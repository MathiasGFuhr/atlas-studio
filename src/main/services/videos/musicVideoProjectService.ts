import type {
  Channel,
  ChannelVideo,
  ChannelVideoWriteInput,
  Project,
  RemoveProjectOptions,
} from '../../../shared/types'
import { MUSIC_PROJECT_HAS_PUBLICATION_ERROR } from '../../../shared/types'
import {
  findUnequivocalMusicProject,
  resolveMusicProjectName,
  type MusicProjectMatchCandidate,
} from '../../../shared/musicVideoProject'
import { channelRepository } from '../../repositories/channelRepository'
import { projectRepository } from '../../repositories/projectRepository'

export type MusicVideoProjectStore = {
  getChannel: (id: string) => Channel | null
  getProject: (id: string) => Project | null
  listMusicProjects: () => Project[]
  createProject: (input: {
    name: string
    description?: string
    projectType: 'music'
    channelId?: string | null
    projectFolderPath?: string | null
  }) => Project
  updateProject: (
    id: string,
    patch: Partial<Pick<Project, 'channelId' | 'projectFolderPath'>>,
  ) => Project | null
  touchProject: (id: string) => void
  removeProject: (id: string) => boolean
  getVideoByProjectId: (projectId: string) => ChannelVideo | null
  createVideo: (input: ChannelVideoWriteInput) => ChannelVideo
  removeVideo: (id: string) => boolean
}

const liveStore: MusicVideoProjectStore = {
  getChannel: (id) => channelRepository.get(id),
  getProject: (id) => projectRepository.get(id),
  listMusicProjects: () => projectRepository.list({ projectType: 'music' }),
  createProject: (input) => projectRepository.create(input),
  updateProject: (id, patch) => projectRepository.update(id, patch),
  touchProject: (id) => projectRepository.touch(id),
  removeProject: (id) => projectRepository.remove(id),
  getVideoByProjectId: (projectId) => channelRepository.getVideoByProjectId(projectId),
  createVideo: (input) => channelRepository.createVideo(input),
  removeVideo: (id) => channelRepository.removeVideo(id),
}

function asCandidate(project: Project): MusicProjectMatchCandidate {
  return {
    id: project.id,
    name: project.name,
    channelId: project.channelId,
    folderPath: project.projectFolderPath,
    linkedVideoId: project.scheduledVideoId ?? null,
  }
}

function resolveExistingMusicProject(
  store: MusicVideoProjectStore,
  input: ChannelVideoWriteInput,
  channel: Channel,
): Project {
  if (input.projectId?.trim()) {
    const existing = store.getProject(input.projectId.trim())
    if (!existing) throw new Error('Projeto de Música não encontrado.')
    if (existing.projectType !== 'music') {
      throw new Error('O projeto informado não é de Música.')
    }
    if (existing.channelId && existing.channelId !== channel.id) {
      throw new Error('Este projeto pertence a outro canal.')
    }
    const linked = store.getVideoByProjectId(existing.id)
    if (linked) throw new Error('Este projeto já possui uma publicação agendada.')
    if (!existing.channelId) {
      return store.updateProject(existing.id, { channelId: channel.id }) ?? existing
    }
    return existing
  }

  const matched = findUnequivocalMusicProject(
    {
      title: input.title,
      channelId: channel.id,
      folderPath: input.projectFolderPath,
      songTitle: input.songTitle,
    },
    store.listMusicProjects().map(asCandidate),
  )
  if (!matched) {
    throw new Error('NO_MATCH')
  }
  const project = store.getProject(matched.id)
  if (!project) throw new Error('Projeto de Música não encontrado.')
  if (!project.channelId) {
    return store.updateProject(project.id, { channelId: channel.id }) ?? project
  }
  return project
}

export function scheduleMusicVideoWith(
  store: MusicVideoProjectStore,
  input: ChannelVideoWriteInput,
): { video: ChannelVideo; project: Project; createdProject: boolean } {
  const channel = store.getChannel(input.channelId)
  if (!channel) throw new Error('Canal não encontrado')
  if (channel.channelType !== 'music') {
    throw new Error('Apenas canais de Música criam projeto automaticamente.')
  }

  const title = input.title.trim()
  if (!title) throw new Error('O título do vídeo é obrigatório.')

  let project: Project | null = null
  let createdProject = false
  try {
    try {
      project = resolveExistingMusicProject(store, input, channel)
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'NO_MATCH') throw error
    }

    if (!project) {
      const folderPath = input.projectFolderPath?.trim() || null
      project = store.createProject({
        name: resolveMusicProjectName({ title, songTitle: input.songTitle }),
        projectType: 'music',
        channelId: channel.id,
        projectFolderPath: folderPath,
      })
      createdProject = true
    }

    const video = store.createVideo({
      ...input,
      title,
      projectId: project.id,
      songTitle: undefined,
    })
    store.touchProject(project.id)
    return { video, project, createdProject }
  } catch (error) {
    if (createdProject && project) {
      try {
        store.removeProject(project.id)
      } catch {
        /* rollback best-effort: não mascarar o erro original */
      }
    }
    throw error
  }
}

export function createChannelVideoWith(
  store: MusicVideoProjectStore,
  input: ChannelVideoWriteInput,
): ChannelVideo {
  const channel = store.getChannel(input.channelId)
  if (!channel) throw new Error('Canal não encontrado')
  if (channel.channelType === 'music') {
    return scheduleMusicVideoWith(store, input).video
  }
  return store.createVideo({ ...input, projectId: null, songTitle: undefined })
}

export function removeChannelVideoWith(store: MusicVideoProjectStore, videoId: string): boolean {
  const removed = store.removeVideo(videoId)
  return removed
}

export function removeProjectWith(
  store: MusicVideoProjectStore,
  projectId: string,
  options: RemoveProjectOptions = {},
): boolean {
  const project = store.getProject(projectId)
  if (!project) return false
  const publication = store.getVideoByProjectId(projectId)
  if (publication) {
    if (!options.alsoRemovePublication) {
      throw new Error(MUSIC_PROJECT_HAS_PUBLICATION_ERROR)
    }
    store.removeVideo(publication.id)
  }
  return store.removeProject(projectId)
}

export function createChannelVideo(input: ChannelVideoWriteInput): ChannelVideo {
  return createChannelVideoWith(liveStore, input)
}

export function scheduleMusicVideo(input: ChannelVideoWriteInput) {
  return scheduleMusicVideoWith(liveStore, input)
}

export function removeChannelVideo(videoId: string): boolean {
  return removeChannelVideoWith(liveStore, videoId)
}

export function removeProject(projectId: string, options: RemoveProjectOptions = {}): boolean {
  return removeProjectWith(liveStore, projectId, options)
}
