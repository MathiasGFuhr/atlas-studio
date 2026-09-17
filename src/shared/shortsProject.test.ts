import { describe, expect, it } from 'vitest'
import type { ShortsClip, ShortsJob } from './shorts'
import {
  exportedShortsCount,
  matchesShortsProjectSearch,
  shortsProjectNameFromFileName,
  shortsProjectStatusLabel,
  shortsProjectDeleteMessage,
  sortShortsProjects,
} from './shortsProject'

function clip(partial: Partial<ShortsClip> = {}): ShortsClip {
  return {
    id: 'c1',
    index: 1,
    start: 0,
    end: 15,
    score: 80,
    reason: 'gancho',
    hook: 'hook',
    title: 'Título',
    description: 'Desc',
    hashtags: [],
    accepted: false,
    exportedPath: null,
    focusStrategy: 'center',
    ...partial,
  }
}

function job(partial: Partial<ShortsJob> = {}): ShortsJob {
  return {
    id: 'j1',
    projectId: null,
    name: 'GEGEN DEN TAKT',
    sourcePath: 'C:\\videos\\show.mp4',
    sourceName: 'show.mp4',
    profile: 'music',
    clipCount: 5,
    requestedDuration: 30,
    durationMode: 'approximate',
    aspectMode: 'center_9_16',
    captionsEnabled: true,
    probe: null,
    clips: [],
    transcript: [],
    transcriptSource: 'none',
    contentLanguage: '',
    languageSource: 'fallback',
    languageConfidence: 0,
    languageOverride: null,
    detectedLanguage: null,
    transcriptLanguage: null,
    analysisNotes: null,
    errorMessage: null,
    status: 'draft',
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T12:00:00.000Z',
    sourceExists: true,
    thumbnailUrl: null,
    ...partial,
  }
}

describe('shorts project helpers', () => {
  it('usa o nome do arquivo sem extensão como nome padrão', () => {
    expect(shortsProjectNameFromFileName('Als „GEGEN DEN TAKT“ begann.mp4')).toBe(
      'Als „GEGEN DEN TAKT“ begann',
    )
    expect(shortsProjectNameFromFileName('C:\\\\videos\\\\show.mov')).toBe('show')
    expect(shortsProjectNameFromFileName('')).toBe('Novo Shorts')
  })

  it('busca por nome, arquivo original e perfil', () => {
    const project = job({ name: 'GEGEN DEN TAKT', sourceName: 'Johann Falk.mp4', profile: 'music' })
    expect(matchesShortsProjectSearch(project, 'gegen')).toBe(true)
    expect(matchesShortsProjectSearch(project, 'falk')).toBe(true)
    expect(matchesShortsProjectSearch(project, 'música')).toBe(true)
    expect(matchesShortsProjectSearch(project, 'historia')).toBe(false)
  })

  it('conta exports e descreve o status simples', () => {
    expect(shortsProjectStatusLabel(job({ status: 'draft', clips: [] }))).toBe('Análise pendente')
    expect(
      shortsProjectStatusLabel(
        job({
          status: 'ready',
          clips: [clip(), clip({ id: 'c2', exportedPath: 'C:\\\\out\\\\a.mp4', accepted: true })],
        }),
      ),
    ).toBe('2 cortes · 1 exportado')
    expect(
      shortsProjectStatusLabel(
        job({
          status: 'ready',
          clips: [clip({ exportedPath: 'C:\\\\out\\\\a.mp4', accepted: true })],
        }),
      ),
    ).toBe('Pronto')
    expect(exportedShortsCount([clip({ exportedPath: 'a.mp4' }), clip({ id: 'c2' })])).toBe(1)
    expect(shortsProjectDeleteMessage(0)).toBe(
      'O projeto será removido do Atlas. O vídeo original não será apagado.',
    )
    expect(shortsProjectDeleteMessage(1)).toContain('Os Shorts já exportados também serão mantidos no computador.')
  })

  it('ordena por edição recente e por nome', () => {
    const older = job({ id: 'a', name: 'Beta', updatedAt: '2026-09-01T00:00:00.000Z' })
    const newer = job({ id: 'b', name: 'Alfa', updatedAt: '2026-09-17T00:00:00.000Z' })
    expect(sortShortsProjects([older, newer], 'updated_desc').map((item) => item.id)).toEqual(['b', 'a'])
    expect(sortShortsProjects([older, newer], 'updated_asc').map((item) => item.id)).toEqual(['a', 'b'])
    expect(sortShortsProjects([older, newer], 'name').map((item) => item.name)).toEqual(['Alfa', 'Beta'])
  })
})
