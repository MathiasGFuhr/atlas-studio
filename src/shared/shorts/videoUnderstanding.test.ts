import { describe, expect, it } from 'vitest'
import {
  normalizeProposedCandidates,
  normalizeVideoUnderstanding,
  understandingHasSignal,
} from './videoUnderstanding'

describe('compreensão global do vídeo', () => {
  it('normaliza o bloco VideoUnderstanding', () => {
    const value = normalizeVideoUnderstanding({
      language: 'de',
      contentType: 'live concert',
      structure: 'intro, verses, chorus, solo, finale',
      majorMoments: [{ time: 82, label: 'final chorus' }],
      visualHighlights: [{ time: 84, detail: 'crowd lights up' }],
      audioHighlights: [{ time: 83, detail: 'band hits the chorus' }],
      narrativeArc: 'build to the last chorus',
    })
    expect(value.language).toBe('de')
    expect(understandingHasSignal(value)).toBe(true)
    expect(value.majorMoments[0]?.label).toBe('final chorus')
  })

  it('descarta candidatos inválidos e preserva motivos visuais/sonoros', () => {
    const candidates = normalizeProposedCandidates(
      {
        candidates: [
          {
            start: 40,
            end: 72,
            type: 'chorus',
            reason: 'refrão com plateia',
            visualReason: 'luzes e público de pé',
            audioReason: 'entrada do refrão',
          },
          { start: 10, end: 10.2, type: 'skip', reason: 'curto demais' },
          { start: 400, end: 430, type: 'late', reason: 'fora' },
        ],
      },
      { duration: 180, maxCount: 8 },
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].visualReason).toContain('luzes')
    expect(candidates[0].audioReason).toContain('refrão')
  })
})
