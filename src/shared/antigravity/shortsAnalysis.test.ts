import { describe, expect, it } from 'vitest'
import { buildShortsAnalysisPrompt, normalizeShortsAnalysis } from './shortsAnalysis'

describe('shortsAnalysis', () => {
  it('usa critérios diferentes para Música e História', () => {
    const music = buildShortsAnalysisPrompt({
      profile: 'music',
      duration: 240,
      clipCount: 3,
      requestedDuration: 30,
      durationMode: 'approximate',
      fileName: 'show.mp4',
      transcript: [{ start: 40, end: 48, text: 'todo mundo canta o refrão' }],
      scenes: [{ time: 42 }],
      localCandidates: [{ start: 40, end: 70, score: 80, reason: 'energia', source: 'energy' }],
      hasTranscript: true,
    })
    const history = buildShortsAnalysisPrompt({
      profile: 'history',
      duration: 240,
      clipCount: 3,
      requestedDuration: 30,
      durationMode: 'approximate',
      fileName: 'roma.mp4',
      transcript: [{ start: 12, end: 20, text: 'o império começou a ruir' }],
      scenes: [{ time: 18 }],
      localCandidates: [{ start: 10, end: 40, score: 70, reason: 'fala', source: 'speech' }],
      hasTranscript: true,
    })

    expect(music).toContain('Perfil editorial: MÚSICA')
    expect(music).toContain('durationMode: approximate')
    expect(music).toContain('requestedClipDuration: 30.0')
    expect(music).toContain('refrão')
    expect(music).toContain('integridade musical')
    expect(music).not.toContain('virada narrativa')

    expect(history).toContain('Perfil editorial: HISTÓRIA')
    expect(history).toContain('gancho')
    expect(history).toContain('unidade narrativa')
    expect(history).not.toContain('clímax vocal')
  })

  it('no modo aproximado preserva um refrão um pouco maior que o pedido', () => {
    const result = normalizeShortsAnalysis(
      {
        clips: [
          { start: 42.4, end: 76.4, score: 91, reason: 'Refrão forte e reação da plateia', hook: 'O festival explode' },
        ],
      },
      { duration: 180, clipCount: 3, requestedDuration: 30, durationMode: 'approximate' },
    )
    expect(result.clips[0].end - result.clips[0].start).toBeCloseTo(34, 1)
  })

  it('no modo exato força a duração pedida', () => {
    const result = normalizeShortsAnalysis(
      {
        clips: [{ start: 10, end: 40, score: 80, reason: 'janela' }],
      },
      { duration: 180, clipCount: 1, requestedDuration: 20, durationMode: 'exact' },
    )
    expect(result.clips[0].end - result.clips[0].start).toBeCloseTo(20, 1)
  })

  it('ignora JSON inválido sem quebrar', () => {
    const result = normalizeShortsAnalysis({ clips: 'nope' } as unknown as Record<string, unknown>, {
      duration: 100,
      clipCount: 3,
      requestedDuration: 20,
      durationMode: 'approximate',
    })
    expect(result.clips).toEqual([])
  })
})
