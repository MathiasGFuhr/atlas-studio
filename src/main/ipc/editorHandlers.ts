import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { parseMusicCaptionLanguage, resolveWhisperModelName } from '../../shared/musicAnalysis'
import { IPC } from '../../shared/types'
import { transcribeLocalAudio } from '../services/shorts/transcribeLocal'
import { extractShortTimeline } from '../../shared/editor/timelineOps'
import {
  EDITOR_ASPECTS,
  EDITOR_AUDIO_EXTENSIONS,
  EDITOR_IMAGE_EXTENSIONS,
  EDITOR_VIDEO_EXTENSIONS,
  formatTimecode,
  isEditorExportResolution,
  type EditorAspect,
  type EditorAssetOrigin,
  type EditorExportProgress,
  type EditorExportRequest,
  type EditorMakeShortRequest,
  type EditorProject,
  type EditorProjectChangedEvent,
  type EditorProjectPatch,
} from '../../shared/editor/types'
import { channelRepository } from '../repositories/channelRepository'
import { editorRepository } from '../repositories/editorRepository'
import { musicRepository } from '../repositories/musicRepository'
import { projectRepository } from '../repositories/projectRepository'
import {
  ensureAssetCover,
  importEditorMedia,
  onEditorAssetChanged,
  presentEditorAsset,
  readEditorWaveform,
  removeEditorAssetFiles,
  removeEditorProjectFiles,
  resumePendingEditorAssets,
} from '../services/editor/editorMedia'
import { alignEditorVideosToMusic } from '../services/editor/editorAudioAlign'
import {
  ingestComfyVideoToEditor,
  sceneNumberFromComfyPath,
} from '../services/editor/editorComfyIngest'
import { listEditorLipsyncGroups } from '../services/editor/editorLipsync'
import { exportEditorProject, nextShortOutputPath } from '../services/editor/editorExport'
import {
  createProjectFolder,
  folderExists,
  resolveEnvironmentRoot,
  sanitizeWindowsFolderName,
} from '../services/storage/projectFolders'
import { setComfyEditorIngestHook } from '../services/comfy'
import { logger } from '../services/logging/logger'

function enrichProjectMeta(project: EditorProject): Pick<EditorProject, 'channelId' | 'channelName' | 'musicName'> {
  let channelId = project.channelId?.trim() || null
  let channelName: string | null = null
  let musicName: string | null = null
  if (project.musicTrackId) {
    const track = musicRepository.get(project.musicTrackId)
    if (track?.name?.trim()) musicName = track.name.trim()
  }
  if (project.musicProjectId) {
    const musicProject = projectRepository.get(project.musicProjectId)
    if (musicProject) {
      if (!channelId) channelId = musicProject.channelId ?? null
      if (!channelName) channelName = musicProject.channelName?.trim() || null
      if (!musicName && musicProject.name.trim()) musicName = musicProject.name.trim()
    }
  }
  if (channelId && !channelName) {
    channelName = channelRepository.get(channelId)?.name?.trim() || null
  }
  return { channelId, channelName, musicName }
}

function firstVisualAsset(project: EditorProject) {
  const visualTrackIds = new Set(
    project.timeline.tracks.filter((track) => track.kind === 'video').map((track) => track.id),
  )
  const orderedClips = [...project.timeline.clips]
    .filter((clip) => visualTrackIds.has(clip.trackId))
    .sort((a, b) => a.start - b.start)
  if (orderedClips.length === 0) return null

  const assetsById = new Map(editorRepository.listAssets(project.id).map((asset) => [asset.id, asset]))
  for (const clip of orderedClips) {
    const raw = assetsById.get(clip.assetId)
    if (raw && raw.kind !== 'audio') return presentEditorAsset(raw)
  }
  return null
}

function presentProject(
  project: EditorProject,
  coverUrl: string | null | undefined = undefined,
): EditorProject {
  const resolvedCover = coverUrl !== undefined ? coverUrl : (firstVisualAsset(project)?.coverUrl ?? null)
  return {
    ...project,
    ...enrichProjectMeta(project),
    // Nunca usa thumbs (72px) — só capa HD ou nada.
    coverUrl: resolvedCover,
  }
}

async function presentProjectWithSharpCover(project: EditorProject): Promise<EditorProject> {
  const visual = firstVisualAsset(project)
  const coverUrl = visual ? await ensureAssetCover(visual) : null
  return presentProject(project, coverUrl)
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(limit, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await fn(items[index])
      }
    }),
  )
  return results
}

function requireProject(projectId: string): EditorProject {
  const project = editorRepository.getProject(String(projectId ?? ''))
  if (!project) throw new Error('Projeto de edição não encontrado.')
  return project
}

function safeFileName(name: string): string {
  const printable = Array.from(name)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
  return printable.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim() || 'video'
}

export function registerEditorHandlers(getMainWindow: () => BrowserWindow | null) {
  onEditorAssetChanged((asset) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.editor.assetChanged, asset)
  })

  function emitProjectChanged(event: EditorProjectChangedEvent) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.editor.projectChanged, event)
  }

  setComfyEditorIngestHook(async ({ batch, job, outputPath }) => {
    const sceneNumber = sceneNumberFromComfyPath(outputPath, job.sceneNumber)
    const result = await ingestComfyVideoToEditor({
      musicProjectId: batch.projectId,
      sceneNumber,
      videoPath: outputPath,
    })
    if (!result) return
    emitProjectChanged({
      projectId: result.project.id,
      reason: 'comfy-ingest',
      sceneNumber: result.sceneNumber,
      message: `Trecho ${result.sceneNumber} entrou no Editor em ${formatTimecode(result.start, result.project.timeline.fps)}.`,
    })
  })

  ipcMain.handle(IPC.editor.list, async () => {
    const projects = editorRepository.listProjects()
    return mapWithConcurrency(projects, 2, (project) => presentProjectWithSharpCover(project))
  })

  ipcMain.handle(IPC.editor.get, async (_e, id: string) => {
    const project = editorRepository.getProject(String(id ?? ''))
    if (!project) return null
    resumePendingEditorAssets(project.id)
    return {
      project: await presentProjectWithSharpCover(project),
      assets: editorRepository.listAssets(project.id).map(presentEditorAsset),
    }
  })

  ipcMain.handle(
    IPC.editor.create,
    (_e, input: { name: string; aspect: EditorAspect; channelId?: string | null }) => {
      const aspect = EDITOR_ASPECTS.includes(input?.aspect) ? input.aspect : '16:9'
      const channelId = String(input?.channelId ?? '').trim()
      if (!channelId) throw new Error('Escolha um cantor para o projeto.')
      const channel = channelRepository.get(channelId)
      if (!channel) throw new Error('Cantor não encontrado.')
      return presentProject(
        editorRepository.createProject({
          name: String(input?.name ?? ''),
          aspect,
          channelId: channel.id,
        }),
      )
    },
  )

  ipcMain.handle(IPC.editor.update, (_e, id: string, patch: EditorProjectPatch) => {
    const updated = editorRepository.updateProject(String(id ?? ''), patch ?? {})
    return updated ? presentProject(updated) : null
  })

  ipcMain.handle(IPC.editor.remove, (_e, id: string) => {
    const project = editorRepository.getProject(String(id ?? ''))
    if (!project) return false
    editorRepository.removeProject(project.id)
    removeEditorProjectFiles(project.id)
    return true
  })

  ipcMain.handle(IPC.editor.listAssets, (_e, projectId: string) =>
    editorRepository.listAssets(requireProject(projectId).id).map(presentEditorAsset),
  )

  ipcMain.handle(IPC.editor.importFiles, async (_e, projectId: string) => {
    const project = requireProject(projectId)
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Importar mídia para o editor',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Mídia',
          extensions: [...EDITOR_VIDEO_EXTENSIONS, ...EDITOR_AUDIO_EXTENSIONS, ...EDITOR_IMAGE_EXTENSIONS],
        },
        { name: 'Vídeo', extensions: EDITOR_VIDEO_EXTENSIONS },
        { name: 'Áudio', extensions: EDITOR_AUDIO_EXTENSIONS },
        { name: 'Imagem', extensions: EDITOR_IMAGE_EXTENSIONS },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return { assets: [], errors: [] }
    return importEditorMedia({ projectId: project.id, paths: result.filePaths, origin: 'file' })
  })

  ipcMain.handle(
    IPC.editor.addFiles,
    (_e, projectId: string, paths: string[], origin?: EditorAssetOrigin) => {
      const project = requireProject(projectId)
      const list = Array.isArray(paths) ? paths.filter((item) => typeof item === 'string' && item.trim()) : []
      return importEditorMedia({
        projectId: project.id,
        paths: list.slice(0, 200),
        origin: origin === 'lipsync' ? 'lipsync' : 'file',
      })
    },
  )

  ipcMain.handle(IPC.editor.removeAsset, (_e, assetId: string) => {
    const asset = editorRepository.getAsset(String(assetId ?? ''))
    if (!asset) return false
    editorRepository.removeAsset(asset.id)
    removeEditorAssetFiles(asset)
    return true
  })

  ipcMain.handle(IPC.editor.setAssetOrigin, (_e, assetId: string, origin: EditorAssetOrigin) => {
    const nextOrigin = origin === 'lipsync' ? 'lipsync' : 'file'
    const updated = editorRepository.updateAssetOrigin(String(assetId ?? ''), nextOrigin)
    if (!updated) return null
    const presented = presentEditorAsset(updated)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.editor.assetChanged, presented)
    return presented
  })

  ipcMain.handle(IPC.editor.waveform, (_e, assetId: string) => readEditorWaveform(String(assetId ?? '')))

  ipcMain.handle(IPC.editor.transcribeAsset, async (_e, assetId: string, language?: string) => {
    const asset = editorRepository.getAsset(String(assetId ?? ''))
    if (!asset) throw new Error('Mídia não encontrada')
    if (asset.kind === 'image') throw new Error('Imagem não tem áudio para legendar.')
    if (!asset.sourcePath || !fs.existsSync(asset.sourcePath)) {
      throw new Error('Arquivo de áudio não encontrado')
    }
    const captionLanguage = parseMusicCaptionLanguage(language)
    const outputDir = path.join(os.tmpdir(), 'atlas-studio-captions', asset.id, captionLanguage)
    const result = await transcribeLocalAudio(asset.sourcePath, outputDir, {
      language: captionLanguage,
      model: resolveWhisperModelName('medium', captionLanguage),
    })
    if (result.cues.length === 0) {
      throw new Error(
        result.detail ||
          'Não foi possível gerar a legenda. Instale o modelo com: py -3 -m pip install faster-whisper',
      )
    }
    return result.cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }))
  })

  ipcMain.handle(IPC.editor.listLipsync, () => listEditorLipsyncGroups())

  ipcMain.handle(IPC.editor.alignToMusic, async (_e, projectId: string, assetIds: string[]) => {
    const project = requireProject(projectId)
    const assets = editorRepository.listAssets(project.id).map(presentEditorAsset)
    const ids = Array.isArray(assetIds)
      ? assetIds.filter((id) => typeof id === 'string' && id.trim()).slice(0, 200)
      : []
    const timelineAudioAssetIds = project.timeline.clips
      .map((clip) => assets.find((asset) => asset.id === clip.assetId))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset && asset.kind === 'audio'))
      .map((asset) => asset.id)

    let cuts = project.musicTrackId ? (musicRepository.get(project.musicTrackId)?.cuts ?? []) : []
    if (cuts.length === 0 && project.musicProjectId) {
      const tracks = musicRepository
        .list({ projectId: project.musicProjectId })
        .filter((track) => track.cuts.length > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      cuts = tracks[0]?.cuts ?? []
    }

    return alignEditorVideosToMusic({
      assets,
      videoAssetIds: ids,
      timelineAudioAssetIds,
      cuts,
    })
  })

  ipcMain.handle(IPC.editor.export, async (_e, request: EditorExportRequest) => {
    const project = requireProject(request?.projectId)
    const resolution = isEditorExportResolution(request?.resolution) ? request.resolution : 1080
    const videoOnly = Boolean(request?.videoOnly)
    const maxQuality = Boolean(request?.maxQuality)
    const win = getMainWindow()
    const defaultDir = project.lastExportPath ? path.dirname(project.lastExportPath) : undefined
    const fileName = videoOnly ? `${safeFileName(project.name)} - video.mp4` : `${safeFileName(project.name)}.mp4`
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Exportar vídeo',
      defaultPath: defaultDir ? path.join(defaultDir, fileName) : fileName,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    })
    if (result.canceled || !result.filePath) return null

    const send = (event: Omit<EditorExportProgress, 'projectId'>) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.editor.exportProgress, { projectId: project.id, ...event })
      }
    }
    send({ stage: 'rendering', percent: 0, message: 'Preparando exportação...' })
    try {
      const outputPath = await exportEditorProject({
        projectId: project.id,
        outputPath: result.filePath,
        resolution,
        videoOnly,
        maxQuality,
        onProgress: (percent) => send({ stage: 'rendering', percent, message: `Exportando... ${percent}%` }),
      })
      send({ stage: 'done', percent: 100, message: 'Vídeo exportado.', outputPath })
      return outputPath
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('editor.export.failed', { projectId: project.id, error: message })
      send({ stage: 'failed', percent: null, message })
      throw error
    }
  })

  const reservedShortPaths = new Set<string>()
  const reserveNextShortPath = (folder: string): string => {
    for (let i = 1; i < 10_000; i += 1) {
      const candidate = path.join(folder, `short ${String(i).padStart(2, '0')}.mp4`)
      const key = path.resolve(candidate).toLowerCase()
      if (!reservedShortPaths.has(key) && !fs.existsSync(candidate)) {
        reservedShortPaths.add(key)
        return candidate
      }
    }
    const fallback = nextShortOutputPath(folder)
    reservedShortPaths.add(path.resolve(fallback).toLowerCase())
    return fallback
  }

  ipcMain.handle(IPC.editor.makeShort, async (_e, request: EditorMakeShortRequest) => {
    const project = requireProject(request?.projectId)
    const clipIds = Array.isArray(request?.clipIds) ? request.clipIds : []
    const shortTimeline = extractShortTimeline(project.timeline, clipIds)
    if (!shortTimeline) {
      throw new Error('Selecione um trecho válido na timeline para fazer o Short.')
    }
    const resolution = isEditorExportResolution(request?.resolution) ? request.resolution : 1080
    const folder = resolveEditorProjectFolder(project)
    const targetPath = reserveNextShortPath(folder)
    const reservedKey = path.resolve(targetPath).toLowerCase()
    const win = getMainWindow()
    const send = (event: Omit<EditorExportProgress, 'projectId'>) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.editor.exportProgress, { projectId: project.id, ...event })
      }
    }
    send({ stage: 'rendering', percent: 0, message: 'Preparando Short 9:16...' })
    try {
      const outputPath = await exportEditorProject({
        projectId: project.id,
        outputPath: targetPath,
        resolution,
        timelineOverride: shortTimeline,
        skipSetLastExport: true,
        onProgress: (percent) => send({ stage: 'rendering', percent, message: `Gerando Short... ${percent}%` }),
      })
      send({ stage: 'done', percent: 100, message: 'Short exportado.', outputPath })
      return outputPath
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('editor.make_short.failed', { projectId: project.id, error: message })
      send({ stage: 'failed', percent: null, message })
      throw error
    } finally {
      reservedShortPaths.delete(reservedKey)
    }
  })
}

function resolveEditorProjectFolder(project: EditorProject): string {
  if (project.musicProjectId) {
    const musicProject = projectRepository.get(project.musicProjectId)
    const existing = musicProject?.projectFolderPath?.trim()
    if (existing) {
      fs.mkdirSync(existing, { recursive: true })
      return path.resolve(existing)
    }
  }

  const lastDir = project.lastExportPath?.trim() ? path.dirname(path.resolve(project.lastExportPath.trim())) : ''
  if (lastDir && folderExists(lastDir)) {
    return lastDir
  }

  // Tenta localizar um projeto principal com o mesmo nome e pasta vinculada.
  const normalizedName = project.name.trim().toLowerCase()
  const matchedProject = projectRepository
    .list()
    .find((item) => item.projectFolderPath?.trim() && item.name.trim().toLowerCase() === normalizedName)
  if (matchedProject?.projectFolderPath) {
    const resolved = path.resolve(matchedProject.projectFolderPath.trim())
    fs.mkdirSync(resolved, { recursive: true })
    return resolved
  }

  // Usa a pasta onde estão as mídias do projeto (priorizando o áudio principal).
  const assets = editorRepository.listAssets(project.id)
  const orderedAssets = [
    ...assets.filter((asset) => asset.kind === 'audio'),
    ...assets.filter((asset) => asset.kind !== 'audio'),
  ]
  for (const asset of orderedAssets) {
    if (!asset.sourcePath) continue
    let dir = path.dirname(path.resolve(asset.sourcePath))
    const base = path.basename(dir).toLowerCase()
    if (base === 'comfy' || base === 'videos' || base === 'audio') {
      dir = path.dirname(dir)
    }
    if (folderExists(dir)) return dir
  }

  // Se já existir pasta com o nome do projeto na raiz do canal/ambiente, reutiliza sem criar "(2)".
  const parentFolder = project.channelId ? (channelRepository.get(project.channelId)?.folderPath ?? null) : null
  const root = parentFolder && folderExists(parentFolder) ? path.resolve(parentFolder) : resolveEnvironmentRoot('music')
  const namedFolder = path.join(root, sanitizeWindowsFolderName(project.name))
  if (folderExists(namedFolder)) {
    return namedFolder
  }

  const created = createProjectFolder({
    name: project.name,
    projectType: 'music',
    parentFolder,
  })
  if (project.musicProjectId) {
    projectRepository.update(project.musicProjectId, { projectFolderPath: created })
  }
  return path.resolve(created)
}
