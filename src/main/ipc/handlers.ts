import { ipcMain, dialog, clipboard, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/types'
import type {
  AdjustScriptRequest,
  AnalyzeQuickPromptRequest,
  AnalyzeTitleRequest,
  Channel,
  ChannelPrompt,
  ChannelVideo,
  ChannelVideoWriteInput,
  GenerateScriptRequest,
  Niche,
  Project,
  ProjectType,
  AppSettings,
  RemoveProjectOptions,
  TaskStatus,
  TaskWriteInput,
  VideoListFilters,
} from '../../shared/types'
import { nicheRepository } from '../repositories/nicheRepository'
import { projectRepository } from '../repositories/projectRepository'
import {
  createProjectFolder,
  folderExists,
  resolveEnvironmentRoot,
} from '../services/storage/projectFolders'
import { scriptRepository } from '../repositories/scriptRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { skillsRepository } from '../repositories/skillsRepository'
import { validateSkill } from '../services/skills/SkillDiscoveryService'
import { syncSkillLibrary } from '../services/skills/SkillLibrarySync'
import { generationRunRepository } from '../repositories/generationRunRepository'
import type { CodexService } from '../services/codex/CodexService'
import type { CodexRuntimeManager } from '../services/codex/CodexRuntimeManager'
import {
  listCodexModels,
  readConfiguredModel,
  resolveEffectiveCodexModel,
} from '../services/codex/codexModels'
import { exportScriptFile } from '../services/storage/scriptFiles'
import {
  clearProfilePhotoFiles,
  importProfilePhoto,
  readImageDataUrl,
} from '../services/storage/profilePhoto'
import { importChannelImage } from '../services/storage/channelMedia'
import { channelRepository } from '../repositories/channelRepository'
import { promptRepository } from '../repositories/promptRepository'
import { quickPromptRepository } from '../repositories/quickPromptRepository'
import type { CustomPrompt } from '../../shared/quickPrompts/types'
import { musicRepository } from '../repositories/musicRepository'
import { shortsRepository } from '../repositories/shortsRepository'
import { analyzeShortsJob, regenerateShortsClipCopy } from '../services/shorts/ShortsPipeline'
import { loadShortsAnalysisPlan } from '../services/shorts/ShortsAnalysisPlanner'
import { exportVideoClip, probeVideo } from '../services/media/ffmpegVideo'
import { toAtlasMediaUrl } from '../services/media/atlasMediaProtocol'
import { ensureShortsClipPoster, ensureShortsClipPosters, ensureShortsThumbnail, presentShortsJob } from '../services/shorts/shortsThumbnail'
import {
  createFromSourceVideo,
  deleteProject as deleteShortsProject,
  markClipExported,
  removeClip as removeShortsClip,
  toImportResult,
  updateClip as updateShortsClip,
  updateProjectSettings,
} from '../services/shorts/ShortsProjectService'
import { buildSrt, buildVerticalCropPlan, buildClipFramingPlan, cuesForClip } from '../../shared/shortsExport'
import { buildFramingExportFilter } from '../../shared/shortsFraming'
import { SHORTS_VIDEO_EXTENSIONS, shortsExportWindow, type ShortsAnalyzeInput, type ShortsClipPatch, type ShortsCopyFields, type ShortsJob } from '../../shared/shorts'
import type { ShortsProjectListFilters } from '../../shared/shortsProject'
import { taskRepository } from '../repositories/taskRepository'
import { logger } from '../services/logging/logger'
import type { AntigravityService } from '../services/antigravity/AntigravityService'
import type { AutoCutPreset, MusicSegment, MusicCutMode } from '../../shared/musicAnalysis'
import type { MusicAdviseRequest } from '../../shared/audio/audioCutAdvisor'
import type { AudioExportFormat, Mp3Bitrate } from '../../shared/audio/audioExport'
import { adviseMusicCutsWithCodex } from '../services/audio/CodexAudioCutAdvisor'
import { exportMusicSegment, exportMusicSegments } from '../services/audio/AudioExportService'
import type { ChatSendMessageRequest } from '../../shared/chat/types'
import type { AgentProviderId } from '../../shared/agents/types'
import { ChatService } from '../services/chat/ChatService'
import type { AgentModelCatalog } from '../services/agents/AgentModelCatalog'
import { getWorkspaceCapabilities } from '../services/workspace/getWorkspaceCapabilities'
import {
  createChannelVideo,
  removeChannelVideo,
  removeProject,
} from '../services/videos/musicVideoProjectService'
import {
  checkForAppUpdates,
  downloadAppUpdate,
  getAppUpdateStatus,
  installAppUpdate,
  scheduleAutoCheck,
} from '../services/updates/AppUpdateService'
import path from 'node:path'
import fs from 'node:fs'

export function registerIpcHandlers(deps: {
  codexService: CodexService
  runtimeManager: CodexRuntimeManager
  antigravityService: AntigravityService
  chatService: ChatService
  agentModelCatalog: AgentModelCatalog
  getMainWindow: () => BrowserWindow | null
}) {
  const {
    codexService,
    runtimeManager,
    antigravityService,
    chatService,
    agentModelCatalog,
    getMainWindow,
  } = deps

  const emitCapabilities = (bundle: Awaited<ReturnType<AgentModelCatalog['getAll']>>) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.agents.capabilitiesChanged, bundle)
    }
  }

  agentModelCatalog.onChange(emitCapabilities)

  const refreshModels = (provider?: AgentProviderId) => {
    void (provider ? agentModelCatalog.refresh(provider) : agentModelCatalog.refreshAll()).catch(
      () => undefined,
    )
  }

  ipcMain.handle(
    IPC.projects.list,
    (_e, filters?: { projectType?: ProjectType; query?: string }) =>
      projectRepository.list(filters),
  )
  ipcMain.handle(IPC.projects.get, (_e, id: string) => projectRepository.get(id))
  ipcMain.handle(
    IPC.projects.create,
    (
      _e,
      input: {
        name: string
        description?: string
        projectType: ProjectType
        channelId?: string | null
      },
    ) => projectRepository.create(input),
  )
  ipcMain.handle(
    IPC.projects.update,
    (
      _e,
      id: string,
      patch: Partial<Pick<Project, 'name' | 'description' | 'projectFolderPath' | 'channelId'>>,
    ) => projectRepository.update(id, patch),
  )
  ipcMain.handle(IPC.projects.remove, (_e, id: string, options?: RemoveProjectOptions) =>
    removeProject(id, options),
  )

  ipcMain.handle(IPC.projects.createFolder, (_e, id: string) => {
    const project = projectRepository.get(id)
    if (!project) throw new Error('Projeto não encontrado')
    if (project.projectFolderPath && folderExists(project.projectFolderPath)) {
      return project
    }
    const folder = createProjectFolder({ name: project.name, projectType: project.projectType })
    return projectRepository.update(id, { projectFolderPath: folder })
  })

  ipcMain.handle(IPC.projects.linkFolder, async (_e, id: string) => {
    const project = projectRepository.get(id)
    if (!project) throw new Error('Projeto não encontrado')
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Selecionar pasta do projeto',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath:
        (project.projectFolderPath && folderExists(project.projectFolderPath)
          ? project.projectFolderPath
          : undefined) ?? resolveEnvironmentRoot(project.projectType),
    })
    if (result.canceled || !result.filePaths[0]) return null
    return projectRepository.update(id, { projectFolderPath: result.filePaths[0] })
  })

  ipcMain.handle(IPC.projects.openFolder, async (_e, id: string) => {
    const project = projectRepository.get(id)
    if (!project) throw new Error('Projeto não encontrado')
    if (!project.projectFolderPath) throw new Error('Nenhuma pasta vinculada a este projeto.')
    if (!folderExists(project.projectFolderPath)) {
      throw new Error('A pasta vinculada não existe mais. Vincule outra pasta.')
    }
    const error = await shell.openPath(path.resolve(project.projectFolderPath))
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle(IPC.niches.list, (_e, filters?: { query?: string; language?: string }) => {
    syncSkillLibrary()
    return nicheRepository.list(filters)
  })

  ipcMain.handle(IPC.niches.get, (_e, id: string) => nicheRepository.get(id))

  ipcMain.handle(
    IPC.niches.create,
    (_e, input: Omit<Niche, 'id' | 'createdAt' | 'updatedAt'>) => nicheRepository.create(input),
  )

  ipcMain.handle(
    IPC.niches.update,
    (_e, id: string, patch: Partial<Omit<Niche, 'id' | 'createdAt'>>) =>
      nicheRepository.update(id, patch),
  )

  ipcMain.handle(
    IPC.channels.list,
    (_e, filters?: { query?: string; channelType?: ProjectType }) =>
      channelRepository.list(filters),
  )
  ipcMain.handle(IPC.channels.get, (_e, id: string) => channelRepository.get(id))
  ipcMain.handle(
    IPC.channels.create,
    (
      _e,
      input: Omit<Channel, 'id' | 'createdAt' | 'updatedAt' | 'avatarDataUrl' | 'videoCount' | 'nicheName'>,
    ) => channelRepository.create(input),
  )
  ipcMain.handle(
    IPC.channels.update,
    (
      _e,
      id: string,
      patch: Partial<Omit<Channel, 'id' | 'createdAt' | 'avatarDataUrl' | 'videoCount' | 'nicheName'>>,
    ) => channelRepository.update(id, patch),
  )
  ipcMain.handle(IPC.channels.remove, (_e, id: string) => channelRepository.remove(id))

  ipcMain.handle(IPC.tasks.list, () => taskRepository.list())
  ipcMain.handle(IPC.tasks.get, (_e, id: string) => taskRepository.get(id))
  ipcMain.handle(IPC.tasks.create, (_e, input: TaskWriteInput) => taskRepository.create(input))
  ipcMain.handle(IPC.tasks.update, (_e, id: string, patch: Partial<TaskWriteInput>) =>
    taskRepository.update(id, patch),
  )
  ipcMain.handle(IPC.tasks.setStatus, (_e, id: string, status: TaskStatus) =>
    taskRepository.setStatus(id, status),
  )
  ipcMain.handle(IPC.tasks.remove, (_e, id: string) => taskRepository.remove(id))
  ipcMain.handle(IPC.tasks.pendingCount, () => taskRepository.pendingCount())
  ipcMain.handle(IPC.channels.setAvatar, (_e, channelId: string, sourcePath: string) => {
    const savedPath = importChannelImage(sourcePath, channelId, 'avatar')
    return channelRepository.update(channelId, { avatarPath: savedPath })
  })

  ipcMain.handle(
    IPC.videos.list,
    (_e, filters?: VideoListFilters) => channelRepository.listVideos(filters ?? {}),
  )
  ipcMain.handle(IPC.videos.get, (_e, id: string) => channelRepository.getVideo(id))
  ipcMain.handle(IPC.videos.create, (_e, input: ChannelVideoWriteInput) => createChannelVideo(input))
  ipcMain.handle(
    IPC.videos.update,
    (
      _e,
      id: string,
      patch: Partial<
        Omit<ChannelVideo, 'id' | 'channelId' | 'createdAt' | 'thumbnailDataUrl' | 'folderExists' | 'projectName'>
      >,
    ) => channelRepository.updateVideo(id, patch),
  )
  ipcMain.handle(IPC.videos.remove, (_e, id: string) => removeChannelVideo(id))
  ipcMain.handle(IPC.videos.setThumbnail, (_e, videoId: string, sourcePath: string) => {
    const video = channelRepository.getVideo(videoId)
    if (!video) throw new Error('Vídeo não encontrado')
    const savedPath = importChannelImage(sourcePath, video.channelId, `thumb-${videoId}`)
    return channelRepository.updateVideo(videoId, { thumbnailPath: savedPath })
  })
  ipcMain.handle(IPC.videos.analyzeTitle, async (_e, request: AnalyzeTitleRequest) => {
    try {
      return await antigravityService.analyzeTitle(request)
    } catch (error) {
      throw error instanceof Error ? error : new Error('Não foi possível analisar o título.')
    }
  })

  ipcMain.handle(
    IPC.prompts.list,
    (_e, filters?: { channelId?: string; query?: string }) => promptRepository.list(filters),
  )
  ipcMain.handle(IPC.prompts.get, (_e, id: string) => promptRepository.get(id))
  ipcMain.handle(
    IPC.prompts.create,
    (_e, input: { channelId: string; title: string; content: string }) =>
      promptRepository.create(input),
  )
  ipcMain.handle(
    IPC.prompts.update,
    (_e, id: string, patch: Partial<Omit<ChannelPrompt, 'id' | 'createdAt' | 'channelName'>>) =>
      promptRepository.update(id, patch),
  )
  ipcMain.handle(IPC.prompts.remove, (_e, id: string) => promptRepository.remove(id))

  // Prompts rápidos: presets ficam no código, aqui só o que o usuário salva.
  ipcMain.handle(
    IPC.quickPrompts.list,
    (_e, filters?: { projectId?: string | null; query?: string }) =>
      quickPromptRepository.list(filters),
  )
  ipcMain.handle(
    IPC.quickPrompts.create,
    (
      _e,
      input: {
        name: string
        category?: string
        text: string
        tabId?: string | null
        projectId?: string | null
      },
    ) => quickPromptRepository.create(input),
  )
  ipcMain.handle(
    IPC.quickPrompts.update,
    (_e, id: string, patch: Partial<Omit<CustomPrompt, 'id' | 'createdAt' | 'updatedAt'>>) =>
      quickPromptRepository.update(id, patch),
  )
  ipcMain.handle(IPC.quickPrompts.remove, (_e, id: string) => quickPromptRepository.remove(id))
  ipcMain.handle(IPC.quickPrompts.listFavorites, () => quickPromptRepository.listFavorites())
  ipcMain.handle(IPC.quickPrompts.setFavorite, (_e, itemId: string, favorite: boolean) =>
    quickPromptRepository.setFavorite(itemId, favorite),
  )
  ipcMain.handle(IPC.quickPrompts.listTabs, () => quickPromptRepository.listTabs())
  ipcMain.handle(IPC.quickPrompts.createTab, (_e, input: { name: string }) =>
    quickPromptRepository.createTab(input),
  )
  ipcMain.handle(
    IPC.quickPrompts.updateTab,
    (_e, id: string, patch: { name?: string; sortOrder?: number }) =>
      quickPromptRepository.updateTab(id, patch),
  )
  ipcMain.handle(IPC.quickPrompts.removeTab, (_e, id: string) =>
    quickPromptRepository.removeTab(id),
  )

  ipcMain.handle(IPC.antigravity.status, () => antigravityService.getStatus())
  ipcMain.handle(IPC.antigravity.healthCheck, async () => {
    const status = await antigravityService.healthCheck()
    refreshModels('antigravity')
    return status
  })
  ipcMain.handle(IPC.antigravity.loginStart, () => antigravityService.loginStart())
  ipcMain.handle(IPC.antigravity.loginCancel, () => {
    antigravityService.loginCancel()
  })
  ipcMain.handle(IPC.antigravity.loginConfirm, async () => {
    const status = await antigravityService.loginConfirm()
    refreshModels('antigravity')
    return status
  })
  ipcMain.handle(IPC.antigravity.logout, async () => {
    const status = await antigravityService.logout()
    refreshModels('antigravity')
    return status
  })
  ipcMain.handle(
    IPC.antigravity.analyzeQuickPrompt,
    async (_e, request: AnalyzeQuickPromptRequest) => {
      try {
        return await antigravityService.analyzeQuickPrompt(request)
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error('Não foi possível analisar com Antigravity.')
      }
    },
  )

  ipcMain.handle(IPC.music.list, (_e, filters?: { projectId?: string }) =>
    musicRepository.list(filters),
  )
  ipcMain.handle(IPC.music.get, (_e, id: string) => musicRepository.get(id))
  ipcMain.handle(IPC.music.import, async (_e, projectId?: string | null) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Áudio',
          extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma', 'aiff'],
        },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null

    // Toda faixa pertence a um projeto de Música: sem projeto informado, cria-se um.
    let targetProjectId = projectId || null
    if (targetProjectId && projectRepository.get(targetProjectId)?.projectType !== 'music') {
      targetProjectId = null
    }
    if (!targetProjectId) {
      targetProjectId = projectRepository.create({
        name: path.basename(result.filePaths[0], path.extname(result.filePaths[0])),
        projectType: 'music',
      }).id
    }

    const track = await musicRepository.importFromFile(result.filePaths[0], targetProjectId)
    projectRepository.touch(targetProjectId)
    return track
  })
  ipcMain.handle(
    IPC.music.update,
    (
      _e,
      id: string,
      patch: Partial<{
        name: string
        duration: number
        cutMode: MusicCutMode
        cuts: MusicSegment[]
        selectedId: string | null
        appliedPreset: AutoCutPreset | null
      }>,
    ) => musicRepository.update(id, patch),
  )
  ipcMain.handle(IPC.music.remove, (_e, id: string) => musicRepository.remove(id))
  ipcMain.handle(IPC.music.preview, (_e, id: string) => {
    const track = musicRepository.get(id)
    if (!track?.previewPath || !fs.existsSync(track.previewPath)) {
      throw new Error('Prévia da música não encontrada')
    }
    return fs.readFileSync(track.previewPath)
  })
  ipcMain.handle(IPC.music.previewUrl, (_e, id: string) => {
    const track = musicRepository.get(id)
    if (!track?.previewPath || !fs.existsSync(track.previewPath)) {
      throw new Error('Prévia da música não encontrada')
    }
    return toAtlasMediaUrl(track.previewPath)
  })
  ipcMain.handle(IPC.music.chooseExportFolder, async () => {
    const win = getMainWindow()
    const current = settingsRepository.get().musicExportFolder
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Pasta de saída dos cortes',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: current || undefined,
    })
    if (result.canceled || !result.filePaths[0]) return current || null
    const folder = result.filePaths[0]
    settingsRepository.update({ musicExportFolder: folder })
    return folder
  })
  ipcMain.handle(
    IPC.music.export,
    async (
      _e,
      payload: {
        id: string
        start: number
        end: number
        filename?: string
        format?: AudioExportFormat
        bitrate?: Mp3Bitrate
        directory?: string
      },
    ) => {
      const track = musicRepository.get(payload.id)
      if (!track) throw new Error('Música não encontrada')
      const format: AudioExportFormat = payload.format === 'wav' ? 'wav' : payload.format === 'flac' ? 'flac' : 'mp3'
      const bitrate = payload.bitrate === 192 || payload.bitrate === 256 ? payload.bitrate : 320
      const ext = format
      const suggested = payload.filename?.trim()
        ? payload.filename.endsWith(`.${ext}`)
          ? payload.filename
          : `${payload.filename}.${ext}`
        : `${track.name}-corte.${ext}`
      const lastFolder = settingsRepository.get().musicExportFolder
      let targetPath: string | null = null
      if (payload.directory) {
        targetPath = path.join(payload.directory, path.basename(suggested))
      } else {
        const win = getMainWindow()
        const result = await dialog.showSaveDialog(win ?? undefined!, {
          title: 'Exportar corte',
          defaultPath: lastFolder ? path.join(lastFolder, path.basename(suggested)) : suggested,
          filters:
            format === 'wav'
              ? [{ name: 'WAV', extensions: ['wav'] }]
              : format === 'flac'
                ? [{ name: 'FLAC', extensions: ['flac'] }]
                : [{ name: 'MP3', extensions: ['mp3'] }],
        })
        if (result.canceled || !result.filePath) return null
        targetPath = result.filePath
      }
      const saved = await exportMusicSegment({
        id: payload.id,
        start: payload.start,
        end: payload.end,
        targetPath,
        format,
        bitrate,
      })
      settingsRepository.update({ musicExportFolder: path.dirname(saved) })
      return saved
    },
  )
  ipcMain.handle(
    IPC.music.exportAll,
    async (
      _e,
      payload: {
        id: string
        format?: AudioExportFormat
        bitrate?: Mp3Bitrate
        directory?: string
        cuts?: Array<{ start: number; end: number; label: string }>
      },
    ) => {
      const track = musicRepository.get(payload.id)
      if (!track) throw new Error('Música não encontrada')
      const format: AudioExportFormat = payload.format === 'wav' ? 'wav' : 'mp3'
      const bitrate = payload.bitrate === 192 || payload.bitrate === 256 ? payload.bitrate : 320
      let directory = payload.directory || settingsRepository.get().musicExportFolder
      if (!directory) {
        const win = getMainWindow()
        const result = await dialog.showOpenDialog(win ?? undefined!, {
          title: 'Exportar todos os cortes',
          properties: ['openDirectory', 'createDirectory'],
        })
        if (result.canceled || !result.filePaths[0]) return null
        directory = result.filePaths[0]
      }
      settingsRepository.update({ musicExportFolder: directory })
      const cuts = payload.cuts?.length
        ? payload.cuts
        : track.cuts.map((cut) => ({ start: cut.start, end: cut.end, label: cut.label }))
      return exportMusicSegments({
        id: payload.id,
        directory,
        format,
        bitrate,
        cuts,
      })
    },
  )
  ipcMain.handle(IPC.music.adviseCuts, async (_e, request: MusicAdviseRequest) => {
    return adviseMusicCutsWithCodex(request, codexService)
  })

  ipcMain.handle(IPC.shorts.list, (_e, filters?: ShortsProjectListFilters) =>
    shortsRepository.list(filters).map(presentShortsJob),
  )
  ipcMain.handle(IPC.shorts.get, async (_e, id: string) => {
    const job = shortsRepository.get(id)
    if (!job) return null
    await ensureShortsClipPosters(job)
    return presentShortsJob(shortsRepository.get(id) ?? job)
  })
  ipcMain.handle(IPC.shorts.import, async (_e, projectId?: string | null) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Importar vídeo para Shorts',
      properties: ['openFile'],
      filters: [
        { name: 'Vídeo', extensions: SHORTS_VIDEO_EXTENSIONS },
        { name: 'Todos', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const sourcePath = path.resolve(result.filePaths[0])
    const probe = await probeVideo(sourcePath)
    const project = projectId ? projectRepository.get(projectId) : null
    const created = createFromSourceVideo({
      sourcePath,
      sourceName: probe.name,
      projectId: project?.id ?? null,
      profile: project?.projectType ?? 'history',
      probe,
      forceNew: false,
    })
    if (created.kind === 'created') {
      await ensureShortsThumbnail(created.project)
    }
    const latest = shortsRepository.get(created.project.id) ?? created.project
    return toImportResult({ ...created, project: presentShortsJob(latest) }, sourcePath)
  })
  ipcMain.handle(
    IPC.shorts.createFromSourceVideo,
    async (
      _e,
      input: { sourcePath: string; projectId?: string | null; forceNew?: boolean },
    ) => {
      const sourcePath = path.resolve(String(input?.sourcePath ?? ''))
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error('Arquivo de vídeo não encontrado.')
      }
      const probe = await probeVideo(sourcePath)
      const project = input.projectId ? projectRepository.get(input.projectId) : null
      const created = createFromSourceVideo({
        sourcePath,
        sourceName: probe.name,
        projectId: project?.id ?? null,
        profile: project?.projectType ?? 'history',
        probe,
        forceNew: Boolean(input.forceNew),
      })
      if (created.kind === 'created') {
        await ensureShortsThumbnail(created.project)
      }
      const latest = shortsRepository.get(created.project.id) ?? created.project
      return toImportResult({ ...created, project: presentShortsJob(latest) }, sourcePath)
    },
  )
  ipcMain.handle(IPC.shorts.getAnalysisPlan, async () => {
    return loadShortsAnalysisPlan({
      antigravity: antigravityService,
      catalog: agentModelCatalog,
    })
  })
  ipcMain.handle(IPC.shorts.analyze, async (_e, request: ShortsAnalyzeInput) => {
    const job = await analyzeShortsJob({
      request,
      antigravity: antigravityService,
      catalog: agentModelCatalog,
      getWindow: getMainWindow,
    })
    await ensureShortsThumbnail(job)
    await ensureShortsClipPosters(job)
    return presentShortsJob(shortsRepository.get(job.id) ?? job)
  })
  ipcMain.handle(
    IPC.shorts.updateClip,
    async (_e, jobId: string, clipId: string, patch: ShortsClipPatch) => {
      const updated = updateShortsClip(jobId, clipId, patch)
      if (!updated) return null
      const clip = updated.clips.find((item) => item.id === clipId)
      if (clip && (patch.start != null || patch.end != null)) {
        await ensureShortsClipPoster(updated, clip)
      }
      return presentShortsJob(shortsRepository.get(jobId) ?? updated)
    },
  )
  ipcMain.handle(IPC.shorts.removeClip, (_e, jobId: string, clipId: string) => {
    const updated = removeShortsClip(jobId, clipId)
    return updated ? presentShortsJob(updated) : null
  })
  ipcMain.handle(
    IPC.shorts.regenerateCopy,
    async (_e, payload: { jobId: string; clipId: string; fields?: ShortsCopyFields }) => {
      const job = await regenerateShortsClipCopy({
        jobId: payload.jobId,
        clipId: payload.clipId,
        fields: payload.fields === 'title' || payload.fields === 'description' ? payload.fields : 'all',
        antigravity: antigravityService,
        getWindow: getMainWindow,
      })
      return presentShortsJob(job)
    },
  )
  ipcMain.handle(
    IPC.shorts.updateSettings,
    (
      _e,
      jobId: string,
      patch: Partial<
        Pick<
          ShortsJob,
          'name' | 'profile' | 'clipCount' | 'requestedDuration' | 'durationMode' | 'aspectMode' | 'framingSettings' | 'captionsEnabled' | 'languageOverride'
        >
      >,
    ) => {
      const updated = updateProjectSettings(jobId, patch)
      return updated ? presentShortsJob(updated) : null
    },
  )
  ipcMain.handle(IPC.shorts.export, async (_e, payload: { jobId: string; clipId: string }) => {
    const job = shortsRepository.get(payload.jobId)
    if (!job) throw new Error('Projeto de Shorts não encontrado.')
    const clip = job.clips.find((item) => item.id === payload.clipId)
    if (!clip) throw new Error('Corte não encontrado.')
    if (!fs.existsSync(job.sourcePath)) throw new Error('O vídeo original não está mais neste caminho.')
    const win = getMainWindow()
    const suggested = `${path.parse(job.sourceName).name}-short-${clip.index}.mp4`
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      title: 'Exportar Short',
      defaultPath: suggested,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    })
    if (result.canceled || !result.filePath) return null

    win?.webContents.send(IPC.shorts.progress, {
      jobId: job.id,
      stage: 'exporting',
      message: 'Exportando...',
    })

    const framingPlan = buildClipFramingPlan(job, clip)
    const framingFilter = framingPlan ? buildFramingExportFilter(framingPlan, clip.start) : {}
    const crop = job.probe
      ? buildVerticalCropPlan(job.probe.width, job.probe.height, job.aspectMode)
      : null
    const workDir = path.join(path.dirname(result.filePath), `.atlas-shorts-${clip.id.slice(0, 8)}`)
    let subtitlePath: string | null = null
    if (job.captionsEnabled) {
      const relative = cuesForClip(job.transcript, clip.start, clip.end).filter((cue) => cue.text.trim())
      const srt = buildSrt(relative)
      if (srt) {
        fs.mkdirSync(workDir, { recursive: true })
        subtitlePath = path.join(workDir, 'captions.srt')
        fs.writeFileSync(subtitlePath, srt, 'utf8')
      }
    }

    const window = shortsExportWindow(clip)
    logger.info('shorts.export', {
      jobId: job.id,
      clipId: window.clipId,
      start: window.start,
      end: window.end,
      duration: window.duration,
    })
    try {
      await exportVideoClip({
        sourcePath: job.sourcePath,
        outputPath: result.filePath,
        start: window.start,
        end: window.end,
        videoFilter: framingFilter.videoFilter ?? crop?.filter,
        filterComplex: framingFilter.filterComplex,
        subtitlePath,
      })
    } finally {
      if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true })
    }

    markClipExported(job.id, clip.id, result.filePath)
    return result.filePath
  })
  ipcMain.handle(IPC.shorts.remove, (_e, id: string) => deleteShortsProject(id))
  ipcMain.handle(IPC.shorts.mediaUrl, (_e, jobId: string) => {
    const job = shortsRepository.get(jobId)
    if (!job) throw new Error('Projeto de Shorts não encontrado.')
    if (!fs.existsSync(job.sourcePath)) throw new Error('O vídeo original não está mais neste caminho.')
    return toAtlasMediaUrl(job.sourcePath)
  })
  ipcMain.handle(IPC.shorts.thumbnailUrl, async (_e, jobId: string) => {
    const job = shortsRepository.get(jobId)
    if (!job) return null
    return ensureShortsThumbnail(job)
  })
  ipcMain.handle(IPC.shorts.relink, async (_e, jobId: string) => {
    const job = shortsRepository.get(jobId)
    if (!job) throw new Error('Projeto de Shorts não encontrado.')
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Localizar arquivo original',
      properties: ['openFile'],
      filters: [
        { name: 'Vídeo', extensions: SHORTS_VIDEO_EXTENSIONS },
        { name: 'Todos', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const sourcePath = path.resolve(result.filePaths[0])
    const probe = await probeVideo(sourcePath)
    const updated = shortsRepository.update(jobId, {
      sourcePath,
      sourceName: probe.name,
      probe,
    })
    if (!updated) return null
    await ensureShortsThumbnail(updated)
    return presentShortsJob(shortsRepository.get(jobId) ?? updated)
  })
  ipcMain.handle(IPC.shorts.openExportsFolder, async (_e, jobId: string) => {
    const job = shortsRepository.get(jobId)
    if (!job) throw new Error('Projeto de Shorts não encontrado.')
    const exportPaths = job.clips
      .map((clip) => clip.exportedPath)
      .filter((item): item is string => Boolean(item))
      .filter((item) => fs.existsSync(item))
    if (exportPaths.length === 0) {
      throw new Error('Nenhum Short exportado neste projeto.')
    }
    shell.showItemInFolder(exportPaths[exportPaths.length - 1])
    return true
  })

  ipcMain.handle(IPC.skills.list, () => skillsRepository.listDiscovered(true))

  ipcMain.handle(IPC.skills.rescan, (_e, libraryRoot?: string) => {
    return syncSkillLibrary(libraryRoot)
  })

  ipcMain.handle(IPC.skills.validate, (_e, skillPath: string) => validateSkill(skillPath))

  ipcMain.handle(
    IPC.scripts.list,
    (_e, filters?: { query?: string; nicheId?: string; language?: string; projectId?: string }) =>
      scriptRepository.list(filters),
  )

  ipcMain.handle(IPC.scripts.get, (_e, id: string) => scriptRepository.get(id))
  ipcMain.handle(IPC.scripts.recent, (_e, limit?: number) => scriptRepository.recent(limit ?? 3))
  ipcMain.handle(IPC.scripts.summary, () => scriptRepository.summary())
  ipcMain.handle(IPC.scripts.versions, (_e, scriptId: string) => scriptRepository.versions(scriptId))

  ipcMain.handle(IPC.scripts.saveVersion, (_e, scriptId: string) => {
    const script = scriptRepository.get(scriptId)
    if (!script) throw new Error('Roteiro não encontrado')
    return scriptRepository.addVersion(scriptId, script.content, 'Salvar versão manual')
  })

  ipcMain.handle(
    IPC.scripts.export,
    async (_e, payload: { scriptId: string; format: 'txt' | 'md' }) => {
      const script = scriptRepository.get(payload.scriptId)
      if (!script) throw new Error('Roteiro não encontrado')
      const win = getMainWindow()
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: 'Exportar roteiro',
        defaultPath: `${script.title}.${payload.format}`,
        filters:
          payload.format === 'md'
            ? [{ name: 'Markdown', extensions: ['md'] }]
            : [{ name: 'Texto', extensions: ['txt'] }],
      })
      if (result.canceled || !result.filePath) return null
      exportScriptFile({
        title: script.title,
        content: script.content,
        format: payload.format,
        targetPath: result.filePath,
      })
      return result.filePath
    },
  )

  ipcMain.handle(IPC.workspace.capabilities, () => getWorkspaceCapabilities())
  ipcMain.handle(IPC.settings.get, () => settingsRepository.get())
  ipcMain.handle(IPC.settings.update, (_e, patch: Partial<AppSettings>) => {
    const next = settingsRepository.update(patch)
    if (patch.autoCheckUpdates !== undefined) scheduleAutoCheck()
    return next
  })
  ipcMain.handle(IPC.settings.setProfilePhoto, (_e, sourcePath: string) => {
    const savedPath = importProfilePhoto(sourcePath)
    return settingsRepository.update({ accountPhotoPath: savedPath })
  })
  ipcMain.handle(IPC.settings.clearProfilePhoto, () => {
    clearProfilePhotoFiles()
    return settingsRepository.update({ accountPhotoPath: '' })
  })

  ipcMain.handle(IPC.codex.status, () => runtimeManager.getStatus())
  ipcMain.handle(IPC.codex.connect, async () => {
    const status = await codexService.connect()
    refreshModels('codex')
    return status
  })
  ipcMain.handle(IPC.codex.disconnect, () => codexService.disconnect())
  ipcMain.handle(IPC.codex.healthCheck, async () => {
    const status = await runtimeManager.healthCheck()
    refreshModels('codex')
    return status
  })
  ipcMain.handle(IPC.codex.listModels, () => {
    const settings = settingsRepository.get()
    return {
      models: listCodexModels(),
      configured: readConfiguredModel(),
      effective: resolveEffectiveCodexModel(settings.codexModel),
    }
  })

  ipcMain.handle(IPC.codex.accountRead, () => runtimeManager.accountRead())
  ipcMain.handle(IPC.codex.loginStart, (_e, type?: string) =>
    runtimeManager.loginStart(type ?? 'chatgpt'),
  )
  ipcMain.handle(IPC.codex.loginCancel, () => {
    runtimeManager.loginCancel()
  })
  ipcMain.handle(IPC.codex.logout, async () => {
    const status = await runtimeManager.logout()
    refreshModels('codex')
    return status
  })
  ipcMain.handle(IPC.codex.onboardingDismissed, () => {
    runtimeManager.dismissOnboarding()
  })
  ipcMain.handle(IPC.codex.isOnboardingDismissed, () =>
    runtimeManager.isOnboardingDismissed(),
  )

  ipcMain.handle(IPC.agents.getCapabilities, () => agentModelCatalog.getAll())
  ipcMain.handle(IPC.agents.refreshModels, (_e, provider?: AgentProviderId) =>
    provider ? agentModelCatalog.refresh(provider) : agentModelCatalog.refreshAll(),
  )
  ipcMain.handle(IPC.agents.setDefaultModel, (_e, provider: AgentProviderId, model: string) =>
    agentModelCatalog.setDefaultModel(provider, model),
  )
  ipcMain.handle(IPC.agents.setReasoningEffort, (_e, provider: AgentProviderId, effort: string) =>
    agentModelCatalog.setReasoningEffort(provider, effort),
  )

  ipcMain.handle(IPC.generation.start, (_e, request: GenerateScriptRequest) =>
    codexService.generateScript(request),
  )
  ipcMain.handle(IPC.generation.adjust, (_e, request: AdjustScriptRequest) =>
    codexService.adjustScript(request),
  )
  ipcMain.handle(IPC.generation.cancel, () => codexService.cancel())
  ipcMain.handle(IPC.generation.interrupted, () => generationRunRepository.listInterrupted())

  ipcMain.handle(IPC.chat.listConversations, () => chatService.listConversations())
  ipcMain.handle(IPC.chat.getConversation, (_e, id: string) => chatService.getConversation(id))
  ipcMain.handle(
    IPC.chat.createConversation,
    (
      _e,
      input?: {
        title?: string
        projectId?: string | null
        useProjectContext?: boolean
        lastAgent?: 'codex' | 'antigravity' | null
        modelOverride?: string | null
        effortOverride?: string | null
      },
    ) => chatService.createConversation(input),
  )
  ipcMain.handle(IPC.chat.renameConversation, (_e, id: string, title: string) =>
    chatService.renameConversation(id, title),
  )
  ipcMain.handle(
    IPC.chat.setContext,
    (
      _e,
      id: string,
      patch: {
        projectId?: string | null
        useProjectContext?: boolean
        lastAgent?: 'codex' | 'antigravity' | null
        modelOverride?: string | null
        effortOverride?: string | null
      },
    ) => chatService.setConversationContext(id, patch),
  )
  ipcMain.handle(IPC.chat.removeConversation, (_e, id: string) =>
    chatService.removeConversation(id),
  )
  ipcMain.handle(IPC.chat.sendMessage, (_e, request: ChatSendMessageRequest) =>
    chatService.sendMessage(request),
  )
  ipcMain.handle(IPC.chat.confirmActions, (_e, conversationId: string, accepted: boolean) =>
    chatService.confirmActions(conversationId, accepted),
  )
  ipcMain.handle(IPC.chat.agentStatus, () => chatService.agentStatus())
  ipcMain.handle(IPC.chat.prepareAttachments, (_e, paths: string[]) =>
    chatService.prepareAttachments(paths),
  )

  ipcMain.handle(IPC.dialog.selectFolder, async () => {
    const win = getMainWindow()
    const settings = settingsRepository.get()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openDirectory'],
      defaultPath: settings.skillLibraryRoot || undefined,
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.dialog.selectImage, async () => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile'],
      filters: [
        { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
  ipcMain.handle(IPC.dialog.readImageDataUrl, (_e, filePath: string) => readImageDataUrl(filePath))

  ipcMain.handle(IPC.dialog.selectFiles, async () => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Anexar ao Chat',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Arquivos', extensions: ['*'] },
        { name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Áudio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] },
        { name: 'Texto', extensions: ['txt', 'md', 'json', 'csv', 'html'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return result.filePaths
  })

  ipcMain.handle(IPC.dialog.selectExecutable, async () => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Executável', extensions: ['exe', 'cmd', 'bat'] }]
          : [{ name: 'Todos', extensions: ['*'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.updates.status, () => getAppUpdateStatus())
  ipcMain.handle(IPC.updates.check, () => checkForAppUpdates({ silent: false }))
  ipcMain.handle(IPC.updates.download, () => downloadAppUpdate())
  ipcMain.handle(IPC.updates.install, () => installAppUpdate())

  ipcMain.handle(IPC.system.copyText, (_e, text: string) => {
    clipboard.writeText(text)
    return true
  })

  ipcMain.handle(IPC.system.openPath, async (_e, targetPath: string) => {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Caminho inválido')
    }
    if (/^https?:\/\//i.test(targetPath)) {
      try {
        await shell.openExternal(targetPath)
        return true
      } catch {
        if (process.platform === 'win32') {
          const { spawn } = await import('node:child_process')
          spawn('cmd', ['/c', 'start', '', targetPath], {
            windowsHide: true,
            stdio: 'ignore',
            detached: true,
          }).unref()
          return true
        }
        throw new Error('Não foi possível abrir o navegador.')
      }
    }
    const resolved = path.resolve(targetPath)
    const error = await shell.openPath(resolved)
    if (error) throw new Error(error)
    return true
  })
}
