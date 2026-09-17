import { describe, expect, it } from 'vitest'
import type {
  Channel,
  ChannelVideo,
  ChannelVideoWriteInput,
  Project,
} from '../../../shared/types'
import { MUSIC_PROJECT_HAS_PUBLICATION_ERROR } from '../../../shared/types'
import {
  createChannelVideoWith,
  removeChannelVideoWith,
  removeProjectWith,
  scheduleMusicVideoWith,
  type MusicVideoProjectStore,
} from './musicVideoProjectService'

function channel(partial: Partial<Channel> & Pick<Channel, 'id' | 'name'>): Channel {
  return {
    description: '',
    avatarPath: '',
    nicheId: null,
    youtubeUrl: '',
    color: '#a78bfa',
    channelType: 'music',
    active: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  }
}

function project(partial: Partial<Project> & Pick<Project, 'id' | 'name'>): Project {
  return {
    description: '',
    projectType: 'music',
    channelId: 'ch-falk',
    projectFolderPath: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  }
}

function video(partial: Partial<ChannelVideo> & Pick<ChannelVideo, 'id' | 'title'>): ChannelVideo {
  return {
    channelId: 'ch-falk',
    description: '',
    thumbnailPath: '',
    scheduledDate: '2026-09-21',
    status: 'colocando',
    scriptId: null,
    projectId: null,
    projectFolderPath: null,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...partial,
  }
}

function createStore(seed?: { channels?: Channel[]; projects?: Project[]; videos?: ChannelVideo[] }) {
  const channels = new Map((seed?.channels ?? [channel({ id: 'ch-falk', name: 'Johann Falk' })]).map((item) => [item.id, item]))
  const projects = new Map((seed?.projects ?? []).map((item) => [item.id, { ...item }]))
  const videos = new Map((seed?.videos ?? []).map((item) => [item.id, { ...item }]))
  let seq = 1
  const store: MusicVideoProjectStore = {
    getChannel: (id) => channels.get(id) ?? null,
    getProject: (id) => projects.get(id) ?? null,
    listMusicProjects: () => [...projects.values()].filter((item) => item.projectType === 'music'),
    createProject: (input) => {
      const created = project({
        id: `p-${seq++}`,
        name: input.name,
        channelId: input.channelId ?? null,
        projectFolderPath: input.projectFolderPath ?? null,
      })
      projects.set(created.id, created)
      return created
    },
    updateProject: (id, patch) => {
      const current = projects.get(id)
      if (!current) return null
      const next = { ...current, ...patch }
      projects.set(id, next)
      return next
    },
    touchProject: (id) => {
      const current = projects.get(id)
      if (current) current.updatedAt = '2026-09-17T12:00:00.000Z'
    },
    removeProject: (id) => projects.delete(id),
    getVideoByProjectId: (projectId) =>
      [...videos.values()].find((item) => item.projectId === projectId) ?? null,
    createVideo: (input: ChannelVideoWriteInput) => {
      const created = video({
        id: `v-${seq++}`,
        title: input.title,
        channelId: input.channelId,
        scheduledDate: input.scheduledDate,
        status: input.status,
        projectId: input.projectId ?? null,
        projectFolderPath: input.projectFolderPath ?? null,
      })
      videos.set(created.id, created)
      const linked = created.projectId ? projects.get(created.projectId) : null
      if (linked) linked.scheduledVideoId = created.id
      return created
    },
    removeVideo: (id) => {
      const current = videos.get(id)
      if (!current) return false
      if (current.projectId) {
        const linked = projects.get(current.projectId)
        if (linked) linked.scheduledVideoId = null
      }
      return videos.delete(id)
    },
  }
  return { store, projects, videos }
}

const baseInput: ChannelVideoWriteInput = {
  channelId: 'ch-falk',
  title: 'HEILIGE LÜGEN',
  scheduledDate: '2026-09-21',
  status: 'colocando',
}

describe('musicVideoProjectService', () => {
  it('cria projeto de Música ao agendar um vídeo sem projeto', () => {
    const { store, projects } = createStore()
    const result = scheduleMusicVideoWith(store, baseInput)
    expect(result.createdProject).toBe(true)
    expect(result.project.name).toBe('HEILIGE LÜGEN')
    expect(result.project.channelId).toBe('ch-falk')
    expect(result.project.projectFolderPath).toBeNull()
    expect(result.video.projectId).toBe(result.project.id)
    expect(projects.size).toBe(1)
  })

  it('usa songTitle como nome do projeto quando informado', () => {
    const { store } = createStore()
    const result = scheduleMusicVideoWith(store, {
      ...baseInput,
      title: 'Diese Worte trafen das ganze Festival | HEILIGE LÜGEN',
      songTitle: 'HEILIGE LÜGEN',
    })
    expect(result.project.name).toBe('HEILIGE LÜGEN')
  })

  it('vincula projeto existente inequívoco em vez de duplicar', () => {
    const existing = project({ id: 'p1', name: 'HEILIGE LÜGEN' })
    const { store, projects } = createStore({ projects: [existing] })
    const result = scheduleMusicVideoWith(store, baseInput)
    expect(result.createdProject).toBe(false)
    expect(result.video.projectId).toBe('p1')
    expect(projects.size).toBe(1)
  })

  it('cria outro projeto quando o nome existente é ambíguo', () => {
    const { store, projects } = createStore({
      projects: [
        project({ id: 'p1', name: 'HEILIGE LÜGEN' }),
        project({ id: 'p2', name: 'HEILIGE LÜGEN' }),
      ],
    })
    const result = scheduleMusicVideoWith(store, baseInput)
    expect(result.createdProject).toBe(true)
    expect(projects.size).toBe(3)
    expect(result.video.projectId).toBe(result.project.id)
  })

  it('não aplica a regra a canais de História', () => {
    const history = channel({ id: 'ch-hist', name: 'História', channelType: 'history' })
    const { store, projects } = createStore({ channels: [history] })
    const created = createChannelVideoWith(store, {
      ...baseInput,
      channelId: 'ch-hist',
      title: 'A Queda de Roma',
    })
    expect(created.projectId).toBeNull()
    expect(projects.size).toBe(0)
  })

  it('desfaz o projeto criado se o vídeo falhar', () => {
    const { store, projects } = createStore()
    const failing: MusicVideoProjectStore = {
      ...store,
      createVideo: () => {
        throw new Error('falha ao gravar vídeo')
      },
    }
    expect(() => scheduleMusicVideoWith(failing, baseInput)).toThrow('falha ao gravar vídeo')
    expect(projects.size).toBe(0)
  })

  it('excluir o agendamento preserva o projeto', () => {
    const { store, projects, videos } = createStore()
    const result = scheduleMusicVideoWith(store, baseInput)
    expect(removeChannelVideoWith(store, result.video.id)).toBe(true)
    expect(videos.size).toBe(0)
    expect(projects.get(result.project.id)?.name).toBe('HEILIGE LÜGEN')
    expect(projects.get(result.project.id)?.scheduledVideoId).toBeNull()
  })

  it('não exclui projeto com publicação sem confirmação', () => {
    const { store } = createStore()
    const result = scheduleMusicVideoWith(store, baseInput)
    expect(() => removeProjectWith(store, result.project.id)).toThrow(MUSIC_PROJECT_HAS_PUBLICATION_ERROR)
    expect(store.getProject(result.project.id)).toBeTruthy()
    expect(store.getVideoByProjectId(result.project.id)?.id).toBe(result.video.id)
  })

  it('exclui projeto e publicação juntos quando confirmado', () => {
    const { store, projects, videos } = createStore()
    const result = scheduleMusicVideoWith(store, baseInput)
    expect(removeProjectWith(store, result.project.id, { alsoRemovePublication: true })).toBe(true)
    expect(projects.size).toBe(0)
    expect(videos.size).toBe(0)
  })
})
