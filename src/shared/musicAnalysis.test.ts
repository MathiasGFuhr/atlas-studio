import { describe, expect, it } from 'vitest'
import { analyzeMusic, autoCutMusic } from './musicAnalysis'

function tone(sampleRate: number, seconds: number, freq: number, amp: number) {
  const length = Math.floor(sampleRate * seconds)
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp
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

describe('musicAnalysis', () => {
  it('detecta silêncio e gera cortes automáticos nas partes com áudio', () => {
    const sampleRate = 22050
    const samples = concat([
      tone(sampleRate, 1, 0, 0),
      tone(sampleRate, 2.2, 220, 0.4),
      tone(sampleRate, 1.2, 0, 0),
      tone(sampleRate, 2.4, 440, 0.45),
      tone(sampleRate, 0.8, 0, 0),
    ])

    const analysis = analyzeMusic(samples, sampleRate)
    expect(analysis.silence.length).toBeGreaterThan(0)

    const cuts = autoCutMusic(analysis, 'completo')
    expect(cuts.length).toBeGreaterThanOrEqual(2)
    expect(cuts[0].start).toBeGreaterThanOrEqual(0.6)
    expect(cuts[0].end - cuts[0].start).toBeGreaterThan(1)
  })

  it('o gancho escolhe uma janela contínua', () => {
    const sampleRate = 22050
    const samples = concat([
      tone(sampleRate, 5, 110, 0.08),
      tone(sampleRate, 12, 330, 0.5),
      tone(sampleRate, 8, 110, 0.08),
    ])
    const analysis = analyzeMusic(samples, sampleRate)
    const [hook] = autoCutMusic(analysis, 'gancho15')
    expect(hook.end - hook.start).toBeLessThanOrEqual(15.05)
    expect(hook.start).toBeGreaterThan(1)
    expect(hook.start).toBeLessThan(8)
    expect(hook.end).toBeGreaterThan(12)
  })
})
