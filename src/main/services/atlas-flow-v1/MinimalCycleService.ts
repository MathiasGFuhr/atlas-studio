/**
 * Orquestração do primeiro ciclo real (projeto + 2 refs + 1 imagem).
 * Estado: NÃO VALIDADO até asset commitado na linha correta.
 *
 * Este módulo só registra o contrato de etapas. A execução no Flow
 * depende de observações reais da extensão (sem seletores inventados).
 */

export type MinimalCycleStage =
  | 'idle'
  | 'session_verified'
  | 'project_ensured'
  | 'references_ready'
  | 'prompt_prepared'
  | 'submitted'
  | 'result_observed'
  | 'asset_committed'
  | 'failed'

export type MinimalCycleStatus = {
  stage: MinimalCycleStage
  realFlowValidated: false
  atlasProjectId: string | null
  promptId: string | null
  attemptId: string | null
  lastError: string | null
  notes: string[]
}

const status: MinimalCycleStatus = {
  stage: 'idle',
  realFlowValidated: false,
  atlasProjectId: null,
  promptId: null,
  attemptId: null,
  lastError: null,
  notes: [
    'Conexão health/hello não implica geração validada.',
    'Sem lote até 1 imagem real com 2 referências na linha correta.',
  ],
}

export function getMinimalCycleStatus(): MinimalCycleStatus {
  return { ...status, notes: [...status.notes] }
}

export function markCycleStage(
  stage: MinimalCycleStage,
  patch: Partial<Omit<MinimalCycleStatus, 'stage' | 'realFlowValidated'>> = {},
): MinimalCycleStatus {
  status.stage = stage
  if (patch.atlasProjectId !== undefined) status.atlasProjectId = patch.atlasProjectId
  if (patch.promptId !== undefined) status.promptId = patch.promptId
  if (patch.attemptId !== undefined) status.attemptId = patch.attemptId
  if (patch.lastError !== undefined) status.lastError = patch.lastError
  if (patch.notes) status.notes = patch.notes
  status.realFlowValidated = false
  return getMinimalCycleStatus()
}
