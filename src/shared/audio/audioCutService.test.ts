import { describe, expect, it } from 'vitest'
import {
  addManualSelection,
  makeSegment,
  moveMarker,
  removeCut,
  splitAtPlayhead,
  updateCutBounds,
  getCutMarkers,
} from './audioCutService'

function track(duration = 310) {
  return { duration, cuts: [makeSegment(0, duration, 1, 'manual', { id: 'a', label: 'Faixa' })] }
}

describe('audioCutService', () => {
  it('corta no playhead e gera dois segmentos consecutivos', () => {
    const { cuts, duration } = track()
    const next = splitAtPlayhead(cuts, 92.42, duration)
    expect(next).toHaveLength(2)
    expect(next[0].start).toBe(0)
    expect(next[0].end).toBe(92.42)
    expect(next[1].start).toBe(92.42)
    expect(next[1].end).toBe(310)
  })

  it('permite múltiplos cortes consecutivos', () => {
    const duration = 310
    let cuts = splitAtPlayhead([], 92, duration)
    cuts = splitAtPlayhead(cuts, 168, duration)
    cuts = splitAtPlayhead(cuts, 245, duration)
    expect(cuts.map((cut) => [cut.start, cut.end])).toEqual([
      [0, 92],
      [92, 168],
      [168, 245],
      [245, 310],
    ])
  })

  it('move marcador sem cruzar o vizinho', () => {
    const duration = 100
    const cuts = splitAtPlayhead(splitAtPlayhead([], 20, duration), 60, duration)
    const marker = getCutMarkers(cuts, duration).find((item) => item.time === 20)!
    const moved = moveMarker(cuts, marker, 90, duration)
    const times = getCutMarkers(moved, duration).map((item) => item.time)
    expect(Math.max(...times.filter((time) => time < 60))).toBeLessThan(60)
    expect(moved[0].end).toBeLessThan(moved[1].end)
    expect(moved[0].end).toBe(moved[1].start)
  })

  it('remove um segmento selecionado', () => {
    const cuts = splitAtPlayhead([], 40, 100)
    expect(removeCut(cuts, cuts[0].id)).toHaveLength(1)
  })

  it('altera start e end com precisão decimal', () => {
    const cuts = [makeSegment(10, 20, 1, 'manual', { id: 'x' })]
    const next = updateCutBounds(cuts, 'x', 10.327, 18.5, 40)
    expect(next[0].start).toBe(10.327)
    expect(next[0].end).toBe(18.5)
  })

  it('novo corte manual nasce no playhead', () => {
    const next = addManualSelection([], 12.5, 40)
    expect(next.cuts[0].start).toBe(12.5)
    expect(next.cuts[0].end).toBeGreaterThan(12.5)
    expect(next.selectedId).toBe(next.cuts[0].id)
  })
})
