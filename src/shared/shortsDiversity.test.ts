import { describe, expect, it } from 'vitest'
import {
  formatInsufficientShortsNote,
  overlapRatio,
  selectDiverseClips,
  shortsCandidatePoolSize,
  temporalIoU,
  windowsConflict,
  type ShortsRankedWindow,
} from './shortsDiversity'

function clip(
  id: string,
  start: number,
  end: number,
  score = 80,
): ShortsRankedWindow {
  return { id, start, end, score, reason: id, hook: '' }
}

describe('shortsDiversity', () => {
  it('trata A e B quase iguais como conflito e prefere a alternativa C/D', () => {
    const result = selectDiverseClips({
      candidates: [
        clip('A', 10, 40, 90),
        clip('B', 12, 42, 89),
        clip('C', 60, 90, 80),
        clip('D', 120, 150, 78),
      ],
      count: 3,
      videoDuration: 180,
    })
    const ids = result.selected.map((item) => item.id)
    expect(ids).toContain('A')
    expect(ids).not.toContain('B')
    expect(ids).toContain('C')
    expect(ids).toContain('D')
    expect(result.discarded.some((item) => item.id === 'B' && item.reason.includes('overlap'))).toBe(true)
    expect(overlapRatio({ start: 10, end: 40 }, { start: 12, end: 42 })).toBeGreaterThan(0.8)
    expect(temporalIoU({ start: 10, end: 40 }, { start: 12, end: 42 })).toBeGreaterThan(0.7)
    expect(windowsConflict({ start: 10, end: 40 }, { start: 12, end: 42 })).toBe(true)
  })

  it('se só existem 2 bons candidatos e o usuário pede 5, devolve 2', () => {
    const result = selectDiverseClips({
      candidates: [clip('A', 10, 40, 88), clip('B', 80, 110, 84)],
      count: 5,
      videoDuration: 180,
    })
    expect(result.selected).toHaveLength(2)
    expect(formatInsufficientShortsNote(result.selected.length, 5)).toBe(
      'Encontramos 2 trechos realmente distintos com qualidade suficiente.',
    )
  })

  it('não duplica o mesmo timestamp para preencher a cota', () => {
    const result = selectDiverseClips({
      candidates: [
        clip('A', 276, 310, 95),
        clip('B', 276, 310, 94),
        clip('C', 276.1, 310, 93),
        clip('D', 276, 309.9, 92),
      ],
      count: 5,
      videoDuration: 310,
    })
    expect(result.selected.length).toBe(1)
    expect(new Set(result.selected.map((item) => `${item.start}-${item.end}`)).size).toBe(1)
  })

  it('gera um pool interno maior que a cota pedida', () => {
    expect(shortsCandidatePoolSize(5)).toBeGreaterThanOrEqual(12)
    expect(shortsCandidatePoolSize(5)).toBeLessThanOrEqual(20)
  })
})
