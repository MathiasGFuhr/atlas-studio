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
  GenerateScriptRequest,
  Niche,
  Project,
  ProjectType,
  AppSettings,
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
} from '../services/storage/profilePhoto'
import { importChannelImage } from '../services/storage/channelMedia'
import { channelRepository } from '../repositories/channelRepository'
import { promptRepository } from '../repositories/promptRepository'
import { quickPromptRepository } from '../repositories/quickPromptRepository'
import type { CustomPrompt } from '../../shared/quickPrompts/types'
import { musicRepository } from '../repositories/musicRepository'
import { taskRepository } from '../repositories/taskRepository'
import type { AntigravityService } from '../services/antigravity/AntigravityService'
import type { MusicSegment, MusicCutMode } from '../../shared/musicAnalysis'
import type { ChatSendMessageRequest } from '../../shared/chat/types'
import { ChatService } from '../services/chat/ChatService'
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
  getMainWindow: () => BrowserWindow | null
}) {
  const { codexService, runtimeManager, antigravityService, chatService, getMainWindow } = deps

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
  ipcMain.handle(IPC.projects.remove, (_e, id: string) => projectRepository.remove(id))

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
  ipcMain.handle(
    IPC.videos.create,
    (
      _e,
      input: Omit<ChannelVideo, 'id' | 'createdAt' | 'updatedAt' | 'thumbnailDataUrl' | 'folderExists'>,
    ) => channelRepository.createVideo(input),
  )
  ipcMain.handle(
    IPC.videos.update,
    (
      _e,
      id: string,
      patch: Partial<
        Omit<ChannelVideo, 'id' | 'channelId' | 'createdAt' | 'thumbnailDataUrl' | 'folderExists'>
      >,
    ) => channelRepository.updateVideo(id, patch),
  )
  ipcMain.handle(IPC.videos.remove, (_e, id: string) => channelRepository.removeVideo(id))
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
    (_e, input: { name: string; category?: string; text: string; projectId?: string | null }) =>
      quickPromptRepository.create(input),
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

  ipcMain.handle(IPC.antigravity.status, () => antigravityService.getStatus())
  ipcMain.handle(IPC.antigravity.healthCheck, () => antigravityService.healthCheck())
  ipcMain.handle(IPC.antigravity.loginStart, () => antigravityService.loginStart())
  ipcMain.handle(IPC.antigravity.loginCancel, () => {
    antigravityService.loginCancel()
  })
  ipcMain.handle(IPC.antigravity.loginConfirm, () => antigravityService.loginConfirm())
  ipcMain.handle(IPC.antigravity.logout, () => antigravityService.logout())
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
      patch: Partial<{ name: string; duration: number; cutMode: MusicCutMode; cuts: MusicSegment[] }>,
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
  ipcMain.handle(
    IPC.music.export,
    async (_e, payload: { id: string; start: number; end: number; filename?: string }) => {
      const track = musicRepository.get(payload.id)
      if (!track) throw new Error('Música não encontrada')
      const win = getMainWindow()
      const suggested = payload.filename || `${track.name}-corte.mp3`
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: 'Exportar corte',
        defaultPath: suggested,
        filters: [{ name: 'MP3', extensions: ['mp3'] }],
      })
      if (result.canceled || !result.filePath) return null
      return musicRepository.exportSegment(payload.id, payload.start, payload.end, result.filePath)
    },
  )

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
  ipcMain.handle(IPC.codex.connect, () => codexService.connect())
  ipcMain.handle(IPC.codex.disconnect, () => codexService.disconnect())
  ipcMain.handle(IPC.codex.healthCheck, () => runtimeManager.healthCheck())
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
  ipcMain.handle(IPC.codex.logout, () => runtimeManager.logout())
  ipcMain.handle(IPC.codex.onboardingDismissed, () => {
    runtimeManager.dismissOnboarding()
  })
  ipcMain.handle(IPC.codex.isOnboardingDismissed, () =>
    runtimeManager.isOnboardingDismissed(),
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
      input?: { title?: string; projectId?: string | null; useProjectContext?: boolean },
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
      patch: { projectId?: string | null; useProjectContext?: boolean },
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
