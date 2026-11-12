import { describe, expect, it } from 'vitest'
import {
  alignAudioSegment,
  buildEnergyEnvelope,
  bestEnvelopeMatch,
  scaleNumberedSegmentsToMusic,
} from './audioAlign'

function patterned(
  sampleRate: number,
  pattern: Array<{ seconds: number; amp: number; freq?: number }>,
): Int16Array {
  const parts: Int16Array[] = []
  for (const step of pattern) {
    const samples = new Int16Array(Math.round(sampleRate * step.seconds))
    const freq = step.freq ?? 220
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * step.amp)
    }
    parts.push(samples)
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Int16Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe('audioAlign', () => {
  const sampleRate = 4000

  it('monta envelope com picos por segundo', () => {
    const samples = patterned(sampleRate, [{ seconds: 2, amp: 12000 }])
    const envelope = buildEnergyEnvelope(samples, sampleRate, 20)
    expect(envelope.length).toBeGreaterThanOrEqual(40)
    expect(envelope.length).toBeLessThanOrEqual(41)
  })

  it('acha o trecho pelo mesmo áudio dentro da música', () => {
    const intro = patterned(sampleRate, [
      { seconds: 0.4, amp: 2000 },
      { seconds: 0.4, amp: 14000 },
      { seconds: 0.4, amp: 1000 },
    ])
    const target = patterned(sampleRate, [
      { seconds: 0.25, amp: 16000, freq: 440 },
      { seconds: 0.15, amp: 0 },
      { seconds: 0.25, amp: 9000, freq: 330 },
      { seconds: 0.15, amp: 0 },
    ])
    const outro = patterned(sampleRate, [
      { seconds: 0.5, amp: 5000 },
      { seconds: 0.5, amp: 11000 },
      { seconds: 0.5, amp: 3000 },
    ])
    const merged = new Int16Array(intro.length + target.length + outro.length)
    merged.set(intro, 0)
    merged.set(target, intro.length)
    merged.set(outro, intro.length + target.length)
    const result = alignAudioSegment({
      haystack: merged,
      needle: target,
      sampleRate,
      peaksPerSecond: 20,
      minScore: 0.4,
      minMargin: 0.02,
      minPcmScore: 0.4,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.offset).toBeGreaterThan(1.1)
    expect(result.offset).toBeLessThan(1.35)
  })

  it('falha quando o trecho não existe na música', () => {
    const song = patterned(sampleRate, [
      { seconds: 1, amp: 8000, freq: 200 },
      { seconds: 1, amp: 2000, freq: 200 },
      { seconds: 1, amp: 12000, freq: 200 },
    ])
    const foreign = patterned(sampleRate, [
      { seconds: 0.2, amp: 16000, freq: 900 },
      { seconds: 0.2, amp: 0 },
      { seconds: 0.2, amp: 16000, freq: 900 },
      { seconds: 0.2, amp: 0 },
    ])
    const result = alignAudioSegment({
      haystack: song,
      needle: foreign,
      sampleRate,
      peaksPerSecond: 20,
      minScore: 0.85,
      minMargin: 0.08,
      minPcmScore: 0.85,
    })
    expect(result.ok).toBe(false)
  })

  it('bestEnvelopeMatch devolve o índice certo e a 2ª pontuação', () => {
    const haystack = new Float64Array([0, 0.1, 0.2, 0.8, 0.9, 0.7, 0.1, 0])
    const needle = new Float64Array([0.8, 0.9, 0.7])
    const match = bestEnvelopeMatch(haystack, needle)
    expect(match?.index).toBe(3)
    expect(match?.score ?? 0).toBeGreaterThan(0.95)
    expect(match?.secondScore ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('scaleNumberedSegmentsToMusic remove o padding acumulado', () => {
    const scaled = scaleNumberedSegmentsToMusic({
      musicDuration: 10,
      segments: [
        { scene: 1, path: '1.mp3', duration: 4.2 },
        { scene: 2, path: '2.mp3', duration: 3.2 },
        { scene: 3, path: '3.mp3', duration: 3.2 },
      ],
    })
    expect(scaled).toHaveLength(3)
    expect(scaled[0].start).toBe(0)
    expect(scaled[0].duration + scaled[1].duration + scaled[2].duration).toBeCloseTo(10, 5)
    expect(scaled[2].start + scaled[2].duration).toBeCloseTo(10, 5)
    expect(scaled[0].duration).toBeLessThan(4.2)
  })
})
