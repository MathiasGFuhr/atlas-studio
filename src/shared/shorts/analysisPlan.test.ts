import { describe, expect, it } from 'vitest'
import type { AgentCapabilities } from '../agents/capabilities'
import { buildShortsAnalysisPlan, resolveAnalysisRuntime } from './analysisPlan'

const videoCaps: AgentCapabilities = {
  supportsText: true,
  supportsImages: true,
  supportsAudio: true,
  supportsVideo: true,
  mediaDelivery: 'workspace-files',
  evidence: ['add-dir'],
}

const textCaps: AgentCapabilities = {
  supportsText: true,
  supportsImages: false,
  supportsAudio: false,
  supportsVideo: false,
  mediaDelivery: 'none',
  evidence: ['text'],
}

describe('plano de análise de Shorts', () => {
  it('não recomenda audiovisual sem consentimento de envio', () => {
    const plan = buildShortsAnalysisPlan({
      currentModel: 'gemini-flash',
      currentCapabilities: videoCaps,
      models: [{ id: 'gemini-flash', label: 'Flash' }],
      modelCapabilities: new Map([['gemini-flash', videoCaps]]),
      allowExternalVideoAnalysis: false,
    })
    expect(plan.recommendedMode).toBe('frames_audio_transcript')
    expect(plan.needsVideoConsent).toBe(true)
    expect(plan.canSendVideo).toBe(false)
    expect(plan.needsModelChoice).toBe(false)
  })

  it('pede escolha explícita se o modelo atual não vê vídeo e outro vê', () => {
    const plan = buildShortsAnalysisPlan({
      currentModel: 'text-only',
      currentCapabilities: textCaps,
      models: [
        { id: 'text-only', label: 'Texto' },
        { id: 'gemini-pro', label: 'Pro' },
      ],
      modelCapabilities: new Map([
        ['text-only', textCaps],
        ['gemini-pro', videoCaps],
      ]),
      allowExternalVideoAnalysis: true,
    })
    expect(plan.needsModelChoice).toBe(true)
    expect(plan.compatibleVideoModels.map((item) => item.id)).toEqual(['gemini-pro'])
    expect(plan.recommendedMode).toBe('frames_audio_transcript')
  })

  it('não troca de modelo silenciosamente', () => {
    const plan = buildShortsAnalysisPlan({
      currentModel: 'text-only',
      currentCapabilities: textCaps,
      models: [
        { id: 'text-only', label: 'Texto' },
        { id: 'gemini-pro', label: 'Pro' },
      ],
      modelCapabilities: new Map([
        ['text-only', textCaps],
        ['gemini-pro', videoCaps],
      ]),
      allowExternalVideoAnalysis: true,
    })
    const current = resolveAnalysisRuntime({ plan, modelDecision: 'current', allowExternalVideoAnalysis: true })
    expect(current.model).toBe('text-only')
    expect(current.sendVideo).toBe(false)
    expect(current.watchedVideoClaimAllowed).toBe(false)

    const switched = resolveAnalysisRuntime({
      plan,
      modelDecision: 'use_compatible',
      allowExternalVideoAnalysis: true,
    })
    expect(switched.model).toBe('gemini-pro')
    expect(switched.sendVideo).toBe(true)
    expect(switched.mode).toBe('audiovisual')
  })
})
