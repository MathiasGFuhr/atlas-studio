import { describe, expect, it, vi } from 'vitest'
import { adviseMusicCutsWithCodex } from './CodexAudioCutAdvisor'
import type { MusicAdviseRequest } from '../../../shared/audio/audioCutAdvisor'
import type { CodexService } from '../codex/CodexService'

vi.mock('../logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function request(): MusicAdviseRequest {
  return {
    duration: 100,
    silences: [{ start: 0, end: 1.2 }],
    energyChanges: [{ time: 20, delta: 0.2, kind: 'rise' }],
    transients: [20, 48],
    sectionCandidates: [{ time: 48, kind: 'peak', score: 0.8 }],
    candidates: [
      { id: 'C1', time: 20, score: 0.9, kind: 'split', reason: 'pause' },
      { id: 'C2', time: 48, score: 0.87, kind: 'split', reason: 'section' },
    ],
    requestedMode: 'estrutura',
    inputKind: 'analysis-summary',
  }
}

describe('CodexAudioCutAdvisor', () => {
  it('usa análise local quando o Codex está desconectado', async () => {
    const service = {
      getStatus: () => ({
        connected: false,
        authenticated: false,
      }),
      runChatPrompt: vi.fn(),
    } as unknown as CodexService
    const result = await adviseMusicCutsWithCodex(request(), service)
    expect(result.usedCodex).toBe(false)
    expect(result.cuts.length).toBeGreaterThan(0)
    expect(service.runChatPrompt).not.toHaveBeenCalled()
  })

  it('aceita só IDs de candidatos retornados pelo Codex', async () => {
    const service = {
      getStatus: () => ({
        connected: true,
        authenticated: true,
      }),
      runChatPrompt: vi.fn(async () =>
        JSON.stringify({
          cuts: [
            { id: 'C1', confidence: 0.91, reason: 'Natural transition after a short pause' },
            { time: 33.333, reason: 'invented' },
          ],
        }),
      ),
    } as unknown as CodexService
    const result = await adviseMusicCutsWithCodex(request(), service)
    expect(result.usedCodex).toBe(true)
    expect(result.selected.map((item) => item.id)).toEqual(['C1'])
    expect(result.inputKind).toBe('analysis-summary')
  })
})
