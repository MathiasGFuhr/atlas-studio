import type { BrowserWindow } from 'electron'
import type {
  AdjustScriptRequest,
  CodexStatus,
  GenerateScriptRequest,
  GenerationProgressEvent,
  GenerationResult,
  GenerationStep,
} from '../../../shared/types'
import { GENERATION_STEPS } from '../../../shared/types'

export interface CodexServiceOptions {
  workspaceRoot: string
  getWindow: () => BrowserWindow | null
  runtimeManager?: import('./CodexRuntimeManager').CodexRuntimeManager
}

export interface ICodexService {
  connect(): Promise<CodexStatus>
  disconnect(): Promise<void>
  healthCheck(): Promise<CodexStatus>
  createThread(): Promise<string>
  generateScript(request: GenerateScriptRequest): Promise<GenerationResult>
  adjustScript(request: AdjustScriptRequest): Promise<GenerationResult>
  runChatPrompt(
    prompt: string,
    signal?: AbortSignal,
    extraReadableDirs?: string[],
    run?: { model?: string | null; effort?: string | null },
  ): Promise<string>
  cancel(): Promise<void>
  getStatus(): CodexStatus
}

export function createInitialSteps(): GenerationStep[] {
  return GENERATION_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: index === 0 ? 'running' : 'pending',
  }))
}

export function markStep(
  steps: GenerationStep[],
  id: GenerationStep['id'],
  state: GenerationStep['state'],
): GenerationStep[] {
  const index = steps.findIndex((s) => s.id === id)
  return steps.map((step, i) => {
    if (step.id === id) return { ...step, state }
    if (state === 'done' && i === index + 1 && step.state === 'pending') {
      return { ...step, state: 'running' }
    }
    return step
  })
}

export function markStepsCancelled(steps: GenerationStep[]): GenerationStep[] {
  return steps.map((step) =>
    step.state === 'running' || step.state === 'pending'
      ? { ...step, state: step.state === 'running' ? 'cancelled' : 'pending' }
      : step,
  )
}

export function inferPhaseFromCodexOutput(chunk: string): GenerationStep['id'] | null {
  const text = chunk.toLowerCase()
  if (/audit|quality gate|originalit|unicidade/.test(text)) return 'audit'
  if (/revis|edit|reten|anti-template|quality/.test(text)) return 'review'
  if (/escrev|draft|roteiro|writing|opening|abertura|kapitel|abschnitt/.test(text)) return 'writing'
  if (/structur|arquitet|beat map|outline|estrutura/.test(text)) return 'structure'
  if (/research|pesquis|source|fonte|dossi|web search|busca/.test(text)) return 'research'
  return null
}

export type ProgressEmitter = (event: GenerationProgressEvent) => void
