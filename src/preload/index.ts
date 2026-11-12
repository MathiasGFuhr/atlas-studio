import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
  SelectFolderOptions,
  ChannelVideo,
  ChannelVideoWriteInput,
  DiscoveredSkill,
  GenerateScriptRequest,
  GenerationProgressEvent,
  GenerationResult,
  Niche,
  Project,
  ProjectPatch,
  ProjectType,
  RemoveProjectOptions,
  ScriptRecord,
  ScriptVersion,
  SkillRescanResult,
  SkillValidationResult,
  AtlasTask,
  TaskStatus,
  TaskWriteInput,
  VideoListFilters,
} from '../shared/types'
import type {
  AutoCutPreset,
  MusicCaptionLanguage,
  MusicCaptionModel,
  MusicCutMode,
  MusicSegment,
  MusicTrack,
} from '../shared/musicAnalysis'
import type { MusicAdviseRequest, MusicAdviseResult } from '../shared/audio/audioCutAdvisor'
import type { AudioExportFormat, Mp3Bitrate } from '../shared/audio/audioExport'
import type {
  ShortsAnalyzeInput,
  ShortsClipPatch,
  ShortsCopyFields,
  ShortsJob,
  ShortsProgressEvent,
} from '../shared/shorts'
import type { ShortsAnalysisPlan } from '../shared/shorts/analysisPlan'
import type { ShortsProjectListFilters } from '../shared/shortsProject'
import type { ShortsImportResult } from '../shared/shortsProjectIdentity'
import type {
  CustomPrompt,
  CustomPromptTab,
  SharedPromptCatalogSnapshot,
} from '../shared/quickPrompts/types'
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
import type {
  AtlasAuthInput,
  AtlasSession,
  TeamChatCreateGroupInput,
  TeamChatMember,
  TeamChatMessage,
  TeamChatPeer,
  TeamChatRoom,
  TeamChatSendInput,
  TeamChatTyping,
} from '../shared/account'
import type {
  LipSyncFolderScan,
  LipSyncRef,
  LipSyncRefCreateInput,
  LipSyncRefListFilters,
  LipSyncRefUpdateInput,
  LipSyncSubject,
} from '../shared/lipSyncRefs'
import type {
  FlowCreateProgress,
  FlowExtensionStatus,
  FlowGenerationCard,
  FlowProject,
  FlowProjectCreateInput,
  FlowProjectPatch,
  FlowReference,
  FlowReferenceUpdateInput,
} from '../shared/flowProjects'
import type {
  ComfyBatchView,
  ComfyConfig,
  ComfyConfigPatch,
  ComfyConnectionInfo,
  ComfyDiscoverResult,
  ComfyStartResult,
} from '../shared/comfy'
import type {
  RunpodInfraStatus,
  RunpodPodLifecycleState,
  RunpodStartPodRequest,
  RunpodStartPreview,
  RunpodStopPodRequest,
  RunpodStopPodResult,
} from '../shared/runpod'
import type {
  ComfyConnectConfirmRequest,
  ComfyConnectConfirmResult,
  ComfyConnectPrepareResult,
  ComfyConnectRefreshResult,
} from '../shared/comfyConnect'
import type { LipsyncControlledTestPlan } from '../shared/lipsyncControlledTest'
import type { ComfyGpuRecoveryConfirmRequest } from '../shared/comfyGpuRecovery'
import type { GpuRecoveryValidationBundle } from '../shared/gpuRecoveryValidation'
import type { LtxEnvironmentPlan, LtxEnvironmentPrepStatus } from '../shared/ltxEnvironment'
import type { ExportLtxWorkflowResult, LtxPhase4ValidationStatus } from '../shared/ltxPhase4'
import type { LtxControlledValidationPlan } from '../shared/ltxControlledValidation'
import type { LtxAutoDetectResult } from '../shared/ltxAutoDetect'
import type { LtxDetectionBootResult } from '../shared/ltxDetectionSnapshot'
import type { WorkspaceCapabilities } from '../shared/workspaceCapabilities'
import type { AgentModelSnapshot, AgentModelsBundle, AgentProviderId } from '../shared/agents/types'
import type {
  EditorAspect,
  EditorAsset,
  EditorAssetOrigin,
  EditorAudioAlignResult,
  EditorExportProgress,
  EditorExportRequest,
  EditorLipsyncGroup,
  EditorProject,
  EditorProjectChangedEvent,
  EditorProjectPatch,
  EditorWaveform,
} from '../shared/editor/types'

type EditorImportResult = { assets: EditorAsset[]; errors: string[] }

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
      projectFolderPath?: string | null
    }) => ipcRenderer.invoke(IPC.projects.create, input) as Promise<Project>,
    update: (id: string, patch: ProjectPatch) =>
      ipcRenderer.invoke(IPC.projects.update, id, patch) as Promise<Project | null>,
    remove: (id: string, options?: RemoveProjectOptions) =>
      ipcRenderer.invoke(IPC.projects.remove, id, options) as Promise<boolean>,
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
    list: (filters?: VideoListFilters) =>
      ipcRenderer.invoke(IPC.videos.list, filters) as Promise<ChannelVideo[]>,
    count: (filters?: VideoListFilters) =>
      ipcRenderer.invoke(IPC.videos.count, filters) as Promise<number>,
    get: (id: string) => ipcRenderer.invoke(IPC.videos.get, id) as Promise<ChannelVideo | null>,
    create: (input: ChannelVideoWriteInput) =>
      ipcRenderer.invoke(IPC.videos.create, input) as Promise<ChannelVideo>,
    update: (
      id: string,
      patch: Partial<
        Omit<ChannelVideo, 'id' | 'channelId' | 'createdAt' | 'thumbnailDataUrl' | 'folderExists' | 'projectName'>
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
      tabId?: string | null
      projectId?: string | null
    }) => ipcRenderer.invoke(IPC.quickPrompts.create, input) as Promise<CustomPrompt>,
    update: (id: string, patch: Partial<Omit<CustomPrompt, 'id' | 'createdAt' | 'updatedAt'>>) =>
      ipcRenderer.invoke(IPC.quickPrompts.update, id, patch) as Promise<CustomPrompt | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.quickPrompts.remove, id) as Promise<boolean>,
    listFavorites: () =>
      ipcRenderer.invoke(IPC.quickPrompts.listFavorites) as Promise<string[]>,
    setFavorite: (itemId: string, favorite: boolean) =>
      ipcRenderer.invoke(IPC.quickPrompts.setFavorite, itemId, favorite) as Promise<string[]>,
    listTabs: () => ipcRenderer.invoke(IPC.quickPrompts.listTabs) as Promise<CustomPromptTab[]>,
    createTab: (input: { name: string }) =>
      ipcRenderer.invoke(IPC.quickPrompts.createTab, input) as Promise<CustomPromptTab>,
    updateTab: (id: string, patch: { name?: string; sortOrder?: number }) =>
      ipcRenderer.invoke(IPC.quickPrompts.updateTab, id, patch) as Promise<CustomPromptTab | null>,
    removeTab: (id: string) =>
      ipcRenderer.invoke(IPC.quickPrompts.removeTab, id) as Promise<boolean>,
    listShared: () =>
      ipcRenderer.invoke(IPC.quickPrompts.listShared) as Promise<SharedPromptCatalogSnapshot>,
    setPublic: (id: string, isPublic: boolean) =>
      ipcRenderer.invoke(IPC.quickPrompts.setPublic, id, isPublic) as Promise<CustomPrompt>,
    copyShared: (sharedId: string, input?: { tabId?: string | null }) =>
      ipcRenderer.invoke(IPC.quickPrompts.copyShared, sharedId, input) as Promise<CustomPrompt>,
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
      patch: Partial<{
        name: string
        duration: number
        cutMode: MusicCutMode
        cuts: MusicSegment[]
        selectedId: string | null
        appliedPreset: AutoCutPreset | null
      }>,
    ) => ipcRenderer.invoke(IPC.music.update, id, patch) as Promise<MusicTrack | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.music.remove, id) as Promise<boolean>,
    preview: (id: string) => ipcRenderer.invoke(IPC.music.preview, id) as Promise<Uint8Array>,
    previewUrl: (id: string) => ipcRenderer.invoke(IPC.music.previewUrl, id) as Promise<string>,
    export: (payload: {
      id: string
      start: number
      end: number
      filename?: string
      format?: AudioExportFormat
      bitrate?: Mp3Bitrate
      directory?: string
    }) => ipcRenderer.invoke(IPC.music.export, payload) as Promise<string | null>,
    exportAll: (payload: {
      id: string
      format?: AudioExportFormat
      bitrate?: Mp3Bitrate
      directory?: string
      cuts?: Array<{ start: number; end: number; label: string }>
    }) => ipcRenderer.invoke(IPC.music.exportAll, payload) as Promise<string[] | null>,
    chooseExportFolder: () => ipcRenderer.invoke(IPC.music.chooseExportFolder) as Promise<string | null>,
    adviseCuts: (request: MusicAdviseRequest) =>
      ipcRenderer.invoke(IPC.music.adviseCuts, request) as Promise<MusicAdviseResult>,
    transcribe: (id: string, language?: MusicCaptionLanguage, model?: MusicCaptionModel) =>
      ipcRenderer.invoke(IPC.music.transcribe, id, language, model) as Promise<MusicTrack | null>,
    exportSrt: (id: string) => ipcRenderer.invoke(IPC.music.exportSrt, id) as Promise<string | null>,
    importSrt: (id: string) => ipcRenderer.invoke(IPC.music.importSrt, id) as Promise<MusicTrack | null>,
    exportCutsToLipSync: (payload: {
      trackId: string
      cuts?: Array<{ start: number; end: number; label: string }>
      format?: AudioExportFormat
      bitrate?: Mp3Bitrate
      subject?: 'singer' | 'band'
    }) =>
      ipcRenderer.invoke(IPC.music.exportCutsToLipSync, payload) as Promise<{
        folder: string
        files: string[]
        refs: Array<{ id: string; label: string }>
      } | null>,
  },
  shorts: {
    list: (filters?: ShortsProjectListFilters) =>
      ipcRenderer.invoke(IPC.shorts.list, filters) as Promise<ShortsJob[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.shorts.get, id) as Promise<ShortsJob | null>,
    import: (projectId?: string | null) =>
      ipcRenderer.invoke(IPC.shorts.import, projectId) as Promise<ShortsImportResult | null>,
    createFromSourceVideo: (input: { sourcePath: string; projectId?: string | null; forceNew?: boolean }) =>
      ipcRenderer.invoke(IPC.shorts.createFromSourceVideo, input) as Promise<ShortsImportResult>,
    analyze: (request: ShortsAnalyzeInput) =>
      ipcRenderer.invoke(IPC.shorts.analyze, request) as Promise<ShortsJob>,
    getAnalysisPlan: () => ipcRenderer.invoke(IPC.shorts.getAnalysisPlan) as Promise<ShortsAnalysisPlan>,
    updateClip: (jobId: string, clipId: string, patch: ShortsClipPatch) =>
      ipcRenderer.invoke(IPC.shorts.updateClip, jobId, clipId, patch) as Promise<ShortsJob | null>,
    removeClip: (jobId: string, clipId: string) =>
      ipcRenderer.invoke(IPC.shorts.removeClip, jobId, clipId) as Promise<ShortsJob | null>,
    regenerateCopy: (payload: { jobId: string; clipId: string; fields?: ShortsCopyFields }) =>
      ipcRenderer.invoke(IPC.shorts.regenerateCopy, payload) as Promise<ShortsJob>,
    updateSettings: (
      jobId: string,
      patch: Partial<
        Pick<
          ShortsJob,
          | 'name'
          | 'profile'
          | 'clipCount'
          | 'requestedDuration'
          | 'durationMode'
          | 'aspectMode'
          | 'framingSettings'
          | 'logoSettings'
          | 'captionsEnabled'
          | 'languageOverride'
        >
      >,
    ) => ipcRenderer.invoke(IPC.shorts.updateSettings, jobId, patch) as Promise<ShortsJob | null>,
    setLogo: (jobId: string, sourcePath: string) =>
      ipcRenderer.invoke(IPC.shorts.setLogo, jobId, sourcePath) as Promise<ShortsJob | null>,
    clearLogo: (jobId: string) =>
      ipcRenderer.invoke(IPC.shorts.clearLogo, jobId) as Promise<ShortsJob | null>,
    export: (payload: { jobId: string; clipId: string }) =>
      ipcRenderer.invoke(IPC.shorts.export, payload) as Promise<string | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.shorts.remove, id) as Promise<boolean>,
    mediaUrl: (jobId: string) => ipcRenderer.invoke(IPC.shorts.mediaUrl, jobId) as Promise<string>,
    thumbnailUrl: (jobId: string) =>
      ipcRenderer.invoke(IPC.shorts.thumbnailUrl, jobId) as Promise<string | null>,
    relink: (jobId: string) => ipcRenderer.invoke(IPC.shorts.relink, jobId) as Promise<ShortsJob | null>,
    openExportsFolder: (jobId: string, clipId?: string) =>
      ipcRenderer.invoke(IPC.shorts.openExportsFolder, jobId, clipId) as Promise<boolean>,
    onProgress: (callback: (event: ShortsProgressEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: ShortsProgressEvent) => callback(data)
      ipcRenderer.on(IPC.shorts.progress, listener)
      return () => {
        ipcRenderer.removeListener(IPC.shorts.progress, listener)
      }
    },
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
  workspace: {
    capabilities: () =>
      ipcRenderer.invoke(IPC.workspace.capabilities) as Promise<WorkspaceCapabilities>,
  },
  account: {
    getSession: () => ipcRenderer.invoke(IPC.account.getSession) as Promise<AtlasSession>,
    signIn: (input: AtlasAuthInput) =>
      ipcRenderer.invoke(IPC.account.signIn, input) as Promise<AtlasSession>,
    signUp: (input: AtlasAuthInput) =>
      ipcRenderer.invoke(IPC.account.signUp, input) as Promise<AtlasSession>,
    signOut: () => ipcRenderer.invoke(IPC.account.signOut) as Promise<AtlasSession>,
    updateProfile: (name: string) =>
      ipcRenderer.invoke(IPC.account.updateProfile, name) as Promise<AtlasSession>,
    onChanged: (callback: (session: AtlasSession) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: AtlasSession) => callback(data)
      ipcRenderer.on(IPC.account.changed, listener)
      return () => {
        ipcRenderer.removeListener(IPC.account.changed, listener)
      }
    },
  },
  teamChat: {
    listRooms: () => ipcRenderer.invoke(IPC.teamChat.listRooms) as Promise<TeamChatRoom[]>,
    listDirectory: () => ipcRenderer.invoke(IPC.teamChat.listDirectory) as Promise<TeamChatPeer[]>,
    listMembers: (roomId: string) =>
      ipcRenderer.invoke(IPC.teamChat.listMembers, roomId) as Promise<TeamChatMember[]>,
    listMessages: (roomId: string) =>
      ipcRenderer.invoke(IPC.teamChat.listMessages, roomId) as Promise<TeamChatMessage[]>,
    openDm: (userId: string) =>
      ipcRenderer.invoke(IPC.teamChat.openDm, userId) as Promise<TeamChatRoom>,
    createGroup: (input: TeamChatCreateGroupInput) =>
      ipcRenderer.invoke(IPC.teamChat.createGroup, input) as Promise<TeamChatRoom>,
    addGroupMembers: (roomId: string, memberIds: string[]) =>
      ipcRenderer.invoke(IPC.teamChat.addGroupMembers, roomId, memberIds) as Promise<TeamChatMember[]>,
    hideForMe: (roomId: string) =>
      ipcRenderer.invoke(IPC.teamChat.hideForMe, roomId) as Promise<void>,
    sendMessage: (input: TeamChatSendInput | string) =>
      ipcRenderer.invoke(IPC.teamChat.sendMessage, input) as Promise<TeamChatMessage>,
    listOnline: () => ipcRenderer.invoke(IPC.teamChat.listOnline) as Promise<TeamChatPeer[]>,
    setActiveRoom: (roomId: string | null) =>
      ipcRenderer.invoke(IPC.teamChat.setActiveRoom, roomId) as Promise<void>,
    setTyping: (roomId: string, typing: boolean) =>
      ipcRenderer.invoke(IPC.teamChat.setTyping, roomId, typing) as Promise<void>,
    onMessage: (callback: (message: TeamChatMessage) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: TeamChatMessage) => callback(data)
      ipcRenderer.on(IPC.teamChat.message, listener)
      return () => {
        ipcRenderer.removeListener(IPC.teamChat.message, listener)
      }
    },
    onTyping: (callback: (event: TeamChatTyping) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: TeamChatTyping) => callback(data)
      ipcRenderer.on(IPC.teamChat.typing, listener)
      return () => {
        ipcRenderer.removeListener(IPC.teamChat.typing, listener)
      }
    },
    onPresence: (callback: (peers: TeamChatPeer[]) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: TeamChatPeer[]) => callback(data)
      ipcRenderer.on(IPC.teamChat.presence, listener)
      return () => {
        ipcRenderer.removeListener(IPC.teamChat.presence, listener)
      }
    },
    onPeerOnline: (callback: (peer: TeamChatPeer) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: TeamChatPeer) => callback(data)
      ipcRenderer.on(IPC.teamChat.peerOnline, listener)
      return () => {
        ipcRenderer.removeListener(IPC.teamChat.peerOnline, listener)
      }
    },
    onOpenChat: (callback: (roomId?: string | null) => void) => {
      const listener = (_: Electron.IpcRendererEvent, roomId?: string | null) => callback(roomId)
      ipcRenderer.on(IPC.teamChat.openChat, listener)
      return () => {
        ipcRenderer.removeListener(IPC.teamChat.openChat, listener)
      }
    },
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
  agents: {
    getCapabilities: () =>
      ipcRenderer.invoke(IPC.agents.getCapabilities) as Promise<AgentModelsBundle>,
    refreshModels: (provider?: AgentProviderId) =>
      ipcRenderer.invoke(IPC.agents.refreshModels, provider) as Promise<
        AgentModelSnapshot | AgentModelsBundle
      >,
    setDefaultModel: (provider: AgentProviderId, model: string) =>
      ipcRenderer.invoke(IPC.agents.setDefaultModel, provider, model) as Promise<AgentModelSnapshot>,
    setReasoningEffort: (provider: AgentProviderId, effort: string) =>
      ipcRenderer.invoke(
        IPC.agents.setReasoningEffort,
        provider,
        effort,
      ) as Promise<AgentModelSnapshot>,
    onCapabilitiesChanged: (callback: (bundle: AgentModelsBundle) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: AgentModelsBundle) => callback(data)
      ipcRenderer.on(IPC.agents.capabilitiesChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.agents.capabilitiesChanged, listener)
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
      lastAgent?: 'codex' | 'antigravity' | null
      modelOverride?: string | null
      effortOverride?: string | null
    }) => ipcRenderer.invoke(IPC.chat.createConversation, input) as Promise<ChatConversation>,
    renameConversation: (id: string, title: string) =>
      ipcRenderer.invoke(IPC.chat.renameConversation, id, title) as Promise<ChatConversation | null>,
    setContext: (
      id: string,
      patch: {
        projectId?: string | null
        useProjectContext?: boolean
        lastAgent?: 'codex' | 'antigravity' | null
        modelOverride?: string | null
        effortOverride?: string | null
      },
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
    selectFolder: (options?: SelectFolderOptions) =>
      ipcRenderer.invoke(IPC.dialog.selectFolder, options) as Promise<string | null>,
    selectImage: () => ipcRenderer.invoke(IPC.dialog.selectImage) as Promise<string | null>,
    selectAudio: (options?: SelectFolderOptions) =>
      ipcRenderer.invoke(IPC.dialog.selectAudio, options) as Promise<string | null>,
    readImageDataUrl: (filePath: string) =>
      ipcRenderer.invoke(IPC.dialog.readImageDataUrl, filePath) as Promise<string | null>,
    selectFiles: () => ipcRenderer.invoke(IPC.dialog.selectFiles) as Promise<string[]>,
    selectImages: () => ipcRenderer.invoke(IPC.dialog.selectImages) as Promise<string[]>,
    selectExecutable: () =>
      ipcRenderer.invoke(IPC.dialog.selectExecutable) as Promise<string | null>,
  },
  lipSyncRefs: {
    list: (filters?: LipSyncRefListFilters) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.list, filters) as Promise<LipSyncRef[]>,
    create: (input: LipSyncRefCreateInput) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.create, input) as Promise<LipSyncRef>,
    createMany: (imagePaths: string[], projectId?: string | null, subject?: LipSyncSubject) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.createMany, imagePaths, projectId, subject) as Promise<
        LipSyncRef[]
      >,
    update: (id: string, patch: LipSyncRefUpdateInput) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.update, id, patch) as Promise<LipSyncRef | null>,
    setAudio: (id: string, audioPath: string) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.setAudio, id, audioPath) as Promise<LipSyncRef | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.lipSyncRefs.remove, id) as Promise<boolean>,
    removeByProject: (projectId: string, subject?: LipSyncSubject) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.removeByProject, projectId, subject) as Promise<number>,
    archiveByProject: (projectId: string, subject?: LipSyncSubject) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.archiveByProject, projectId, subject) as Promise<
        LipSyncRef[]
      >,
    scanFolder: (folder: string) =>
      ipcRenderer.invoke(IPC.lipSyncRefs.scanFolder, folder) as Promise<LipSyncFolderScan>,
  },
  flowProjects: {
    list: (filters?: { query?: string }) =>
      ipcRenderer.invoke(IPC.flowProjects.list, filters) as Promise<FlowProject[]>,
    get: (id: string) => ipcRenderer.invoke(IPC.flowProjects.get, id) as Promise<FlowProject | null>,
    create: (input: FlowProjectCreateInput) =>
      ipcRenderer.invoke(IPC.flowProjects.create, input) as Promise<FlowProject>,
    update: (id: string, patch: FlowProjectPatch) =>
      ipcRenderer.invoke(IPC.flowProjects.update, id, patch) as Promise<FlowProject>,
    retryLink: (id: string) =>
      ipcRenderer.invoke(IPC.flowProjects.retryLink, id) as Promise<FlowProject>,
    remove: (id: string) => ipcRenderer.invoke(IPC.flowProjects.remove, id) as Promise<boolean>,
    openLocal: (id: string) =>
      ipcRenderer.invoke(IPC.flowProjects.openLocal, id) as Promise<boolean>,
    openRemote: (id: string) =>
      ipcRenderer.invoke(IPC.flowProjects.openRemote, id) as Promise<boolean>,
    extensionStatus: () =>
      ipcRenderer.invoke(IPC.flowProjects.extensionStatus) as Promise<FlowExtensionStatus>,
    listReferences: (projectId: string) =>
      ipcRenderer.invoke(IPC.flowProjects.listReferences, projectId) as Promise<FlowReference[]>,
    addReferences: (projectId: string, filePaths: string[]) =>
      ipcRenderer.invoke(IPC.flowProjects.addReferences, projectId, filePaths) as Promise<
        FlowReference[]
      >,
    updateReference: (id: string, patch: FlowReferenceUpdateInput) =>
      ipcRenderer.invoke(IPC.flowProjects.updateReference, id, patch) as Promise<FlowReference | null>,
    removeReference: (id: string) =>
      ipcRenderer.invoke(IPC.flowProjects.removeReference, id) as Promise<boolean>,
    syncReferences: (projectId: string) =>
      ipcRenderer.invoke(IPC.flowProjects.syncReferences, projectId) as Promise<{
        uploaded: number
        reused: number
      }>,
    syncPrompt: (projectId: string, options?: { submit?: boolean; promptOverride?: string }) =>
      ipcRenderer.invoke(IPC.flowProjects.syncPrompt, projectId, options) as Promise<{
        mentions: number
        submitted: boolean
        verified: boolean
      }>,
    resumeGeneration: (projectId: string) =>
      ipcRenderer.invoke(IPC.flowProjects.resumeGeneration, projectId) as Promise<FlowProject>,
    listGenerationCards: (projectId: string) =>
      ipcRenderer.invoke(IPC.flowProjects.listGenerationCards, projectId) as Promise<
        FlowGenerationCard[]
      >,
    importGenerationCards: (projectId: string, source: string) =>
      ipcRenderer.invoke(IPC.flowProjects.importGenerationCards, projectId, source) as Promise<
        FlowGenerationCard[]
      >,
    addGenerationCard: (projectId: string, prompt: string) =>
      ipcRenderer.invoke(IPC.flowProjects.addGenerationCard, projectId, prompt) as Promise<
        FlowGenerationCard
      >,
    updateGenerationCard: (id: string, patch: { prompt?: string }) =>
      ipcRenderer.invoke(IPC.flowProjects.updateGenerationCard, id, patch) as Promise<
        FlowGenerationCard | null
      >,
    removeGenerationCard: (id: string) =>
      ipcRenderer.invoke(IPC.flowProjects.removeGenerationCard, id) as Promise<boolean>,
    prepareGenerationCard: (cardId: string) =>
      ipcRenderer.invoke(IPC.flowProjects.prepareGenerationCard, cardId) as Promise<FlowGenerationCard>,
    generateGenerationCard: (cardId: string) =>
      ipcRenderer.invoke(IPC.flowProjects.generateGenerationCard, cardId) as Promise<FlowGenerationCard>,
    onProgress: (callback: (event: FlowCreateProgress) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: FlowCreateProgress) => callback(data)
      ipcRenderer.on(IPC.flowProjects.progress, listener)
      return () => {
        ipcRenderer.removeListener(IPC.flowProjects.progress, listener)
      }
    },
  },
  comfy: {
    getConfig: () => ipcRenderer.invoke(IPC.comfy.getConfig) as Promise<ComfyConfig>,
    saveConfig: (patch: ComfyConfigPatch) =>
      ipcRenderer.invoke(IPC.comfy.saveConfig, patch) as Promise<ComfyConfig>,
    importWorkflow: () => ipcRenderer.invoke(IPC.comfy.importWorkflow) as Promise<ComfyConfig | null>,
    testConnection: (baseUrl?: string) =>
      ipcRenderer.invoke(IPC.comfy.testConnection, baseUrl) as Promise<ComfyConnectionInfo>,
    discoverUrl: () => ipcRenderer.invoke(IPC.comfy.discoverUrl) as Promise<ComfyDiscoverResult>,
    getRunpodStatus: (options?: { force?: boolean }) =>
      ipcRenderer.invoke(IPC.comfy.getRunpodStatus, options) as Promise<RunpodInfraStatus>,
    getCachedRunpodStatus: () =>
      ipcRenderer.invoke(IPC.comfy.getCachedRunpodStatus) as Promise<RunpodInfraStatus | null>,
    previewRunpodStart: (podId: string) =>
      ipcRenderer.invoke(IPC.comfy.previewRunpodStart, podId) as Promise<RunpodStartPreview>,
    startRunpodPod: (request: RunpodStartPodRequest) =>
      ipcRenderer.invoke(IPC.comfy.startRunpodPod, request) as Promise<RunpodPodLifecycleState>,
    stopRunpodPod: (request: RunpodStopPodRequest) =>
      ipcRenderer.invoke(IPC.comfy.stopRunpodPod, request) as Promise<RunpodStopPodResult>,
    cleanupSupersededRunpodPods: (options?: { dryRun?: boolean; keepPodId?: string | null }) =>
      ipcRenderer.invoke(IPC.comfy.cleanupSupersededRunpodPods, options) as Promise<{
        dryRun: boolean
        candidates: Array<{ id: string; name: string; status: string }>
        terminated: Array<{ id: string; name: string }>
        failed: Array<{ id: string; name: string; error: string }>
        message: string
      }>,
    getRunpodLifecycle: () =>
      ipcRenderer.invoke(IPC.comfy.getRunpodLifecycle) as Promise<RunpodPodLifecycleState | null>,
    prepareComfyConnect: () =>
      ipcRenderer.invoke(IPC.comfy.prepareComfyConnect) as Promise<ComfyConnectPrepareResult>,
    confirmComfyConnect: (request: ComfyConnectConfirmRequest) =>
      ipcRenderer.invoke(IPC.comfy.confirmComfyConnect, request) as Promise<ComfyConnectConfirmResult>,
    confirmComfyGpuRecovery: (request: ComfyGpuRecoveryConfirmRequest) =>
      ipcRenderer.invoke(IPC.comfy.confirmComfyGpuRecovery, request) as Promise<ComfyConnectConfirmResult>,
    refreshComfyConnectStatus: () =>
      ipcRenderer.invoke(IPC.comfy.refreshComfyConnectStatus) as Promise<ComfyConnectRefreshResult>,
    prepareLipsyncControlledTest: (options?: { projectId?: string | null; refId?: string | null }) =>
      ipcRenderer.invoke(IPC.comfy.prepareLipsyncControlledTest, options) as Promise<LipsyncControlledTestPlan>,
    prepareGpuRecoveryValidation: (options?: { projectId?: string | null; refId?: string | null }) =>
      ipcRenderer.invoke(IPC.comfy.prepareGpuRecoveryValidation, options) as Promise<GpuRecoveryValidationBundle>,
    getLtxEnvironment: () =>
      ipcRenderer.invoke(IPC.comfy.getLtxEnvironment) as Promise<LtxEnvironmentPlan>,
    saveLtxEnvironment: (patch: Partial<LtxEnvironmentPlan>) =>
      ipcRenderer.invoke(IPC.comfy.saveLtxEnvironment, patch) as Promise<LtxEnvironmentPlan>,
    diagnoseLtxEnvironment: () =>
      ipcRenderer.invoke(IPC.comfy.diagnoseLtxEnvironment) as Promise<LtxEnvironmentPrepStatus>,
    exportLtxWorkflow: () =>
      ipcRenderer.invoke(IPC.comfy.exportLtxWorkflow) as Promise<ExportLtxWorkflowResult>,
    validateLtxPhase4: () =>
      ipcRenderer.invoke(IPC.comfy.validateLtxPhase4) as Promise<LtxPhase4ValidationStatus>,
    prepareLtxControlledValidation: () =>
      ipcRenderer.invoke(IPC.comfy.prepareLtxControlledValidation) as Promise<LtxControlledValidationPlan>,
    detectLtxEnvironment: (options?: { forceFullScan?: boolean }) =>
      ipcRenderer.invoke(IPC.comfy.detectLtxEnvironment, options) as Promise<LtxAutoDetectResult>,
    getSavedLtxDetection: () =>
      ipcRenderer.invoke(IPC.comfy.getSavedLtxDetection) as Promise<{
        detection: LtxAutoDetectResult | null
        savedAt: string | null
        inventoryVerifiedAt: string | null
      }>,
    bootstrapLtxEnvironment: (options?: { forceFullScan?: boolean }) =>
      ipcRenderer.invoke(IPC.comfy.bootstrapLtxEnvironment, options) as Promise<LtxDetectionBootResult>,
    getRunpodS3Status: () =>
      ipcRenderer.invoke(IPC.comfy.getRunpodS3Status) as Promise<{
        configured: boolean
        accessKeyPreview: string | null
      }>,
    saveRunpodS3Credentials: (creds: { accessKeyId: string; secretAccessKey: string } | null) =>
      ipcRenderer.invoke(IPC.comfy.saveRunpodS3Credentials, creds) as Promise<{
        configured: boolean
        accessKeyPreview: string | null
      }>,
    saveRunpodS3CredentialsAndBootstrap: (
      creds: { accessKeyId: string; secretAccessKey: string } | null,
    ) =>
      ipcRenderer.invoke(IPC.comfy.saveRunpodS3CredentialsAndBootstrap, creds) as Promise<{
        configured: boolean
        accessKeyPreview: string | null
        boot: LtxDetectionBootResult | null
      }>,
    start: (projectId: string | null, refIds?: string[] | null) =>
      ipcRenderer.invoke(IPC.comfy.start, projectId, refIds) as Promise<ComfyStartResult>,
    list: () => ipcRenderer.invoke(IPC.comfy.list) as Promise<ComfyBatchView[]>,
    latest: () => ipcRenderer.invoke(IPC.comfy.latest) as Promise<ComfyBatchView | null>,
    pause: (batchId: string) => ipcRenderer.invoke(IPC.comfy.pause, batchId) as Promise<ComfyBatchView | null>,
    resume: (batchId: string) => ipcRenderer.invoke(IPC.comfy.resume, batchId) as Promise<ComfyBatchView | null>,
    cancel: (batchId: string) => ipcRenderer.invoke(IPC.comfy.cancel, batchId) as Promise<ComfyBatchView | null>,
    retryFailed: (batchId: string) =>
      ipcRenderer.invoke(IPC.comfy.retryFailed, batchId) as Promise<ComfyBatchView | null>,
  },
  editor: {
    list: () => ipcRenderer.invoke(IPC.editor.list) as Promise<EditorProject[]>,
    get: (id: string) =>
      ipcRenderer.invoke(IPC.editor.get, id) as Promise<{ project: EditorProject; assets: EditorAsset[] } | null>,
    create: (input: { name: string; aspect: EditorAspect; channelId: string }) =>
      ipcRenderer.invoke(IPC.editor.create, input) as Promise<EditorProject>,
    update: (id: string, patch: EditorProjectPatch) =>
      ipcRenderer.invoke(IPC.editor.update, id, patch) as Promise<EditorProject | null>,
    remove: (id: string) => ipcRenderer.invoke(IPC.editor.remove, id) as Promise<boolean>,
    listAssets: (projectId: string) =>
      ipcRenderer.invoke(IPC.editor.listAssets, projectId) as Promise<EditorAsset[]>,
    importFiles: (projectId: string) =>
      ipcRenderer.invoke(IPC.editor.importFiles, projectId) as Promise<EditorImportResult>,
    addFiles: (projectId: string, paths: string[], origin?: EditorAssetOrigin) =>
      ipcRenderer.invoke(IPC.editor.addFiles, projectId, paths, origin) as Promise<EditorImportResult>,
    removeAsset: (assetId: string) => ipcRenderer.invoke(IPC.editor.removeAsset, assetId) as Promise<boolean>,
    setAssetOrigin: (assetId: string, origin: EditorAssetOrigin) =>
      ipcRenderer.invoke(IPC.editor.setAssetOrigin, assetId, origin) as Promise<EditorAsset | null>,
    waveform: (assetId: string) =>
      ipcRenderer.invoke(IPC.editor.waveform, assetId) as Promise<EditorWaveform | null>,
    listLipsync: () => ipcRenderer.invoke(IPC.editor.listLipsync) as Promise<EditorLipsyncGroup[]>,
    alignToMusic: (projectId: string, assetIds: string[]) =>
      ipcRenderer.invoke(IPC.editor.alignToMusic, projectId, assetIds) as Promise<EditorAudioAlignResult>,
    export: (request: EditorExportRequest) =>
      ipcRenderer.invoke(IPC.editor.export, request) as Promise<string | null>,
    /** Caminho real de um arquivo arrastado do Explorer (File.path não existe mais no Electron 32+). */
    pathForFile: (file: File) => webUtils.getPathForFile(file),
    onAssetChanged: (callback: (asset: EditorAsset) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: EditorAsset) => callback(data)
      ipcRenderer.on(IPC.editor.assetChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.editor.assetChanged, listener)
      }
    },
    onExportProgress: (callback: (event: EditorExportProgress) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: EditorExportProgress) => callback(data)
      ipcRenderer.on(IPC.editor.exportProgress, listener)
      return () => {
        ipcRenderer.removeListener(IPC.editor.exportProgress, listener)
      }
    },
    onProjectChanged: (callback: (event: EditorProjectChangedEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: EditorProjectChangedEvent) => callback(data)
      ipcRenderer.on(IPC.editor.projectChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.editor.projectChanged, listener)
      }
    },
  },
  system: {
    copyText: (text: string) => ipcRenderer.invoke(IPC.system.copyText, text) as Promise<boolean>,
    readText: () => ipcRenderer.invoke(IPC.system.readText) as Promise<string>,
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
