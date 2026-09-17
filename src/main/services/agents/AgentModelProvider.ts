import type { AgentModelInfo, AgentProviderId, AgentReasoningEffort } from '../../../shared/agents/types'

export type CliResult = {
  code: number | null
  stdout: string
  stderr: string
}

export type CliRunner = (args: string[], timeoutMs: number) => Promise<CliResult>
export type RpcRunner = (method: string, params?: Record<string, unknown>) => Promise<unknown | null>

export interface AgentModelProvider {
  readonly id: AgentProviderId
  getStatus(): Promise<{ version: string | null; connected: boolean; account?: string | null }>
  getVersion(): Promise<string | null>
  getAuthFingerprint(): Promise<string>
  getCurrentModel(): Promise<string | null>
  listModels(): Promise<{
    models: AgentModelInfo[]
    source: 'app-server' | 'cli' | 'catalog' | 'config' | 'none'
    error?: string | null
    officialFallback?: string | null
    officialFallbackMessage?: string | null
  }>
  setDefaultModel(model: string): Promise<void>
  listReasoningEfforts(modelId?: string | null): Promise<AgentReasoningEffort[]>
  getCurrentReasoningEffort(): Promise<string | null>
  setReasoningEffort(effort: string): Promise<void>
}
