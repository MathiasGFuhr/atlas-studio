/**
 * Fase 4 — recuperação quando a GPU original não está disponível.
 * Apenas planejamento/dry-run: propõe até 3 opções; não cria Pod.
 */

import type { RunpodGpuCatalogEntry, RunpodPodSummary } from './runpod'
import type { LtxEnvironmentPlan } from './ltxEnvironment'
import { assessLtxPodCompatibility } from './runpodLtxCompat'
import {
  isAllowedLtxGpuId,
  isRejectedLtxGpuId,
  resolveLtxPreferredGpuOrder,
} from './ltxControlledValidation'
import { scoreLtxComfyPod } from './ltxAutoDetect'

export type LtxGpuUnavailableReason =
  | 'pod_terminated'
  | 'gpu_not_in_catalog'
  | 'gpu_unavailable'
  | 'vram_insufficient'
  | 'over_budget'
  | 'start_not_allowed'
  | 'unknown'

export type LtxRecoveryOption = {
  priority: 1 | 2 | 3
  kind: 'reuse_existing_pod' | 'propose_new_pod_same_dc' | 'propose_new_pod_any_dc'
  gpuId: string
  memoryGb: number | null
  priceUsd: number | null
  availability: string | null
  dataCenterId: string | null
  /** Pod existente reutilizável (se kind = reuse). */
  existingPodId: string | null
  fitsBudget: boolean
  fitsVram: boolean
  preservesNetworkVolumeDc: boolean | null
  reasons: string[]
  /** Custo estimado só de compute; armazenamento é separado. */
  estimatedComputeUsdPerHour: number | null
}

export type LtxGpuRecoveryPlan = {
  dryRun: true
  mutationCalls: 0
  originalPodId: string | null
  originalGpuId: string | null
  unavailable: boolean
  reasons: LtxGpuUnavailableReason[]
  detail: string[]
  options: LtxRecoveryOption[]
  /** Sem API equivalente confirmada ao botão “Migrate Pod” do painel. */
  consoleMigrateCaveat: string
  paidActionsRequiringApproval: string[]
}

function priceFor(
  entry: RunpodGpuCatalogEntry,
  cloud: LtxEnvironmentPlan['preferredCloud'],
): number | null {
  if (cloud === 'COMMUNITY') return entry.communityPrice
  return entry.securePrice ?? entry.communityPrice
}

function availabilityLooksDown(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.toUpperCase()
  return (
    normalized === 'NONE' ||
    normalized === 'UNAVAILABLE' ||
    normalized === 'OUT_OF_STOCK' ||
    normalized === '0' ||
    normalized.includes('UNAVAIL')
  )
}

/**
 * Detecta se a GPU/Pod original não serve mais e propõe até 3 alternativas
 * dentro do teto de custo e VRAM mínima do plano.
 */
export function planLtxGpuRecovery(input: {
  plan: LtxEnvironmentPlan
  preferredPodId: string | null
  pods: RunpodPodSummary[]
  catalog: RunpodGpuCatalogEntry[]
}): LtxGpuRecoveryPlan {
  const consoleMigrateCaveat =
    'Docs oficiais: “Automatically migrate your Pod data” é console/UI (beta). REST v2 não documenta migrate (actions: start|stop|restart|terminate; create: POST /v2/pods). Com Network Volume, o equivalente oficial é criar/reutilizar Pod no mesmo DC anexando o volume — sem recopiar modelos.'

  const preferredId = input.preferredPodId?.trim() || null
  const original =
    (preferredId ? input.pods.find((pod) => pod.id === preferredId) : null) ??
    input.pods.find((pod) => /comfy|ltx/i.test(`${pod.name} ${pod.image ?? ''}`)) ??
    null

  const originalGpuId = original?.gpuType ?? input.plan.primaryGpuId
  const reasons: LtxGpuUnavailableReason[] = []
  const detail: string[] = []

  if (!original) {
    reasons.push('unknown')
    detail.push('Pod preferido/LTX não encontrado na lista atual da conta.')
  } else {
    const status = String(original.status || '').toUpperCase()
    if (status === 'TERMINATED') {
      reasons.push('pod_terminated')
      detail.push(`Pod ${original.id} está TERMINATED — não pode ser reiniciado.`)
    }
    const compat = assessLtxPodCompatibility(original, input.catalog)
    if (!compat.startAllowedByApi && status !== 'RUNNING' && status !== 'PROVISIONING' && status !== 'STARTING') {
      reasons.push('start_not_allowed')
      detail.push(`Start não permitido no status ${status || 'desconhecido'}.`)
    }
    if (compat.vramGb != null && compat.vramGb < input.plan.minVramGb) {
      reasons.push('vram_insufficient')
      detail.push(`VRAM ${compat.vramGb} GB < mínimo ${input.plan.minVramGb} GB.`)
    }
  }

  if (originalGpuId) {
    const catalogHit = input.catalog.find((gpu) => gpu.id === originalGpuId || gpu.name === originalGpuId)
    if (!catalogHit) {
      reasons.push('gpu_not_in_catalog')
      detail.push(`GPU ${originalGpuId} ausente no catálogo atual.`)
    } else if (availabilityLooksDown(catalogHit.availability)) {
      reasons.push('gpu_unavailable')
      detail.push(`Catálogo reporta disponibilidade ${catalogHit.availability} para ${originalGpuId}.`)
    }
    const price = catalogHit ? priceFor(catalogHit, input.plan.preferredCloud) : null
    if (
      input.plan.maxUsdPerHour != null &&
      price != null &&
      price > input.plan.maxUsdPerHour
    ) {
      reasons.push('over_budget')
      detail.push(`Preço atual US$ ${price}/h acima do teto US$ ${input.plan.maxUsdPerHour}/h.`)
    }
  }

  const unavailable = reasons.length > 0
  const preferredDc =
    input.plan.preferredDataCenterId || original?.dataCenterId || null
  const maxUsd = input.plan.maxUsdPerHour
  const minVram = input.plan.minVramGb

  const options: LtxRecoveryOption[] = []

  // 1) Religar Pods existentes (PRO 4500) — inclui o original se ainda tiver Start.
  // No console, “Start for $0.72/h” = esse caminho; não criar Pod novo à toa.
  const reusable = input.pods
    .filter((pod) => isAllowedLtxGpuId(pod.gpuType))
    .map((pod) => ({ pod, compat: assessLtxPodCompatibility(pod, input.catalog) }))
    .filter(({ compat, pod }) => {
      if (compat.level === 'block' && !compat.canStart && String(pod.status).toUpperCase() !== 'RUNNING') {
        return false
      }
      if (compat.vramGb != null && compat.vramGb < minVram) return false
      if (maxUsd != null && pod.costPerHr != null && pod.costPerHr > maxUsd) return false
      return compat.hasComfyPort && compat.canStart
    })
    .sort((a, b) => {
      const scoreDiff =
        scoreLtxComfyPod(b.pod, {
          volumeDc: preferredDc,
          preferredId: input.preferredPodId,
        }) -
        scoreLtxComfyPod(a.pod, {
          volumeDc: preferredDc,
          preferredId: input.preferredPodId,
        })
      if (scoreDiff !== 0) return scoreDiff
      return (a.pod.costPerHr ?? 999) - (b.pod.costPerHr ?? 999)
    })

  for (const { pod, compat } of reusable.slice(0, 2)) {
    const isOriginal = pod.id === original?.id
    options.push({
      priority: (options.length + 1) as 1 | 2 | 3,
      kind: 'reuse_existing_pod',
      gpuId: pod.gpuType ?? '(desconhecida)',
      memoryGb: compat.vramGb,
      priceUsd: pod.costPerHr,
      availability: String(pod.status),
      dataCenterId: pod.dataCenterId,
      existingPodId: pod.id,
      fitsBudget: maxUsd == null || pod.costPerHr == null ? true : pod.costPerHr <= maxUsd,
      fitsVram: compat.vramGb == null ? true : compat.vramGb >= minVram,
      preservesNetworkVolumeDc:
        preferredDc && pod.dataCenterId ? pod.dataCenterId === preferredDc : null,
      reasons: [
        isOriginal
          ? `Religar o mesmo Pod (${pod.name}) — como “Start” no console RunPod.`
          : `Reutilizar Pod existente ${pod.id} (${pod.name}) — sem criar recurso novo.`,
        ...(compat.warnings.length ? compat.warnings : []),
      ],
      estimatedComputeUsdPerHour: pod.costPerHr,
    })
  }

  // 2–3) Mesma lógica do console “Automatically migrate”:
  // novo Pod com a GPU idêntica ao original, no DC do volume (Network Volume anexa).
  // Sem fallback barato (L4/4000/4090). Sem API REST de migrate — só POST /v2/pods.
  const preferredOrder = [
    originalGpuId && isAllowedLtxGpuId(originalGpuId) ? originalGpuId : null,
    ...resolveLtxPreferredGpuOrder(input.plan),
  ].filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index)

  const catalogCandidates = preferredOrder
    .map((id) => {
      const hit = input.catalog.find((gpu) => gpu.id === id || gpu.name === id)
      if (hit) return hit
      // GPU do Pod original pode não estar “HIGH” no catálogo — ainda assim é a spec idêntica.
      if (id === originalGpuId) {
        return {
          id,
          name: id,
          memoryGb: original?.gpuMemoryGb ?? null,
          securePrice: original?.costPerHr ?? null,
          communityPrice: null,
          availability: 'LOW',
        } satisfies RunpodGpuCatalogEntry
      }
      return null
    })
    .filter(Boolean) as RunpodGpuCatalogEntry[]

  // Não misturar com GPU de reuse — migrate precisa poder criar a mesma placa do original.
  const seenCreateGpu = new Set<string>()
  for (const gpu of catalogCandidates) {
    if (options.length >= 3) break
    if (seenCreateGpu.has(gpu.id)) continue
    if (isRejectedLtxGpuId(gpu.id)) continue
    const price = priceFor(gpu, input.plan.preferredCloud) ?? original?.costPerHr ?? null
    if (maxUsd != null && price != null && price > maxUsd) continue
    if (gpu.memoryGb != null && gpu.memoryGb < minVram) continue
    seenCreateGpu.add(gpu.id)
    const sameDc = Boolean(preferredDc)
    const identicalToOriginal = Boolean(originalGpuId && gpu.id === originalGpuId)
    options.push({
      priority: (options.length + 1) as 1 | 2 | 3,
      kind: sameDc ? 'propose_new_pod_same_dc' : 'propose_new_pod_any_dc',
      gpuId: gpu.id,
      memoryGb: gpu.memoryGb,
      priceUsd: price,
      availability: gpu.availability,
      dataCenterId: preferredDc,
      existingPodId: null,
      fitsBudget: maxUsd == null || price == null ? true : price <= maxUsd,
      fitsVram: gpu.memoryGb == null ? true : gpu.memoryGb >= minVram,
      preservesNetworkVolumeDc: preferredDc ? true : null,
      reasons: [
        identicalToOriginal
          ? 'Equivalente ao “Automatically migrate your Pod data” do console: novo Pod com a mesma GPU.'
          : 'Proposta de Pod novo com GPU da família LTX (PRO 4500).',
        preferredDc
          ? `DC ${preferredDc} para anexar o Network Volume (o volume não é copiado — anexa o mesmo).`
          : 'Datacenter ainda não fixado no plano.',
        'REST v2 não tem action migrate — o Atlas usa POST /v2/pods + mounts.network.',
      ],
      estimatedComputeUsdPerHour: price,
    })
  }

  const paidActionsRequiringApproval: string[] = []
  if (options.some((opt) => opt.kind !== 'reuse_existing_pod')) {
    paidActionsRequiringApproval.push(
      'Criar Pod novo com GPU compatível (compute horário) — bloqueado até autorização.',
    )
  }
  if (input.plan.storageStrategy === 'network_volume' && !input.plan.networkVolumeId) {
    paidActionsRequiringApproval.push(
      'Criar Network Volume no datacenter alvo (armazenamento contínuo) — bloqueado até autorização.',
    )
  }
  paidActionsRequiringApproval.push(
    'Copiar modelos para volume / build&push de imagem Docker — só após aprovação e inventário confirmado.',
  )

  return {
    dryRun: true,
    mutationCalls: 0,
    originalPodId: original?.id ?? preferredId,
    originalGpuId,
    unavailable,
    reasons: [...new Set(reasons)],
    detail,
    options: options.slice(0, 3).map((opt, index) => ({
      ...opt,
      priority: (index + 1) as 1 | 2 | 3,
    })),
    consoleMigrateCaveat,
    paidActionsRequiringApproval,
  }
}
