import type {
  AdjustScriptRequest,
  AppSettings,
  CodexStatus,
  AnalyzeTitleRequest,
  AnalyzeTitleResult,
  AnalyzeQuickPromptRequest,
  AnalyzeQuickPromptResult,
  AntigravityStatus,
  Channel,
  ChannelPrompt,
  ChannelVideo,
  DiscoveredSkill,
  GenerateScriptRequest,
  GenerationProgressEvent,
  GenerationResult,
  GenerationStep,
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
} from '../src/shared/types'
import type { MusicTrack } from '../src/shared/musicAnalysis'
import type { CustomPrompt } from '../src/shared/quickPrompts/types'
import type {
  ChatAgentStatusSnapshot,
  ChatAttachment,
  ChatConversation,
  ChatConversationDetail,
  ChatProgressEvent,
  ChatSendMessageRequest,
  ChatSendMessageResult,
} from '../src/shared/chat/types'
import { GENERATION_STEPS } from '../src/shared/types'

/**
 * Mock API para preview no navegador (sem Electron).
 * Retorna listas vazias — dados reais vêm exclusivamente do SQLite via IPC.
 */

const projects: Project[] = []
const niches: Niche[] = []
const channels: Channel[] = []
const videos: ChannelVideo[] = []
const prompts: ChannelPrompt[] = []
const quickPrompts: CustomPrompt[] = []
const quickPromptFavorites = new Set<string>()
const scripts: ScriptRecord[] = []
const musicTracks: MusicTrack[] = []
const tasks: AtlasTask[] = []

function resolveRelated(
  relatedType?: AtlasTask['relatedType'],
  relatedId?: string | null,
): Pick<AtlasTask, 'relatedType' | 'relatedId'> {
  const type = relatedType ?? null
  const id = relatedId?.trim() || null
  if (!type || !id) return { relatedType: null, relatedId: null }
  return { relatedType: type, relatedId: id }
}

function withRelatedName(task: AtlasTask): AtlasTask {
  if (!task.relatedType || !task.relatedId) return { ...task, relatedName: null }
  if (task.relatedType === 'channel') {
    return {
      ...task,
      relatedName: channels.find((c) => c.id === task.relatedId)?.name ?? null,
    }
  }
  return {
    ...task,
    relatedName: projects.find((p) => p.id === task.relatedId)?.name ?? null,
  }
}

const settings: AppSettings = {
  accountName: '',
  accountRole: '',
  accountEmail: '',
  accountPhotoPath: '',
  workspacePath: '',
  projectsRoot: '',
  skillsPath: '',
  skillLibraryRoot: '',
  scriptsPath: '',
  defaultLanguage: 'Português',
  defaultNicheId: null,
  defaultOutputStyle: 'profissional',
  defaultDuration: '15',
  finalAuditEnabled: true,
  codexModel: 'GPT-4o',
  autoApproval: false,
  backupEnabled: true,
  autoCheckUpdates: true,
  codexBinaryPath: '',
  antigravityBinaryPath: '',
  codexOnboardingDismissed: true,
  notificationReadKeys: [],
}

let progressListener: ((event: GenerationProgressEvent) => void) | null = null

export const mockApi = {
  projects: {
    list: async (filters?: { projectType?: ProjectType; query?: string }) => {
      const q = filters?.query?.trim().toLowerCase()
      return projects
        .filter((p) => !filters?.projectType || p.projectType === filters.projectType)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    },
    get: async (id: string) => projects.find((p) => p.id === id) ?? null,
    create: async (input: {
      name: string
      description?: string
      projectType: ProjectType
      channelId?: string | null
    }) => {
      const channel = input.channelId
        ? channels.find((c) => c.id === input.channelId) ?? null
        : null
      const project: Project = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        projectType: input.projectType,
        channelId: channel?.id ?? null,
        channelName: channel?.name ?? null,
        projectFolderPath: null,
        folderExists: false,
        scriptCount: 0,
        trackCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      projects.unshift(project)
      return project
    },
    update: async (id: string, patch: Partial<Project>) => {
      const idx = projects.findIndex((p) => p.id === id)
      if (idx < 0) return null
      const next = { ...projects[idx], ...patch, updatedAt: new Date().toISOString() }
      if (patch.channelId !== undefined) {
        const channel = patch.channelId ? channels.find((c) => c.id === patch.channelId) ?? null : null
        next.channelId = channel?.id ?? null
        next.channelName = channel?.name ?? null
      }
      if (patch.name !== undefined) next.name = patch.name.trim()
      if (patch.description !== undefined) next.description = patch.description.trim()
      projects[idx] = next
      return projects[idx]
    },
    remove: async (id: string) => {
      const idx = projects.findIndex((p) => p.id === id)
      if (idx < 0) return false
      projects.splice(idx, 1)
      for (const script of scripts) {
        if (script.projectId === id) script.projectId = null
      }
      for (const track of musicTracks) {
        if (track.projectId === id) track.projectId = null
      }
      for (const prompt of quickPrompts) {
        if (prompt.projectId === id) prompt.projectId = null
      }
      return true
    },
    createFolder: async (): Promise<Project | null> => {
      throw new Error('Criar pasta indisponível no modo mock. Use o Electron.')
    },
    linkFolder: async (): Promise<Project | null> => {
      throw new Error('Selecionar pasta indisponível no modo mock. Use o Electron.')
    },
    openFolder: async () => {
      throw new Error('Abrir pasta indisponível no modo mock. Use o Electron.')
    },
  },
  niches: {
    list: async () => niches,
    get: async (id: string) => niches.find((n) => n.id === id) ?? null,
    create: async (input: Omit<Niche, 'id' | 'createdAt' | 'updatedAt'>) => {
      const niche: Niche = {
        ...input,
        scriptsPath: input.scriptsPath ?? '',
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      niches.push(niche)
      return niche
    },
    update: async (id: string, patch: Partial<Niche>) => {
      const idx = niches.findIndex((n) => n.id === id)
      if (idx < 0) return null
      niches[idx] = { ...niches[idx], ...patch, updatedAt: new Date().toISOString() }
      return niches[idx]
    },
  },
  channels: {
    list: async (filters?: { query?: string; channelType?: ProjectType }) => {
      const q = filters?.query?.trim().toLowerCase()
      return channels
        .filter((c) => !filters?.channelType || c.channelType === filters.channelType)
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
        .map((c) => ({
          ...c,
          videoCount: videos.filter((v) => v.channelId === c.id).length,
        }))
    },
    get: async (id: string) => {
      const channel = channels.find((c) => c.id === id)
      if (!channel) return null
      return { ...channel, videoCount: videos.filter((v) => v.channelId === id).length }
    },
    create: async (
      input: Omit<Channel, 'id' | 'createdAt' | 'updatedAt' | 'avatarDataUrl' | 'videoCount' | 'nicheName'>,
    ) => {
      const channel: Channel = {
        ...input,
        id: crypto.randomUUID(),
        videoCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      channels.push(channel)
      return channel
    },
    update: async (id: string, patch: Partial<Channel>) => {
      const idx = channels.findIndex((c) => c.id === id)
      if (idx < 0) return null
      channels[idx] = { ...channels[idx], ...patch, updatedAt: new Date().toISOString() }
      return channels[idx]
    },
    remove: async (id: string) => {
      const idx = channels.findIndex((c) => c.id === id)
      if (idx < 0) return false
      channels.splice(idx, 1)
      for (let i = videos.length - 1; i >= 0; i -= 1) {
        if (videos[i].channelId === id) videos.splice(i, 1)
      }
      for (let i = prompts.length - 1; i >= 0; i -= 1) {
        if (prompts[i].channelId === id) prompts.splice(i, 1)
      }
      return true
    },
    setAvatar: async (channelId: string, sourcePath: string) => {
      const idx = channels.findIndex((c) => c.id === channelId)
      if (idx < 0) return null
      channels[idx] = {
        ...channels[idx],
        avatarPath: sourcePath,
        avatarDataUrl: sourcePath,
        updatedAt: new Date().toISOString(),
      }
      return channels[idx]
    },
  },
  tasks: {
    list: async () => tasks.map(withRelatedName),
    get: async (id: string) => {
      const found = tasks.find((t) => t.id === id)
      return found ? withRelatedName(found) : null
    },
    create: async (input: TaskWriteInput) => {
      const title = input.title?.trim()
      if (!title) throw new Error('O título da tarefa é obrigatório.')
      const now = new Date().toISOString()
      const related = resolveRelated(input.relatedType, input.relatedId)
      const task: AtlasTask = {
        id: crypto.randomUUID(),
        title,
        description: input.description?.trim() ?? '',
        status: 'pending',
        priority: input.priority ?? 'normal',
        category: input.category ?? 'general',
        dueDate: input.dueDate?.trim() || null,
        relatedType: related.relatedType,
        relatedId: related.relatedId,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      }
      tasks.unshift(task)
      return withRelatedName(task)
    },
    update: async (id: string, patch: Partial<TaskWriteInput>) => {
      const idx = tasks.findIndex((t) => t.id === id)
      if (idx < 0) return null
      const current = tasks[idx]
      const title = patch.title !== undefined ? patch.title.trim() : current.title
      if (!title) throw new Error('O título da tarefa é obrigatório.')
      const related = resolveRelated(
        patch.relatedType !== undefined ? patch.relatedType : current.relatedType,
        patch.relatedId !== undefined ? patch.relatedId : current.relatedId,
      )
      tasks[idx] = {
        ...current,
        title,
        description: patch.description !== undefined ? patch.description.trim() : current.description,
        priority: patch.priority ?? current.priority,
        category: patch.category ?? current.category,
        dueDate: patch.dueDate !== undefined ? patch.dueDate?.trim() || null : current.dueDate,
        relatedType: related.relatedType,
        relatedId: related.relatedId,
        updatedAt: new Date().toISOString(),
      }
      return withRelatedName(tasks[idx])
    },
    setStatus: async (id: string, status: TaskStatus) => {
      const idx = tasks.findIndex((t) => t.id === id)
      if (idx < 0) return null
      const now = new Date().toISOString()
      tasks[idx] = {
        ...tasks[idx],
        status,
        completedAt: status === 'completed' ? now : null,
        updatedAt: now,
      }
      return withRelatedName(tasks[idx])
    },
    remove: async (id: string) => {
      const idx = tasks.findIndex((t) => t.id === id)
      if (idx < 0) return false
      tasks.splice(idx, 1)
      return true
    },
    pendingCount: async () => tasks.filter((t) => t.status === 'pending').length,
  },
  videos: {
    list: async (filters: { channelId: string; from?: string; to?: string }) =>
      videos.filter((v) => {
        if (v.channelId !== filters.channelId) return false
        if (filters.from && v.scheduledDate < filters.from) return false
        if (filters.to && v.scheduledDate > filters.to) return false
        return true
      }),
    get: async (id: string) => videos.find((v) => v.id === id) ?? null,
    create: async (input: Omit<ChannelVideo, 'id' | 'createdAt' | 'updatedAt' | 'thumbnailDataUrl'>) => {
      const video: ChannelVideo = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      videos.push(video)
      return video
    },
    update: async (id: string, patch: Partial<ChannelVideo>) => {
      const idx = videos.findIndex((v) => v.id === id)
      if (idx < 0) return null
      videos[idx] = { ...videos[idx], ...patch, updatedAt: new Date().toISOString() }
      return videos[idx]
    },
    remove: async (id: string) => {
      const idx = videos.findIndex((v) => v.id === id)
      if (idx < 0) return false
      videos.splice(idx, 1)
      return true
    },
    setThumbnail: async (videoId: string, sourcePath: string) => {
      const idx = videos.findIndex((v) => v.id === videoId)
      if (idx < 0) return null
      videos[idx] = {
        ...videos[idx],
        thumbnailPath: sourcePath,
        thumbnailDataUrl: sourcePath,
        updatedAt: new Date().toISOString(),
      }
      return videos[idx]
    },
    analyzeTitle: async (_request: AnalyzeTitleRequest): Promise<AnalyzeTitleResult> => {
      throw new Error('Análise de título indisponível no modo mock. Use o Electron.')
    },
  },
  prompts: {
    list: async (filters?: { channelId?: string; query?: string }) => {
      const q = filters?.query?.trim().toLowerCase()
      return prompts
        .filter((p) => !filters?.channelId || p.channelId === filters.channelId)
        .filter(
          (p) =>
            !q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q),
        )
        .map((p) => ({
          ...p,
          channelName: channels.find((c) => c.id === p.channelId)?.name ?? p.channelName,
        }))
    },
    get: async (id: string) => {
      const prompt = prompts.find((p) => p.id === id)
      if (!prompt) return null
      return {
        ...prompt,
        channelName: channels.find((c) => c.id === prompt.channelId)?.name ?? prompt.channelName,
      }
    },
    create: async (input: { channelId: string; title: string; content: string }) => {
      const channel = channels.find((c) => c.id === input.channelId)
      if (!channel) throw new Error('Canal não encontrado')
      const prompt: ChannelPrompt = {
        id: crypto.randomUUID(),
        channelId: input.channelId,
        channelName: channel.name,
        title: input.title.trim(),
        content: input.content.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      prompts.unshift(prompt)
      return prompt
    },
    update: async (id: string, patch: Partial<ChannelPrompt>) => {
      const idx = prompts.findIndex((p) => p.id === id)
      if (idx < 0) return null
      const nextChannelId = patch.channelId ?? prompts[idx].channelId
      const channel = channels.find((c) => c.id === nextChannelId)
      prompts[idx] = {
        ...prompts[idx],
        ...patch,
        channelId: nextChannelId,
        channelName: channel?.name ?? prompts[idx].channelName,
        updatedAt: new Date().toISOString(),
      }
      return prompts[idx]
    },
    remove: async (id: string) => {
      const idx = prompts.findIndex((p) => p.id === id)
      if (idx < 0) return false
      prompts.splice(idx, 1)
      return true
    },
  },
  quickPrompts: {
    list: async (filters?: { projectId?: string | null; query?: string }) => {
      const q = filters?.query?.trim().toLowerCase()
      return quickPrompts
        .filter((p) => !p.projectId || p.projectId === filters?.projectId)
        .filter(
          (p) =>
            !q ||
            p.name.toLowerCase().includes(q) ||
            p.text.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q),
        )
    },
    create: async (input: {
      name: string
      category?: string
      text: string
      projectId?: string | null
    }) => {
      const prompt: CustomPrompt = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        category: input.category?.trim() || 'custom',
        text: input.text.trim(),
        projectId: input.projectId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      quickPrompts.unshift(prompt)
      return prompt
    },
    update: async (id: string, patch: Partial<CustomPrompt>) => {
      const idx = quickPrompts.findIndex((p) => p.id === id)
      if (idx < 0) return null
      quickPrompts[idx] = {
        ...quickPrompts[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      }
      return quickPrompts[idx]
    },
    remove: async (id: string) => {
      const idx = quickPrompts.findIndex((p) => p.id === id)
      if (idx < 0) return false
      quickPrompts.splice(idx, 1)
      quickPromptFavorites.delete(id)
      return true
    },
    listFavorites: async () => [...quickPromptFavorites],
    setFavorite: async (itemId: string, favorite: boolean) => {
      if (favorite) quickPromptFavorites.add(itemId)
      else quickPromptFavorites.delete(itemId)
      return [...quickPromptFavorites]
    },
  },
  antigravity: {
    status: async (): Promise<AntigravityStatus> => ({
      connected: false,
      authenticated: false,
      authState: 'not_found',
      version: null,
      runtimePath: null,
      message: 'Modo mock — abra com npm run electron:dev',
      lastCheckedAt: new Date().toISOString(),
    }),
    healthCheck: async () => mockApi.antigravity.status(),
    loginStart: async () => ({ loginId: 'mock' }),
    loginCancel: async () => undefined,
    loginConfirm: async () => mockApi.antigravity.status(),
    logout: async () => mockApi.antigravity.status(),
    analyzeQuickPrompt: async (_request: AnalyzeQuickPromptRequest): Promise<AnalyzeQuickPromptResult> => {
      throw new Error('Antigravity indisponível no modo mock.')
    },
    onAuthStateChanged: () => () => undefined,
  },
  music: {
    list: async (filters?: { projectId?: string }) =>
      musicTracks.filter((track) => !filters?.projectId || track.projectId === filters.projectId),
    get: async (id: string) => musicTracks.find((track) => track.id === id) ?? null,
    import: async () => {
      throw new Error('Importação de música indisponível no modo mock. Use o Electron.')
    },
    update: async (id: string, patch: Partial<MusicTrack>) => {
      const idx = musicTracks.findIndex((track) => track.id === id)
      if (idx < 0) return null
      musicTracks[idx] = { ...musicTracks[idx], ...patch, updatedAt: new Date().toISOString() }
      return musicTracks[idx]
    },
    remove: async (id: string) => {
      const idx = musicTracks.findIndex((track) => track.id === id)
      if (idx < 0) return false
      musicTracks.splice(idx, 1)
      return true
    },
    preview: async () => {
      throw new Error('Prévia indisponível no modo mock. Use o Electron.')
    },
    export: async () => null,
  },
  skills: {
    list: async (): Promise<DiscoveredSkill[]> => [],
    rescan: async (): Promise<SkillRescanResult> => ({
      libraryRoot: '',
      total: 0,
      added: 0,
      updated: 0,
      removed: 0,
      skills: [],
      nichesCreated: 0,
      report: {
        libraryRoot: '',
        visitedDirectories: [],
        skillMdFound: [],
        ignoredDirectories: [],
        filesystemErrors: [],
      },
    }),
    validate: async (skillPath: string): Promise<SkillValidationResult> => ({
      status: skillPath ? 'valid' : 'invalid',
      path: skillPath,
      issues: skillPath ? [] : ['Caminho vazio'],
      warnings: [],
    }),
  },
  scripts: {
    list: async (filters?: { projectId?: string }) =>
      scripts.filter((s) => !filters?.projectId || s.projectId === filters.projectId),
    get: async (id: string) => scripts.find((s) => s.id === id) ?? null,
    recent: async () => scripts.slice(0, 3),
    summary: async () => ({ total: 0, prontos: 0, rascunhos: 0, emRevisao: 0, erros: 0 }),
    versions: async (): Promise<ScriptVersion[]> => [],
    saveVersion: async (scriptId: string) => ({
      id: crypto.randomUUID(),
      scriptId,
      versionNumber: 2,
      content: '',
      createdAt: new Date().toISOString(),
    }),
    export: async () => null,
  },
  settings: {
    get: async () => settings,
    update: async (patch: Partial<AppSettings>) => Object.assign(settings, patch),
    setProfilePhoto: async () => settings,
    clearProfilePhoto: async () => {
      settings.accountPhotoPath = ''
      settings.accountPhotoDataUrl = null
      return settings
    },
  },
  codex: {
    status: async (): Promise<CodexStatus> => ({
      connected: false,
      authenticated: false,
      authState: 'not_authenticated',
      account: null,
      model: null,
      message: 'Modo mock — abra com npm run electron:dev (não use o navegador)',
      lastCheckedAt: new Date().toISOString(),
      runtimePath: null,
      codexVersion: null,
      appServerRunning: false,
    }),
    connect: async () => mockApi.codex.status(),
    disconnect: async () => undefined,
    accountRead: async () => null,
    loginStart: async () => ({ loginId: 'mock', authUrl: '' }),
    loginCancel: async () => undefined,
    logout: async () => undefined,
    healthCheck: async () => mockApi.codex.status(),
    onAuthStateChanged: () => () => undefined,
    dismissOnboarding: async () => undefined,
    isOnboardingDismissed: async () => true,
  },
  generation: {
    start: async (_request: GenerateScriptRequest): Promise<GenerationResult> => {
      throw new Error('Geração indisponível no modo mock. Use o Electron.')
    },
    adjust: async (_request: AdjustScriptRequest): Promise<GenerationResult> => {
      throw new Error('Ajuste indisponível no modo mock. Use o Electron.')
    },
    cancel: async () => undefined,
    interrupted: async () => [],
    onProgress: (callback: (event: GenerationProgressEvent) => void) => {
      progressListener = callback
      return () => {
        progressListener = null
      }
    },
  },
  chat: {
    listConversations: async (): Promise<ChatConversation[]> => [],
    getConversation: async (): Promise<ChatConversationDetail | null> => null,
    createConversation: async (): Promise<ChatConversation> => ({
      id: crypto.randomUUID(),
      title: 'Nova conversa',
      projectId: null,
      useProjectContext: false,
      lastAgent: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    renameConversation: async () => null,
    setContext: async () => null,
    removeConversation: async () => false,
    sendMessage: async (_request: ChatSendMessageRequest): Promise<ChatSendMessageResult> => {
      throw new Error('Chat indisponível no modo mock. Use o Electron.')
    },
    confirmActions: async (): Promise<ChatSendMessageResult> => {
      throw new Error('Chat indisponível no modo mock. Use o Electron.')
    },
    agentStatus: async (): Promise<ChatAgentStatusSnapshot> => ({
      agents: [
        { id: 'codex', label: 'Codex', ready: false, connected: false, message: 'Mock' },
        { id: 'antigravity', label: 'Antigravity', ready: false, connected: false, message: 'Mock' },
      ],
    }),
    prepareAttachments: async (): Promise<ChatAttachment[]> => [],
    onProgress: (_callback: (event: ChatProgressEvent) => void) => () => undefined,
  },
  dialog: {
    selectFolder: async () => null,
    selectImage: async () => null,
    selectFiles: async () => [],
    selectExecutable: async () => null,
  },
  system: {
    copyText: async (text: string) => {
      await navigator.clipboard.writeText(text)
      return true
    },
    openPath: async () => true,
  },
  updates: {
    status: async () => ({
      state: 'dev' as const,
      currentVersion: '1.5.2',
      availableVersion: null,
      releaseNotes: null,
      downloadPercent: null,
      errorMessage: null,
      packaged: false,
      autoCheckEnabled: true,
    }),
    check: async () => mockApi.updates.status(),
    download: async () => mockApi.updates.status(),
    install: async () => mockApi.updates.status(),
    onChanged: () => () => undefined,
  },
}
