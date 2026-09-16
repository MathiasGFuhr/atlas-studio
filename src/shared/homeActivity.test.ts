import { describe, expect, it } from 'vitest'
import type { MusicTrack } from './musicAnalysis'
import type { AtlasTask, Channel, Project, ScriptRecord } from './types'
import { buildHomeActivity } from './homeActivity'

function project(partial: Partial<Project> & Pick<Project, 'id' | 'name'>): Project {
  return {
    description: '',
    projectType: 'history',
    channelId: null,
    projectFolderPath: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...partial,
  }
}

function script(partial: Partial<ScriptRecord> & Pick<ScriptRecord, 'id' | 'title'>): ScriptRecord {
  return {
    nicheId: 'n1',
    topic: '',
    language: 'pt',
    content: '',
    status: 'rascunho',
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    ...partial,
  }
}

function task(partial: Partial<AtlasTask> & Pick<AtlasTask, 'id' | 'title'>): AtlasTask {
  return {
    description: '',
    status: 'pending',
    priority: 'normal',
    category: 'general',
    dueDate: null,
    relatedType: null,
    relatedId: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    completedAt: null,
    ...partial,
  }
}

function channel(partial: Partial<Channel> & Pick<Channel, 'id' | 'name'>): Channel {
  return {
    description: '',
    avatarPath: '',
    nicheId: null,
    youtubeUrl: '',
    color: '#35e58b',
    channelType: 'history',
    active: true,
    createdAt: '2026-09-09T10:00:00.000Z',
    updatedAt: '2026-09-09T10:00:00.000Z',
    ...partial,
  }
}

function track(partial: Partial<MusicTrack> & Pick<MusicTrack, 'id' | 'name'>): MusicTrack {
  return {
    originalPath: '',
    previewPath: '',
    duration: 1,
    cutMode: 'manual',
    cuts: [],
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z',
    ...partial,
  }
}

describe('atividade recente da Home', () => {
  it('ordena pelo evento mais recente e limita a quantidade', () => {
    const items = buildHomeActivity(
      {
        projects: [project({ id: 'p1', name: 'Impérios', updatedAt: '2026-09-14T08:00:00.000Z' })],
        scripts: [script({ id: 's1', title: 'Roma', updatedAt: '2026-09-15T09:00:00.000Z' })],
        tasks: [
          task({
            id: 't1',
            title: 'Revisar gancho',
            status: 'completed',
            completedAt: '2026-09-15T10:00:00.000Z',
          }),
          task({ id: 't2', title: 'Pendente' }),
        ],
        channels: [channel({ id: 'c1', name: 'Atlas Docs' })],
        tracks: [track({ id: 'm1', name: 'Trilha' })],
      },
      3,
    )

    expect(items.map((item) => item.id)).toEqual([
      'task:t1:completed',
      'script:s1:updated',
      'project:p1:updated',
    ])
    expect(items[0]?.detail).toBe('Tarefa concluída')
    expect(items[1]?.href).toBe('/historia/roteiros/s1')
  })

  it('trata criação quando createdAt e updatedAt são iguais', () => {
    const [item] = buildHomeActivity({
      projects: [project({ id: 'p2', name: 'Novo', projectType: 'music' })],
      scripts: [],
      tasks: [],
      channels: [],
      tracks: [],
    })
    expect(item?.kind).toBe('project-created')
    expect(item?.detail).toBe('Projeto de Música criado')
    expect(item?.href).toBe('/musica/projetos/p2')
  })
})
