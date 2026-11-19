import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorProject } from '../../../shared/editor/types'
import type { Project } from '../../../shared/types'

const mockProjects = new Map<string, Project>()
const mockEditorProjects = new Map<string, EditorProject>()

vi.mock('../../repositories/projectRepository', () => ({
  projectRepository: {
    get: (id: string) => mockProjects.get(id) ?? null,
  },
}))

vi.mock('../../repositories/musicRepository', () => ({
  musicRepository: {
    list: () => [],
    get: () => null,
  },
}))

vi.mock('../../repositories/editorRepository', () => ({
  editorRepository: {
    findByMusicProjectId: (musicProjectId: string) =>
      [...mockEditorProjects.values()].find((p) => p.musicProjectId === musicProjectId) ?? null,
    getProject: (id: string) => mockEditorProjects.get(id) ?? null,
    listAssets: () => [],
    createProject: (input: {
      name: string
      aspect: '9:16' | '16:9' | '1:1'
      musicProjectId?: string | null
      musicTrackId?: string | null
      channelId?: string | null
    }) => {
      const id = `ed-${mockEditorProjects.size + 1}`
      const project: EditorProject = {
        id,
        name: input.name,
        timeline: { version: 1, aspect: input.aspect, fps: 30, tracks: [], clips: [] },
        musicProjectId: input.musicProjectId ?? null,
        musicTrackId: input.musicTrackId ?? null,
        channelId: input.channelId ?? null,
        duration: 0,
        lastExportPath: null,
        createdAt: '2026-11-18T00:00:00.000Z',
        updatedAt: '2026-11-18T00:00:00.000Z',
      }
      mockEditorProjects.set(id, project)
      return project
    },
    updateProject: (
      id: string,
      patch: { name?: string; channelId?: string | null; musicTrackId?: string | null },
    ) => {
      const current = mockEditorProjects.get(id)
      if (!current) return null
      const next: EditorProject = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.channelId !== undefined ? { channelId: patch.channelId } : {}),
        ...(patch.musicTrackId !== undefined ? { musicTrackId: patch.musicTrackId } : {}),
      }
      mockEditorProjects.set(id, next)
      return next
    },
  },
}))

import {
  ensureEditorProjectForMusicProject,
  sceneNumberFromComfyPath,
  syncEditorProjectWithMusicProject,
} from './editorComfyIngest'

function makeMusicProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Tu És a Minha Porção',
    description: '',
    songLyrics: '',
    projectType: 'music',
    channelId: null,
    workspace: 'music',
    channelName: null,
    projectFolderPath: null,
    folderExists: false,
    createdAt: '2026-11-18T00:00:00.000Z',
    updatedAt: '2026-11-18T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  mockProjects.clear()
  mockEditorProjects.clear()
})

describe('sceneNumberFromComfyPath', () => {
  it('lê o número do arquivo', () => {
    expect(sceneNumberFromComfyPath('C:/lipsync/3.mp4', 9)).toBe(3)
  })

  it('usa o fallback quando o nome não é só número', () => {
    expect(sceneNumberFromComfyPath('C:/lipsync/cena.mp4', 4)).toBe(4)
  })

  it('usa o fallback para nomes com sufixo de colisão (4 1.mp4)', () => {
    expect(sceneNumberFromComfyPath('C:/lipsync/4 1.mp4', 4)).toBe(4)
  })
})

describe('syncEditorProjectWithMusicProject', () => {
  it('cria o projeto no Editor em 16:9 ao vincular a um canal/cantor', async () => {
    mockProjects.set('p1', makeMusicProject({ channelId: 'ch-1' }))
    const editor = await syncEditorProjectWithMusicProject('p1')
    expect(editor).not.toBeNull()
    expect(editor?.name).toBe('Tu És a Minha Porção')
    expect(editor?.channelId).toBe('ch-1')
    expect(editor?.musicProjectId).toBe('p1')
    expect(editor?.timeline.aspect).toBe('16:9')
  })

  it('atualiza o canal/cantor no Editor quando o vínculo muda no projeto de Lipsync', async () => {
    mockProjects.set('p1', makeMusicProject({ channelId: 'ch-1' }))
    const created = ensureEditorProjectForMusicProject('p1')
    expect(created?.channelId).toBe('ch-1')

    mockProjects.set('p1', makeMusicProject({ channelId: 'ch-2' }))
    const moved = await syncEditorProjectWithMusicProject('p1')
    expect(moved?.id).toBe(created?.id)
    expect(moved?.channelId).toBe('ch-2')

    mockProjects.set('p1', makeMusicProject({ channelId: null }))
    const unlinked = await syncEditorProjectWithMusicProject('p1')
    expect(unlinked?.id).toBe(created?.id)
    expect(unlinked?.channelId).toBeNull()
  })

  it('não cria projeto no Editor quando o projeto não tem cantor e ainda não existia no Editor', async () => {
    mockProjects.set('p1', makeMusicProject({ channelId: null }))
    const editor = await syncEditorProjectWithMusicProject('p1')
    expect(editor).toBeNull()
    expect(mockEditorProjects.size).toBe(0)
  })
})
