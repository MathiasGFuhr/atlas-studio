import { describe, expect, it } from 'vitest'
import {
  adaptiveOverlapPolicy,
  formatInsufficientShortsNote,
  isNearDuplicate,
  overlapRatio,
  sanitizeProposedShortsNotes,
  selectDiverseClips,
  shortsCandidatePoolSize,
  temporalIoU,
  temporalOverlapSeconds,
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
      requestedDuration: 30,
    })
    const ids = result.selected.map((item) => item.id)
    expect(ids).toContain('A')
    expect(ids).not.toContain('B')
    expect(ids).toContain('C')
    expect(ids).toContain('D')
    expect(overlapRatio({ start: 10, end: 40 }, { start: 12, end: 42 })).toBeGreaterThan(0.8)
    expect(temporalIoU({ start: 10, end: 40 }, { start: 12, end: 42 })).toBeGreaterThan(0.7)
    expect(windowsConflict({ start: 10, end: 40 }, { start: 12, end: 42 })).toBe(true)
  })

  it('se só existem 2 bons candidatos e o usuário pede 5, devolve os 2 disponíveis', () => {
    const result = selectDiverseClips({
      candidates: [clip('A', 10, 40, 88), clip('B', 80, 110, 84)],
      count: 5,
      videoDuration: 180,
      requestedDuration: 30,
    })
    expect(result.selected).toHaveLength(2)
    expect(formatInsufficientShortsNote(result.selected.length, 5)).toContain('Encontramos 2')
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
      requestedDuration: 30,
    })
    expect(result.selected.length).toBe(1)
    expect(new Set(result.selected.map((item) => `${item.start}-${item.end}`)).size).toBe(1)
  })

  it('gera um pool interno maior que a cota pedida', () => {
    expect(shortsCandidatePoolSize(5)).toBeGreaterThanOrEqual(15)
    expect(shortsCandidatePoolSize(5)).toBeLessThanOrEqual(30)
    expect(shortsCandidatePoolSize(3)).toBeGreaterThanOrEqual(15)
    expect(shortsCandidatePoolSize(3)).toBeLessThanOrEqual(30)
    expect(shortsCandidatePoolSize(2)).toBeGreaterThanOrEqual(15)
  })

  it('em vídeo de 56.6s / 30s / 2 Shorts mantém os dois candidatos reais', () => {
    const policy = adaptiveOverlapPolicy({
      videoDuration: 56.6,
      requestedDuration: 30,
      requestedCount: 2,
    })
    expect(policy.shortVideo).toBe(true)
    expect(policy.maxOverlapSeconds).toBeGreaterThan(12.2)
    expect(windowsConflict({ start: 5, end: 34 }, { start: 21.8, end: 51.8 }, policy)).toBe(false)

    const result = selectDiverseClips({
      candidates: [clip('C1', 5, 34, 94), clip('C2', 21.8, 51.8, 93)],
      count: 2,
      videoDuration: 56.6,
      requestedDuration: 30,
    })
    expect(result.selected).toHaveLength(2)
    expect(result.selected.map((item) => item.id).sort()).toEqual(['C1', 'C2'])
    expect(formatInsufficientShortsNote(2, 2)).toBe('')
  })

  it('aceita o par complementar 00–30 e 26.6–56.6', () => {
    const policy = adaptiveOverlapPolicy({ videoDuration: 56.6, requestedDuration: 30 })
    expect(temporalOverlapSeconds({ start: 0, end: 30 }, { start: 26.6, end: 56.6 })).toBeCloseTo(3.4, 1)
    expect(windowsConflict({ start: 0, end: 30 }, { start: 26.6, end: 56.6 }, policy)).toBe(false)
    const result = selectDiverseClips({
      candidates: [clip('start', 0, 30, 80), clip('end', 26.6, 56.6, 78)],
      count: 2,
      videoDuration: 56.6,
      requestedDuration: 30,
    })
    expect(result.selected).toHaveLength(2)
  })

  it('com alternativa distinta, elimina o deslocamento curto 05–35 vs 07–37', () => {
    expect(isNearDuplicate({ start: 5, end: 35 }, { start: 7, end: 37 })).toBe(true)
    const result = selectDiverseClips({
      candidates: [clip('A', 5, 35, 90), clip('B', 7, 37, 88), clip('C', 26.6, 56.6, 80)],
      count: 2,
      videoDuration: 56.6,
      requestedDuration: 30,
    })
    expect(result.selected).toHaveLength(2)
    expect(result.selected.map((item) => item.id)).toEqual(expect.arrayContaining(['A', 'C']))
    expect(result.selected.map((item) => item.id)).not.toContain('B')
  })

  it('se só restam 05–35 e 07–37 e a cota é 2, mantém os dois em vez de desistir', () => {
    const result = selectDiverseClips({
      candidates: [clip('A', 5, 35, 90), clip('B', 7, 37, 88)],
      count: 2,
      videoDuration: 56.6,
      requestedDuration: 30,
    })
    expect(result.selected).toHaveLength(2)
    expect(new Set(result.selected.map((item) => `${item.start}-${item.end}`)).size).toBe(2)
  })

  it('faz backfill: se C2 conflita com C1, testa C3', () => {
    const result = selectDiverseClips({
      candidates: [
        clip('C1', 5, 35, 99),
        clip('C2', 20, 50, 97),
        clip('C3', 26, 56, 70),
      ],
      count: 2,
      videoDuration: 56.6,
      requestedDuration: 30,
    })
    const ids = result.selected.map((item) => item.id)
    expect(ids).toContain('C1')
    expect(ids).not.toContain('C2')
    expect(ids).toContain('C3')
    expect(result.selected).toHaveLength(2)
  })

  it('se pede 5 em vídeo de 56.6s / 30s, preenche a cota com starts diferentes', () => {
    const result = selectDiverseClips({
      candidates: [
        clip('A', 0, 30, 90),
        clip('B', 5, 35, 89),
        clip('C', 10, 40, 88),
        clip('D', 15, 45, 87),
        clip('E', 20, 50, 86),
        clip('F', 21.8, 51.8, 85),
        clip('G', 26.6, 56.6, 84),
      ],
      count: 5,
      videoDuration: 56.6,
      requestedDuration: 30,
    })
    expect(result.selected).toHaveLength(5)
    expect(new Set(result.selected.map((item) => `${item.start}-${item.end}`)).size).toBe(5)
  })

  it('no pool mantém a janela complementar para backfill', () => {
    const result = selectDiverseClips({
      candidates: [
        clip('peak', 5, 34, 94),
        clip('shift', 21.8, 51.8, 93),
        clip('end', 26.6, 56.6, 80),
      ],
      count: 15,
      videoDuration: 56.6,
      requestedDuration: 30,
      role: 'pool',
    })
    const ids = result.selected.map((item) => item.id)
    expect(ids).toContain('peak')
    expect(ids).toContain('end')
  })

  it('descarta nota da IA que contradiz a contagem local', () => {
    expect(
      sanitizeProposedShortsNotes('Foram selecionados os 2 melhores trechos distintos.', {
        found: 1,
        requested: 2,
        note: 'Encontramos 1 trecho possível para este vídeo.',
      }),
    ).toBeNull()
  })

  it('em 56.6s / 3 / 45s escolhe 3 janelas temporalmente diferentes', () => {
    const result = selectDiverseClips({
      candidates: [
        clip('A', 0, 45, 90),
        clip('B', 6, 51, 88),
        clip('C', 11.6, 56.6, 86),
      ],
      count: 3,
      videoDuration: 56.6,
      requestedDuration: 45,
    })
    expect(result.selected).toHaveLength(3)
    expect(new Set(result.selected.map((item) => item.start.toFixed(1))).size).toBe(3)
    expect(new Set(result.selected.map((item) => `${item.start}-${item.end}`)).size).toBe(3)
  })
})
