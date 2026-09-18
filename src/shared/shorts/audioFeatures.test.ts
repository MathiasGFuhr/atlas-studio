import { describe, expect, it } from 'vitest'
import { analyzeMusic } from '../musicAnalysis'
import { enrichAudioAnalysis } from './audioFeatures'

function tone(sampleRate: number, seconds: number, freq: number, amp: number) {
  const samples = new Float32Array(Math.round(sampleRate * seconds))
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp
  }
  return samples
}

function concat(parts: Float32Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Float32Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe('features de áudio', () => {
  it('detecta build-up, drop e entrada vocal além de RMS', () => {
    const sampleRate = 16000
    const quiet = tone(sampleRate, 3, 80, 0.04)
    const build = tone(sampleRate, 3, 120, 0.18)
    const drop = tone(sampleRate, 4, 900, 0.85)
    const samples = concat([quiet, build, drop])
    const base = analyzeMusic(samples, sampleRate)
    const enriched = enrichAudioAnalysis(base, samples)
    const types = new Set(enriched.events.map((event) => event.type))
    expect(types.has('build_up') || types.has('drop') || types.has('peak')).toBe(true)
    expect(types.has('vocal_entry') || types.has('onset')).toBe(true)
    expect(enriched.structure.length).toBeGreaterThan(0)
    expect(enriched.zeroCrossing.length).toBe(base.energy.length)
  })

  it('marca outro quando o final fica mais baixo', () => {
    const sampleRate = 16000
    const loud = tone(sampleRate, 8, 220, 0.7)
    const fade = tone(sampleRate, 4, 110, 0.05)
    const samples = concat([loud, fade])
    const enriched = enrichAudioAnalysis(analyzeMusic(samples, sampleRate), samples)
    expect(enriched.events.some((event) => event.type === 'outro')).toBe(true)
  })
})
