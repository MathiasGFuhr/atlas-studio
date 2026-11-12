/**
 * Conexão automática ComfyUI ↔ RunPod (aba LipSync).
 * Estados de UI + resultados do orquestrador compartilhado.
 */

import type { ComfyConfig, ComfyConnectionInfo } from './comfy'
import type { ComfyGpuRecoveryPreview } from './comfyGpuRecovery'
import type {
  RunpodPodLifecycleState,
  RunpodPodSummary,
  RunpodStartPreview,
} from './runpod'

export type ComfyConnectUiPhase =
  | 'idle'
  | 'gpu_off'
  | 'awaiting_cost'
  | 'starting'
  | 'waiting_pod'
  | 'waiting_comfy'
  | 'checking_ltx'
  | 'ready'
  /** Simulação concluída — não é conexão real; não libera geração. */
  | 'simulated'
  | 'error'
  | 'gpu_unavailable'

export const COMFY_CONNECT_SIMULATED_MESSAGE =
  'Simulação concluída — nenhuma GPU iniciada'

export type ComfyConnectGpuAlternative = {
  podId: string
  podName: string
  gpuType: string | null
  status: string
  costPerHr: number | null
  dataCenterId: string | null
  note: string
}

export type ComfyConnectCatalogHint = {
  gpuId: string
  displayName: string
  memoryGb: number | null
  note: string
}

export type ComfyConnectPrepareResult =
  | {
      status: 'ready'
      phase: 'ready'
      baseUrl: string
      podId: string
      podName: string
      connection: ComfyConnectionInfo
      modelsOk: boolean
      modelsMessage: string
      message: string
      dryRun: boolean
      lifecycle: RunpodPodLifecycleState | null
      config: ComfyConfig
    }
  | {
      status: 'needs_confirmation'
      phase: 'awaiting_cost'
      preview: RunpodStartPreview
      dryRunDefault: boolean
      alternatives: ComfyConnectGpuAlternative[]
      message: string
      config: ComfyConfig
    }
  | {
      status: 'in_flight'
      phase: ComfyConnectUiPhase
      lifecycle: RunpodPodLifecycleState
      message: string
      config: ComfyConfig
    }
  | {
      status: 'gpu_unavailable'
      phase: 'gpu_unavailable'
      preferredPod: RunpodPodSummary | null
      alternatives: ComfyConnectGpuAlternative[]
      catalogHints: ComfyConnectCatalogHint[]
      message: string
      config: ComfyConfig
      /** Quando preenchido, a UI pode oferecer recuperação autorizada. */
      recovery: ComfyGpuRecoveryPreview | null
    }
  | {
      status: 'needs_recovery'
      phase: 'awaiting_cost'
      recovery: ComfyGpuRecoveryPreview
      dryRunDefault: boolean
      message: string
      config: ComfyConfig
    }
  | {
      status: 'error'
      phase: 'error'
      message: string
      diagnostics: string[]
      config: ComfyConfig
    }

export type ComfyConnectConfirmRequest = {
  podId: string
  confirmedCostPerHr: number | null
  dryRun: boolean
  acceptBilling: boolean
}

export type ComfyConnectConfirmResult = {
  /**
   * `simulated` = dry-run ok; nunca libera geração real.
   * `needs_recovery` = start falhou por GPU do host; UI deve mostrar opções de recovery.
   */
  status: 'ready' | 'simulated' | 'error' | 'needs_recovery'
  phase: ComfyConnectUiPhase
  baseUrl: string | null
  podId: string
  podName: string
  connection: ComfyConnectionInfo | null
  modelsOk: boolean
  modelsMessage: string
  message: string
  lifecycle: RunpodPodLifecycleState
  config: ComfyConfig
  diagnostics: string[]
  dryRun: boolean
  recovery?: ComfyGpuRecoveryPreview | null
}

export type ComfyConnectRefreshResult = {
  phase: ComfyConnectUiPhase
  baseUrl: string
  connection: ComfyConnectionInfo | null
  message: string
  config: ComfyConfig
  urlChanged: boolean
}

export const COMFY_CONNECT_PHASE_LABEL: Record<ComfyConnectUiPhase, string> = {
  idle: 'Aguardando',
  gpu_off: 'GPU desligada — Conectar ComfyUI',
  awaiting_cost: 'Aguardando autorização de custo',
  starting: 'Iniciando Pod',
  waiting_pod: 'Iniciando Pod',
  waiting_comfy: 'Aguardando ComfyUI',
  checking_ltx: 'Verificando LTX-2.3',
  ready: 'ComfyUI conectado — pronto para gerar',
  simulated: COMFY_CONNECT_SIMULATED_MESSAGE,
  error: 'Erro na conexão',
  gpu_unavailable: 'GPU indisponível',
}

export function mapLifecyclePhaseToConnectUi(
  phase: RunpodPodLifecycleState['phase'] | null | undefined,
  dryRun?: boolean,
): ComfyConnectUiPhase {
  switch (phase) {
    case 'confirming':
      return 'awaiting_cost'
    case 'starting':
      return 'starting'
    case 'waiting_pod':
      return 'waiting_pod'
    case 'waiting_comfy':
      return 'waiting_comfy'
    case 'checking_nodes':
      return 'checking_ltx'
    case 'ready':
      return dryRun ? 'simulated' : 'ready'
    case 'stopping':
      return 'starting'
    case 'stopped':
      return 'gpu_off'
    case 'error':
      return 'error'
    case 'idle':
    default:
      return 'idle'
  }
}

export function isComfyConnectBusy(phase: ComfyConnectUiPhase): boolean {
  return (
    phase === 'starting' ||
    phase === 'waiting_pod' ||
    phase === 'waiting_comfy' ||
    phase === 'checking_ltx'
  )
}

/** Só `ready` (conexão real verificada) libera envio LipSync. */
export function isComfyConnectReadyForGeneration(phase: ComfyConnectUiPhase): boolean {
  return phase === 'ready'
}
