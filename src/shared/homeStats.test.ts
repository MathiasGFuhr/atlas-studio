import { describe, expect, it } from 'vitest'
import type { MusicTrack } from './musicAnalysis'
import type { Project, ScriptRecord } from './types'
import { buildHomeModuleStats } from './homeStats'

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

describe('métricas da Home', () => {
  it('ignora roteiros e faixas depois que o projeto some', () => {
    const stats = buildHomeModuleStats({
      projects: [],
      scripts: [
        script({ id: 's1', title: 'Órfão', status: 'em_revisao', projectId: null }),
        script({ id: 's2', title: 'Antigo', status: 'rascunho', projectId: 'apagado' }),
      ],
      tracks: [
        track({
          id: 'm1',
          name: 'Trilha',
          projectId: null,
          cuts: [
            { id: 'c1', start: 0, end: 1, label: 'A', source: 'manual' },
            { id: 'c2', start: 1, end: 2, label: 'B', source: 'manual' },
          ],
        }),
      ],
    })

    expect(stats).toMatchObject({
      historyCount: 0,
      musicCount: 0,
      draftCount: 0,
      reviewCount: 0,
      trackCount: 0,
    })
    expect(stats.scripts).toEqual([])
    expect(stats.tracks).toEqual([])
  })

  it('conta só o conteúdo ainda ligado aos projetos atuais', () => {
    const stats = buildHomeModuleStats({
      projects: [
        project({ id: 'h1', name: 'Roma' }),
        project({ id: 'm1', name: 'EP', projectType: 'music' }),
      ],
      scripts: [
        script({ id: 's1', title: 'Cap. 1', status: 'rascunho', projectId: 'h1' }),
        script({ id: 's2', title: 'Cap. 2', status: 'em_revisao', projectId: 'h1' }),
        script({ id: 's3', title: 'Órfão', status: 'em_revisao', projectId: null }),
      ],
      tracks: [
        track({
          id: 't1',
          name: 'Faixa 1',
          projectId: 'm1',
          cuts: [{ id: 'c1', start: 0, end: 1, label: 'A', source: 'manual' }],
        }),
        track({ id: 't2', name: 'Órfã', projectId: null }),
      ],
    })

    expect(stats).toMatchObject({
      historyCount: 1,
      musicCount: 1,
      draftCount: 1,
      reviewCount: 1,
      trackCount: 1,
    })
    expect(stats.scripts.map((item) => item.id)).toEqual(['s1', 's2'])
    expect(stats.tracks.map((item) => item.id)).toEqual(['t1'])
  })
})
