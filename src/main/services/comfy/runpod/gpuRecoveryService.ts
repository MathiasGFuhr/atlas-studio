/**
 * Recuperação GPU indisponível via API REST v2 oficial.
 * Equivalente ao migrate do console quando há Network Volume: create/reuse + attach.
 */

import type { ComfyApiWorkflow, ComfyConfig } from '../../../../shared/comfy'
import {
  buildComfyGpuRecoveryPreview,
  type ComfyGpuRecoveryConfirmRequest,
  type ComfyGpuRecoveryOption,
  type ComfyGpuRecoveryPreview,
} from '../../../../shared/comfyGpuRecovery'
import type { LtxEnvironmentPlan } from '../../../../shared/ltxEnvironment'
import { planLtxGpuRecovery } from '../../../../shared/ltxRecovery'
import type { RunpodInfraStatus, RunpodPodLifecycleState, RunpodPodSummary } from '../../../../shared/runpod'
import { assessLtxPodCompatibility } from '../../../../shared/runpodLtxCompat'
import {
  formatRunpodHostGpuUnavailableMessage,
  formatRunpodNoInstanceAvailableMessage,
  isRunpodHostGpuUnavailableMessage,
  isRunpodNoInstanceAvailableMessage,
} from '../../../../shared/runpodHostCapacity'
import { inspectComfyPodReadOnly } from './comfyPodInventory'
import { probeComfyLtxReadiness } from './comfyReadiness'
import {
  RunpodApiError,
  type RunpodClientV2,
  type RunpodCreatePodRequest,
} from './RunpodClientV2'
import { summarizeV2Pod } from './mapRunpodV2'
import type { RunpodLifecycleManager } from './RunpodLifecycleManager'

export type GpuRecoveryServiceDeps = {
  createClient: (apiKey: string) => RunpodClientV2
  getApiKey: () => string
  getConfig: () => ComfyConfig
  saveConfig: (patch: Partial<ComfyConfig>) => ComfyConfig
  getWorkflow: () => ComfyApiWorkflow | null
  getLtxPlan: () => LtxEnvironmentPlan
  modelsPersistentlyVerified: () => boolean
  lifecycle: RunpodLifecycleManager
  getRunpodStatus: (options?: { force?: boolean }) => Promise<RunpodInfraStatus>
  probeComfy?: typeof probeComfyLtxReadiness
  inspectModels?: typeof inspectComfyPodReadOnly
  sleep?: (ms: number) => Promise<void>
  log?: (event: string, data?: Record<string, unknown>) => void
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function resolveMountPath(pod: RunpodPodSummary | null, plan: LtxEnvironmentPlan): string {
  const fromPod = pod?.networkMounts?.[0]?.path?.trim()
  if (fromPod) return fromPod
  const models = plan.modelsMountPath?.trim()
  if (models?.endsWith('/models')) return models.replace(/\/models$/, '') || '/runpod-volume'
  if (models) return models
  return '/runpod-volume'
}

function resolveImage(pod: RunpodPodSummary | null, plan: LtxEnvironmentPlan): string | null {
  const fromPod = pod?.image?.trim() || null
  if (fromPod && !/pending-pin|placeholder/i.test(fromPod)) return fromPod
  const fromPlan = plan.templateImage?.trim() || null
  if (fromPlan && plan.templateTagPinned && !/pending-pin/i.test(fromPlan)) return fromPlan
  return fromPod
}

function availabilityOk(value: string | null | undefined): boolean {
  if (!value) return true
  const upper = value.toUpperCase()
  return !(
    upper === 'NONE' ||
    upper === 'UNAVAILABLE' ||
    upper === 'OUT_OF_STOCK' ||
    upper === '0' ||
    upper.includes('UNAVAIL')
  )
}

export async function buildGpuRecoveryPreview(
  deps: GpuRecoveryServiceDeps,
  preferred: RunpodPodSummary | null,
  status: RunpodInfraStatus,
): Promise<ComfyGpuRecoveryPreview> {
  const plan = deps.getLtxPlan()
  const recovery = planLtxGpuRecovery({
    plan,
    preferredPodId: preferred?.id ?? (deps.getConfig().runpodPreferredPodId || null),
    pods: status.pods,
    catalog: status.gpuCatalog,
  })

  const volumeDc = plan.preferredDataCenterId || preferred?.dataCenterId || null
  const volumeId =
    plan.networkVolumeId ||
    preferred?.networkMounts?.[0]?.volumeId ||
    status.networkVolumes.find((vol) => vol.dataCenterId === volumeDc)?.id ||
    status.networkVolumes[0]?.id ||
    null

  let availableGpuIdsInVolumeDc: string[] = []
  const apiKey = deps.getApiKey().trim()
  if (apiKey && volumeDc) {
    try {
      const client = deps.createClient(apiKey)
      const dcs = await client.listDataCenters({ includeGpuAvailability: true })
      const hit = dcs.find((dc) => dc.id === volumeDc)
      availableGpuIdsInVolumeDc = (hit?.gpuAvailability ?? [])
        .filter((gpu) => availabilityOk(gpu.availability))
        .map((gpu) => gpu.id)
    } catch (error) {
      deps.log?.('gpu.recovery.dc_availability_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return buildComfyGpuRecoveryPreview({
    originalPod: preferred,
    volumeDataCenterId: volumeDc,
    networkVolumeId: volumeId,
    mountPath: resolveMountPath(preferred, plan),
    image: resolveImage(preferred, plan),
    maxUsdPerHour: plan.maxUsdPerHour,
    recoveryOptions: recovery.options,
    availableGpuIdsInVolumeDc,
  })
}

export type GpuRecoveryConfirmResult = {
  status: 'ready' | 'simulated' | 'error'
  message: string
  baseUrl: string | null
  podId: string | null
  podName: string | null
  connection: RunpodPodLifecycleState['comfy']
  config: ComfyConfig
  diagnostics: string[]
  dryRun: boolean
  lifecycle: RunpodPodLifecycleState | null
  stoppedOriginalPodId: string | null
}

export async function confirmGpuRecovery(
  deps: GpuRecoveryServiceDeps,
  preview: ComfyGpuRecoveryPreview,
  request: ComfyGpuRecoveryConfirmRequest,
): Promise<GpuRecoveryConfirmResult> {
  const option = preview.options.find((row) => row.id === request.optionId)
  if (!option) {
    return {
      status: 'error',
      message: 'Opção de recuperação inválida.',
      baseUrl: null,
      podId: null,
      podName: null,
      connection: null,
      config: deps.getConfig(),
      diagnostics: [],
      dryRun: request.dryRun,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  if (!request.dryRun && !request.acceptBilling) {
    return {
      status: 'error',
      message: 'Confirme a cobrança da GPU de recuperação.',
      baseUrl: null,
      podId: null,
      podName: null,
      connection: null,
      config: deps.getConfig(),
      diagnostics: ['acceptBilling obrigatório para create/start real.'],
      dryRun: false,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  if (
    !request.dryRun &&
    option.willStopOriginalIfRunning &&
    !request.acceptStopOriginalIfRunning
  ) {
    return {
      status: 'error',
      message:
        'O Pod antigo ainda está RUNNING. Autorize o STOP dele após validar o novo para não pagar duas GPUs.',
      baseUrl: null,
      podId: null,
      podName: null,
      connection: null,
      config: deps.getConfig(),
      diagnostics: ['acceptStopOriginalIfRunning obrigatório.'],
      dryRun: false,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  if (
    option.estimatedCostPerHr != null &&
    request.confirmedCostPerHr != null &&
    Math.abs(option.estimatedCostPerHr - request.confirmedCostPerHr) > 0.0001
  ) {
    return {
      status: 'error',
      message: 'O custo confirmado não confere com a opção selecionada.',
      baseUrl: null,
      podId: null,
      podName: null,
      connection: null,
      config: deps.getConfig(),
      diagnostics: [],
      dryRun: request.dryRun,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  if (option.kind === 'reuse_existing_pod' && option.existingPodId) {
    return runReuseExisting(deps, option, request)
  }

  return runCreateWithVolume(deps, preview, option, request)
}

async function runReuseExisting(
  deps: GpuRecoveryServiceDeps,
  option: ComfyGpuRecoveryOption,
  request: ComfyGpuRecoveryConfirmRequest,
): Promise<GpuRecoveryConfirmResult> {
  const podId = option.existingPodId!
  deps.saveConfig({ runpodPreferredPodId: podId })
  const lifecycle = await deps.lifecycle.startExistingPod({
    podId,
    confirmedCostPerHr: request.confirmedCostPerHr,
    dryRun: request.dryRun,
    acceptBilling: request.acceptBilling,
  })

  if (request.dryRun) {
    return {
      status: 'simulated',
      message: 'Simulação concluída — nenhuma GPU iniciada',
      baseUrl: null,
      podId,
      podName: lifecycle.podName,
      connection: lifecycle.comfy,
      config: deps.getConfig(),
      diagnostics: lifecycle.diagnostics,
      dryRun: true,
      lifecycle,
      stoppedOriginalPodId: null,
    }
  }

  if (lifecycle.phase !== 'ready' || !lifecycle.baseUrl) {
    const failMessage = lifecycle.error || lifecycle.message
    const friendly = isRunpodHostGpuUnavailableMessage(failMessage)
      ? formatRunpodHostGpuUnavailableMessage(failMessage)
      : isRunpodNoInstanceAvailableMessage(failMessage)
        ? formatRunpodNoInstanceAvailableMessage(failMessage)
        : failMessage
    return {
      status: 'error',
      message: friendly,
      baseUrl: lifecycle.baseUrl,
      podId,
      podName: lifecycle.podName,
      connection: lifecycle.comfy,
      config: deps.getConfig(),
      diagnostics: lifecycle.diagnostics,
      dryRun: false,
      lifecycle,
      stoppedOriginalPodId: null,
    }
  }

  const config = deps.saveConfig({
    baseUrl: lifecycle.baseUrl,
    runpodPreferredPodId: podId,
  })
  return {
    status: 'ready',
    message: 'ComfyUI conectado — pronto para gerar',
    baseUrl: lifecycle.baseUrl,
    podId,
    podName: lifecycle.podName,
    connection: lifecycle.comfy,
    config,
    diagnostics: lifecycle.diagnostics,
    dryRun: false,
    lifecycle,
    stoppedOriginalPodId: null,
  }
}

async function runCreateWithVolume(
  deps: GpuRecoveryServiceDeps,
  preview: ComfyGpuRecoveryPreview,
  option: ComfyGpuRecoveryOption,
  request: ComfyGpuRecoveryConfirmRequest,
): Promise<GpuRecoveryConfirmResult> {
  const plan = deps.getLtxPlan()
  const volumeId = option.networkVolumeId || preview.networkVolumeId
  const mountPath = option.mountPath || '/runpod-volume'
  const image = option.image
  const dc = option.dataCenterId || preview.volumeDataCenterId

  if (!volumeId || !image || !dc) {
    return {
      status: 'error',
      message:
        'Recuperação incompleta: faltam volume, imagem Docker ou datacenter. Rode a detecção LTX antes.',
      baseUrl: null,
      podId: null,
      podName: null,
      connection: null,
      config: deps.getConfig(),
      diagnostics: [
        `volume=${volumeId || 'n/d'}`,
        `image=${image || 'n/d'}`,
        `dc=${dc || 'n/d'}`,
      ],
      dryRun: request.dryRun,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  // Espelha o migrate do console: mesma GPU/imagem/portas no DC do volume.
  const original = preview.originalPod
  const identicalGpu = Boolean(original?.gpuType && original.gpuType === option.gpuId)
  const resolvedImage = (original?.image && identicalGpu ? original.image : image) || image
  const resolvedCloud =
    original?.cloud === 'COMMUNITY' || original?.cloud === 'SECURE'
      ? original.cloud
      : plan.preferredCloud === 'COMMUNITY'
        ? 'COMMUNITY'
        : 'SECURE'
  const body: RunpodCreatePodRequest = {
    name: original ? `${original.name} · migrated` : 'Atlas LTX migrated',
    image: resolvedImage,
    cloud: resolvedCloud,
    dataCenterIds: [dc],
    gpu: { id: option.gpuId, count: 1 },
    ports: original?.ports?.length ? original.ports : ['8188/http', '22/tcp'],
    // Container disk efêmero; modelos ficam no Network Volume. 50 GB cobre Comfy base.
    disk: 50,
    mounts: {
      network: [{ volumeId, path: mountPath }],
    },
  }

  if (request.dryRun) {
    deps.log?.('gpu.recovery.dry_run_create', {
      gpuId: option.gpuId,
      volumeId,
      dc,
      identicalGpu,
    })
    return {
      status: 'simulated',
      message: 'Simulação concluída — nenhuma GPU iniciada',
      baseUrl: null,
      podId: null,
      podName: body.name,
      connection: null,
      config: deps.getConfig(),
      diagnostics: [
        'Dry-run: POST /v2/pods não enviado (equiv. Automatically migrate).',
        `GPU=${option.gpuId}${identicalGpu ? ' (idêntica ao Pod original)' : ''} · DC=${dc}`,
        `volume=${volumeId} @ ${mountPath} · image=${resolvedImage}`,
        'Modelos no Network Volume seriam reutilizados (sem reinstalação).',
      ],
      dryRun: true,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  const apiKey = deps.getApiKey().trim()
  if (!apiKey) {
    return {
      status: 'error',
      message: 'Chave RunPod ausente.',
      baseUrl: null,
      podId: null,
      podName: null,
      connection: null,
      config: deps.getConfig(),
      diagnostics: [],
      dryRun: false,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  const client = deps.createClient(apiKey)
  const sleep = deps.sleep ?? defaultSleep
  let created: Awaited<ReturnType<RunpodClientV2['createPod']>> | null = null
  const maxAttempts = 4
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      deps.log?.('gpu.recovery.create_post', {
        gpuId: option.gpuId,
        volumeId,
        dc,
        identicalGpu,
        attempt,
      })
      created = await client.createPod(body)
      lastError = null
      break
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const capacity = isRunpodNoInstanceAvailableMessage(message)
      if (!capacity || attempt >= maxAttempts) break
      deps.log?.('gpu.recovery.create_retry', { attempt, message })
      await sleep(1_500 * attempt)
    }
  }
  if (!created) {
    const message = lastError instanceof Error ? lastError.message : String(lastError || 'erro')
    const friendly = formatRunpodNoInstanceAvailableMessage(message)
    return {
      status: 'error',
      message: `Falha ao criar Pod de recuperação: ${friendly}`,
      baseUrl: null,
      podId: null,
      podName: null,
      connection: null,
      config: deps.getConfig(),
      diagnostics: [
        lastError instanceof RunpodApiError ? `HTTP ${lastError.status}` : 'erro de rede/API',
        message,
        `GPU pedida=${option.gpuId}${identicalGpu ? ' (idêntica)' : ''} · DC=${dc} · tentativas=${maxAttempts}`,
      ],
      dryRun: false,
      lifecycle: null,
      stoppedOriginalPodId: null,
    }
  }

  const newPod = summarizeV2Pod(created)
  deps.saveConfig({ runpodPreferredPodId: newPod.id })

  // Aguarda Comfy via lifecycle (Pod pode já vir RUNNING do create).
  const lifecycle = await deps.lifecycle.startExistingPod({
    podId: newPod.id,
    confirmedCostPerHr: request.confirmedCostPerHr ?? newPod.costPerHr,
    dryRun: false,
    acceptBilling: true,
  })

  if (lifecycle.phase !== 'ready' || !lifecycle.baseUrl) {
    return {
      status: 'error',
      message: lifecycle.error || lifecycle.message,
      baseUrl: lifecycle.baseUrl,
      podId: newPod.id,
      podName: newPod.name,
      connection: lifecycle.comfy,
      config: deps.getConfig(),
      diagnostics: [
        ...lifecycle.diagnostics,
        'Pod de recovery criado, mas ComfyUI/LTX não validou — Pod antigo não foi parado.',
      ],
      dryRun: false,
      lifecycle,
      stoppedOriginalPodId: null,
    }
  }

  // Modelos: preferir snapshot persistente; senão inventário live.
  if (!deps.modelsPersistentlyVerified()) {
    const inspect = deps.inspectModels ?? inspectComfyPodReadOnly
    try {
      const inventory = await inspect(lifecycle.baseUrl, deps.getWorkflow())
      const present = inventory.models.filter((model) => model.present === true).length
      const required = inventory.models.length
      if (present < required) {
        return {
          status: 'error',
          message: `Novo Pod validou Comfy, mas modelos LTX incompletos (${present}/${required}). URL não trocada como pronta.`,
          baseUrl: lifecycle.baseUrl,
          podId: newPod.id,
          podName: newPod.name,
          connection: lifecycle.comfy,
          config: deps.getConfig(),
          diagnostics: inventory.notes,
          dryRun: false,
          lifecycle,
          stoppedOriginalPodId: null,
        }
      }
    } catch (error) {
      // Se Comfy nodes ok e volume montado, ainda salvamos URL mas avisamos.
      deps.log?.('gpu.recovery.model_inspect_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let config = deps.saveConfig({
    baseUrl: lifecycle.baseUrl,
    runpodPreferredPodId: newPod.id,
  })

  let stoppedOriginalPodId: string | null = null
  if (
    preview.originalCurrentlyBilling &&
    preview.originalPod?.id &&
    request.acceptStopOriginalIfRunning
  ) {
    try {
      deps.log?.('gpu.recovery.stop_original', { podId: preview.originalPod.id })
      await client.stopPod(preview.originalPod.id)
      stoppedOriginalPodId = preview.originalPod.id
    } catch (error) {
      return {
        status: 'ready',
        message:
          'ComfyUI novo conectado, mas falhou o STOP do Pod antigo — desligue-o manualmente para evitar cobrança dupla.',
        baseUrl: lifecycle.baseUrl,
        podId: newPod.id,
        podName: newPod.name,
        connection: lifecycle.comfy,
        config,
        diagnostics: [
          ...lifecycle.diagnostics,
          error instanceof Error ? error.message : String(error),
        ],
        dryRun: false,
        lifecycle,
        stoppedOriginalPodId: null,
      }
    }
  }

  return {
    status: 'ready',
    message: stoppedOriginalPodId
      ? 'Recuperação concluída: novo ComfyUI validado e Pod antigo parado (não excluído).'
      : 'Recuperação concluída: novo ComfyUI validado com Network Volume (modelos preservados).',
    baseUrl: lifecycle.baseUrl,
    podId: newPod.id,
    podName: newPod.name,
    connection: lifecycle.comfy,
    config,
    diagnostics: [
      ...lifecycle.diagnostics,
      `compat=${assessLtxPodCompatibility(newPod).level}`,
      stoppedOriginalPodId ? `stop original=${stoppedOriginalPodId}` : 'original não estava RUNNING',
    ],
    dryRun: false,
    lifecycle,
    stoppedOriginalPodId,
  }
}
