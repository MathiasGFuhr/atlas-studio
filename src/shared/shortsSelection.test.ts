import { describe, expect, it } from 'vitest'
import { finalizeShortsSelection } from './shortsSelection'
import type { ShortsRankedWindow } from './shortsDiversity'

function clip(id: string, start: number, end: number, score = 80): ShortsRankedWindow {
  return { id, start, end, score, reason: `motivo ${id}`, hook: `hook ${id}`, source: 'speech' }
}

describe('finalizeShortsSelection', () => {
  it('em vídeo de ~5 min com 5 pedidos, mantém timestamps distintos', () => {
    const video = 310
    const ranked = [
      clip('c1', 20, 52, 90),
      clip('c2', 78, 111, 88),
      clip('c3', 140, 172, 85),
      clip('c4', 200, 234, 82),
      clip('c5', 260, 294, 80),
    ]
    const result = finalizeShortsSelection({
      ranked,
      fallback: ranked,
      clipCount: 5,
      videoDuration: video,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'history',
      cues: [{ start: 0, end: 310, text: '' }],
    })
    expect(result.clips).toHaveLength(5)
    const keys = result.clips.map((item) => `${item.start.toFixed(1)}-${item.end.toFixed(1)}`)
    expect(new Set(keys).size).toBe(5)
    expect(result.clips.every((item) => Math.abs(item.end - 310) < 0.2)).toBe(false)
    expect(result.clips.every((item) => Math.abs(item.start - 276) < 0.2)).toBe(false)
    for (const item of result.clips) {
      expect(item.end - item.start).toBeGreaterThanOrEqual(25)
      expect(item.end - item.start).toBeLessThanOrEqual(36)
    }
  })

  it('se a IA repetir o mesmo corte, completa com fallbacks distintos', () => {
    const collapsed = [0, 1, 2, 3, 4].map((index) =>
      clip(`ai${index}`, 276, 310, 95 - index),
    )
    const fallback = [
      clip('c1', 20, 52, 70),
      clip('c2', 78, 111, 68),
      clip('c3', 140, 172, 66),
      clip('c4', 200, 234, 64),
      clip('c5', 276, 310, 62),
    ]
    const result = finalizeShortsSelection({
      ranked: collapsed,
      fallback,
      clipCount: 5,
      videoDuration: 310,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'music',
      cues: [{ start: 0, end: 310, text: '' }],
    })
    expect(result.clips.length).toBeGreaterThanOrEqual(4)
    const keys = new Set(result.clips.map((item) => `${Math.round(item.start)}-${Math.round(item.end)}`))
    expect(keys.size).toBe(result.clips.length)
  })

  it('no modo exato cada Short tem a duração pedida e start diferente', () => {
    const result = finalizeShortsSelection({
      ranked: [
        clip('c1', 20, 80, 90),
        clip('c2', 70, 140, 88),
        clip('c3', 135, 200, 84),
      ],
      fallback: [],
      clipCount: 3,
      videoDuration: 240,
      requestedDuration: 30,
      durationMode: 'exact',
      profile: 'history',
    })
    expect(result.clips).toHaveLength(3)
    for (const item of result.clips) {
      expect(item.end - item.start).toBeCloseTo(30, 1)
    }
    const starts = result.clips.map((item) => item.start)
    expect(new Set(starts.map((value) => value.toFixed(1))).size).toBe(3)
  })

  it('snap de cue vazia cobrindo o vídeo não colapsa todos os starts', () => {
    const result = finalizeShortsSelection({
      ranked: [clip('c1', 12, 44, 80), clip('c2', 90, 122, 78)],
      fallback: [clip('c1', 12, 44, 80), clip('c2', 90, 122, 78)],
      clipCount: 5,
      videoDuration: 200,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'history',
      cues: [{ start: 0, end: 200, text: '' }],
    })
    expect(result.clips).toHaveLength(2)
    expect(result.insufficient).toBe(true)
    expect(result.note).toContain('Encontramos 2 trechos distintos')
    expect(result.clips[0].start).toBeLessThan(20)
    expect(result.clips[1].start).toBeGreaterThan(60)
  })

  it('vídeo 56.6s / 30s / 2 Shorts devolve 2 trechos, inclusive no caso real 5–34 e 21.8–51.8', () => {
    const result = finalizeShortsSelection({
      ranked: [clip('ai1', 5, 34, 94), clip('ai2', 21.8, 51.8, 93)],
      fallback: [
        clip('c1', 0, 30, 70),
        clip('c2', 5, 35, 68),
        clip('c3', 21.8, 51.8, 66),
        clip('c4', 26.6, 56.6, 64),
      ],
      clipCount: 2,
      videoDuration: 56.6,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'history',
    })
    expect(result.clips).toHaveLength(2)
    expect(result.insufficient).toBe(false)
    expect(result.note).toBe('')
    const starts = result.clips.map((item) => item.start).sort((a, b) => a - b)
    expect(starts[1] - starts[0]).toBeGreaterThan(10)
  })

  it('vídeo 56.6s / 30s / 5 Shorts devolve o máximo distinto, não 5 duplicatas', () => {
    const fallback = [
      clip('c1', 0, 30, 70),
      clip('c2', 5, 35, 69),
      clip('c3', 10, 40, 68),
      clip('c4', 15, 45, 67),
      clip('c5', 20, 50, 66),
      clip('c6', 26.6, 56.6, 65),
    ]
    const result = finalizeShortsSelection({
      ranked: [clip('ai1', 5, 34, 94), clip('ai2', 21.8, 51.8, 93)],
      fallback,
      clipCount: 5,
      videoDuration: 56.6,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'history',
    })
    expect(result.clips.length).toBeGreaterThanOrEqual(2)
    expect(result.clips.length).toBeLessThan(5)
    expect(result.insufficient).toBe(true)
    expect(result.note).toContain('trechos distintos com qualidade suficiente para este vídeo.')
    expect(new Set(result.clips.map((item) => `${item.start.toFixed(1)}-${item.end.toFixed(1)}`)).size).toBe(
      result.clips.length,
    )
  })
})
