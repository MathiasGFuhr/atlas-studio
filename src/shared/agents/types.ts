export type AgentProviderId = 'codex' | 'antigravity'

export type AgentModelSource = 'app-server' | 'cli' | 'catalog' | 'config' | 'cache' | 'none'

export interface AgentModelInfo {
  id: string
  label: string
  description?: string
  reasoningEfforts?: AgentReasoningEffort[]
  /** Modalidades declaradas pelo catálogo do CLI, se existirem. */
  inputModalities?: Array<'text' | 'image' | 'audio' | 'video'>
}

export interface AgentReasoningEffort {
  id: string
  label: string
}

export interface AgentModelSnapshot {
  provider: AgentProviderId
  version: string | null
  models: AgentModelInfo[]
  currentModel: string | null
  currentReasoningEffort: string | null
  reasoningEfforts: AgentReasoningEffort[]
  supportsReasoningEffort: boolean
  configuredModelMissing: boolean
  officialFallback: string | null
  officialFallbackMessage: string | null
  error: string | null
  source: AgentModelSource
  discoveredAt: string
  fromCache: boolean
}

export interface AgentModelsBundle {
  codex: AgentModelSnapshot
  antigravity: AgentModelSnapshot
}

export interface AgentRunConfig {
  model: string | null
  effort: string | null
  usedModelOverride: boolean
  usedEffortOverride: boolean
}
