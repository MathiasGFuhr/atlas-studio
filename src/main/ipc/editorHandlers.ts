import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/types'
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
import { exportEditorProject } from '../services/editor/editorExport'
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
  const assets = editorRepository.listAssets(project.id).map(presentEditorAsset)
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const visualTrackIds = new Set(
    project.timeline.tracks.filter((track) => track.kind === 'video').map((track) => track.id),
  )
  return (
    [...project.timeline.clips]
      .filter((clip) => visualTrackIds.has(clip.trackId))
      .sort((a, b) => a.start - b.start)
      .map((clip) => byId.get(clip.assetId))
      .find((asset) => asset && asset.kind !== 'audio') ?? null
  )
}

function presentProject(project: EditorProject, coverUrl: string | null = null): EditorProject {
  const visual = firstVisualAsset(project)
  return {
    ...project,
    ...enrichProjectMeta(project),
    // Nunca usa thumbs (72px) — só capa HD ou nada.
    coverUrl: coverUrl ?? visual?.coverUrl ?? null,
  }
}

async function presentProjectWithSharpCover(project: EditorProject): Promise<EditorProject> {
  const visual = firstVisualAsset(project)
  const coverUrl = visual ? await ensureAssetCover(visual) : null
  return presentProject(project, coverUrl)
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
    return Promise.all(projects.map((project) => presentProjectWithSharpCover(project)))
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
    return alignEditorVideosToMusic({
      assets,
      videoAssetIds: ids,
      timelineAudioAssetIds,
    })
  })

  ipcMain.handle(IPC.editor.export, async (_e, request: EditorExportRequest) => {
    const project = requireProject(request?.projectId)
    const resolution = isEditorExportResolution(request?.resolution) ? request.resolution : 1080
    const win = getMainWindow()
    const defaultDir = project.lastExportPath ? path.dirname(project.lastExportPath) : undefined
    const fileName = `${safeFileName(project.name)}.mp4`
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
}
