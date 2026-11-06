import { describe, expect, it } from 'vitest'
import { analyzeMusic } from '../musicAnalysis'
import {
  autoCutByVocals,
  irregularTargetLength,
  normalizeVocalCutBounds,
  vocalRegionsFromCaptions,
} from './vocalAutoCut'

function tone(sampleRate: number, seconds: number, freq: number, amp: number) {
  const length = Math.floor(sampleRate * seconds)
  const samples = new Float32Array(length)
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp
  }
  return samples
}

function noise(sampleRate: number, seconds: number, amp: number) {
  const length = Math.floor(sampleRate * seconds)
  const samples = new Float32Array(length)
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = (Math.random() * 2 - 1) * amp
  }
  return samples
}

function concat(parts: Float32Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe('vocalAutoCut', () => {
  it('normaliza min/max e impede máximo menor que o mínimo', () => {
    expect(normalizeVocalCutBounds(20, 10)).toEqual({ minSec: 20, maxSec: 21 })
    expect(normalizeVocalCutBounds(15, 25).minSec).toBe(15)
    expect(normalizeVocalCutBounds(15, 25).maxSec).toBe(25)
  })

  it('varia o alvo de duração — nunca a mesma sequência exata', () => {
    const lengths = [0, 1, 2, 3, 4].map((index) => irregularTargetLength(index, 15, 25))
    expect(new Set(lengths).size).toBeGreaterThan(1)
    for (const length of lengths) {
      expect(length).toBeGreaterThanOrEqual(15)
      expect(length).toBeLessThanOrEqual(25)
    }
  })

  it('usa legendas para separar canto e instrumental', () => {
    const regions = vocalRegionsFromCaptions(
      [
        { start: 2, end: 8, text: 'eu canto aqui' },
        { start: 8.3, end: 12, text: 'mais um verso' },
        { start: 20, end: 28, text: 'refrão' },
      ],
      40,
    )
    expect(regions.some((region) => region.kind === 'vocal')).toBe(true)
    expect(regions.some((region) => region.kind === 'instrumental')).toBe(true)
    expect(regions[0].start).toBe(0)
    expect(regions[regions.length - 1].end).toBe(40)
  })

  it('gera cortes dentro do min/max a partir das legendas', () => {
    const sampleRate = 22050
    const samples = concat([
      tone(sampleRate, 5, 110, 0.2),
      tone(sampleRate, 18, 220, 0.35),
      tone(sampleRate, 8, 110, 0.15),
      tone(sampleRate, 22, 330, 0.4),
      tone(sampleRate, 6, 90, 0.12),
    ])
    const analysis = analyzeMusic(samples, sampleRate)
    const captions = [
      { start: 5, end: 12, text: 'verso um' },
      { start: 12.2, end: 22, text: 'verso dois' },
      { start: 31, end: 48, text: 'refrão longo' },
    ]
    const cuts = autoCutByVocals(analysis, {
      minSec: 10,
      maxSec: 18,
      captions,
      samples,
    })

    expect(cuts.length).toBeGreaterThanOrEqual(3)
    for (const cut of cuts) {
      const duration = cut.end - cut.start
      expect(duration).toBeGreaterThan(0.5)
      expect(duration).toBeLessThanOrEqual(18.05)
      expect(cut.label).toMatch(/^Trecho \d+ · (Canto|Instrumental)$/)
    }
    // Não deve ser uma sequência de durações idênticas.
    const durations = cuts.map((cut) => Number((cut.end - cut.start).toFixed(1)))
    expect(new Set(durations).size).toBeGreaterThan(1)
  })

  it('funciona sem legendas usando heurística de áudio', () => {
    const sampleRate = 22050
    // Instrumental mais "limpo" + trecho ruidoso (proxy de vocal) + instrumental.
    const samples = concat([
      tone(sampleRate, 12, 110, 0.25),
      noise(sampleRate, 16, 0.22),
      tone(sampleRate, 14, 165, 0.2),
    ])
    const analysis = analyzeMusic(samples, sampleRate)
    const cuts = autoCutByVocals(analysis, {
      minSec: 8,
      maxSec: 16,
      captions: [],
      samples,
    })
    expect(cuts.length).toBeGreaterThanOrEqual(2)
    expect(cuts[0].start).toBe(0)
    expect(cuts[cuts.length - 1].end).toBeLessThanOrEqual(analysis.duration + 0.05)
  })
})
