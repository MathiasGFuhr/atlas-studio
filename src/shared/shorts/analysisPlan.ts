import type { AgentCapabilities } from '../agents/capabilities'
import type { AgentModelInfo } from '../agents/types'
import type { ShortsAnalysisMode, ShortsModelDecision } from '../shorts'
import { SHORTS_ANALYSIS_MODE_LABEL, isShortsAnalysisMode } from '../shorts'

export type { ShortsAnalysisMode, ShortsModelDecision } from '../shorts'
export { SHORTS_ANALYSIS_MODE_LABEL, isShortsAnalysisMode }

export interface ShortsCompatibleModel {
  id: string
  label: string
}

export interface ShortsAnalysisPlan {
  provider: 'antigravity'
  currentModel: string | null
  currentCapabilities: AgentCapabilities
  compatibleVideoModels: ShortsCompatibleModel[]
  allowExternalVideoAnalysis: boolean
  recommendedMode: ShortsAnalysisMode
  needsVideoConsent: boolean
  needsModelChoice: boolean
  canSendVideo: boolean
}

export function buildShortsAnalysisPlan(input: {
  currentModel: string | null
  currentCapabilities: AgentCapabilities
  models: AgentModelInfo[]
  modelCapabilities: Map<string, AgentCapabilities>
  allowExternalVideoAnalysis: boolean
}): ShortsAnalysisPlan {
  const currentId = input.currentModel?.trim() || null
  const compatibleVideoModels = input.models
    .filter((model) => {
      if (currentId && model.id === currentId) return false
      return input.modelCapabilities.get(model.id)?.supportsVideo === true
    })
    .map((model) => ({ id: model.id, label: model.label || model.id }))

  const canWatch = input.currentCapabilities.supportsVideo
  const allow = Boolean(input.allowExternalVideoAnalysis)
  const recommendedMode: ShortsAnalysisMode = canWatch && allow ? 'audiovisual' : 'frames_audio_transcript'

  return {
    provider: 'antigravity',
    currentModel: currentId,
    currentCapabilities: input.currentCapabilities,
    compatibleVideoModels,
    allowExternalVideoAnalysis: allow,
    recommendedMode,
    needsVideoConsent: canWatch && !allow,
    needsModelChoice: !canWatch && compatibleVideoModels.length > 0,
    canSendVideo: canWatch && allow,
  }
}

export function resolveAnalysisRuntime(input: {
  plan: ShortsAnalysisPlan
  modelDecision?: ShortsModelDecision | null
  modelOverride?: string | null
  allowExternalVideoAnalysis?: boolean
}): {
  mode: ShortsAnalysisMode
  model: string | null
  sendVideo: boolean
  watchedVideoClaimAllowed: boolean
} {
  const allow = input.allowExternalVideoAnalysis ?? input.plan.allowExternalVideoAnalysis
  const decision = input.modelDecision ?? 'current'
  let model = input.plan.currentModel
  let supportsVideo = input.plan.currentCapabilities.supportsVideo

  if (decision === 'use_compatible') {
    const chosen =
      input.modelOverride?.trim() ||
      input.plan.compatibleVideoModels[0]?.id ||
      null
    if (chosen) {
      model = chosen
      supportsVideo = true
    }
  }

  if (decision === 'continue_frames') {
    supportsVideo = false
  }

  const sendVideo = Boolean(supportsVideo && allow && decision !== 'continue_frames')
  return {
    mode: sendVideo ? 'audiovisual' : 'frames_audio_transcript',
    model,
    sendVideo,
    watchedVideoClaimAllowed: sendVideo,
  }
}
