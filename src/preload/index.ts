import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdjustScriptRequest,
  AppSettings,
  CodexAccountInfo,
  CodexLoginStartResult,
  CodexStatus,
  AnalyzeTitleRequest,
  AnalyzeTitleResult,
  AnalyzeQuickPromptRequest,
  AnalyzeQuickPromptResult,
  AntigravityLoginStartResult,
  AntigravityStatus,
  Channel,
  ChannelPrompt,
  ChannelVideo,
  DiscoveredSkill,
  GenerateScriptRequest,
  GenerationProgressEvent,
  GenerationResult,
  Niche,
  Project,
  ProjectType,
  ScriptRecord,
  ScriptVersion,
  SkillRescanResult,
  SkillValidationResult,
  AtlasTask,
  TaskStatus,
  TaskWriteInput,
} from '../shared/types'
import type { MusicCutMode, MusicSegment, MusicTrack } from '../shared/musicAnalysis'
import type { CustomPrompt } from '../shared/quickPrompts/types'
import type {
  ChatAgentStatusSnapshot,
  ChatAttachment,
  ChatConversation,
  ChatConversationDetail,
  ChatProgressEvent,
  ChatSendMessageRequest,
  ChatSendMessageResult,
} from '../shared/chat/types'
import type { AppUpdateStatus } from '../shared/updates'
import { IPC } from '../shared/types'

const api = {
  projects: {
    list: (filters?: { projectType?: ProjectType; query?: string }) =>
      ipcRenderer.invoke(IPC.projects.list, filters) as Promise<Project[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.projects.get, id) as Promise<Project | null>,
    create: (input: {
      name: string
      description?: string
      projectType: ProjectType
      channelId?: string | null
    }) => ipcRenderer.invoke(IPC.projects.create, input) as Promise<Project>,
    update: (
      id: string,
      patch: Partial<Pick<Project, 'name' | 'description' | 'projectFolderPath' | 'channelId'>>,
    ) => ipcRenderer.invoke(IPC.projects.update, id, patch) as Promise<Project | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.projects.remove, id) as Promise<boolean>,
    /** Cria a pasta física do projeto na raiz configurada. */
    createFolder: (id: string) =>
      ipcRenderer.invoke(IPC.projects.createFolder, id) as Promise<Project | null>,
    /** Abre o seletor nativo de diretórios e vincula a pasta escolhida. */
    linkFolder: (id: string) =>
      ipcRenderer.invoke(IPC.projects.linkFolder, id) as Promise<Project | null>,
    /** Abre a pasta vinculada no Explorer. */
    openFolder: (id: string) =>
      ipcRenderer.invoke(IPC.projects.openFolder, id) as Promise<boolean>,
  },
  niches: {
    list: (filters?: { query?: string; language?: string }) =>
      ipcRenderer.invoke(IPC.niches.list, filters) as Promise<Niche[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.niches.get, id) as Promise<Niche | null>,
    create: (input: Omit<Niche, 'id' | 'createdAt' | 'updatedAt'>) =>
      ipcRenderer.invoke(IPC.niches.create, input) as Promise<Niche>,
    update: (id: string, patch: Partial<Omit<Niche, 'id' | 'createdAt'>>) =>
      ipcRenderer.invoke(IPC.niches.update, id, patch) as Promise<Niche | null>,
  },
  channels: {
    list: (filters?: { query?: string; channelType?: ProjectType }) =>
      ipcRenderer.invoke(IPC.channels.list, filters) as Promise<Channel[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.channels.get, id) as Promise<Channel | null>,
    create: (
      input: Omit<Channel, 'id' | 'createdAt' | 'updatedAt' | 'avatarDataUrl' | 'videoCount' | 'nicheName'>,
    ) => ipcRenderer.invoke(IPC.channels.create, input) as Promise<Channel>,
    update: (
      id: string,
      patch: Partial<Omit<Channel, 'id' | 'createdAt' | 'avatarDataUrl' | 'videoCount' | 'nicheName'>>,
    ) => ipcRenderer.invoke(IPC.channels.update, id, patch) as Promise<Channel | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.channels.remove, id) as Promise<boolean>,
    setAvatar: (channelId: string, sourcePath: string) =>
      ipcRenderer.invoke(IPC.channels.setAvatar, channelId, sourcePath) as Promise<Channel | null>,
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasks.list) as Promise<AtlasTask[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.tasks.get, id) as Promise<AtlasTask | null>,
    create: (input: TaskWriteInput) =>
      ipcRenderer.invoke(IPC.tasks.create, input) as Promise<AtlasTask>,
    update: (id: string, patch: Partial<TaskWriteInput>) =>
      ipcRenderer.invoke(IPC.tasks.update, id, patch) as Promise<AtlasTask | null>,
    setStatus: (id: string, status: TaskStatus) =>
      ipcRenderer.invoke(IPC.tasks.setStatus, id, status) as Promise<AtlasTask | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.tasks.remove, id) as Promise<boolean>,
    pendingCount: () => ipcRenderer.invoke(IPC.tasks.pendingCount) as Promise<number>,
  },
  videos: {
    list: (filters: { channelId: string; from?: string; to?: string }) =>
      ipcRenderer.invoke(IPC.videos.list, filters) as Promise<ChannelVideo[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.videos.get, id) as Promise<ChannelVideo | null>,
    create: (
      input: Omit<ChannelVideo, 'id' | 'createdAt' | 'updatedAt' | 'thumbnailDataUrl' | 'folderExists'>,
    ) => ipcRenderer.invoke(IPC.videos.create, input) as Promise<ChannelVideo>,
    update: (
      id: string,
      patch: Partial<
        Omit<ChannelVideo, 'id' | 'channelId' | 'createdAt' | 'thumbnailDataUrl' | 'folderExists'>
      >,
    ) => ipcRenderer.invoke(IPC.videos.update, id, patch) as Promise<ChannelVideo | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.videos.remove, id) as Promise<boolean>,
    setThumbnail: (videoId: string, sourcePath: string) =>
      ipcRenderer.invoke(IPC.videos.setThumbnail, videoId, sourcePath) as Promise<ChannelVideo | null>,
    analyzeTitle: (request: AnalyzeTitleRequest) =>
      ipcRenderer.invoke(IPC.videos.analyzeTitle, request) as Promise<AnalyzeTitleResult>,
  },
  prompts: {
    list: (filters?: { channelId?: string; query?: string }) =>
      ipcRenderer.invoke(IPC.prompts.list, filters) as Promise<ChannelPrompt[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.prompts.get, id) as Promise<ChannelPrompt | null>,
    create: (input: { channelId: string; title: string; content: string }) =>
      ipcRenderer.invoke(IPC.prompts.create, input) as Promise<ChannelPrompt>,
    update: (
      id: string,
      patch: Partial<Omit<ChannelPrompt, 'id' | 'createdAt' | 'channelName'>>,
    ) => ipcRenderer.invoke(IPC.prompts.update, id, patch) as Promise<ChannelPrompt | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.prompts.remove, id) as Promise<boolean>,
  },
  quickPrompts: {
    list: (filters?: { projectId?: string | null; query?: string }) =>
      ipcRenderer.invoke(IPC.quickPrompts.list, filters) as Promise<CustomPrompt[]>,
    create: (input: {
      name: string
      category?: string
      text: string
      projectId?: string | null
    }) => ipcRenderer.invoke(IPC.quickPrompts.create, input) as Promise<CustomPrompt>,
    update: (id: string, patch: Partial<Omit<CustomPrompt, 'id' | 'createdAt' | 'updatedAt'>>) =>
      ipcRenderer.invoke(IPC.quickPrompts.update, id, patch) as Promise<CustomPrompt | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.quickPrompts.remove, id) as Promise<boolean>,
    listFavorites: () =>
      ipcRenderer.invoke(IPC.quickPrompts.listFavorites) as Promise<string[]>,
    setFavorite: (itemId: string, favorite: boolean) =>
      ipcRenderer.invoke(IPC.quickPrompts.setFavorite, itemId, favorite) as Promise<string[]>,
  },
  antigravity: {
    status: () => ipcRenderer.invoke(IPC.antigravity.status) as Promise<AntigravityStatus>,
    healthCheck: () => ipcRenderer.invoke(IPC.antigravity.healthCheck) as Promise<AntigravityStatus>,
    loginStart: () =>
      ipcRenderer.invoke(IPC.antigravity.loginStart) as Promise<AntigravityLoginStartResult>,
    loginCancel: () => ipcRenderer.invoke(IPC.antigravity.loginCancel) as Promise<void>,
    loginConfirm: () =>
      ipcRenderer.invoke(IPC.antigravity.loginConfirm) as Promise<AntigravityStatus>,
    logout: () => ipcRenderer.invoke(IPC.antigravity.logout) as Promise<AntigravityStatus>,
    analyzeQuickPrompt: (request: AnalyzeQuickPromptRequest) =>
      ipcRenderer.invoke(IPC.antigravity.analyzeQuickPrompt, request) as Promise<AnalyzeQuickPromptResult>,
    onAuthStateChanged: (callback: (status: AntigravityStatus) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: AntigravityStatus) => callback(data)
      ipcRenderer.on(IPC.antigravity.authStateChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.antigravity.authStateChanged, listener)
      }
    },
  },
  music: {
    list: (filters?: { projectId?: string }) =>
      ipcRenderer.invoke(IPC.music.list, filters) as Promise<MusicTrack[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.music.get, id) as Promise<MusicTrack | null>,
    import: (projectId?: string | null) =>
      ipcRenderer.invoke(IPC.music.import, projectId) as Promise<MusicTrack | null>,
    update: (
      id: string,
      patch: Partial<{ name: string; duration: number; cutMode: MusicCutMode; cuts: MusicSegment[] }>,
    ) => ipcRenderer.invoke(IPC.music.update, id, patch) as Promise<MusicTrack | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.music.remove, id) as Promise<boolean>,
    preview: (id: string) => ipcRenderer.invoke(IPC.music.preview, id) as Promise<Uint8Array>,
    export: (payload: { id: string; start: number; end: number; filename?: string }) =>
      ipcRenderer.invoke(IPC.music.export, payload) as Promise<string | null>,
  },
  skills: {
    list: () => ipcRenderer.invoke(IPC.skills.list) as Promise<DiscoveredSkill[]>,
    rescan: (libraryRoot?: string) =>
      ipcRenderer.invoke(IPC.skills.rescan, libraryRoot) as Promise<SkillRescanResult>,
    validate: (skillPath: string) =>
      ipcRenderer.invoke(IPC.skills.validate, skillPath) as Promise<SkillValidationResult>,
  },
  scripts: {
    list: (filters?: {
      query?: string
      nicheId?: string
      language?: string
      projectId?: string
    }) => ipcRenderer.invoke(IPC.scripts.list, filters) as Promise<ScriptRecord[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.scripts.get, id) as Promise<ScriptRecord | null>,
    recent: (limit?: number) =>
      ipcRenderer.invoke(IPC.scripts.recent, limit) as Promise<ScriptRecord[]>,
    summary: () =>
      ipcRenderer.invoke(IPC.scripts.summary) as Promise<{
        total: number
        prontos: number
        rascunhos: number
        emRevisao: number
        erros: number
      }>,
    versions: (scriptId: string) =>
      ipcRenderer.invoke(IPC.scripts.versions, scriptId) as Promise<ScriptVersion[]>,
    saveVersion: (scriptId: string) =>
      ipcRenderer.invoke(IPC.scripts.saveVersion, scriptId) as Promise<ScriptVersion>,
    export: (scriptId: string, format: 'txt' | 'md') =>
      ipcRenderer.invoke(IPC.scripts.export, { scriptId, format }) as Promise<string | null>,
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get) as Promise<AppSettings>,
    update: (patch: Partial<AppSettings>) =>
      ipcRenderer.invoke(IPC.settings.update, patch) as Promise<AppSettings>,
    setProfilePhoto: (sourcePath: string) =>
      ipcRenderer.invoke(IPC.settings.setProfilePhoto, sourcePath) as Promise<AppSettings>,
    clearProfilePhoto: () =>
      ipcRenderer.invoke(IPC.settings.clearProfilePhoto) as Promise<AppSettings>,
  },
  codex: {
    status: () => ipcRenderer.invoke(IPC.codex.status) as Promise<CodexStatus>,
    connect: () => ipcRenderer.invoke(IPC.codex.connect) as Promise<CodexStatus>,
    disconnect: () => ipcRenderer.invoke(IPC.codex.disconnect) as Promise<void>,
    accountRead: () =>
      ipcRenderer.invoke(IPC.codex.accountRead) as Promise<CodexAccountInfo | null>,
    loginStart: (type?: string) =>
      ipcRenderer.invoke(IPC.codex.loginStart, type) as Promise<CodexLoginStartResult>,
    loginCancel: () => ipcRenderer.invoke(IPC.codex.loginCancel) as Promise<void>,
    logout: () => ipcRenderer.invoke(IPC.codex.logout) as Promise<void>,
    healthCheck: () => ipcRenderer.invoke(IPC.codex.healthCheck) as Promise<CodexStatus>,
    listModels: () =>
      ipcRenderer.invoke(IPC.codex.listModels) as Promise<{
        models: Array<{ id: string; label: string; description?: string }>
        configured: string | null
        effective: string
      }>,
    onAuthStateChanged: (callback: (status: CodexStatus) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: CodexStatus) => callback(data)
      ipcRenderer.on(IPC.codex.authStateChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.codex.authStateChanged, listener)
      }
    },
    onLoginUrl: (callback: (payload: { authUrl: string; userCode?: string }) => void) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        data: { authUrl: string; userCode?: string },
      ) => callback(data)
      ipcRenderer.on(IPC.codex.loginUrl, listener)
      return () => {
        ipcRenderer.removeListener(IPC.codex.loginUrl, listener)
      }
    },
    dismissOnboarding: () =>
      ipcRenderer.invoke(IPC.codex.onboardingDismissed) as Promise<void>,
    isOnboardingDismissed: () =>
      ipcRenderer.invoke(IPC.codex.isOnboardingDismissed) as Promise<boolean>,
  },
  generation: {
    start: (request: GenerateScriptRequest) =>
      ipcRenderer.invoke(IPC.generation.start, request) as Promise<GenerationResult>,
    adjust: (request: AdjustScriptRequest) =>
      ipcRenderer.invoke(IPC.generation.adjust, request) as Promise<GenerationResult>,
    cancel: () => ipcRenderer.invoke(IPC.generation.cancel) as Promise<void>,
    interrupted: () =>
      ipcRenderer.invoke(IPC.generation.interrupted) as Promise<
        Array<{
          id: string
          nicheId: string | null
          startedAt: string
          errorMessage?: string | null
        }>
      >,
    onProgress: (callback: (event: GenerationProgressEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: GenerationProgressEvent) =>
        callback(data)
      ipcRenderer.on(IPC.generation.progress, listener)
      return () => {
        ipcRenderer.removeListener(IPC.generation.progress, listener)
      }
    },
  },
  chat: {
    listConversations: () =>
      ipcRenderer.invoke(IPC.chat.listConversations) as Promise<ChatConversation[]>,
    getConversation: (id: string) =>
      ipcRenderer.invoke(IPC.chat.getConversation, id) as Promise<ChatConversationDetail | null>,
    createConversation: (input?: {
      title?: string
      projectId?: string | null
      useProjectContext?: boolean
    }) => ipcRenderer.invoke(IPC.chat.createConversation, input) as Promise<ChatConversation>,
    renameConversation: (id: string, title: string) =>
      ipcRenderer.invoke(IPC.chat.renameConversation, id, title) as Promise<ChatConversation | null>,
    setContext: (
      id: string,
      patch: { projectId?: string | null; useProjectContext?: boolean },
    ) => ipcRenderer.invoke(IPC.chat.setContext, id, patch) as Promise<ChatConversation | null>,
    removeConversation: (id: string) =>
      ipcRenderer.invoke(IPC.chat.removeConversation, id) as Promise<boolean>,
    sendMessage: (request: ChatSendMessageRequest) =>
      ipcRenderer.invoke(IPC.chat.sendMessage, request) as Promise<ChatSendMessageResult>,
    confirmActions: (conversationId: string, accepted: boolean) =>
      ipcRenderer.invoke(IPC.chat.confirmActions, conversationId, accepted) as Promise<ChatSendMessageResult>,
    agentStatus: () =>
      ipcRenderer.invoke(IPC.chat.agentStatus) as Promise<ChatAgentStatusSnapshot>,
    prepareAttachments: (paths: string[]) =>
      ipcRenderer.invoke(IPC.chat.prepareAttachments, paths) as Promise<ChatAttachment[]>,
    onProgress: (callback: (event: ChatProgressEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: ChatProgressEvent) => callback(data)
      ipcRenderer.on(IPC.chat.progress, listener)
      return () => {
        ipcRenderer.removeListener(IPC.chat.progress, listener)
      }
    },
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke(IPC.dialog.selectFolder) as Promise<string | null>,
    selectImage: () => ipcRenderer.invoke(IPC.dialog.selectImage) as Promise<string | null>,
    selectFiles: () => ipcRenderer.invoke(IPC.dialog.selectFiles) as Promise<string[]>,
    selectExecutable: () =>
      ipcRenderer.invoke(IPC.dialog.selectExecutable) as Promise<string | null>,
  },
  system: {
    copyText: (text: string) => ipcRenderer.invoke(IPC.system.copyText, text) as Promise<boolean>,
    openPath: (targetPath: string) =>
      ipcRenderer.invoke(IPC.system.openPath, targetPath) as Promise<boolean>,
  },
  updates: {
    status: () => ipcRenderer.invoke(IPC.updates.status) as Promise<AppUpdateStatus>,
    check: () => ipcRenderer.invoke(IPC.updates.check) as Promise<AppUpdateStatus>,
    download: () => ipcRenderer.invoke(IPC.updates.download) as Promise<AppUpdateStatus>,
    install: () => ipcRenderer.invoke(IPC.updates.install) as Promise<AppUpdateStatus>,
    onChanged: (callback: (status: AppUpdateStatus) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: AppUpdateStatus) => callback(data)
      ipcRenderer.on(IPC.updates.changed, listener)
      return () => {
        ipcRenderer.removeListener(IPC.updates.changed, listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('atlas', api)

export type AtlasApi = typeof api
