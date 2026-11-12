/**
 * Orquestrador único: Conectar ComfyUI (barra LipSync) e Gerar no Comfy.
 * Reutiliza RunpodLifecycleManager — sem segunda implementação de start.
 */

import type { ComfyApiWorkflow, ComfyConfig, ComfyConnectionInfo } from '../../../../shared/comfy'
import {
  COMFY_CONNECT_SIMULATED_MESSAGE,
  mapLifecyclePhaseToConnectUi,
  type ComfyConnectCatalogHint,
  type ComfyConnectConfirmRequest,
  type ComfyConnectConfirmResult,
  type ComfyConnectGpuAlternative,
  type ComfyConnectPrepareResult,
  type ComfyConnectRefreshResult,
  type ComfyConnectUiPhase,
} from '../../../../shared/comfyConnect'
import {
  formatRunpodHostGpuUnavailableMessage,
  isRunpodHostGpuUnavailableMessage,
} from '../../../../shared/runpodHostCapacity'
import type {
  ComfyGpuRecoveryConfirmRequest,
  ComfyGpuRecoveryPreview,
} from '../../../../shared/comfyGpuRecovery'
import { scoreLtxComfyPod } from '../../../../shared/ltxAutoDetect'
import type { LtxEnvironmentPlan } from '../../../../shared/ltxEnvironment'
import type {
  RunpodGpuCatalogEntry,
  RunpodInfraStatus,
  RunpodPodLifecycleState,
  RunpodPodSummary,
  RunpodStartPodRequest,
} from '../../../../shared/runpod'
import { assessLtxPodCompatibility } from '../../../../shared/runpodLtxCompat'
import { inspectComfyPodReadOnly } from './comfyPodInventory'
import { probeComfyLtxReadiness } from './comfyReadiness'
import {
  buildGpuRecoveryPreview,
  confirmGpuRecovery,
} from './gpuRecoveryService'
import type { RunpodClientV2 } from './RunpodClientV2'
import type { RunpodLifecycleManager } from './RunpodLifecycleManager'

export type ComfyConnectOrchestratorDeps = {
  getApiKey: () => string
  getConfig: () => ComfyConfig
  saveConfig: (patch: Partial<ComfyConfig>) => ComfyConfig
  getWorkflow: () => ComfyApiWorkflow | null
  getLtxPlan: () => LtxEnvironmentPlan
  /** true se snapshot S3/detecção já confirmou os 5 modelos oficiais. */
  modelsPersistentlyVerified: () => boolean
  getRunpodStatus: (options?: { force?: boolean }) => Promise<RunpodInfraStatus>
  lifecycle: RunpodLifecycleManager
  createClient: (apiKey: string) => RunpodClientV2
  probeComfy?: typeof probeComfyLtxReadiness
  inspectModels?: typeof inspectComfyPodReadOnly
  log?: (event: string, data?: Record<string, unknown>) => void
}

function isRunningStatus(status: string | null | undefined): boolean {
  return String(status || '').toUpperCase() === 'RUNNING'
}

function isBootingStatus(status: string | null | undefined): boolean {
  const upper = String(status || '').toUpperCase()
  return upper === 'PROVISIONING' || upper === 'STARTING'
}

function podLooksStartable(pod: RunpodPodSummary): boolean {
  const status = String(pod.status || '').toUpperCase()
  if (!pod.hasComfyPort || status === 'TERMINATED') return false
  if (status === 'RUNNING' || status === 'STARTING' || status === 'PROVISIONING') return true
  const actions = (pod.actions ?? []).map((a) => String(a).toLowerCase())
  return status === 'EXITED' && (actions.includes('start') || actions.length === 0)
}

/**
 * Prefere religar Pod existente (ex.: …-migration com Start $0.72/h no console)
 * em vez de ficar preso no Pod antigo sem vaga no host.
 */
function selectPreferredPod(
  pods: RunpodPodSummary[],
  preferredId: string | null,
  volumeDc: string | null,
): RunpodPodSummary | null {
  const scored = [...pods]
    .map((pod) => ({
      pod,
      score: scoreLtxComfyPod(pod, { volumeDc, preferredId }),
      startable: podLooksStartable(pod),
    }))
    .sort((a, b) => b.score - a.score)

  if (preferredId) {
    const hit = scored.find((row) => row.pod.id === preferredId)
    if (hit?.startable) return hit.pod
  }

  const bestStartable = scored.find((row) => row.startable && row.score >= 0)
  if (bestStartable) return bestStartable.pod

  return scored.find((row) => row.score >= 0)?.pod ?? null
}

function toAlternative(
  pod: RunpodPodSummary,
  note: string,
): ComfyConnectGpuAlternative {
  return {
    podId: pod.id,
    podName: pod.name,
    gpuType: pod.gpuType,
    status: pod.status,
    costPerHr: pod.costPerHr,
    dataCenterId: pod.dataCenterId,
    note,
  }
}

function listCompatibleAlternatives(
  pods: RunpodPodSummary[],
  preferredId: string | null,
  volumeDc: string | null,
  catalog: RunpodGpuCatalogEntry[],
): { alternatives: ComfyConnectGpuAlternative[]; catalogHints: ComfyConnectCatalogHint[] } {
  const alternatives = pods
    .filter((pod) => pod.id !== preferredId)
    .filter((pod) => pod.hasComfyPort)
    .map((pod) => {
      const compat = pod.ltxCompat ?? assessLtxPodCompatibility(pod, catalog)
      return { pod, compat }
    })
    .filter(({ compat }) => compat.canStart)
    .map(({ pod }) => {
      const sameDc = volumeDc && pod.dataCenterId === volumeDc
      return toAlternative(
        pod,
        sameDc
          ? 'Pod existente compatível no mesmo datacenter do Network Volume (não provisionado automaticamente).'
          : 'Pod existente compatível — confirme DC/volume antes de migrar (não provisionado automaticamente).',
      )
    })

  const catalogHints: ComfyConnectCatalogHint[] = catalog
    .filter((gpu) => (gpu.memoryGb ?? 0) >= 16)
    .slice(0, 8)
    .map((gpu) => ({
      gpuId: gpu.id,
      displayName: gpu.name || gpu.id,
      memoryGb: gpu.memoryGb,
      note:
        'Alternativa de catálogo — criar/migrar Pod ainda não está autorizado automaticamente nesta versão.',
    }))

  return { alternatives, catalogHints }
}

async function verifyLtxModels(
  deps: ComfyConnectOrchestratorDeps,
  baseUrl: string,
  dryRun: boolean,
): Promise<{ ok: boolean; message: string }> {
  if (dryRun) {
    return { ok: true, message: 'Simulação: modelos LTX-2.3 tratados como presentes.' }
  }
  if (deps.modelsPersistentlyVerified()) {
    return {
      ok: true,
      message: 'Modelos LTX-2.3 confirmados no snapshot salvo (Network Volume / detecção).',
    }
  }
  const inspect = deps.inspectModels ?? inspectComfyPodReadOnly
  try {
    const inventory = await inspect(baseUrl, deps.getWorkflow())
    const present = inventory.models.filter((model) => model.present === true).length
    const required = inventory.models.length
    const unknown = inventory.models.filter((model) => model.present == null).length
    if (present === required && required > 0) {
      return { ok: true, message: `Modelos LTX-2.3: ${present}/${required} no ComfyUI.` }
    }
    if (unknown === required) {
      return {
        ok: false,
        message:
          'Não foi possível listar os 5 modelos LTX-2.3 no ComfyUI. Rode a detecção com S3 ou verifique /models.',
      }
    }
    const missing = inventory.models
      .filter((model) => model.present === false)
      .map((model) => model.expectedFileName)
    return {
      ok: false,
      message: `Modelos LTX-2.3 incompletos (${present}/${required}). Ausentes: ${missing.join(', ') || 'n/d'}.`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function clearStaleUrl(deps: ComfyConnectOrchestratorDeps, reason: string): ComfyConfig {
  const current = deps.getConfig()
  if (!current.baseUrl.trim()) return current
  deps.log?.('comfy.connect.clear_stale_url', { previous: current.baseUrl, reason })
  return deps.saveConfig({ baseUrl: '' })
}

export class ComfyConnectOrchestrator {
  private readonly deps: ComfyConnectOrchestratorDeps
  private prepareInFlight: Promise<ComfyConnectPrepareResult> | null = null
  private confirmInFlight: Promise<ComfyConnectConfirmResult> | null = null
  private recoveryInFlight: Promise<ComfyConnectConfirmResult> | null = null
  private lastRecoveryPreview: ComfyGpuRecoveryPreview | null = null

  constructor(deps: ComfyConnectOrchestratorDeps) {
    this.deps = deps
  }

  getLastRecoveryPreview(): ComfyGpuRecoveryPreview | null {
    return this.lastRecoveryPreview
  }

  getLifecycle(): RunpodPodLifecycleState | null {
    return this.deps.lifecycle.getLatest()
  }

  /** Atualiza URL/status sem iniciar GPU. */
  async refreshStatus(): Promise<ComfyConnectRefreshResult> {
    const apiKey = this.deps.getApiKey().trim()
    let config = this.deps.getConfig()
    if (!apiKey) {
      return {
        phase: 'error',
        baseUrl: config.baseUrl,
        connection: null,
        message: 'Cole a chave da API do RunPod nas Configurações.',
        config,
        urlChanged: false,
      }
    }

    const status = await this.deps.getRunpodStatus({ force: true })
    const plan = this.deps.getLtxPlan()
    const preferred = selectPreferredPod(
      status.pods,
      config.runpodPreferredPodId || status.preferredPodId,
      plan.preferredDataCenterId,
    )

    if (!preferred || !isRunningStatus(preferred.status)) {
      config = clearStaleUrl(this.deps, 'preferred_pod_offline')
      return {
        phase: 'gpu_off',
        baseUrl: config.baseUrl,
        connection: null,
        message: preferred
          ? `GPU desligada (${preferred.name} · ${preferred.status}). Use Conectar ComfyUI para iniciar.`
          : 'Nenhum pod com porta 8188 encontrado. Configure o Pod preferencial nas Configurações.',
        config,
        urlChanged: Boolean(this.deps.getConfig().baseUrl !== config.baseUrl),
      }
    }

    const nextUrl = preferred.comfyProxyUrl || ''
    const previous = config.baseUrl
    if (nextUrl && nextUrl !== previous) {
      config = this.deps.saveConfig({
        baseUrl: nextUrl,
        runpodPreferredPodId: preferred.id,
      })
    } else if (preferred.id && preferred.id !== config.runpodPreferredPodId) {
      config = this.deps.saveConfig({ runpodPreferredPodId: preferred.id })
    }

    const probe = this.deps.probeComfy ?? probeComfyLtxReadiness
    let connection: ComfyConnectionInfo | null = null
    let phase: ComfyConnectUiPhase = 'waiting_comfy'
    let message = 'Pod RUNNING. Aguardando ComfyUI…'

    if (config.baseUrl) {
      try {
        const readiness = await probe(config.baseUrl, this.deps.getWorkflow())
        connection = readiness.connection
        if (connection.ok && readiness.nodes.ok) {
          const models = await verifyLtxModels(this.deps, config.baseUrl, false)
          if (models.ok) {
            phase = 'ready'
            message = 'ComfyUI conectado — pronto para gerar'
          } else {
            phase = 'error'
            message = models.message
          }
        } else if (connection.ok && !readiness.nodes.ok) {
          phase = 'error'
          message = readiness.nodes.message
        } else {
          phase = 'waiting_comfy'
          message = connection?.message || 'Aguardando ComfyUI…'
        }
      } catch (error) {
        connection = {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
        phase = 'waiting_comfy'
        message = connection.message
      }
    }

    return {
      phase,
      baseUrl: config.baseUrl,
      connection,
      message,
      config,
      urlChanged: config.baseUrl !== previous,
    }
  }

  async prepare(options?: { force?: boolean }): Promise<ComfyConnectPrepareResult> {
    if (this.confirmInFlight) {
      const lifecycle = this.deps.lifecycle.getLatest()
      const config = this.deps.getConfig()
      if (lifecycle && lifecycle.phase !== 'ready' && lifecycle.phase !== 'error') {
        return {
          status: 'in_flight',
          phase: mapLifecyclePhaseToConnectUi(lifecycle.phase),
          lifecycle,
          message: lifecycle.message,
          config,
        }
      }
    }
    if (this.prepareInFlight && !options?.force) return this.prepareInFlight

    const run = this.runPrepare().finally(() => {
      this.prepareInFlight = null
    })
    this.prepareInFlight = run
    return run
  }

  async confirm(request: ComfyConnectConfirmRequest): Promise<ComfyConnectConfirmResult> {
    if (this.confirmInFlight) return this.confirmInFlight
    const run = this.runConfirm(request).finally(() => {
      this.confirmInFlight = null
    })
    this.confirmInFlight = run
    return run
  }

  async confirmRecovery(
    request: ComfyGpuRecoveryConfirmRequest,
  ): Promise<ComfyConnectConfirmResult> {
    if (this.recoveryInFlight) return this.recoveryInFlight
    const run = this.runConfirmRecovery(request).finally(() => {
      this.recoveryInFlight = null
    })
    this.recoveryInFlight = run
    return run
  }

  private recoveryDeps() {
    return {
      createClient: this.deps.createClient,
      getApiKey: this.deps.getApiKey,
      getConfig: this.deps.getConfig,
      saveConfig: this.deps.saveConfig,
      getWorkflow: this.deps.getWorkflow,
      getLtxPlan: this.deps.getLtxPlan,
      modelsPersistentlyVerified: this.deps.modelsPersistentlyVerified,
      lifecycle: this.deps.lifecycle,
      getRunpodStatus: this.deps.getRunpodStatus,
      probeComfy: this.deps.probeComfy,
      inspectModels: this.deps.inspectModels,
      log: this.deps.log,
    }
  }

  private async offerRecovery(
    preferred: RunpodPodSummary | null,
    status: RunpodInfraStatus,
    config: ComfyConfig,
    fallbackMessage: string,
    alternatives: ComfyConnectGpuAlternative[],
    catalogHints: ComfyConnectCatalogHint[],
  ): Promise<ComfyConnectPrepareResult> {
    const recovery = await buildGpuRecoveryPreview(this.recoveryDeps(), preferred, status)
    this.lastRecoveryPreview = recovery
    if (recovery.options.length > 0) {
      return {
        status: 'needs_recovery',
        phase: 'awaiting_cost',
        recovery,
        dryRunDefault: config.runpodDryRunStarts,
        message: recovery.message,
        config,
      }
    }
    return {
      status: 'gpu_unavailable',
      phase: 'gpu_unavailable',
      preferredPod: preferred,
      alternatives,
      catalogHints,
      message: fallbackMessage,
      config,
      recovery,
    }
  }

  private async runPrepare(): Promise<ComfyConnectPrepareResult> {
    let config = this.deps.getConfig()
    const apiKey = this.deps.getApiKey().trim()
    if (!apiKey) {
      return {
        status: 'error',
        phase: 'error',
        message: 'Cole a chave da API do RunPod nas Configurações.',
        diagnostics: ['Sem chave → impossível listar/iniciar Pods.'],
        config,
      }
    }

    const status = await this.deps.getRunpodStatus({ force: true })
    if (status.apiKeyValid === false) {
      return {
        status: 'error',
        phase: 'error',
        message: status.error || 'Chave RunPod inválida.',
        diagnostics: [status.error || 'apiKeyValid=false'],
        config,
      }
    }

    const plan = this.deps.getLtxPlan()
    const preferredId = config.runpodPreferredPodId || status.preferredPodId || plan.primaryGpuId
    // primaryGpuId is GPU type not pod id — only use if it looks like a pod id
    const preferredPodId =
      preferredId && !preferredId.includes(' ') && preferredId.length > 8
        ? preferredId
        : config.runpodPreferredPodId || status.preferredPodId

    const preferred = selectPreferredPod(
      status.pods,
      preferredPodId,
      plan.preferredDataCenterId,
    )

    if (!preferred) {
      config = clearStaleUrl(this.deps, 'no_pod')
      return {
        status: 'error',
        phase: 'error',
        message: 'Nenhum pod com porta 8188 (ComfyUI) na conta RunPod.',
        diagnostics: [
          'Ligue/crie o Pod no RunPod com a porta 8188, ou selecione o Pod preferencial nas Configurações.',
        ],
        config,
      }
    }

    if (preferred.id !== config.runpodPreferredPodId) {
      config = this.deps.saveConfig({ runpodPreferredPodId: preferred.id })
    }

    const compat =
      preferred.ltxCompat ?? assessLtxPodCompatibility(preferred, status.gpuCatalog)
    const { alternatives, catalogHints } = listCompatibleAlternatives(
      status.pods,
      preferred.id,
      plan.preferredDataCenterId,
      status.gpuCatalog,
    )

    if (!compat.canStart && !isRunningStatus(preferred.status) && !isBootingStatus(preferred.status)) {
      config = clearStaleUrl(this.deps, 'pod_blocked')
      return this.offerRecovery(
        preferred,
        status,
        config,
        compat.reasons[0] ||
          `Pod "${preferred.name}" não pode ser iniciado agora (${preferred.status}).`,
        alternatives,
        catalogHints,
      )
    }

    // Já RUNNING/boot: conectar de verdade (não usar dry-run — o Pod já está cobrando).
    if (isRunningStatus(preferred.status) || isBootingStatus(preferred.status)) {
      if (isRunningStatus(preferred.status)) {
        const live = await this.tryConnectRunningPod(preferred)
        if (live) return live
      }
      // Comfy ainda não saudável — espera via lifecycle (idempotente; sem POST se já RUNNING).
      const waitResult = await this.runConfirm({
        podId: preferred.id,
        confirmedCostPerHr: preferred.costPerHr,
        dryRun: false,
        acceptBilling: false,
      })
      if (waitResult.status === 'ready' && waitResult.connection) {
        return {
          status: 'ready',
          phase: 'ready',
          baseUrl: waitResult.baseUrl || '',
          podId: waitResult.podId,
          podName: waitResult.podName,
          connection: waitResult.connection,
          modelsOk: waitResult.modelsOk,
          modelsMessage: waitResult.modelsMessage,
          message: waitResult.message,
          dryRun: false,
          lifecycle: waitResult.lifecycle,
          config: waitResult.config,
        }
      }
      return {
        status: 'error',
        phase: 'error',
        message: waitResult.message,
        diagnostics: waitResult.diagnostics,
        config: waitResult.config,
      }
    }

    // EXITED / parado: precisa confirmação de custo (ou dry-run).
    const preview = await this.deps.lifecycle.previewStart(preferred.id)
    if (!preview.compatibility.canStart) {
      return this.offerRecovery(
        preferred,
        status,
        config,
        preview.confirmationMessage,
        alternatives,
        catalogHints,
      )
    }

    return {
      status: 'needs_confirmation',
      phase: 'awaiting_cost',
      preview,
      dryRunDefault: preview.dryRunDefault || config.runpodDryRunStarts,
      alternatives,
      message: preview.confirmationMessage,
      config,
    }
  }

  private async runConfirmRecovery(
    request: ComfyGpuRecoveryConfirmRequest,
  ): Promise<ComfyConnectConfirmResult> {
    const preview = this.lastRecoveryPreview
    if (!preview) {
      return {
        status: 'error',
        phase: 'error',
        baseUrl: null,
        podId: '',
        podName: '',
        connection: null,
        modelsOk: false,
        modelsMessage: 'Sem preview de recuperação.',
        message: 'Abra Conectar ComfyUI de novo para montar as opções de recuperação.',
        lifecycle: this.deps.lifecycle.getLatest() ?? {
          podId: '',
          podName: '',
          phase: 'error',
          dryRun: request.dryRun,
          message: 'Sem preview',
          diagnostics: [],
          podStatus: null,
          baseUrl: null,
          costPerHr: null,
          comfy: null,
          nodeReadiness: null,
          compatibility: null,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          error: 'Sem preview de recuperação',
        },
        config: this.deps.getConfig(),
        diagnostics: [],
        dryRun: request.dryRun,
      }
    }

    const result = await confirmGpuRecovery(this.recoveryDeps(), preview, request)
    const fallbackLife = (): RunpodPodLifecycleState =>
      result.lifecycle ??
      this.deps.lifecycle.getLatest() ?? {
        podId: result.podId || '',
        podName: result.podName || '',
        phase: result.status === 'ready' ? 'ready' : result.status === 'simulated' ? 'ready' : 'error',
        dryRun: result.dryRun,
        message: result.message,
        diagnostics: result.diagnostics,
        podStatus: null,
        baseUrl: result.baseUrl,
        costPerHr: null,
        comfy: result.connection,
        nodeReadiness: null,
        compatibility: null,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: result.status === 'error' ? result.message : null,
      }

    if (result.status === 'simulated') {
      return {
        status: 'simulated',
        phase: 'simulated',
        baseUrl: null,
        podId: result.podId || '',
        podName: result.podName || '',
        connection: result.connection,
        modelsOk: true,
        modelsMessage: 'Simulação de recovery.',
        message: result.message,
        lifecycle: fallbackLife(),
        config: result.config,
        diagnostics: result.diagnostics,
        dryRun: true,
      }
    }
    if (result.status === 'ready' && result.baseUrl) {
      return {
        status: 'ready',
        phase: 'ready',
        baseUrl: result.baseUrl,
        podId: result.podId || '',
        podName: result.podName || '',
        connection: result.connection,
        modelsOk: true,
        modelsMessage: 'Modelos no Network Volume (sem reinstalação).',
        message: result.message,
        lifecycle: fallbackLife(),
        config: result.config,
        diagnostics: result.diagnostics,
        dryRun: false,
      }
    }
    return {
      status: 'error',
      phase: 'error',
      baseUrl: result.baseUrl,
      podId: result.podId || '',
      podName: result.podName || '',
      connection: result.connection,
      modelsOk: false,
      modelsMessage: result.message,
      message: result.message,
      lifecycle: fallbackLife(),
      config: result.config,
      diagnostics: result.diagnostics,
      dryRun: result.dryRun,
    }
  }

  private async tryConnectRunningPod(
    preferred: RunpodPodSummary,
  ): Promise<ComfyConnectPrepareResult | null> {
    const baseUrl = preferred.comfyProxyUrl || ''
    if (!baseUrl) return null

    let config = this.deps.saveConfig({
      baseUrl,
      runpodPreferredPodId: preferred.id,
    })

    const probe = this.deps.probeComfy ?? probeComfyLtxReadiness
    try {
      const readiness = await probe(baseUrl, this.deps.getWorkflow())
      if (!readiness.connection.ok) return null
      if (!readiness.nodes.ok) {
        return {
          status: 'error',
          phase: 'error',
          message: readiness.nodes.message,
          diagnostics: [
            readiness.nodes.message,
            `Ausentes: ${readiness.nodes.missing.join(', ') || '(nenhum)'}`,
          ],
          config,
        }
      }
      const models = await verifyLtxModels(this.deps, baseUrl, false)
      if (!models.ok) {
        return {
          status: 'error',
          phase: 'error',
          message: models.message,
          diagnostics: [models.message, 'Workflow LTX-2.3 requer os 5 assets oficiais.'],
          config,
        }
      }
      return {
        status: 'ready',
        phase: 'ready',
        baseUrl,
        podId: preferred.id,
        podName: preferred.name,
        connection: readiness.connection,
        modelsOk: true,
        modelsMessage: models.message,
        message: 'ComfyUI conectado — pronto para gerar',
        dryRun: false,
        lifecycle: this.deps.lifecycle.getLatest(),
        config,
      }
    } catch {
      return null
    }
  }

  private async runConfirm(request: ComfyConnectConfirmRequest): Promise<ComfyConnectConfirmResult> {
    const startRequest: RunpodStartPodRequest = {
      podId: request.podId,
      confirmedCostPerHr: request.confirmedCostPerHr,
      dryRun: request.dryRun,
      acceptBilling: request.acceptBilling,
    }

    this.deps.log?.('comfy.connect.confirm', {
      podId: request.podId,
      dryRun: request.dryRun,
      acceptBilling: request.acceptBilling,
    })

    if (request.podId.trim()) {
      this.deps.saveConfig({ runpodPreferredPodId: request.podId.trim() })
    }

    const lifecycle = await this.deps.lifecycle.startExistingPod(startRequest)
    let config = this.deps.getConfig()

    // Simulação: lifecycle.phase ready + dryRun — sem URL persistida.
    if (lifecycle.dryRun && lifecycle.phase === 'ready') {
      return {
        status: 'simulated',
        phase: 'simulated',
        baseUrl: null,
        podId: lifecycle.podId,
        podName: lifecycle.podName,
        connection: lifecycle.comfy,
        modelsOk: true,
        modelsMessage: 'Simulação: modelos não verificados no Comfy real.',
        message: COMFY_CONNECT_SIMULATED_MESSAGE,
        lifecycle,
        config,
        diagnostics: lifecycle.diagnostics,
        dryRun: true,
      }
    }

    if (lifecycle.phase !== 'ready' || !lifecycle.baseUrl) {
      if (lifecycle.phase === 'error') {
        config = clearStaleUrl(this.deps, 'lifecycle_error')
      }
      const failMessage = lifecycle.error || lifecycle.message
      const hostFull = isRunpodHostGpuUnavailableMessage(
        [failMessage, ...lifecycle.diagnostics].join('\n'),
      )
      if (hostFull && !lifecycle.dryRun) {
        try {
          const status = await this.deps.getRunpodStatus({ force: true })
          const preferred =
            status.pods.find((pod) => pod.id === lifecycle.podId) ?? status.selectedPod ?? null
          const offered = await this.offerRecovery(
            preferred,
            status,
            config,
            formatRunpodHostGpuUnavailableMessage(failMessage),
            [],
            [],
          )
          if (
            offered.status === 'needs_recovery' ||
            (offered.status === 'gpu_unavailable' &&
              offered.recovery &&
              offered.recovery.options.length > 0)
          ) {
            const recovery =
              offered.status === 'needs_recovery'
                ? offered.recovery
                : offered.recovery!
            return {
              status: 'needs_recovery',
              phase: 'awaiting_cost',
              baseUrl: null,
              podId: lifecycle.podId,
              podName: lifecycle.podName,
              connection: null,
              modelsOk: false,
              modelsMessage: offered.message,
              message: offered.message,
              lifecycle,
              config: offered.config,
              diagnostics: lifecycle.diagnostics,
              dryRun: false,
              recovery,
            }
          }
        } catch (error) {
          this.deps.log?.('comfy.connect.host_gpu_recovery_failed', {
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return {
        status: 'error',
        phase: mapLifecyclePhaseToConnectUi(lifecycle.phase, lifecycle.dryRun),
        baseUrl: lifecycle.baseUrl,
        podId: lifecycle.podId,
        podName: lifecycle.podName,
        connection: lifecycle.comfy,
        modelsOk: false,
        modelsMessage: failMessage,
        message: hostFull ? formatRunpodHostGpuUnavailableMessage(failMessage) : failMessage,
        lifecycle,
        config,
        diagnostics: lifecycle.diagnostics,
        dryRun: lifecycle.dryRun,
        recovery: null,
      }
    }

    config = this.deps.saveConfig({
      baseUrl: lifecycle.baseUrl,
      runpodPreferredPodId: lifecycle.podId,
    })

    const models = await verifyLtxModels(this.deps, lifecycle.baseUrl, false)
    if (!models.ok) {
      return {
        status: 'error',
        phase: 'error',
        baseUrl: lifecycle.baseUrl,
        podId: lifecycle.podId,
        podName: lifecycle.podName,
        connection: lifecycle.comfy,
        modelsOk: false,
        modelsMessage: models.message,
        message: models.message,
        lifecycle,
        config,
        diagnostics: [...lifecycle.diagnostics, models.message],
        dryRun: false,
      }
    }

    return {
      status: 'ready',
      phase: 'ready',
      baseUrl: lifecycle.baseUrl,
      podId: lifecycle.podId,
      podName: lifecycle.podName,
      connection: lifecycle.comfy,
      modelsOk: true,
      modelsMessage: models.message,
      message: 'ComfyUI conectado — pronto para gerar',
      lifecycle,
      config,
      diagnostics: lifecycle.diagnostics,
      dryRun: false,
    }
  }
}
