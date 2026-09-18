import { describe, expect, it } from 'vitest'
import {
  formatInsufficientShortsNote,
  pairDistinctness,
  previewSeekSeconds,
  selectDiverseClips,
  validateDistinctShorts,
  type ShortsRankedWindow,
} from './shortsDiversity'
import { finalizeShortsSelection } from './shortsSelection'

function clip(
  id: string,
  start: number,
  end: number,
  score = 80,
  extra: Partial<ShortsRankedWindow> = {},
): ShortsRankedWindow {
  return { id, start, end, score, reason: extra.reason ?? `motivo ${id}`, hook: extra.hook ?? '', ...extra }
}

describe('validateDistinctShorts', () => {
  it('1. requestedCount = 5 em vídeo curto devolve menos que 5 se não houver diversidade real', () => {
    const result = finalizeShortsSelection({
      ranked: [clip('a', 0, 30, 90), clip('b', 5, 35, 88), clip('c', 10, 40, 86)],
      fallback: [],
      clipCount: 5,
      videoDuration: 56.6,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'history',
    })
    expect(result.clips.length).toBeGreaterThan(0)
    expect(result.clips.length).toBeLessThan(5)
    expect(result.insufficient).toBe(true)
    expect(result.note).toMatch(/realmente distint/)
  })

  it('2. pool com overlap forte e mesmo core moment perde os semelhantes', () => {
    const result = validateDistinctShorts(
      [
        clip('A', 5, 50, 94, { reason: 'refrão principal' }),
        clip('B', 6, 51, 93, { reason: 'refrão principal' }),
        clip('C', 5, 56, 91, { reason: 'refrão principal' }),
        clip('D', 0, 45, 88, { reason: 'abertura da música' }),
      ],
      5,
      { videoDuration: 56.6, requestedDuration: 45 },
    )
    expect(result.selected.length).toBe(1)
    expect(result.selected[0].id).toBe('A')
    expect(result.discarded.some((item) => item.id === 'B' || item.reason.includes('núcleo') || item.reason.includes('core'))).toBe(
      true,
    )
  })

  it('3. há 5 regiões realmente diferentes e devolve 5', () => {
    const result = validateDistinctShorts(
      [
        clip('open', 8, 38, 90, { reason: 'abertura / apresentação' }),
        clip('build', 70, 100, 88, { reason: 'crescimento instrumental' }),
        clip('mid', 140, 170, 86, { reason: 'desenvolvimento / virada' }),
        clip('peak', 210, 240, 92, { reason: 'clímax e explosão da banda' }),
        clip('end', 270, 300, 84, { reason: 'encerramento apoteótico' }),
      ],
      5,
      { videoDuration: 310, requestedDuration: 30 },
    )
    expect(result.selected).toHaveLength(5)
    expect(new Set(result.selected.map((item) => item.id)).size).toBe(5)
  })

  it('4. previews muito parecidos reduzem coexistência', () => {
    const near = pairDistinctness(clip('A', 10, 40, 90), clip('B', 11, 41, 89), 180, 30)
    expect(Math.abs(previewSeekSeconds({ start: 10, end: 40 }) - previewSeekSeconds({ start: 11, end: 41 }))).toBeLessThan(2.25)
    expect(near.similarPreview).toBe(true)
    expect(near.tooSimilar).toBe(true)

    const result = selectDiverseClips({
      candidates: [clip('A', 10, 40, 90), clip('B', 11, 41, 89), clip('C', 90, 120, 80)],
      count: 3,
      videoDuration: 180,
      requestedDuration: 30,
    })
    expect(result.selected.map((item) => item.id)).toEqual(expect.arrayContaining(['A', 'C']))
    expect(result.selected.map((item) => item.id)).not.toContain('B')
  })

  it('5. títulos diferentes com os mesmos timestamps-base ainda são duplicados', () => {
    const result = validateDistinctShorts(
      [
        clip('A', 20, 50, 90, { title: 'A abertura que ninguém esperava', reason: 'gancho inicial' }),
        clip('B', 20, 50, 88, { title: 'O segredo revelado no começo', reason: 'outra copy' }),
        clip('C', 20.04, 50.02, 86, { title: 'Título totalmente novo', reason: 'terceira copy' }),
      ],
      5,
      { videoDuration: 180, requestedDuration: 30 },
    )
    expect(result.selected).toHaveLength(1)
    expect(formatInsufficientShortsNote(result.selected.length, 5)).toContain('Encontramos apenas 1')
  })
})
