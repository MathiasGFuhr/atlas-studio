/**
 * Recuperação quando a GPU do Pod original não está disponível.
 *
 * Docs oficiais RunPod (2026):
 * - "Automatically migrate your Pod data" = console/UI (beta). Network volumes
 *   não são copiados — o Pod novo anexa o mesmo volume.
 * - REST API v2: actions = start|stop|restart|terminate; create = POST /v2/pods.
 *   Não há action/endpoint REST documentado de migrate.
 * - GraphQL: deprecated; manage-pods documenta podResumeZeroGpu, não migrate.
 *
 * Estratégia Atlas = equivalente com Network Volume via API oficial:
 * reutilizar Pod existente OU criar Pod novo no DC do volume (sem reinstalar modelos).
 */

import type { RunpodPodSummary } from './runpod'
import type { LtxRecoveryOption } from './ltxRecovery'
import { isAllowedLtxGpuId } from './ltxControlledValidation'

/** Nota técnica (logs/docs). Na UI preferir textos curtos do painel. */
export const RUNPOD_CONSOLE_MIGRATE_NOTE =
  'Equivalente ao migrate do console RunPod: Pod novo com a mesma GPU + Network Volume (modelos preservados).'

export const RECOVERY_USER_SUMMARY =
  'A GPU deste Pod está ocupada em outra máquina. Escolha como continuar — seus modelos no volume são mantidos.'

function shortGpuLabel(gpuId: string): string {
  if (/PRO 4500/i.test(gpuId) && /Server Edition/i.test(gpuId)) return 'PRO 4500 SE'
  if (/PRO 4500/i.test(gpuId)) return 'PRO 4500'
  return gpuId.replace(/^NVIDIA\s+/i, '')
}

export type ComfyGpuRecoveryOptionKind = 'reuse_existing_pod' | 'create_pod_with_network_volume'

export type ComfyGpuRecoveryOption = {
  id: string
  kind: ComfyGpuRecoveryOptionKind
  label: string
  gpuId: string
  dataCenterId: string | null
  estimatedCostPerHr: number | null
  existingPodId: string | null
  networkVolumeId: string | null
  mountPath: string | null
  image: string | null
  fitsBudget: boolean
  preservesModelsOnVolume: boolean
  willStopOriginalIfRunning: boolean
  reasons: string[]
}

export type ComfyGpuRecoveryPreview = {
  consoleMigrateAvailableViaOfficialRest: false
  consoleMigrateNote: string
  originalPod: RunpodPodSummary | null
  volumeDataCenterId: string | null
  networkVolumeId: string | null
  options: ComfyGpuRecoveryOption[]
  recommendedOptionId: string | null
  message: string
  /** Old pod is RUNNING — criar novo sem stop deixaria 2 GPUs cobrando. */
  originalCurrentlyBilling: boolean
}

export type ComfyGpuRecoveryConfirmRequest = {
  optionId: string
  confirmedCostPerHr: number | null
  dryRun: boolean
  acceptBilling: boolean
  /** Obrigatório se originalCurrentlyBilling e kind=create. */
  acceptStopOriginalIfRunning: boolean
}

export function buildComfyGpuRecoveryPreview(input: {
  originalPod: RunpodPodSummary | null
  volumeDataCenterId: string | null
  networkVolumeId: string | null
  mountPath: string | null
  image: string | null
  maxUsdPerHour: number | null
  recoveryOptions: LtxRecoveryOption[]
  availableGpuIdsInVolumeDc: string[]
}): ComfyGpuRecoveryPreview {
  const originalCurrentlyBilling = String(input.originalPod?.status || '').toUpperCase() === 'RUNNING'
  const options: ComfyGpuRecoveryOption[] = []
  const createCandidates: ComfyGpuRecoveryOption[] = []
  const dcGpuSet = new Set(input.availableGpuIdsInVolumeDc)

  for (const opt of input.recoveryOptions) {
    if (opt.kind === 'reuse_existing_pod' && opt.existingPodId) {
      if (!isAllowedLtxGpuId(opt.gpuId)) continue
      const nameFromReason = opt.reasons
        .map((line) => /Reutilizar Pod existente \S+ \((.+)\)/.exec(line)?.[1])
        .find(Boolean)
      const friendlyName = nameFromReason || opt.existingPodId.slice(0, 10)
      options.push({
        id: `reuse:${opt.existingPodId}`,
        kind: 'reuse_existing_pod',
        label: `Usar Pod existente · ${friendlyName}`,
        gpuId: opt.gpuId,
        dataCenterId: opt.dataCenterId,
        estimatedCostPerHr: opt.estimatedComputeUsdPerHour,
        existingPodId: opt.existingPodId,
        networkVolumeId: input.networkVolumeId,
        mountPath: input.mountPath,
        image: input.image,
        fitsBudget: opt.fitsBudget,
        preservesModelsOnVolume: Boolean(opt.preservesNetworkVolumeDc),
        willStopOriginalIfRunning: false,
        reasons: [`Liga o Pod parado (${shortGpuLabel(opt.gpuId)}) sem criar outro.`],
      })
      continue
    }

    if (opt.kind === 'propose_new_pod_same_dc' || opt.kind === 'propose_new_pod_any_dc') {
      if (!input.networkVolumeId || !input.volumeDataCenterId) continue
      if (!isAllowedLtxGpuId(opt.gpuId)) continue
      if (!input.image?.trim()) continue
      const listedInDc = dcGpuSet.size === 0 || dcGpuSet.has(opt.gpuId)
      const isServerEdition = /Server Edition/i.test(opt.gpuId)
      // SE costuma existir só em DCs como US-KS-2 — create no EU-RO-1 responde 400.
      if (dcGpuSet.size > 0 && !listedInDc && isServerEdition) continue
      const identicalGpu =
        Boolean(input.originalPod?.gpuType) && input.originalPod!.gpuType === opt.gpuId
      createCandidates.push({
        id: `create:${opt.gpuId}`,
        kind: 'create_pod_with_network_volume',
        label: identicalGpu
          ? `Criar Pod novo · mesma GPU (${shortGpuLabel(opt.gpuId)})`
          : `Criar Pod novo · ${shortGpuLabel(opt.gpuId)}`,
        gpuId: opt.gpuId,
        dataCenterId: input.volumeDataCenterId,
        estimatedCostPerHr: opt.estimatedComputeUsdPerHour,
        existingPodId: null,
        networkVolumeId: input.networkVolumeId,
        mountPath: input.mountPath || '/runpod-volume',
        image: input.image,
        fitsBudget: opt.fitsBudget,
        preservesModelsOnVolume: true,
        willStopOriginalIfRunning: originalCurrentlyBilling,
        reasons: [
          identicalGpu
            ? 'Igual ao “migrate” do RunPod: mesma placa e modelos no volume.'
            : 'Nova máquina com GPU compatível; modelos no volume são mantidos.',
          listedInDc
            ? 'Não apaga o Pod antigo.'
            : 'Pode falhar se não houver vaga agora — tente “Usar Pod existente” ou aguarde.',
          ...(originalCurrentlyBilling
            ? ['Se o Pod antigo estiver ligado, pediremos para pará-lo depois (evita cobrar 2 GPUs).']
            : []),
        ],
      })
    }
  }

  // Preferir: GPU idêntica ao original → listada no DC → sem Server Edition.
  createCandidates.sort((a, b) => {
    const orig = input.originalPod?.gpuType
    const aIdent = orig && a.gpuId === orig ? 0 : 1
    const bIdent = orig && b.gpuId === orig ? 0 : 1
    if (aIdent !== bIdent) return aIdent - bIdent
    const aListed = dcGpuSet.size === 0 || dcGpuSet.has(a.gpuId) ? 0 : 1
    const bListed = dcGpuSet.size === 0 || dcGpuSet.has(b.gpuId) ? 0 : 1
    if (aListed !== bListed) return aListed - bListed
    const aSe = /Server Edition/i.test(a.gpuId) ? 1 : 0
    const bSe = /Server Edition/i.test(b.gpuId) ? 1 : 0
    return aSe - bSe
  })
  const listedCreate = createCandidates.filter((row) => dcGpuSet.size === 0 || dcGpuSet.has(row.gpuId))
  const identicalCreate = createCandidates.filter(
    (row) => input.originalPod?.gpuType && row.gpuId === input.originalPod.gpuType,
  )
  const hasReusable = options.some((opt) => opt.kind === 'reuse_existing_pod')
  // Se já existe Pod com Start no console ($/h), criar outro é só fallback.
  if (!hasReusable) {
    options.push(
      ...(listedCreate.length > 0
        ? listedCreate
        : identicalCreate.length > 0
          ? identicalCreate.slice(0, 1)
          : createCandidates.slice(0, 1)),
    )
  } else if (listedCreate.length > 0 || identicalCreate.length > 0) {
    const fallback = (listedCreate[0] ?? identicalCreate[0])!
    options.push({
      ...fallback,
      label: `${fallback.label} (só se o Start do existente falhar)`,
      reasons: [
        'Só use se nenhum Pod existente ligar. No RunPod, “Start for $…/h” = religar o existente.',
        ...fallback.reasons,
      ],
    })
  }

  const recommended =
    options.find((opt) => opt.kind === 'reuse_existing_pod') ??
    options.find(
      (opt) =>
        opt.kind === 'create_pod_with_network_volume' &&
        input.originalPod?.gpuType &&
        opt.gpuId === input.originalPod.gpuType,
    ) ??
    options[0] ??
    null

  const reuseCount = options.filter((opt) => opt.kind === 'reuse_existing_pod').length

  return {
    consoleMigrateAvailableViaOfficialRest: false,
    consoleMigrateNote: RUNPOD_CONSOLE_MIGRATE_NOTE,
    originalPod: input.originalPod,
    volumeDataCenterId: input.volumeDataCenterId,
    networkVolumeId: input.networkVolumeId,
    options,
    recommendedOptionId: recommended?.id ?? null,
    message: options.length
      ? reuseCount > 0
        ? 'Há Pod parado com a mesma GPU. Religue esse (como “Start” no RunPod) — não precisa criar outro.'
        : RECOVERY_USER_SUMMARY
      : 'Sem opção disponível agora. Tente de novo em alguns minutos ou use outro Pod PRO 4500 na conta.',
    originalCurrentlyBilling,
  }
}
