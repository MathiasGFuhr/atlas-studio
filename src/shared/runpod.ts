/**
 * Tipos compartilhados da integração RunPod.
 * Fase 1: leitura. Fase 2: start de Pod existente + prontidão Comfy/LTX.
 */

import type { ComfyConnectionInfo } from './comfy'
import type { LtxPodCompatibility, ComfyNodeReadiness } from './runpodLtxCompat'

/** Status de ciclo de vida do pod na REST API v2. */
export type RunpodPodStatus =
  | 'PROVISIONING'
  | 'STARTING'
  | 'RUNNING'
  | 'EXITED'
  | 'ERROR'
  | 'TERMINATED'
  | string

export type RunpodPodSummary = {
  id: string
  name: string
  status: RunpodPodStatus
  gpuType: string | null
  /** Memória reportada no bloco gpu do pod (pode ser RAM de sistema — ver compat). */
  gpuMemoryGb: number | null
  dataCenterId: string | null
  /** Portas configuradas no pod, ex.: "8188/http". */
  ports: string[]
  /** Custo horário de compute em USD (mesmo parado; cobrança real depende do status). */
  costPerHr: number | null
  cloud: string | null
  hasComfyPort: boolean
  /** URL proxy do ComfyUI se a porta 8188 estiver configurada. */
  comfyProxyUrl: string | null
  /** Ações permitidas pela API v2 no status atual (start/stop/…). */
  actions: string[]
  locked: boolean
  image: string | null
  /** Network volumes montados (quando a API devolve mounts). */
  networkMounts: Array<{ volumeId: string; path: string }>
  /** Preenchido no refresh da Fase 2. */
  ltxCompat?: LtxPodCompatibility
}

export type RunpodGpuCatalogEntry = {
  id: string
  name: string
  memoryGb: number | null
  securePrice: number | null
  communityPrice: number | null
  availability: string | null
}

export type RunpodNetworkVolumeSummary = {
  id: string
  name: string
  sizeGb: number | null
  dataCenterId: string | null
}

export type RunpodTemplateSummary = {
  id: string
  name: string
  image: string | null
  serverless: boolean
}

/**
 * Planejamento futuro do modo automático (Fases 2–5).
 * Persistido só quando o usuário habilitar o gerenciador; padrão desligado.
 */
export type RunpodInfraPlan = {
  /** Feature flag — nunca liga GPU sozinho enquanto false. */
  autoInfraEnabled: boolean
  preferredPodId: string | null
  /** Até 3 tipos de GPU aprovados (Fase 4). */
  gpuWhitelist: string[]
  maxUsdPerHour: number | null
  minVramGb: number | null
  preferredCloud: 'SECURE' | 'COMMUNITY' | null
  preferredDataCenterId: string | null
  networkVolumeId: string | null
  templateId: string | null
  /** Desligamento automático após lotes (Fase 5) — só planejamento. */
  autoShutdownWhenIdle: boolean
}

export const DEFAULT_RUNPOD_INFRA_PLAN: RunpodInfraPlan = {
  autoInfraEnabled: false,
  preferredPodId: null,
  gpuWhitelist: [],
  maxUsdPerHour: null,
  minVramGb: null,
  preferredCloud: null,
  preferredDataCenterId: null,
  networkVolumeId: null,
  templateId: null,
  autoShutdownWhenIdle: false,
}

export function normalizeRunpodInfraPlan(
  input: Partial<RunpodInfraPlan> | null | undefined,
): RunpodInfraPlan {
  const whitelist = Array.isArray(input?.gpuWhitelist)
    ? input!.gpuWhitelist.map((id) => String(id).trim()).filter(Boolean).slice(0, 3)
    : []
  const maxUsd = Number(input?.maxUsdPerHour)
  const minVram = Number(input?.minVramGb)
  return {
    autoInfraEnabled: Boolean(input?.autoInfraEnabled),
    preferredPodId: input?.preferredPodId?.trim() || null,
    gpuWhitelist: whitelist,
    maxUsdPerHour: Number.isFinite(maxUsd) && maxUsd > 0 ? maxUsd : null,
    minVramGb: Number.isFinite(minVram) && minVram > 0 ? minVram : null,
    preferredCloud:
      input?.preferredCloud === 'SECURE' || input?.preferredCloud === 'COMMUNITY'
        ? input.preferredCloud
        : null,
    preferredDataCenterId: input?.preferredDataCenterId?.trim() || null,
    networkVolumeId: input?.networkVolumeId?.trim() || null,
    templateId: input?.templateId?.trim() || null,
    autoShutdownWhenIdle: Boolean(input?.autoShutdownWhenIdle),
  }
}

export type RunpodInfraStatus = {
  fetchedAt: string
  apiKeyPresent: boolean
  apiKeyValid: boolean | null
  error: string | null
  autoInfraEnabled: boolean
  /** Preferência do usuário para start (Fase 2). */
  preferredPodId: string | null
  /** true = Start Pod simula sem POST (sem cobrança). */
  dryRunStarts: boolean
  /** URL atual salva nas configurações. */
  configuredUrl: string
  /** true se o pod da URL não está RUNNING com porta Comfy. */
  urlStale: boolean
  selectedPod: RunpodPodSummary | null
  pods: RunpodPodSummary[]
  suggestedUrl: string | null
  comfy: ComfyConnectionInfo | null
  gpuCatalog: RunpodGpuCatalogEntry[]
  networkVolumes: RunpodNetworkVolumeSummary[]
  templates: RunpodTemplateSummary[]
  /** Confirma que esta consulta não dispara start/stop/create/delete. */
  mutationCalls: 0
  /** Snapshot do último lifecycle (se houver). */
  lifecycle: RunpodPodLifecycleState | null
}

export type RunpodStartPreview = {
  pod: RunpodPodSummary
  costPerHr: number | null
  currency: 'USD'
  dryRunDefault: boolean
  compatibility: LtxPodCompatibility
  confirmationMessage: string
}

export type RunpodPodLifecyclePhase =
  | 'idle'
  | 'confirming'
  | 'starting'
  | 'waiting_pod'
  | 'waiting_comfy'
  | 'checking_nodes'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'error'

export type RunpodPodLifecycleState = {
  podId: string
  podName: string
  phase: RunpodPodLifecyclePhase
  dryRun: boolean
  message: string
  diagnostics: string[]
  podStatus: RunpodPodStatus | null
  baseUrl: string | null
  costPerHr: number | null
  comfy: ComfyConnectionInfo | null
  nodeReadiness: ComfyNodeReadiness | null
  compatibility: LtxPodCompatibility | null
  startedAt: string
  updatedAt: string
  error: string | null
}

export type RunpodStartPodRequest = {
  podId: string
  /** Deve ecoar o custo exibido no preview (proteção anti-clique cego). */
  confirmedCostPerHr: number | null
  /** true = não chama POST /action (obrigatório nos testes; padrão seguro na UI). */
  dryRun: boolean
  /** Confirmação explícita de que o usuário aceita cobrança se dryRun=false. */
  acceptBilling: boolean
}

/** STOP manual — nunca terminate/delete. */
export type RunpodStopPodRequest = {
  podId: string
  /** true = não chama POST /action stop. */
  dryRun: boolean
}

export type RunpodStopPodResult = {
  podId: string
  podName: string
  dryRun: boolean
  phase: Extract<RunpodPodLifecyclePhase, 'stopping' | 'stopped' | 'error'>
  podStatus: RunpodPodStatus | null
  message: string
  diagnostics: string[]
  error: string | null
  /** true se a URL Comfy salva apontava para este Pod e foi limpa. */
  clearedBaseUrl: boolean
  lifecycle: RunpodPodLifecycleState
}
