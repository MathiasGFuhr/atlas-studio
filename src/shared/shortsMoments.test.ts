import { describe, expect, it } from 'vitest'
import { analyzeMusic } from './musicAnalysis'
import { shortsCandidatePoolSize } from './shortsDiversity'
import { buildLocalShortsCandidates, snapClipToCues } from './shortsMoments'

function fakeAnalysis(durationSec: number) {
  const sampleRate = 22050
  const samples = new Float32Array(Math.round(sampleRate * durationSec))
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate
    samples[i] = t > 40 && t < 75 ? Math.sin(i / 20) * 0.9 : Math.sin(i / 80) * 0.08
  }
  return analyzeMusic(samples, sampleRate)
}

describe('shortsMoments', () => {
  it('gera candidatos de Música dentro da faixa de duração e com início em onset', () => {
    const analysis = fakeAnalysis(120)
    const clips = buildLocalShortsCandidates({
      profile: 'music',
      duration: 120,
      requestedDuration: 30,
      durationMode: 'approximate',
      count: 3,
      analysis,
      scenes: [{ time: 42 }],
    })
    expect(clips.length).toBeGreaterThan(0)
    expect(clips.length).toBeLessThanOrEqual(shortsCandidatePoolSize(3))
    expect(new Set(clips.map((clip) => `${clip.start.toFixed(1)}-${clip.end.toFixed(1)}`)).size).toBe(clips.length)
    for (const clip of clips) {
      expect(clip.end - clip.start).toBeGreaterThanOrEqual(25)
      expect(clip.end - clip.start).toBeLessThanOrEqual(36)
      expect(clip.start).toBeGreaterThanOrEqual(0)
      expect(clip.end).toBeLessThanOrEqual(120)
      expect(clip.id).toMatch(/^c\d+$/)
    }
  })

  it('para História prioriza blocos de fala contínuos', () => {
    const clips = buildLocalShortsCandidates({
      profile: 'history',
      duration: 90,
      requestedDuration: 20,
      durationMode: 'approximate',
      count: 3,
      analysis: {
        duration: 90,
        sampleRate: 22050,
        energy: [],
        frameDuration: 0.046,
        silence: [{ start: 28, end: 32 }],
        onsets: [0, 32],
      },
      cues: [{ start: 0, end: 28, text: 'gancho' }],
    })
    expect(clips[0]?.start).toBeLessThan(1)
    expect(clips.some((clip) => clip.reason.toLowerCase().includes('falado') || clip.source === 'speech')).toBe(true)
  })

  it('sem transcrição ainda gera trechos distintos em vídeo de 5 minutos', () => {
    const clips = buildLocalShortsCandidates({
      profile: 'history',
      duration: 310,
      requestedDuration: 30,
      durationMode: 'approximate',
      count: 5,
      analysis: {
        duration: 310,
        sampleRate: 16000,
        energy: [],
        frameDuration: 0.046,
        silence: [],
        onsets: [],
      },
      scenes: [{ time: 18 }, { time: 95 }, { time: 180 }, { time: 250 }],
      cues: [],
    })
    expect(clips.length).toBeGreaterThanOrEqual(5)
    const keys = new Set(clips.map((clip) => `${clip.start.toFixed(1)}-${clip.end.toFixed(1)}`))
    expect(keys.size).toBe(clips.length)
    const starts = clips.map((clip) => clip.start).sort((a, b) => a - b)
    expect(starts[starts.length - 1] - starts[0]).toBeGreaterThan(60)
    expect(clips.every((clip) => Math.abs(clip.start - 276) < 0.2 && Math.abs(clip.end - 310) < 0.2)).toBe(false)
  })

  it('ajusta início e fim para não cortar no meio da fala', () => {
    const snapped = snapClipToCues(
      10.2,
      24.1,
      [
        { start: 9.8, end: 12, text: 'Começou assim' },
        { start: 12, end: 24.4, text: 'e terminou aqui.' },
      ],
      60,
      'history',
    )
    expect(snapped.start).toBe(9.8)
    expect(snapped.end).toBe(24.4)
  })

  it('não estica o corte até o fim do vídeo por causa de uma cue enorme', () => {
    const snapped = snapClipToCues(20, 52, [{ start: 0, end: 310, text: 'bloco único' }], 310, 'history')
    expect(snapped.start).toBeCloseTo(20, 1)
    expect(snapped.end).toBeCloseTo(52, 1)
  })
})
