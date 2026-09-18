import { describe, expect, it } from 'vitest'
import { fallbackScoreFromSignals, normalizeScoreDimensions, scoreFromDimensions } from './clipScoring'

describe('score de Shorts', () => {
  it('não aceita objeto vazio como dimensões', () => {
    expect(normalizeScoreDimensions({})).toBeNull()
    expect(normalizeScoreDimensions(null)).toBeNull()
  })

  it('calcula score ponderado, sem aleatoriedade', () => {
    const dims = normalizeScoreDimensions({
      openingStrength: 90,
      standaloneClarity: 80,
      payoff: 85,
      visualValue: 70,
      audioValue: 95,
      retentionPotential: 88,
      conclusion: 75,
      durationFit: 80,
      originality: 60,
    })
    expect(dims).not.toBeNull()
    const a = scoreFromDimensions(dims!)
    const b = scoreFromDimensions(dims!)
    expect(a).toBe(b)
    expect(a).toBeGreaterThan(75)
    expect(scoreFromDimensions(dims!, { overlapPenalty: 0.5 })).toBeLessThan(a)
  })

  it('fallback local usa sinais, nunca Math.random', () => {
    expect(
      fallbackScoreFromSignals({ visualValue: 80, audioValue: 90, speechValue: 40, durationFit: 70 }),
    ).toBe(
      fallbackScoreFromSignals({ visualValue: 80, audioValue: 90, speechValue: 40, durationFit: 70 }),
    )
  })
})
