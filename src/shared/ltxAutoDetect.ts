/**
 * Detecção automática do ambiente LTX-2.3 (somente leitura / dry-run).
 * Não provisiona recursos pagos.
 */

import { LTX_IA2V_OFFICIAL_MODEL_ASSETS, type LtxEnvironmentPlan } from './ltxEnvironment'
import type { RunpodGpuCatalogEntry, RunpodNetworkVolumeSummary, RunpodPodSummary } from './runpod'
import { LTX_MINIMUM_VRAM_GB, evaluateComfyNodeReadiness, workflowRequiredClassTypes } from './runpodLtxCompat'
import type { ComfyApiWorkflow } from './comfy'
import { analyzeLtxWorkflow } from './ltxWorkflowAnalysis'
import type { LtxModelsInspectionStatus, LtxVolumeModelMatch } from './runpodS3'
import {
  isRejectedLtxGpuId,
  resolveLtxPreferredGpuOrder,
} from './ltxControlledValidation'

export type LtxModelStorageKind = 'network_volume' | 'container_disk' | 'unknown'

export type LtxDetectedModel = {
  role: string
  fileName: string
  folder: string
  present: boolean
  absolutePath: string | null
  sizeBytes: number | null
  sizeGib: number | null
  storageKind: LtxModelStorageKind
  onSelectedNetworkVolume: boolean | null
}

export type LtxGpuRecommendation = {
  priority: 1 | 2 | 3
  gpuId: string
  label: string
  memoryGb: number | null
  priceUsd: number | null
  availability: string | null
  dataCenterId: string | null
  fitsVram: boolean
  fitsBudget: boolean
  volumeCompatible: boolean
  kind: 'existing_validated_pod' | 'catalog_same_dc' | 'catalog_other'
  existingPodId: string | null
  reasons: string[]
}

export type LtxComfyEnvironmentKind =
  | 'existing_verified'
  | 'image_identified'
  | 'reproducible_validated'
  | 'not_ready_for_provisioning'

export type LtxComfyPowerState = 'online' | 'offline' | 'unknown'

export type LtxWorkflowStatus = 'validated' | 'pending_runtime' | 'incompatible' | 'missing'

export type LtxVolumeMountBinding = {
  podId: string
  podName: string
  podStatus: string
  volumeId: string
  mountPath: string
}

export type LtxAutoDetectResult = {
  fetchedAt: string
  dryRun: true
  mutationCalls: 0
  accountFingerprint: string | null
  runpodConnected: boolean
  hasS3Credentials: boolean
  pods: Array<Pick<RunpodPodSummary, 'id' | 'name' | 'status' | 'gpuType' | 'dataCenterId' | 'costPerHr' | 'hasComfyPort' | 'image'>>
  networkVolumes: RunpodNetworkVolumeSummary[]
  selectedVolume: RunpodNetworkVolumeSummary | null
  storage: {
    found: boolean
    accessible: boolean
    volumeId: string | null
    volumeName: string | null
    dataCenterId: string | null
    sizeGb: number | null
    s3Endpoint: string | null
    accessSource: 's3' | 'comfy_mount' | 'none'
    accessMessage: string
  }
  volumeMountBindings: LtxVolumeMountBinding[]
  ltxPod: {
    id: string
    name: string
    status: string
    dataCenterId: string | null
    gpuType: string | null
    costPerHr: number | null
    image: string | null
    comfyProxyUrl: string | null
    networkMounts: Array<{ volumeId: string; path: string }>
    persistentMountPath: string | null
    linkedToSelectedVolume: boolean
  } | null
  comfy: {
    accessible: boolean
    powerState: LtxComfyPowerState
    version: string | null
    pytorchVersion: string | null
    pythonVersion: string | null
    gpuName: string | null
    vramTotalGb: number | null
    environmentKind: LtxComfyEnvironmentKind
    dockerImageField: string | null
    dockerImageIsPlaceholder: boolean
    message: string
  }
  workflow: {
    present: boolean
    name: string
    nodeCount: number
    hasLtxMarker: boolean
    classTypesOk: boolean
    classTypesPending: boolean
    status: LtxWorkflowStatus
    missingClassTypes: string[]
  }
  models: LtxDetectedModel[]
  volumeModels: LtxVolumeModelMatch[]
  modelsSummary: {
    required: number
    /** null quando a inspeção não ocorreu — nunca tratar como 0 ausentes. */
    present: number | null
    inspectionStatus: LtxModelsInspectionStatus
    inspectionSource: 's3' | 'comfy' | 'none'
    onNetworkVolume: number
    onContainerDiskOnly: number
    persistentReady: boolean
    label: string
    warning: string | null
    checks: string[]
  }
  gpuRecommendations: LtxGpuRecommendation[]
  readiness: {
    readyForLipsync: boolean
    readyForRecoveryOnOtherPod: boolean
    summary: string
    validated: string[]
    pending: string[]
    blockers: string[]
  }
  /** Plano sugerido a partir da detecção (ainda dry-run). */
  suggestedPlan: Partial<LtxEnvironmentPlan>
  /** Metadados de persistência — não confundir com runtime Comfy. */
  persistence: {
    savedAt: string | null
    inventoryVerifiedAt: string | null
    fromStoredInventory: boolean
    lastFullScanAt: string | null
    environmentConfigured: boolean
    modelsPersistentlyVerified: boolean
  }
  futureLipsyncIntegration: {
    prepared: true
    autoStartPod: false
    autoShutdown: false
    notes: string[]
  }
}

export function classifyModelStoragePath(
  absolutePath: string | null,
  networkMounts: Array<{ volumeId: string; path: string }>,
  selectedVolumeId: string | null,
): { storageKind: LtxModelStorageKind; onSelectedNetworkVolume: boolean | null } {
  if (!absolutePath) return { storageKind: 'unknown', onSelectedNetworkVolume: null }
  const normalized = absolutePath.replace(/\\/g, '/')
  const mountHit = networkMounts.find((mount) => {
    const mountPath = mount.path.replace(/\/+$/, '')
    return normalized === mountPath || normalized.startsWith(`${mountPath}/`)
  })
  if (mountHit) {
    return {
      storageKind: 'network_volume',
      onSelectedNetworkVolume: selectedVolumeId ? mountHit.volumeId === selectedVolumeId : null,
    }
  }
  if (
    normalized.startsWith('/runpod-volume/') ||
    normalized === '/runpod-volume' ||
    normalized.startsWith('/workspace/') ||
    normalized.startsWith('/ComfyUI/')
  ) {
    // /runpod-volume sem mounts na API ainda pode ser NV; sem mounts confirmados = unknown/container
    if (normalized.startsWith('/runpod-volume')) {
      return {
        storageKind: networkMounts.length > 0 ? 'network_volume' : 'unknown',
        onSelectedNetworkVolume: null,
      }
    }
    return { storageKind: 'container_disk', onSelectedNetworkVolume: false }
  }
  return { storageKind: 'unknown', onSelectedNetworkVolume: null }
}

/** Pontuação para escolher Pod LTX — prioriza religar existente (ex.: …-migration) em vez de criar. */
export function scoreLtxComfyPod(
  pod: RunpodPodSummary,
  options?: { volumeDc?: string | null; preferredId?: string | null },
): number {
  const status = String(pod.status || '').toUpperCase()
  const actions = (pod.actions ?? []).map((a) => String(a).toLowerCase())
  const blob = `${pod.name} ${pod.image ?? ''} ${pod.gpuType ?? ''}`.toLowerCase()
  let score = 0

  if (!pod.hasComfyPort) return -1000
  if (status === 'TERMINATED') return -1000

  if (status === 'RUNNING') score += 100
  else if (status === 'STARTING' || status === 'PROVISIONING') score += 80
  else if (status === 'EXITED' && (actions.includes('start') || actions.length === 0)) score += 60
  else if (status === 'EXITED') score += 20

  if (/pro 4500|rtx pro 4500/.test(blob)) score += 45
  else if (/4500/.test(blob)) score += 35
  if (/migration|migrat|recovered|recovery/.test(blob)) score += 30
  if (/ltx|comfy/.test(blob)) score += 20
  if (options?.volumeDc && pod.dataCenterId === options.volumeDc) score += 20
  if (options?.preferredId && pod.id === options.preferredId) score += 12
  if (pod.comfyProxyUrl) score += 5
  if (pod.networkMounts?.length) score += 8
  return score
}

export function pickLtxComfyPod(
  pods: RunpodPodSummary[],
  options?: { volumeDc?: string | null; preferredId?: string | null },
): RunpodPodSummary | null {
  const scored = pods
    .filter((pod) => pod.hasComfyPort)
    .map((pod) => ({ pod, score: scoreLtxComfyPod(pod, options) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.pod ?? null
}

export function pickPreferredNetworkVolume(
  volumes: RunpodNetworkVolumeSummary[],
  preferredPodDc: string | null,
  preferredVolumeId?: string | null,
): RunpodNetworkVolumeSummary | null {
  if (preferredVolumeId) {
    const hit = volumes.find((volume) => volume.id === preferredVolumeId)
    if (hit) return hit
  }
  if (volumes.length === 0) return null
  if (preferredPodDc) {
    const sameDc = volumes.filter((volume) => volume.dataCenterId === preferredPodDc)
    if (sameDc.length === 1) return sameDc[0]
    if (sameDc.length > 1) {
      return [...sameDc].sort((a, b) => (b.sizeGb ?? 0) - (a.sizeGb ?? 0))[0]
    }
  }
  return [...volumes].sort((a, b) => (b.sizeGb ?? 0) - (a.sizeGb ?? 0))[0]
}

function priceOf(entry: RunpodGpuCatalogEntry, cloud: LtxEnvironmentPlan['preferredCloud']) {
  if (cloud === 'COMMUNITY') return entry.communityPrice
  return entry.securePrice ?? entry.communityPrice
}

export function recommendGpusForLtx(input: {
  plan: LtxEnvironmentPlan
  catalog: RunpodGpuCatalogEntry[]
  selectedVolume: RunpodNetworkVolumeSummary | null
  ltxPod: RunpodPodSummary | null
  dataCenterGpuAvailability: Array<{
    dataCenterId: string
    gpus: Array<{ id: string; availability: string }>
  }>
}): LtxGpuRecommendation[] {
  const maxUsd = input.plan.maxUsdPerHour
  const minVram = input.plan.minVramGb || LTX_MINIMUM_VRAM_GB
  const volumeDc = input.selectedVolume?.dataCenterId ?? null
  const out: LtxGpuRecommendation[] = []

  if (input.ltxPod?.gpuType) {
    const catalogHit = input.catalog.find(
      (gpu) => gpu.id === input.ltxPod!.gpuType || gpu.name === input.ltxPod!.gpuType,
    )
    const memoryGb = catalogHit?.memoryGb ?? input.ltxPod.gpuMemoryGb
    const priceUsd =
      input.ltxPod.costPerHr ?? (catalogHit ? priceOf(catalogHit, input.plan.preferredCloud) : null)
    const volumeCompatible =
      !volumeDc || !input.ltxPod.dataCenterId ? false : volumeDc === input.ltxPod.dataCenterId
    out.push({
      priority: 1,
      gpuId: input.ltxPod.gpuType,
      label: catalogHit?.name || input.ltxPod.gpuType,
      memoryGb,
      priceUsd,
      availability: String(input.ltxPod.status),
      dataCenterId: input.ltxPod.dataCenterId,
      fitsVram: memoryGb == null ? true : memoryGb >= minVram,
      fitsBudget: maxUsd == null || priceUsd == null ? true : priceUsd <= maxUsd,
      volumeCompatible,
      kind: 'existing_validated_pod',
      existingPodId: input.ltxPod.id,
      reasons: [
        'Pod Comfy/LTX existente preferencial.',
        volumeCompatible
          ? 'Mesmo DC do Network Volume selecionado.'
          : volumeDc
            ? `DC do Pod (${input.ltxPod.dataCenterId}) ≠ DC do volume (${volumeDc}) — modelos no volume não anexam a este Pod.`
            : 'Sem volume selecionado para cruzar DC.',
      ],
    })
  }

  const targetDc = volumeDc || input.ltxPod?.dataCenterId || input.plan.preferredDataCenterId
  const dcAvail =
    input.dataCenterGpuAvailability.find((row) => row.dataCenterId === targetDc)?.gpus ?? []

  const preferredOrder = resolveLtxPreferredGpuOrder(input.plan)
  const preferenceRank = (gpuId: string) => {
    const exact = preferredOrder.indexOf(gpuId)
    if (exact >= 0) return exact
    // Família 4500 fica à frente de qualquer “mais barata” (ex.: PRO 4000).
    if (/PRO 4500/i.test(gpuId)) return preferredOrder.length
    return preferredOrder.length + 50
  }

  const candidates = input.catalog
    .filter((gpu) => (gpu.memoryGb ?? 0) >= minVram)
    .filter((gpu) => gpu.availability !== 'NONE')
    .filter((gpu) => !isRejectedLtxGpuId(gpu.id))
    .filter((gpu) => preferredOrder.includes(gpu.id) || /PRO 4500/i.test(gpu.id))
    .map((gpu) => {
      const price = priceOf(gpu, input.plan.preferredCloud)
      const dcHit = dcAvail.find((row) => row.id === gpu.id)
      const volumeCompatible = Boolean(targetDc && dcHit && dcHit.availability !== 'NONE')
      return { gpu, price, dcHit, volumeCompatible }
    })
    .filter((row) => (maxUsd == null || row.price == null ? true : row.price <= maxUsd))
    // Preferidos PRO 4500 entram mesmo se o DC marcar escassez (LOW/ausente).
    .filter((row) => (targetDc ? row.volumeCompatible || preferredOrder.includes(row.gpu.id) : true))
    .sort((a, b) => {
      const rankDiff = preferenceRank(a.gpu.id) - preferenceRank(b.gpu.id)
      if (rankDiff !== 0) return rankDiff
      return (a.price ?? 999) - (b.price ?? 999)
    })

  for (const row of candidates) {
    if (out.length >= 3) break
    if (out.some((item) => item.gpuId === row.gpu.id)) continue
    out.push({
      priority: (out.length + 1) as 1 | 2 | 3,
      gpuId: row.gpu.id,
      label: row.gpu.name,
      memoryGb: row.gpu.memoryGb,
      priceUsd: row.price,
      availability: row.dcHit?.availability ?? row.gpu.availability,
      dataCenterId: targetDc,
      fitsVram: true,
      fitsBudget: maxUsd == null || row.price == null ? true : row.price <= maxUsd,
      volumeCompatible: row.volumeCompatible,
      kind: targetDc ? 'catalog_same_dc' : 'catalog_other',
      existingPodId: null,
      reasons: [
        targetDc ? `Compatível com DC ${targetDc} (volume/modelos).` : 'Sem DC de volume fixado.',
        row.price != null ? `Preço catálogo US$ ${row.price}/h.` : 'Preço indisponível.',
      ],
    })
  }

  return out.slice(0, 3).map((row, index) => ({ ...row, priority: (index + 1) as 1 | 2 | 3 }))
}

export function buildModelsSummaryLabel(input: {
  inspectionStatus: LtxModelsInspectionStatus
  present: number | null
  required: number
}): string {
  if (input.inspectionStatus === 'pending_credentials') {
    return 'Verificação pendente — cadastre a chave S3 para inspecionar o volume com a GPU desligada'
  }
  if (input.inspectionStatus === 'pending_unreachable') {
    return 'Verificação pendente — armazenamento não acessível agora'
  }
  if (input.inspectionStatus === 'not_attempted') {
    return 'Inspeção de modelos ainda não realizada'
  }
  if (input.present == null) return 'Estado dos modelos indeterminado'
  if (input.inspectionStatus === 'found') return `Modelos encontrados: ${input.present}/${input.required}`
  return `Modelos incompletos: ${input.present}/${input.required}`
}

export function buildLtxAutoDetectReadiness(input: {
  runpodConnected: boolean
  comfyAccessible: boolean
  comfyPowerState: LtxComfyPowerState
  workflowStatus: LtxWorkflowStatus
  modelsPresent: number | null
  modelsRequired: number
  modelsInspectionStatus: LtxModelsInspectionStatus
  persistentReady: boolean
  hasVolume: boolean
  storageAccessible: boolean
  gpuOk: boolean
  volumeLinkedToPod: boolean
}): LtxAutoDetectResult['readiness'] {
  const validated: string[] = []
  const pending: string[] = []
  const blockers: string[] = []

  if (!input.runpodConnected) blockers.push('Conecte a chave da API Runpod da sua conta.')
  else validated.push('Conta Runpod autenticada (GET only).')

  if (input.comfyAccessible) validated.push('ComfyUI online (/system_stats).')
  else if (input.comfyPowerState === 'offline') {
    pending.push('ComfyUI offline — inicie o Pod para testar a execução (não implica ausência de modelos).')
  } else {
    pending.push('ComfyUI indisponível ou URL inválida — status de execução pendente.')
  }

  if (input.workflowStatus === 'validated') validated.push('Workflow LTX validado (marcador + nós no ComfyUI).')
  else if (input.workflowStatus === 'pending_runtime') {
    pending.push('Workflow com marcador LTX — validação de nós no runtime pendente (ComfyUI offline).')
  } else if (input.workflowStatus === 'missing') {
    blockers.push('Importe o workflow LTX IA2V.')
  } else {
    blockers.push('Workflow incompatível com LTX-2.3 (evidência concreta de marcador/nós ausentes).')
  }

  if (input.modelsInspectionStatus === 'found' && input.modelsPresent === input.modelsRequired) {
    validated.push(`Arquivos LTX localizados (${input.modelsPresent}/${input.modelsRequired}).`)
  } else if (input.modelsInspectionStatus === 'incomplete' && input.modelsPresent != null) {
    blockers.push(`Modelos incompletos após inspeção (${input.modelsPresent}/${input.modelsRequired}).`)
  } else if (input.modelsInspectionStatus === 'pending_credentials') {
    pending.push(
      'Credenciais S3 ausentes — necessárias para verificar modelos no Network Volume com a GPU desligada.',
    )
  } else if (input.modelsInspectionStatus === 'pending_unreachable') {
    pending.push('Inspeção de modelos pendente: armazenamento não acessível.')
  } else {
    pending.push('Inspeção de modelos ainda não concluída.')
  }

  if (input.persistentReady) validated.push('Modelos confirmados no Network Volume (persistente).')
  else if (input.modelsInspectionStatus === 'found') {
    pending.push('Arquivos encontrados, mas persistência/volume ainda não cruzados completamente.')
  }

  if (!input.hasVolume) pending.push('Nenhum Network Volume na conta — prepare armazenamento persistente.')
  else if (!input.storageAccessible) {
    pending.push('Storage encontrado, porém ainda não acessível para listagem de arquivos.')
  }
  if (!input.volumeLinkedToPod) {
    pending.push('Nenhum Pod da conta está montado no Network Volume selecionado (mount API).')
  }
  if (!input.gpuOk) pending.push('GPU recomendada ainda não atende VRAM/orçamento/volume.')

  const modelsReady =
    input.modelsInspectionStatus === 'found' &&
    input.modelsPresent === input.modelsRequired &&
    input.modelsRequired > 0

  const readyForLipsync =
    input.runpodConnected &&
    input.comfyAccessible &&
    (input.workflowStatus === 'validated' || input.workflowStatus === 'pending_runtime') &&
    modelsReady

  const readyForRecoveryOnOtherPod =
    input.runpodConnected &&
    input.hasVolume &&
    input.persistentReady &&
    modelsReady &&
    input.workflowStatus !== 'incompatible' &&
    input.workflowStatus !== 'missing'

  return {
    readyForLipsync,
    readyForRecoveryOnOtherPod,
    summary: readyForLipsync
      ? input.persistentReady
        ? 'Pronto para gerar LipSync (ambiente verificado + modelos persistentes).'
        : 'Pronto para gerar LipSync no Pod atual — confirme persistência no volume para recuperação.'
      : readyForRecoveryOnOtherPod
        ? 'Modelos persistentes ok — inicie um Pod compatível para gerar LipSync.'
        : 'Ambiente ainda não está pronto para LipSync.',
    validated,
    pending,
    blockers,
  }
}

export function analyzeWorkflowForDetect(
  workflow: ComfyApiWorkflow | null,
  workflowName: string,
  availableClassTypes: string[],
  comfyAccessible: boolean,
) {
  const analysis = analyzeLtxWorkflow(workflow)
  const required = workflowRequiredClassTypes(workflow)
  const classTypesPending = Boolean(workflow) && analysis.hasLtxMarker && !comfyAccessible
  const readiness = availableClassTypes.length
    ? evaluateComfyNodeReadiness(availableClassTypes, required)
    : {
        ok: false,
        present: [] as string[],
        missing: required,
        hasLtxMarker: analysis.hasLtxMarker,
        message: 'object_info indisponível',
      }

  let status: LtxWorkflowStatus = 'missing'
  if (!workflow) status = 'missing'
  else if (!analysis.hasLtxMarker) status = 'incompatible'
  else if (comfyAccessible && !readiness.ok) status = 'incompatible'
  else if (!comfyAccessible) status = 'pending_runtime'
  else status = 'validated'

  return {
    present: Boolean(workflow),
    name: workflowName,
    nodeCount: analysis.nodeCount,
    hasLtxMarker: analysis.hasLtxMarker,
    classTypesOk: readiness.ok,
    classTypesPending,
    status,
    missingClassTypes: classTypesPending ? [] : readiness.missing,
    officialFiles: LTX_IA2V_OFFICIAL_MODEL_ASSETS.map((asset) => ({
      role: asset.role,
      fileName: asset.expectedFileName,
      folder: asset.relativeDir.replace(/^models\//, ''),
    })),
  }
}

export function resolveComfyEnvironmentKind(input: {
  accessible: boolean
  image: string | null
  templatePinned: boolean
  templateImage: string
}): { kind: LtxComfyEnvironmentKind; dockerImageField: string | null; dockerImageIsPlaceholder: boolean } {
  const image = input.image?.trim() || null
  const planImage = input.templateImage.trim()
  const isPlaceholder = !planImage || /pending-pin|pending-build/i.test(planImage)
  if (!input.accessible) {
    return {
      kind: 'not_ready_for_provisioning',
      dockerImageField: isPlaceholder ? null : planImage,
      dockerImageIsPlaceholder: isPlaceholder,
    }
  }
  if (input.templatePinned && !isPlaceholder) {
    return {
      kind: 'reproducible_validated',
      dockerImageField: planImage,
      dockerImageIsPlaceholder: false,
    }
  }
  if (image) {
    return {
      kind: 'image_identified',
      dockerImageField: image,
      dockerImageIsPlaceholder: false,
    }
  }
  return {
    kind: 'existing_verified',
    dockerImageField: null,
    dockerImageIsPlaceholder: true,
  }
}
