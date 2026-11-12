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
  ChannelVideoWriteInput,
  DiscoveredSkill,
  GenerateScriptRequest,
  GenerationProgressEvent,
  GenerationResult,
  GenerationStep,
  Niche,
  Project,
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
} from '../src/shared/types'
import { MUSIC_PROJECT_HAS_PUBLICATION_ERROR } from '../src/shared/types'
import type { MusicTrack } from '../src/shared/musicAnalysis'
import { adviseCutsLocally, type MusicAdviseRequest } from '../src/shared/audio/audioCutAdvisor'
import type { ShortsAnalyzeInput, ShortsJob, ShortsProgressEvent } from '../src/shared/shorts'
import { TEXT_ONLY_CAPABILITIES } from '../src/shared/agents/capabilities'
import type { ShortsImportResult } from '../src/shared/shortsProjectIdentity'
import type {
  CustomPrompt,
  CustomPromptTab,
  SharedPrompt,
  SharedPromptCatalogSnapshot,
} from '../src/shared/quickPrompts/types'
import { nextSharedCopyName } from '../src/shared/quickPrompts/sharedCopyName'
import type {
  ChatAgentStatusSnapshot,
  ChatAttachment,
  ChatConversation,
  ChatConversationDetail,
  ChatProgressEvent,
  ChatSendMessageRequest,
  ChatSendMessageResult,
} from '../src/shared/chat/types'
import { CHAT_DOCK_DEFAULT_HEIGHT, CHAT_DOCK_DEFAULT_WIDTH } from '../src/shared/chat/chatDockSize'
import { DEFAULT_WORLD_CLOCKS } from '../src/shared/worldClocks'
import { GENERATION_STEPS } from '../src/shared/types'
import {
  detectContentAreaPresence,
  preferenceFromSettings,
  resolveWorkspaceCapabilities,
} from '../src/shared/workspaceCapabilities'
import type { AgentModelSnapshot, AgentModelsBundle, AgentProviderId } from '../src/shared/agents/types'
import type {
  AtlasAccount,
  AtlasAuthInput,
  AtlasSession,
  TeamChatCreateGroupInput,
  TeamChatMember,
  TeamChatMessage,
  TeamChatPeer,
  TeamChatRoom,
  TeamChatSendInput,
} from '../src/shared/account'
import type {
  LipSyncRef,
  LipSyncRefCreateInput,
  LipSyncRefListFilters,
  LipSyncRefUpdateInput,
  LipSyncSubject,
} from '../src/shared/lipSyncRefs'
import type {
  FlowExtensionStatus,
  FlowProject,
  FlowProjectCreateInput,
  FlowProjectPatch,
  FlowReference,
  FlowReferenceUpdateInput,
} from '../src/shared/flowProjects'
import {
  labelFromImagePath,
  validateFlowProjectCreateInput,
  validateFlowReferenceLabel,
} from '../src/shared/flowProjects'
import { DEFAULT_COMFY_CONFIG } from '../src/shared/comfy'

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
const quickPromptTabs: CustomPromptTab[] = []
const sharedPrompts: SharedPrompt[] = []
const MOCK_SHARED_AUTHOR_ID = 'mock-author'
const mockAccount: AtlasAccount = {
  id: MOCK_SHARED_AUTHOR_ID,
  email: 'preview@atlas.local',
  name: 'Preview',
}
let mockSession: AtlasSession = { user: mockAccount }
const mockPeer: TeamChatPeer = {
  id: 'mock-peer',
  email: 'colega@atlas.local',
  name: 'Colega',
}
const teamRooms: TeamChatRoom[] = []
const teamMembers = new Map<string, TeamChatMember[]>()
const teamMessages: TeamChatMessage[] = []
const teamRoomsHiddenForMe = new Set<string>()
const teamRoomsClearedBefore = new Map<string, string>()
const lipSyncRefs: LipSyncRef[] = []
const flowProjects: FlowProject[] = []
const flowReferences: FlowReference[] = []
const teamChatListeners = {
  message: new Set<(message: TeamChatMessage) => void>(),
  presence: new Set<(peers: TeamChatPeer[]) => void>(),
}

function upsertMockRoom(room: TeamChatRoom) {
  const index = teamRooms.findIndex((item) => item.id === room.id)
  if (index >= 0) teamRooms[index] = room
  else teamRooms.unshift(room)
}
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
  codexModel: '',
  defaultCodexModel: '',
  defaultCodexEffort: '',
  defaultAntigravityModel: '',
  defaultAntigravityEffort: '',
  allowExternalVideoAnalysis: false,
  autoApproval: false,
  backupEnabled: true,
  autoCheckUpdates: true,
  codexBinaryPath: '',
  antigravityBinaryPath: '',
  codexOnboardingDismissed: true,
  productTourCompleted: false,
  seenProductTours: [],
  notificationReadKeys: [],
  contentAreasAutoDetect: true,
  contentAreasHistoryEnabled: true,
  contentAreasMusicEnabled: true,
  chatPanelWidth: CHAT_DOCK_DEFAULT_WIDTH,
  chatPanelHeight: CHAT_DOCK_DEFAULT_HEIGHT,
  chatFabHidden: false,
  chatFabX: null,
  chatFabY: null,
  musicExportFolder: '',
  worldClocks: DEFAULT_WORLD_CLOCKS.map((clock) => ({ ...clock })),
}

function emptyPublicationFields(): Pick<
  Project,
  | 'scheduledVideoId'
  | 'scheduledVideoChannelId'
  | 'scheduledDate'
  | 'scheduledVideoStatus'
  | 'scheduledVideoTitle'
  | 'scheduledVideoDescription'
  | 'scheduledVideoThumbnailDataUrl'
  | 'scheduledVideoChannelName'
> {
  return {
    scheduledVideoId: null,
    scheduledVideoChannelId: null,
    scheduledDate: null,
    scheduledVideoStatus: null,
    scheduledVideoTitle: null,
    scheduledVideoDescription: null,
    scheduledVideoThumbnailDataUrl: null,
    scheduledVideoChannelName: null,
  }
}

function applyVideoPublication(project: Project, video: ChannelVideo): Project {
  const channel = channels.find((item) => item.id === video.channelId)
  return {
    ...project,
    scheduledVideoId: video.id,
    scheduledVideoChannelId: video.channelId,
    scheduledDate: video.scheduledDate,
    scheduledVideoStatus: video.status,
    scheduledVideoTitle: video.title,
    scheduledVideoDescription: video.description ?? '',
    scheduledVideoThumbnailDataUrl: video.thumbnailDataUrl ?? null,
    scheduledVideoChannelName: channel?.name ?? project.channelName ?? null,
  }
}

function syncProjectPublication(video: ChannelVideo) {
  if (!video.projectId) return
  const idx = projects.findIndex((project) => project.id === video.projectId)
  if (idx < 0) return
  projects[idx] = applyVideoPublication(projects[idx], video)
}

function clearProjectPublication(projectId: string | null) {
  if (!projectId) return
  const idx = projects.findIndex((project) => project.id === projectId)
  if (idx < 0) return
  projects[idx] = { ...projects[idx], ...emptyPublicationFields() }
}

function emptyAgentSnapshot(provider: AgentProviderId): AgentModelSnapshot {
  return {
    provider,
    version: null,
    models: [],
    currentModel: null,
    currentReasoningEffort: null,
    reasoningEfforts: [],
    supportsReasoningEffort: false,
    configuredModelMissing: false,
    officialFallback: null,
    officialFallbackMessage: null,
    error: null,
    source: 'none',
    discoveredAt: new Date().toISOString(),
    fromCache: false,
  }
}

const emptyAgentBundle: AgentModelsBundle = {
  codex: emptyAgentSnapshot('codex'),
  antigravity: emptyAgentSnapshot('antigravity'),
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
      projectFolderPath?: string | null
    }) => {
      const channel = input.channelId
        ? channels.find((c) => c.id === input.channelId) ?? null
        : null
      const project: Project = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        songLyrics: '',
        projectType: input.projectType,
        channelId: channel?.id ?? null,
        channelName: channel?.name ?? null,
        projectFolderPath: input.projectFolderPath?.trim() || null,
        folderExists: Boolean(input.projectFolderPath?.trim()),
        scriptCount: 0,
        trackCount: 0,
        ...emptyPublicationFields(),
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
      if (patch.songLyrics !== undefined) next.songLyrics = patch.songLyrics.replace(/\r\n/g, '\n')
      projects[idx] = next
      return projects[idx]
    },
    remove: async (id: string, options?: RemoveProjectOptions) => {
      const idx = projects.findIndex((p) => p.id === id)
      if (idx < 0) return false
      const linkedVideoIdx = videos.findIndex((v) => v.projectId === id)
      if (linkedVideoIdx >= 0) {
        if (!options?.alsoRemovePublication) {
          throw new Error(MUSIC_PROJECT_HAS_PUBLICATION_ERROR)
        }
        videos.splice(linkedVideoIdx, 1)
      }
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
    list: async (filters?: VideoListFilters) => {
      const matched = videos
        .filter((v) => {
          if (filters?.channelId && v.channelId !== filters.channelId) return false
          if (filters?.from && v.scheduledDate < filters.from) return false
          if (filters?.to && v.scheduledDate > filters.to) return false
          return true
        })
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.createdAt.localeCompare(b.createdAt))
        .map((v) => {
          const channel = channels.find((c) => c.id === v.channelId)
          return {
            ...v,
            channelName: channel?.name ?? v.channelName ?? null,
            channelType: channel?.channelType ?? v.channelType ?? null,
            channelColor: channel?.color ?? v.channelColor ?? null,
          }
        })
      return filters?.limit != null ? matched.slice(0, filters.limit) : matched
    },
    count: async (filters?: VideoListFilters) => {
      return videos.filter((v) => {
        if (filters?.channelId && v.channelId !== filters.channelId) return false
        if (filters?.projectId && v.projectId !== filters.projectId) return false
        if (filters?.from && v.scheduledDate < filters.from) return false
        if (filters?.to && v.scheduledDate > filters.to) return false
        if (filters?.status && v.status !== filters.status) return false
        if (filters?.excludeStatus && v.status === filters.excludeStatus) return false
        return true
      }).length
    },
    get: async (id: string) => videos.find((v) => v.id === id) ?? null,
    create: async (input: ChannelVideoWriteInput) => {
      const channel = channels.find((c) => c.id === input.channelId)
      let projectId = input.projectId?.trim() || null
      if (channel?.channelType === 'music' && !projectId) {
        const existing = projects.find(
          (p) =>
            p.projectType === 'music' &&
            !p.scheduledVideoId &&
            (p.channelId === channel.id || !p.channelId) &&
            p.name.trim().toLowerCase() === input.title.trim().toLowerCase(),
        )
        const project =
          existing ??
          (await mockApi.projects.create({
            name: input.songTitle?.trim() || input.title.trim(),
            projectType: 'music',
            channelId: channel.id,
          }))
        projectId = project.id
        const idx = projects.findIndex((p) => p.id === project.id)
        if (idx >= 0) {
          projects[idx] = {
            ...projects[idx],
            scheduledVideoId: 'pending',
            scheduledVideoChannelId: channel.id,
            scheduledDate: input.scheduledDate,
            channelId: channel.id,
            channelName: channel.name,
          }
        }
      }
      const video: ChannelVideo = {
        id: crypto.randomUUID(),
        channelId: input.channelId,
        title: input.title.trim(),
        description: input.description ?? '',
        thumbnailPath: input.thumbnailPath ?? '',
        scheduledDate: input.scheduledDate,
        status: input.status,
        scriptId: input.scriptId ?? null,
        projectId,
        projectName: projectId ? projects.find((p) => p.id === projectId)?.name ?? null : null,
        projectFolderPath: input.projectFolderPath ?? null,
        folderExists: Boolean(input.projectFolderPath),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      if (projectId) {
        syncProjectPublication(video)
      }
      videos.push(video)
      return video
    },
    update: async (id: string, patch: Partial<ChannelVideo>) => {
      const idx = videos.findIndex((v) => v.id === id)
      if (idx < 0) return null
      videos[idx] = { ...videos[idx], ...patch, updatedAt: new Date().toISOString() }
      syncProjectPublication(videos[idx])
      return videos[idx]
    },
    remove: async (id: string) => {
      const idx = videos.findIndex((v) => v.id === id)
      if (idx < 0) return false
      const current = videos[idx]
      videos.splice(idx, 1)
      clearProjectPublication(current.projectId)
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
      syncProjectPublication(videos[idx])
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
      tabId?: string | null
      projectId?: string | null
    }) => {
      const tab = input.tabId
        ? quickPromptTabs.find((item) => item.id === input.tabId)
        : input.category?.trim() && input.category.trim().toLowerCase() !== 'custom'
          ? quickPromptTabs.find(
              (item) => item.name.toLowerCase() === input.category!.trim().toLowerCase(),
            ) ??
            (() => {
              const created: CustomPromptTab = {
                id: crypto.randomUUID(),
                name: input.category!.trim(),
                sortOrder: quickPromptTabs.length,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
              quickPromptTabs.push(created)
              return created
            })()
          : null
      const prompt: CustomPrompt = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        category: tab?.name ?? (input.category?.trim() || 'custom'),
        text: input.text.trim(),
        tabId: tab?.id ?? null,
        projectId: input.projectId ?? null,
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      quickPrompts.unshift(prompt)
      return prompt
    },
    update: async (id: string, patch: Partial<CustomPrompt>) => {
      const idx = quickPrompts.findIndex((p) => p.id === id)
      if (idx < 0) return null
      const tab =
        patch.tabId !== undefined
          ? quickPromptTabs.find((item) => item.id === patch.tabId) ?? null
          : undefined
      quickPrompts[idx] = {
        ...quickPrompts[idx],
        ...patch,
        tabId: tab === undefined ? quickPrompts[idx].tabId : tab?.id ?? null,
        category: tab?.name ?? patch.category ?? quickPrompts[idx].category,
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
    listTabs: async () => [...quickPromptTabs],
    createTab: async (input: { name: string }) => {
      const name = input.name.trim()
      if (!name) throw new Error('O nome da aba é obrigatório.')
      if (quickPromptTabs.some((tab) => tab.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Já existe uma aba chamada "${name}".`)
      }
      const tab: CustomPromptTab = {
        id: crypto.randomUUID(),
        name,
        sortOrder: quickPromptTabs.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      quickPromptTabs.push(tab)
      return tab
    },
    updateTab: async (id: string, patch: { name?: string; sortOrder?: number }) => {
      const idx = quickPromptTabs.findIndex((tab) => tab.id === id)
      if (idx < 0) return null
      const name = patch.name?.trim() ?? quickPromptTabs[idx].name
      if (!name) throw new Error('O nome da aba é obrigatório.')
      quickPromptTabs[idx] = {
        ...quickPromptTabs[idx],
        name,
        sortOrder: patch.sortOrder ?? quickPromptTabs[idx].sortOrder,
        updatedAt: new Date().toISOString(),
      }
      for (const prompt of quickPrompts) {
        if (prompt.tabId === id) prompt.category = name
      }
      return quickPromptTabs[idx]
    },
    removeTab: async (id: string) => {
      const idx = quickPromptTabs.findIndex((tab) => tab.id === id)
      if (idx < 0) return false
      quickPromptTabs.splice(idx, 1)
      for (const prompt of quickPrompts) {
        if (prompt.tabId === id) {
          prompt.tabId = null
          prompt.category = 'custom'
        }
      }
      return true
    },
    listShared: async (): Promise<SharedPromptCatalogSnapshot> => ({
      configured: true,
      authorId: MOCK_SHARED_AUTHOR_ID,
      items: [...sharedPrompts],
    }),
    setPublic: async (id: string, isPublic: boolean) => {
      const prompt = quickPrompts.find((item) => item.id === id)
      if (!prompt) throw new Error('Prompt não encontrado.')
      prompt.isPublic = isPublic
      prompt.updatedAt = new Date().toISOString()
      const existing = sharedPrompts.findIndex((item) => item.localPromptId === id)
      if (isPublic) {
        const tabName = prompt.tabId
          ? (quickPromptTabs.find((tab) => tab.id === prompt.tabId)?.name ?? prompt.category)
          : null
        const next: SharedPrompt = {
          id: existing >= 0 ? sharedPrompts[existing].id : crypto.randomUUID(),
          localPromptId: prompt.id,
          name: prompt.name,
          text: prompt.text,
          tabName,
          authorId: MOCK_SHARED_AUTHOR_ID,
          authorName: settings.accountName.trim() || 'Autor anônimo',
          publishedAt: existing >= 0 ? sharedPrompts[existing].publishedAt : prompt.updatedAt,
          updatedAt: prompt.updatedAt,
        }
        if (existing >= 0) sharedPrompts[existing] = next
        else sharedPrompts.unshift(next)
      } else if (existing >= 0) {
        sharedPrompts.splice(existing, 1)
      }
      return prompt
    },
    copyShared: async (sharedId: string, input?: { tabId?: string | null }) => {
      const shared = sharedPrompts.find((item) => item.id === sharedId)
      if (!shared) throw new Error('Prompt público não encontrado.')
      return mockApi.quickPrompts.create({
        name: nextSharedCopyName(
          shared.name,
          quickPrompts.map((item) => item.name),
        ),
        text: shared.text,
        tabId: input?.tabId ?? null,
        category: shared.tabName ?? undefined,
      })
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
    previewUrl: async () => {
      throw new Error('Prévia indisponível no modo mock. Use o Electron.')
    },
    export: async () => null,
    exportAll: async () => null,
    chooseExportFolder: async () => settings.musicExportFolder || null,
    adviseCuts: async (request: MusicAdviseRequest) => adviseCutsLocally(request),
    transcribe: async (_id: string, _language?: 'pt' | 'en', _model?: string) => {
      throw new Error('Legenda indisponível no modo mock. Use o Electron.')
    },
    exportSrt: async () => null,
    importSrt: async () => {
      throw new Error('Importação de SRT indisponível no modo mock. Use o Electron.')
    },
    exportCutsToLipSync: async () => {
      throw new Error('Envio ao LipSync indisponível no modo mock. Use o Electron.')
    },
  },
  editor: {
    list: async () => [],
    get: async () => null,
    create: async () => {
      throw new Error('Editor de vídeo indisponível no modo mock. Use o Electron.')
    },
    update: async () => null,
    remove: async () => false,
    listAssets: async () => [],
    importFiles: async () => ({ assets: [], errors: ['Importação indisponível no modo mock.'] }),
    addFiles: async () => ({ assets: [], errors: ['Importação indisponível no modo mock.'] }),
    removeAsset: async () => false,
    setAssetOrigin: async () => null,
    waveform: async () => null,
    listLipsync: async () => [],
    alignToMusic: async () => ({
      placements: [],
      skipped: [],
      musicAssetId: '',
    }),
    export: async () => null,
    pathForFile: () => '',
    onAssetChanged: () => () => {},
    onExportProgress: () => () => {},
    onProjectChanged: () => () => {},
  },
  shorts: {
    list: async () => [] as ShortsJob[],
    get: async () => null,
    import: async (): Promise<ShortsImportResult | null> => {
      throw new Error('Importação de vídeo indisponível no modo mock. Use o Electron.')
    },
    createFromSourceVideo: async (): Promise<ShortsImportResult> => {
      throw new Error('Criação de projeto de Shorts indisponível no modo mock. Use o Electron.')
    },
    analyze: async (_request: ShortsAnalyzeInput) => {
      throw new Error('Análise de Shorts indisponível no modo mock. Use o Electron.')
    },
    getAnalysisPlan: async () => ({
      provider: 'antigravity' as const,
      currentModel: null,
      currentCapabilities: TEXT_ONLY_CAPABILITIES,
      compatibleVideoModels: [],
      allowExternalVideoAnalysis: false,
      recommendedMode: 'frames_audio_transcript' as const,
      needsVideoConsent: false,
      needsModelChoice: false,
      canSendVideo: false,
    }),
    updateClip: async () => null,
    removeClip: async () => null,
    regenerateCopy: async () => {
      throw new Error('Regenerar título/descrição indisponível no modo mock. Use o Electron.')
    },
    updateSettings: async () => null,
    setLogo: async () => null,
    clearLogo: async () => null,
    export: async () => null,
    remove: async () => false,
    mediaUrl: async () => {
      throw new Error('Prévia de vídeo indisponível no modo mock. Use o Electron.')
    },
    thumbnailUrl: async () => null,
    relink: async () => null,
    openExportsFolder: async (_jobId: string, _clipId?: string) => {
      throw new Error('Pasta de exports indisponível no modo mock. Use o Electron.')
    },
    onProgress: (_callback: (event: ShortsProgressEvent) => void) => () => undefined,
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
  account: {
    getSession: async () => mockSession,
    signIn: async (input: AtlasAuthInput): Promise<AtlasSession> => {
      mockSession = {
        user: {
          id: MOCK_SHARED_AUTHOR_ID,
          email: input.email.trim().toLowerCase(),
          name: input.email.split('@')[0] || 'Preview',
        },
      }
      settings.accountEmail = mockSession.user?.email ?? ''
      settings.accountName = mockSession.user?.name ?? ''
      return mockSession
    },
    signUp: async (input: AtlasAuthInput) => mockApi.account.signIn({
      ...input,
      password: input.password,
    }),
    signOut: async () => {
      mockSession = { user: null }
      return mockSession
    },
    updateProfile: async (name: string) => {
      if (mockSession.user) mockSession = { user: { ...mockSession.user, name: name.trim() } }
      settings.accountName = name.trim()
      return mockSession
    },
    onChanged: () => () => undefined,
  },
  teamChat: {
    listRooms: async () =>
      [...teamRooms]
        .filter((room) => !teamRoomsHiddenForMe.has(room.id))
        .map((room) => {
          const clearedBefore = teamRoomsClearedBefore.get(room.id)
          if (!clearedBefore) return room
          const preview =
            [...teamMessages]
              .reverse()
              .find((message) => message.roomId === room.id && message.createdAt > clearedBefore)
              ?.body ?? null
          return { ...room, lastMessagePreview: preview }
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    listDirectory: async () => [mockPeer],
    listMembers: async (roomId: string) => [...(teamMembers.get(roomId) ?? [])],
    listMessages: async (roomId: string) => {
      const clearedBefore = teamRoomsClearedBefore.get(roomId)
      return teamMessages.filter((message) => {
        if (message.roomId !== roomId) return false
        if (clearedBefore && message.createdAt <= clearedBefore) return false
        return true
      })
    },
    openDm: async (userId: string) => {
      const existing = teamRooms.find(
        (room) => room.kind === 'dm' && room.peer?.id === userId,
      )
      if (existing) {
        teamRoomsHiddenForMe.delete(existing.id)
        return existing
      }
      const peer = userId === mockPeer.id ? mockPeer : { id: userId, name: 'Usuário', email: '' }
      const me = mockSession.user ?? mockAccount
      const room: TeamChatRoom = {
        id: crypto.randomUUID(),
        kind: 'dm',
        name: '',
        title: peer.name,
        createdBy: me.id,
        updatedAt: new Date().toISOString(),
        myRole: 'member',
        memberCount: 2,
        lastMessagePreview: null,
        peer,
      }
      teamMembers.set(room.id, [
        { ...me, role: 'member' },
        { ...peer, role: 'member' },
      ])
      upsertMockRoom(room)
      return room
    },
    createGroup: async (input: TeamChatCreateGroupInput) => {
      const name = input.name.trim()
      if (!name) throw new Error('Informe o nome do grupo.')
      const me = mockSession.user ?? mockAccount
      const selected = (input.memberIds ?? [])
        .map((id) => (id === mockPeer.id ? mockPeer : { id, name: 'Usuário', email: '' }))
        .filter((peer) => peer.id !== me.id)
      const room: TeamChatRoom = {
        id: crypto.randomUUID(),
        kind: 'group',
        name,
        title: name,
        createdBy: me.id,
        updatedAt: new Date().toISOString(),
        myRole: 'admin',
        memberCount: 1 + selected.length,
        lastMessagePreview: null,
        peer: null,
      }
      teamMembers.set(room.id, [
        { ...me, role: 'admin' },
        ...selected.map((peer) => ({ ...peer, role: 'member' as const })),
      ])
      upsertMockRoom(room)
      return room
    },
    addGroupMembers: async (roomId: string, memberIds: string[]) => {
      const room = teamRooms.find((item) => item.id === roomId)
      if (!room || room.kind !== 'group') throw new Error('Grupo não encontrado.')
      if (room.myRole !== 'admin') throw new Error('Só o admin do grupo pode adicionar pessoas.')
      const current = teamMembers.get(roomId) ?? []
      const known = new Set(current.map((member) => member.id))
      for (const id of memberIds) {
        if (!id || known.has(id)) continue
        const peer = id === mockPeer.id ? mockPeer : { id, name: 'Usuário', email: '' }
        current.push({ ...peer, role: 'member' })
        known.add(id)
      }
      teamMembers.set(roomId, current)
      room.memberCount = current.length
      room.updatedAt = new Date().toISOString()
      return [...current]
    },
    sendMessage: async (input: TeamChatSendInput | string) => {
      const payload: TeamChatSendInput =
        typeof input === 'string' ? { roomId: '', body: input } : input ?? { roomId: '' }
      const roomId = payload.roomId?.trim() || ''
      const text = (payload.body ?? '').trim()
      const attachmentPath = payload.attachmentPath?.trim() || ''
      if (!roomId) throw new Error('Selecione uma conversa.')
      if (!text && !attachmentPath) throw new Error('Escreva uma mensagem ou anexe um arquivo.')
      const fileName = attachmentPath ? attachmentPath.split(/[/\\]/).pop() || 'arquivo' : ''
      const ext = fileName.includes('.') ? `.${fileName.split('.').pop()?.toLowerCase()}` : ''
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)
      const message: TeamChatMessage = {
        id: crypto.randomUUID(),
        roomId,
        authorId: mockSession.user?.id ?? MOCK_SHARED_AUTHOR_ID,
        authorName: mockSession.user?.name ?? 'Preview',
        body: text || fileName,
        createdAt: new Date().toISOString(),
        attachment: attachmentPath
          ? {
              name: fileName,
              mime: isImage ? 'image/png' : 'application/octet-stream',
              url: isImage
                ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="%231a1a1a"/><text x="50%" y="50%" fill="%2388ff99" font-size="18" text-anchor="middle" dy=".3em">Preview</text></svg>'
                : `file://${attachmentPath.replace(/\\/g, '/')}`,
              kind: isImage ? 'image' : 'file',
            }
          : null,
      }
      teamMessages.push(message)
      const room = teamRooms.find((item) => item.id === roomId)
      if (room) {
        room.lastMessagePreview = message.body
        room.updatedAt = message.createdAt
      }
      // Nova mensagem traz a conversa de volta (como no Supabase)
      teamRoomsHiddenForMe.delete(roomId)
      teamChatListeners.message.forEach((listener) => listener(message))
      return message
    },
    hideForMe: async (roomId: string) => {
      const id = roomId.trim()
      if (!id) throw new Error('Conversa inválida.')
      if (!teamRooms.some((room) => room.id === id)) {
        throw new Error('Você não participa desta conversa.')
      }
      const now = new Date().toISOString()
      teamRoomsHiddenForMe.add(id)
      teamRoomsClearedBefore.set(id, now)
    },
    listOnline: async () =>
      mockSession.user ? [mockSession.user, mockPeer] : [mockPeer],
    onMessage: (callback: (message: TeamChatMessage) => void) => {
      teamChatListeners.message.add(callback)
      return () => {
        teamChatListeners.message.delete(callback)
      }
    },
    onPresence: (callback: (peers: TeamChatPeer[]) => void) => {
      teamChatListeners.presence.add(callback)
      return () => {
        teamChatListeners.presence.delete(callback)
      }
    },
    setActiveRoom: async () => undefined,
    setTyping: async () => undefined,
    onTyping: () => () => undefined,
    onPeerOnline: () => () => undefined,
    onOpenChat: () => () => undefined,
  },
  workspace: {
    capabilities: async () =>
      resolveWorkspaceCapabilities(
        detectContentAreaPresence({
          channelTypes: channels.map((channel) => channel.channelType),
          projectTypes: projects.map((project) => project.projectType),
        }),
        preferenceFromSettings(settings),
      ),
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
    listModels: async () => ({ models: [], configured: null, effective: '' }),
    onAuthStateChanged: () => () => undefined,
    dismissOnboarding: async () => undefined,
    isOnboardingDismissed: async () => true,
  },
  agents: {
    getCapabilities: async (): Promise<AgentModelsBundle> => emptyAgentBundle,
    refreshModels: async (): Promise<AgentModelsBundle> => emptyAgentBundle,
    setDefaultModel: async (provider: AgentProviderId): Promise<AgentModelSnapshot> =>
      emptyAgentSnapshot(provider),
    setReasoningEffort: async (provider: AgentProviderId): Promise<AgentModelSnapshot> =>
      emptyAgentSnapshot(provider),
    onCapabilitiesChanged: () => () => undefined,
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
      modelOverride: null,
      effortOverride: null,
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
    selectAudio: async () => null,
    selectImages: async () => [],
    readImageDataUrl: async () => null,
    selectFiles: async () => [],
    selectExecutable: async () => null,
  },
  lipSyncRefs: {
    list: async (filters?: LipSyncRefListFilters) => {
      let list = [...lipSyncRefs]
      if (filters?.unassignedOnly) {
        list = list.filter((item) => !item.projectId)
      } else if (filters?.projectId) {
        list = list.filter((item) => item.projectId === filters.projectId)
      }
      const status = filters?.status ?? 'active'
      if (status !== 'all') {
        list = list.filter((item) => item.status === status)
      }
      if (filters?.subject) {
        list = list.filter((item) => item.subject === filters.subject)
      }
      return list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    },
    create: async (input: LipSyncRefCreateInput) => {
      const now = new Date().toISOString()
      const projectId = input.projectId?.trim() || null
      const project = projectId ? projects.find((item) => item.id === projectId) : null
      const imagePath = input.imagePath?.trim() ?? ''
      const item: LipSyncRef = {
        id: crypto.randomUUID(),
        label: input.label?.trim() || (imagePath ? 'Referência' : ''),
        prompt: input.prompt?.trim() || '',
        lyrics: input.lyrics?.trim() || '',
        imagePath,
        imageDataUrl: imagePath
          ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="100%" height="100%" fill="%231a1a1a"/><text x="50%" y="50%" fill="%2388ff99" font-size="18" text-anchor="middle" dy=".3em">Lipsync</text></svg>'
          : null,
        audioPath: '',
        audioDuration: null,
        projectId,
        projectName: project?.name ?? null,
        subject: input.subject === 'band' ? 'band' : 'singer',
        status: 'active',
        sortOrder: lipSyncRefs.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
        createdAt: now,
        updatedAt: now,
      }
      lipSyncRefs.push(item)
      return item
    },
    createMany: async (imagePaths: string[], projectId?: string | null, subject?: LipSyncSubject) => {
      const created: LipSyncRef[] = []
      for (const imagePath of imagePaths) {
        created.push(await mockApi.lipSyncRefs.create({ imagePath, projectId, subject }))
      }
      return created
    },
    update: async (id: string, patch: LipSyncRefUpdateInput) => {
      const index = lipSyncRefs.findIndex((item) => item.id === id)
      if (index < 0) return null
      const current = lipSyncRefs[index]
      const projectId =
        patch.projectId !== undefined ? patch.projectId?.trim() || null : current.projectId
      const project = projectId ? projects.find((item) => item.id === projectId) : null
      if (patch.imagePath !== undefined && !patch.imagePath.trim()) {
        throw new Error('Selecione uma imagem.')
      }
      const next: LipSyncRef = {
        ...current,
        label: patch.label !== undefined ? patch.label.trim() : current.label,
        prompt: patch.prompt !== undefined ? patch.prompt : current.prompt,
        lyrics: patch.lyrics !== undefined ? patch.lyrics : current.lyrics,
        imagePath: patch.imagePath !== undefined ? patch.imagePath.trim() : current.imagePath,
        projectId,
        projectName: project?.name ?? null,
        subject: patch.subject === 'band' ? 'band' : patch.subject === 'singer' ? 'singer' : current.subject,
        updatedAt: new Date().toISOString(),
      }
      lipSyncRefs[index] = next
      return next
    },
    setAudio: async (id: string, audioPath: string) => {
      const index = lipSyncRefs.findIndex((item) => item.id === id)
      if (index < 0) return null
      const path = audioPath.trim()
      const next: LipSyncRef = {
        ...lipSyncRefs[index],
        audioPath: path,
        audioDuration: path ? 12.5 : null,
        updatedAt: new Date().toISOString(),
      }
      lipSyncRefs[index] = next
      return next
    },
    remove: async (id: string) => {
      const index = lipSyncRefs.findIndex((item) => item.id === id)
      if (index < 0) return false
      lipSyncRefs.splice(index, 1)
      return true
    },
    removeByProject: async (projectId: string, subject?: LipSyncSubject) => {
      const before = lipSyncRefs.length
      const remaining = lipSyncRefs.filter(
        (item) => item.projectId !== projectId || (subject && item.subject !== subject),
      )
      lipSyncRefs.length = 0
      lipSyncRefs.push(...remaining)
      return before - remaining.length
    },
    archiveByProject: async (projectId: string, subject?: LipSyncSubject) => {
      const archived = lipSyncRefs.filter(
        (item) => item.projectId === projectId && (!subject || item.subject === subject),
      )
      if (archived.length === 0) {
        throw new Error('Não há referências neste projeto para salvar.')
      }
      const remaining = lipSyncRefs.filter(
        (item) => item.projectId !== projectId || (subject && item.subject !== subject),
      )
      lipSyncRefs.length = 0
      lipSyncRefs.push(...remaining)
      return archived
    },
  },
  flowProjects: {
    list: async (filters?: { query?: string }) => {
      const q = filters?.query?.trim().toLowerCase()
      return flowProjects.filter((project) => {
        if (!q) return true
        return (
          project.name.toLowerCase().includes(q) ||
          project.localFolderPath.toLowerCase().includes(q) ||
          (project.remoteId?.toLowerCase().includes(q) ?? false)
        )
      })
    },
    get: async (id: string) => flowProjects.find((project) => project.id === id) ?? null,
    create: async (input: FlowProjectCreateInput) => {
      const validated = validateFlowProjectCreateInput({
        name: input.name,
        localFolderPath: input.localFolderPath,
        folderExists: true,
      })
      if (!validated.ok) throw new Error(validated.error)
      const now = new Date().toISOString()
      const project: FlowProject = {
        id: crypto.randomUUID(),
        name: validated.name,
        localFolderPath: validated.localFolderPath,
        remoteUrl: null,
        remoteId: null,
        accountHint: null,
        syncStatus: input.createInFlow === false ? 'local_created' : 'sync_failed',
        lastError:
          input.createInFlow === false
            ? null
            : 'Vínculo com Google Flow disponível apenas no app Electron com a extensão.',
        createInFlow: input.createInFlow !== false,
        operationId: crypto.randomUUID(),
        prompt: '',
        imageModel: 'nano-banana-2.1',
        imageOutputs: 3,
        generationPaused: false,
        createdAt: now,
        updatedAt: now,
      }
      flowProjects.unshift(project)
      return project
    },
    update: async (id: string, patch: FlowProjectPatch) => {
      const project = flowProjects.find((item) => item.id === id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      if (patch.name !== undefined) project.name = patch.name.trim()
      if (patch.localFolderPath !== undefined) project.localFolderPath = patch.localFolderPath.trim()
      if (patch.remoteUrl !== undefined) project.remoteUrl = patch.remoteUrl?.trim() || null
      if (patch.remoteId !== undefined) project.remoteId = patch.remoteId?.trim() || null
      if (patch.accountHint !== undefined) project.accountHint = patch.accountHint?.trim() || null
      if (patch.syncStatus !== undefined) project.syncStatus = patch.syncStatus
      if (patch.lastError !== undefined) project.lastError = patch.lastError?.trim() || null
      if (patch.createInFlow !== undefined) project.createInFlow = patch.createInFlow
      if (patch.prompt !== undefined) project.prompt = String(patch.prompt ?? '').slice(0, 20_000)
      if (patch.imageModel !== undefined) project.imageModel = patch.imageModel
      if (patch.imageOutputs !== undefined) project.imageOutputs = patch.imageOutputs
      if (patch.generationPaused !== undefined) project.generationPaused = patch.generationPaused
      project.updatedAt = new Date().toISOString()
      return project
    },
    retryLink: async (id: string) => {
      const project = flowProjects.find((item) => item.id === id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      project.syncStatus = 'sync_failed'
      project.lastError = 'Vínculo com Google Flow disponível apenas no app Electron com a extensão.'
      project.updatedAt = new Date().toISOString()
      return project
    },
    remove: async (id: string) => {
      const index = flowProjects.findIndex((item) => item.id === id)
      if (index < 0) return false
      flowProjects.splice(index, 1)
      for (let i = flowReferences.length - 1; i >= 0; i -= 1) {
        if (flowReferences[i]?.projectId === id) flowReferences.splice(i, 1)
      }
      return true
    },
    openLocal: async () => true,
    openRemote: async () => {
      throw new Error('Projeto remoto indisponível no modo mock.')
    },
    extensionStatus: async (): Promise<FlowExtensionStatus> => ({
      bridgeRunning: false,
      bridgePort: null,
      extensionConnected: false,
      accountHint: null,
      extensionPath: '',
      pairToken: null,
      lastError: 'Disponível só no app do Atlas.',
    }),
    listReferences: async (projectId: string) =>
      flowReferences
        .filter((item) => item.projectId === projectId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    addReferences: async (projectId: string, filePaths: string[]) => {
      const project = flowProjects.find((item) => item.id === projectId)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      const existing = flowReferences.filter((item) => item.projectId === projectId)
      let sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
      const created: FlowReference[] = []
      for (const filePath of filePaths) {
        const now = new Date().toISOString()
        const ref: FlowReference = {
          id: crypto.randomUUID(),
          projectId,
          label: validateFlowReferenceLabel(labelFromImagePath(filePath)),
          imagePath: filePath,
          imageUrl: null,
          imageThumbUrl: null,
          sortOrder,
          flowUploadKey: null,
          flowFileName: null,
          syncStatus: 'local',
          syncedAt: null,
          lastSyncError: null,
          createdAt: now,
          updatedAt: now,
        }
        flowReferences.push(ref)
        created.push(ref)
        sortOrder += 1
      }
      return created
    },
    updateReference: async (id: string, patch: FlowReferenceUpdateInput) => {
      const ref = flowReferences.find((item) => item.id === id)
      if (!ref) return null
      if (patch.label !== undefined) ref.label = validateFlowReferenceLabel(patch.label)
      ref.updatedAt = new Date().toISOString()
      return { ...ref }
    },
    removeReference: async (id: string) => {
      const index = flowReferences.findIndex((item) => item.id === id)
      if (index < 0) return false
      flowReferences.splice(index, 1)
      return true
    },
    syncReferences: async (projectId: string) => {
      const project = flowProjects.find((item) => item.id === projectId)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      if (!project.remoteId) {
        throw new Error('Informe a URL do projeto existente no Google Flow antes de enviar as referências.')
      }
      const refs = flowReferences.filter((item) => item.projectId === projectId)
      if (refs.length === 0) throw new Error('Anexe pelo menos uma imagem de referência neste projeto.')
      const now = new Date().toISOString()
      for (const ref of refs) {
        ref.syncStatus = 'sent'
        ref.flowFileName = `${ref.label}.png`
        ref.flowUploadKey = `${ref.label.toLowerCase()}::${ref.flowFileName}`
        ref.syncedAt = now
        ref.lastSyncError = null
      }
      return { uploaded: refs.length, reused: 0 }
    },
    syncPrompt: async (projectId: string) => {
      const project = flowProjects.find((item) => item.id === projectId)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      if (project.generationPaused) {
        throw new Error(project.lastError || 'Geração pausada.')
      }
      if (!project.remoteId) {
        throw new Error('Informe a URL do projeto existente no Google Flow antes de enviar o prompt.')
      }
      if (!String(project.prompt || '').trim()) {
        throw new Error('Escreva um prompt neste projeto antes de enviar ao Flow.')
      }
      throw new Error('Envio do prompt ao Google Flow disponível apenas no app Electron com a extensão.')
    },
    resumeGeneration: async (projectId: string) => {
      const project = flowProjects.find((item) => item.id === projectId)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      project.generationPaused = false
      project.lastError = null
      project.updatedAt = new Date().toISOString()
      return project
    },
    listGenerationCards: async () => [],
    importGenerationCards: async () => {
      throw new Error('Importação de cards disponível apenas no app Electron.')
    },
    addGenerationCard: async () => {
      throw new Error('Cards disponíveis apenas no app Electron.')
    },
    updateGenerationCard: async () => null,
    removeGenerationCard: async () => false,
    prepareGenerationCard: async () => {
      throw new Error('Preparar card disponível apenas no app Electron.')
    },
    generateGenerationCard: async () => {
      throw new Error('Gerar card disponível apenas no app Electron.')
    },
    onProgress: () => () => undefined,
  },
  comfy: {
    getConfig: async () => ({ ...DEFAULT_COMFY_CONFIG }),
    saveConfig: async () => ({ ...DEFAULT_COMFY_CONFIG }),
    importWorkflow: async () => null,
    testConnection: async () => ({ ok: false, message: 'Disponível só no app do Atlas.' }),
    discoverUrl: async () => ({
      ok: false,
      changed: false,
      baseUrl: '',
      podId: '',
      podName: '',
      message: 'Disponível só no app do Atlas.',
      connection: null,
    }),
    getRunpodStatus: async () => ({
      fetchedAt: new Date().toISOString(),
      apiKeyPresent: false,
      apiKeyValid: null,
      error: 'Disponível só no app do Atlas.',
      autoInfraEnabled: false,
      preferredPodId: null,
      dryRunStarts: true,
      configuredUrl: '',
      urlStale: false,
      selectedPod: null,
      pods: [],
      suggestedUrl: null,
      comfy: null,
      gpuCatalog: [],
      networkVolumes: [],
      templates: [],
      mutationCalls: 0 as const,
      lifecycle: null,
    }),
    previewRunpodStart: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    startRunpodPod: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    stopRunpodPod: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    cleanupSupersededRunpodPods: async () => ({
      dryRun: true,
      candidates: [],
      terminated: [],
      failed: [],
      message: 'Disponível só no app do Atlas.',
    }),
    getRunpodLifecycle: async () => null,
    prepareComfyConnect: async () => ({
      status: 'error' as const,
      phase: 'error' as const,
      message: 'Disponível só no app do Atlas.',
      diagnostics: [],
      config: { ...DEFAULT_COMFY_CONFIG },
    }),
    confirmComfyConnect: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    confirmComfyGpuRecovery: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    refreshComfyConnectStatus: async () => ({
      phase: 'error' as const,
      baseUrl: '',
      connection: null,
      message: 'Disponível só no app do Atlas.',
      config: { ...DEFAULT_COMFY_CONFIG },
      urlChanged: false,
    }),
    prepareLipsyncControlledTest: async () => ({
      readyToAuthorizeStart: false,
      readyToGenerateAfterConnect: false,
      dryRunStarts: true,
      autoShutdownImplemented: false as const,
      estimatedCostPerHr: null,
      preferredPod: null,
      scene: {
        refId: null,
        label: null,
        number: null,
        imagePath: null,
        audioPath: null,
        promptPreview: null,
        outputDir: null,
      },
      checks: [],
      blockers: ['Disponível só no app do Atlas.'],
      warnings: [],
      authorizationSteps: [],
      message: 'Disponível só no app do Atlas.',
    }),
    prepareGpuRecoveryValidation: async () => ({
      validation: {
        readyToAuthorizePaidRecovery: false,
        dryRunStarts: true,
        autoShutdownImplemented: false as const,
        batchProductionAllowed: false as const,
        estimatedCostPerHr: null,
        preferredPod: null,
        recovery: null,
        recommendedAction: 'none' as const,
        continuousBillingRisks: [],
        authorizationSteps: [],
        postSuccessReportFields: [],
        checks: [],
        blockers: ['Disponível só no app do Atlas.'],
        warnings: [],
        message: 'Disponível só no app do Atlas.',
      },
      autoShutdown: {
        implemented: false as const,
        enabledByDefault: false as const,
        stopAction: 'stop' as const,
        neverActions: ['terminate', 'delete', 'delete_volume'] as Array<
          'terminate' | 'delete' | 'delete_volume'
        >,
        waitForDownloads: true as const,
        graceSecondsAfterLastDownload: 30,
        triggers: [],
        safetyRules: [],
        uiRequirements: [],
        estimatedRiskWithoutIt: 'N/A',
        message: 'Disponível só no app do Atlas.',
      },
      fetchedAt: new Date().toISOString(),
      mutationCalls: 0 as const,
      paidOperationsExecuted: false as const,
    }),
    getCachedRunpodStatus: async () => null,
    getSavedLtxDetection: async () => ({
      detection: null,
      savedAt: null,
      inventoryVerifiedAt: null,
    }),
    bootstrapLtxEnvironment: async () => ({
      snapshot: null,
      detection: null,
      source: 'none' as const,
      inventoryFromCache: false,
      message: 'Disponível só no app do Atlas.',
    }),
    saveRunpodS3CredentialsAndBootstrap: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    getLtxEnvironment: async () => ({
      dryRunOnly: true,
      accountFingerprint: null,
      templateImage: 'atlas-studio/comfyui-ltx2.3:pending-pin',
      templateTagPinned: false,
      containerPort: 8188,
      storageStrategy: 'undecided' as const,
      preferredDataCenterId: null,
      networkVolumeId: null,
      networkVolumeSizeGb: null,
      primaryGpuId: null,
      alternateGpuIds: [null, null] as [string | null, string | null],
      minVramGb: 16,
      recommendedVramGb: 24,
      maxUsdPerHour: null,
      preferredCloud: 'SECURE' as const,
      modelsMountPath: '/runpod-volume/models',
      comfyRootInContainer: '/ComfyUI',
      notes: '',
    }),
    saveLtxEnvironment: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    diagnoseLtxEnvironment: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    detectLtxEnvironment: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    getRunpodS3Status: async () => ({ configured: false, accessKeyPreview: null }),
    saveRunpodS3Credentials: async () => {
      throw new Error('Disponível só no app do Atlas.')
    },
    start: async () => {
      throw new Error('O envio ao ComfyUI só funciona no app do Atlas.')
    },
    list: async () => [],
    latest: async () => null,
    pause: async () => null,
    resume: async () => null,
    cancel: async () => null,
    retryFailed: async () => null,
  },
  system: {
    copyText: async (text: string) => {
      await navigator.clipboard.writeText(text)
      return true
    },
    readText: async () => navigator.clipboard.readText(),
    openPath: async () => true,
  },
  updates: {
    status: async () => ({
      state: 'dev' as const,
      currentVersion: '1.24.0',
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
