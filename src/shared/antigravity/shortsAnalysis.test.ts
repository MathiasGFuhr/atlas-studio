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
      localCandidates: [{ id: 'c1', start: 40, end: 70, score: 80, reason: 'energia', source: 'energy' }],
      hasTranscript: true,
      editorial: {
        language: 'de',
        contentLanguage: 'de',
        languageName: 'German',
        languageSource: 'channel',
        languageConfidence: 0.9,
        sourceName: 'show.mp4',
      },
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
      localCandidates: [{ id: 'c1', start: 10, end: 40, score: 70, reason: 'fala', source: 'speech' }],
      hasTranscript: true,
    })

    expect(music).toContain('Perfil editorial: MÚSICA')
    expect(music).toContain('contentLanguage: de')
    expect(music).toContain('Generate all viewer-facing metadata in German.')
    expect(music).toContain('hook: 1 frase no idioma do conteúdo (German / de)')
    expect(music).not.toContain('Responda só no JSON do schema, em português do Brasil.')
    expect(music).toContain('durationMode: approximate')
    expect(music).toContain('requestedClipDuration: 30.0')
    expect(music).toContain('refrão')
    expect(music).toContain('integridade musical')
    expect(music).toContain('c1: 40.0–70.0s')
    expect(music).toContain('candidateId')
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

  it('rankeia por candidateId e limita ajuste fino a poucos segundos', () => {
    const result = normalizeShortsAnalysis(
      {
        selected: [
          { candidateId: 'c2', score: 94, reason: 'solo', start: 78, end: 130 },
          { candidateId: 'c2', score: 90, reason: 'duplicado' },
          { candidateId: 'c1', score: 88, reason: 'refrão', start: 18, end: 54 },
        ],
      },
      {
        duration: 310,
        clipCount: 5,
        requestedDuration: 30,
        durationMode: 'approximate',
        localCandidates: [
          { id: 'c1', start: 20, end: 52, score: 80, reason: 'energia', source: 'energy' },
          { id: 'c2', start: 80, end: 112, score: 78, reason: 'onset', source: 'onset' },
          { id: 'c3', start: 200, end: 232, score: 70, reason: 'cena', source: 'scene' },
        ],
      },
    )
    expect(result.clips.map((clip) => clip.id)).toEqual(['c2', 'c1'])
    expect(result.clips[0].start).toBeGreaterThanOrEqual(77)
    expect(result.clips[0].start).toBeLessThanOrEqual(83)
    expect(result.clips[0].end).toBeLessThanOrEqual(115)
  })

  it('descarta timestamps inventados longe dos candidatos e usa o pool local', () => {
    const result = normalizeShortsAnalysis(
      {
        clips: [
          { start: 276, end: 310, score: 99, reason: 'final 1' },
          { start: 276, end: 310, score: 98, reason: 'final 2' },
          { start: 276, end: 310, score: 97, reason: 'final 3' },
        ],
      },
      {
        duration: 310,
        clipCount: 3,
        requestedDuration: 30,
        durationMode: 'approximate',
        localCandidates: [
          { id: 'c1', start: 20, end: 52, score: 80, reason: 'gancho', source: 'speech' },
          { id: 'c2', start: 90, end: 122, score: 76, reason: 'revelação', source: 'scene' },
          { id: 'c3', start: 180, end: 212, score: 72, reason: 'conclusão', source: 'structure' },
        ],
      },
    )
    expect(result.clips.length).toBeGreaterThanOrEqual(1)
    expect(result.clips.every((clip) => Math.abs(clip.start - 276) < 0.2)).toBe(false)
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
