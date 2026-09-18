import { describe, expect, it } from 'vitest'
import { finalizeShortsSelection, validateAndFill } from './shortsSelection'
import type { ShortsRankedWindow } from './shortsDiversity'

function clip(id: string, start: number, end: number, score = 80): ShortsRankedWindow {
  return { id, start, end, score, reason: `motivo ${id}`, hook: `hook ${id}`, source: 'speech' }
}

function uniqueWindows(clips: Array<{ start: number; end: number }>) {
  return new Set(clips.map((item) => `${item.start.toFixed(1)}-${item.end.toFixed(1)}`))
}

describe('finalizeShortsSelection', () => {
  it('em vídeo de ~5 min com 5 pedidos, mantém timestamps distintos e baixa sobreposição', () => {
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
    expect(result.note).toBe('')
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
    expect(result.clips).toHaveLength(5)
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
    expect(result.clips).toHaveLength(5)
    expect(result.insufficient).toBe(false)
    expect(uniqueWindows(result.clips).size).toBe(5)
    expect(result.clips[0].start).toBeLessThan(20)
    expect(result.clips.some((item) => item.start > 60)).toBe(true)
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
    const starts = result.clips.map((item) => item.start).sort((a, b) => a - b)
    expect(starts[1] - starts[0]).toBeGreaterThan(10)
  })

  it('vídeo 56.6s / 3 / ~45s devolve 3 clips válidos e temporalmente diferentes', () => {
    const result = validateAndFill({
      ranked: [clip('ai1', 5, 50, 94)],
      fallback: [clip('c1', 0, 45, 70)],
      clipCount: 3,
      videoDuration: 56.6,
      requestedDuration: 45,
      durationMode: 'approximate',
      profile: 'history',
    })
    expect(result.clips).toHaveLength(3)
    expect(result.insufficient).toBe(false)
    expect(uniqueWindows(result.clips).size).toBe(3)
    expect(new Set(result.clips.map((item) => item.start.toFixed(1))).size).toBe(3)
    for (const item of result.clips) {
      expect(item.start).toBeGreaterThanOrEqual(0)
      expect(item.end).toBeLessThanOrEqual(56.6 + 0.04)
      expect(item.end).toBeGreaterThan(item.start)
      expect(item.end - item.start).toBeGreaterThanOrEqual(27)
    }
    expect(result.note).toContain('compartilham partes da apresentação')
    expect(result.diagnostics.slidingWindows).toBeGreaterThanOrEqual(3)
  })

  it('vídeo 56.6s / 3 / 45s exact devolve 3 clips de 45s com starts diferentes', () => {
    const result = validateAndFill({
      ranked: [clip('ai1', 0, 45, 90)],
      fallback: [],
      clipCount: 3,
      videoDuration: 56.6,
      requestedDuration: 45,
      durationMode: 'exact',
      profile: 'history',
    })
    expect(result.clips).toHaveLength(3)
    expect(result.insufficient).toBe(false)
    for (const item of result.clips) {
      expect(item.end - item.start).toBeCloseTo(45, 1)
      expect(item.end).toBeLessThanOrEqual(56.6 + 0.04)
    }
    expect(new Set(result.clips.map((item) => item.start.toFixed(1))).size).toBe(3)
    expect(uniqueWindows(result.clips).size).toBe(3)
  })

  it('vídeo 300s / 5 / 30s devolve 5 clips com baixa sobreposição', () => {
    const result = validateAndFill({
      ranked: [
        clip('c1', 10, 40, 90),
        clip('c2', 70, 100, 88),
        clip('c3', 130, 160, 85),
        clip('c4', 190, 220, 82),
        clip('c5', 250, 280, 80),
      ],
      fallback: [],
      clipCount: 5,
      videoDuration: 300,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'history',
    })
    expect(result.clips).toHaveLength(5)
    expect(uniqueWindows(result.clips).size).toBe(5)
    const sorted = [...result.clips].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i += 1) {
      const overlap = Math.max(0, Math.min(sorted[i - 1].end, sorted[i].end) - sorted[i].start)
      const shorter = Math.min(sorted[i - 1].end - sorted[i - 1].start, sorted[i].end - sorted[i].start)
      expect(overlap / shorter).toBeLessThanOrEqual(0.28)
    }
  })

  it('vídeo 12s / 3 / 30s não cria timestamps maiores que o vídeo', () => {
    const result = validateAndFill({
      ranked: [],
      fallback: [],
      clipCount: 3,
      videoDuration: 12,
      requestedDuration: 30,
      durationMode: 'approximate',
      profile: 'history',
    })
    expect(result.clips.length).toBeGreaterThanOrEqual(1)
    expect(result.clips.length).toBeLessThanOrEqual(1)
    for (const item of result.clips) {
      expect(item.start).toBeGreaterThanOrEqual(0)
      expect(item.end).toBeLessThanOrEqual(12.04)
      expect(item.end - item.start).toBeLessThanOrEqual(12.04)
    }
    expect(result.insufficient).toBe(true)
  })
})
