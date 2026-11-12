/**
 * Fase 3 — plano de ambiente persistente/reproduzível LTX-2.3.
 * Apenas configuração, auditoria e dry-run. Sem provisionar recursos pagos.
 */

import type { ComfyApiWorkflow } from './comfy'
import type { RunpodGpuCatalogEntry, RunpodNetworkVolumeSummary, RunpodPodSummary } from './runpod'
import { LTX_MINIMUM_VRAM_GB, LTX_RECOMMENDED_VRAM_GB, workflowRequiredClassTypes } from './runpodLtxCompat'

/** GPU validada no fluxo LTX (32 GB). Não confundir com PRO 4000. */
export const LTX_DEFAULT_PRIMARY_GPU_ID = 'NVIDIA RTX PRO 4500 Blackwell'
export const LTX_DEFAULT_ALTERNATE_GPU_ID = 'NVIDIA RTX PRO 4500 Blackwell Server Edition'

function isRejectedStoredLtxGpuId(gpuId: string): boolean {
  return /RTX PRO 4000\b/i.test(gpuId) || /GeForce RTX 40\d0\b/i.test(gpuId)
}

function sanitizeLtxGpuId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || null
  if (!trimmed || isRejectedStoredLtxGpuId(trimmed)) return null
  return trimmed
}

export type LtxEvidenceLevel =
  | 'confirmed_in_repo'
  | 'confirmed_official_docs'
  | 'needs_pod_inspection'
  | 'needs_user_validation'
  | 'unknown'

export type LtxEvidenceItem = {
  id: string
  label: string
  value: string
  evidence: LtxEvidenceLevel
  notes?: string
}

export type LtxModelAsset = {
  id: string
  role: 'checkpoint' | 'lora' | 'text_encoder' | 'upscaler' | 'other'
  /** Nome de arquivo esperado (oficial IA2V); pode diferir no disco do usuário. */
  expectedFileName: string
  relativeDir: string
  evidence: LtxEvidenceLevel
  notes?: string
}

export type LtxStorageStrategy = 'network_volume' | 'global_volume' | 'pod_disk_only' | 'undecided'

export type LtxEnvironmentPlan = {
  /** Sempre true nesta fase: nenhum create/start de volume/pod. */
  dryRunOnly: boolean
  /** Fingerprint sha256 truncado da chave RunPod — nunca a chave em si. */
  accountFingerprint: string | null
  templateImage: string
  templateTagPinned: boolean
  containerPort: number
  storageStrategy: LtxStorageStrategy
  preferredDataCenterId: string | null
  networkVolumeId: string | null
  networkVolumeSizeGb: number | null
  /** GPU principal + até 2 alternativas (Fase 4 usará isso). */
  primaryGpuId: string | null
  alternateGpuIds: [string | null, string | null]
  minVramGb: number
  recommendedVramGb: number
  maxUsdPerHour: number | null
  preferredCloud: 'SECURE' | 'COMMUNITY' | null
  modelsMountPath: string
  comfyRootInContainer: string
  notes: string
}

export const DEFAULT_LTX_ENVIRONMENT_PLAN: LtxEnvironmentPlan = {
  dryRunOnly: true,
  accountFingerprint: null,
  /** Placeholder pinável — preencher após inspeção do Pod / build do template. */
  templateImage: 'atlas-studio/comfyui-ltx2.3:pending-pin',
  templateTagPinned: false,
  containerPort: 8188,
  storageStrategy: 'undecided',
  preferredDataCenterId: null,
  networkVolumeId: null,
  networkVolumeSizeGb: null,
  primaryGpuId: null,
  alternateGpuIds: [null, null],
  minVramGb: LTX_MINIMUM_VRAM_GB,
  recommendedVramGb: LTX_RECOMMENDED_VRAM_GB,
  maxUsdPerHour: null,
  preferredCloud: 'SECURE',
  modelsMountPath: '/runpod-volume/models',
  comfyRootInContainer: '/ComfyUI',
  notes: '',
}

export function normalizeLtxEnvironmentPlan(
  input: Partial<LtxEnvironmentPlan> | null | undefined,
): LtxEnvironmentPlan {
  const alts = Array.isArray(input?.alternateGpuIds) ? input!.alternateGpuIds : [null, null]
  const minVram = Number(input?.minVramGb)
  const recVram = Number(input?.recommendedVramGb)
  const maxUsd = Number(input?.maxUsdPerHour)
  const volSize = Number(input?.networkVolumeSizeGb)
  const strategy = input?.storageStrategy
  return {
    // Fase 3: dry-run é invariante do plano persistido (provisionamento exige fase futura + auth).
    dryRunOnly: true,
    accountFingerprint: input?.accountFingerprint?.trim() || null,
    templateImage: String(input?.templateImage ?? DEFAULT_LTX_ENVIRONMENT_PLAN.templateImage).trim(),
    templateTagPinned: Boolean(input?.templateTagPinned),
    containerPort: 8188,
    storageStrategy:
      strategy === 'network_volume' ||
      strategy === 'global_volume' ||
      strategy === 'pod_disk_only' ||
      strategy === 'undecided'
        ? strategy
        : 'undecided',
    preferredDataCenterId: input?.preferredDataCenterId?.trim() || null,
    networkVolumeId: input?.networkVolumeId?.trim() || null,
    networkVolumeSizeGb: Number.isFinite(volSize) && volSize > 0 ? volSize : null,
    primaryGpuId: sanitizeLtxGpuId(input?.primaryGpuId) ?? LTX_DEFAULT_PRIMARY_GPU_ID,
    alternateGpuIds: [
      sanitizeLtxGpuId(alts[0]) ?? LTX_DEFAULT_ALTERNATE_GPU_ID,
      sanitizeLtxGpuId(alts[1]),
    ],
    minVramGb: Number.isFinite(minVram) && minVram > 0 ? minVram : LTX_MINIMUM_VRAM_GB,
    recommendedVramGb: Number.isFinite(recVram) && recVram > 0 ? recVram : LTX_RECOMMENDED_VRAM_GB,
    maxUsdPerHour: Number.isFinite(maxUsd) && maxUsd > 0 ? maxUsd : null,
    preferredCloud:
      input?.preferredCloud === 'SECURE' || input?.preferredCloud === 'COMMUNITY'
        ? input.preferredCloud
        : 'SECURE',
    modelsMountPath:
      String(input?.modelsMountPath ?? DEFAULT_LTX_ENVIRONMENT_PLAN.modelsMountPath).trim() ||
      DEFAULT_LTX_ENVIRONMENT_PLAN.modelsMountPath,
    comfyRootInContainer:
      String(input?.comfyRootInContainer ?? DEFAULT_LTX_ENVIRONMENT_PLAN.comfyRootInContainer).trim() ||
      DEFAULT_LTX_ENVIRONMENT_PLAN.comfyRootInContainer,
    notes: String(input?.notes ?? ''),
  }
}

/**
 * Manifesto IA2V oficial (docs.comfy.org LTX-2.3 Image and Audio to Video).
 * Nomes no disco do usuário podem divergir — exigir validação no Pod.
 */
export const LTX_IA2V_OFFICIAL_MODEL_ASSETS: LtxModelAsset[] = [
  {
    id: 'ckpt-dev-fp8',
    role: 'checkpoint',
    expectedFileName: 'ltx-2.3-22b-dev-fp8.safetensors',
    relativeDir: 'models/checkpoints',
    evidence: 'confirmed_official_docs',
    notes: 'Template oficial IA2V (docs.comfy.org). Confirmar nome/hash no Pod.',
  },
  {
    id: 'lora-distilled',
    role: 'lora',
    expectedFileName: 'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
    relativeDir: 'models/loras',
    evidence: 'confirmed_official_docs',
  },
  {
    id: 'lora-gemma-abliterated',
    role: 'lora',
    expectedFileName: 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
    relativeDir: 'models/loras',
    evidence: 'confirmed_official_docs',
  },
  {
    id: 'text-encoder-gemma',
    role: 'text_encoder',
    expectedFileName: 'gemma_3_12B_it_fp4_mixed.safetensors',
    relativeDir: 'models/text_encoders',
    evidence: 'confirmed_official_docs',
  },
  {
    id: 'upscaler-spatial',
    role: 'upscaler',
    expectedFileName: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
    relativeDir: 'models/latent_upscale_models',
    evidence: 'confirmed_official_docs',
  },
]

/** class_types presentes no stub Atlas de video_ltx2_3_ia2v (testes). */
export const LTX_IA2V_STUB_CLASS_TYPES = [
  'LoadImage',
  'LoadAudio',
  'SaveVideo',
  'RandomNoise',
  'CLIPTextEncode',
  'PrimitiveStringMultiline',
  'PrimitiveFloat',
  'PrimitiveInt',
  'PrimitiveBoolean',
  'TextGenerateLTX2Prompt',
] as const

export function auditLtxWorkflowEvidence(
  workflow: ComfyApiWorkflow | null,
  workflowName: string,
): LtxEvidenceItem[] {
  const items: LtxEvidenceItem[] = [
    {
      id: 'workflow-file-in-repo',
      label: 'Arquivo video_ltx2_3_ia2v.json no repositório',
      value: 'ausente',
      evidence: 'needs_user_validation',
      notes:
        'O JSON completo não está no git. O Atlas usa o workflow importado no SQLite e um stub parcial nos testes.',
    },
    {
      id: 'workflow-imported',
      label: 'Workflow importado no Atlas',
      value: workflowName.trim() || (workflow ? '(sem nome)' : 'nenhum'),
      evidence: workflow ? 'confirmed_in_repo' : 'needs_user_validation',
    },
    {
      id: 'native-ltx',
      label: 'Custom nodes para LTX-2.3 oficial',
      value: 'Não exigidos (suporte nativo ComfyUI)',
      evidence: 'confirmed_official_docs',
      notes: 'docs.comfy.org: “Native ComfyUI support — no custom nodes required” para templates oficiais.',
    },
    {
      id: 'comfy-version',
      label: 'Versão ComfyUI',
      value: 'não pinada no Atlas',
      evidence: 'needs_pod_inspection',
      notes: 'Docs pedem ComfyUI atualizado / templates LTX-2.3. Ler /system_stats no Pod ligado.',
    },
    {
      id: 'cuda-pytorch',
      label: 'CUDA / PyTorch / Python',
      value: 'não confirmados',
      evidence: 'needs_pod_inspection',
      notes: 'Inspecionar imagem/container do Pod atual; não inventar tags.',
    },
    {
      id: 'vram',
      label: 'VRAM',
      value: `mín. ${LTX_MINIMUM_VRAM_GB} GB (FP8 offload) · rec. ${LTX_RECOMMENDED_VRAM_GB} GB`,
      evidence: 'confirmed_official_docs',
      notes: 'Fonte: guia público LTX 2.3 VRAM + docs Comfy. Validar no workload real do usuário.',
    },
  ]

  const classTypes = workflowRequiredClassTypes(workflow)
  items.push({
    id: 'class-types',
    label: 'class_types do workflow',
    value: classTypes.join(', ') || '(vazio)',
    evidence: workflow ? 'confirmed_in_repo' : 'confirmed_in_repo',
    notes: workflow
      ? 'Extraído do workflow importado no SQLite.'
      : `Fallback: stub de testes (${LTX_IA2V_STUB_CLASS_TYPES.join(', ')}).`,
  })

  if (workflow) {
    const hasLtx = classTypes.includes('TextGenerateLTX2Prompt')
    items.push({
      id: 'ltx-marker',
      label: 'Marcador TextGenerateLTX2Prompt',
      value: hasLtx ? 'presente' : 'ausente',
      evidence: hasLtx ? 'confirmed_in_repo' : 'needs_user_validation',
    })
  }

  return items
}

export type LtxGpuFailoverCandidate = {
  priority: 1 | 2 | 3
  gpuId: string | null
  memoryGb: number | null
  priceUsd: number | null
  availability: string | null
  fitsBudget: boolean | null
  fitsVram: boolean | null
  dataCenterCompatible: boolean | null
  reasons: string[]
}

export type LtxEnvironmentPrepStatus = {
  fetchedAt: string
  dryRun: true
  mutationCalls: 0
  plan: LtxEnvironmentPlan
  evidence: LtxEvidenceItem[]
  models: LtxModelAsset[]
  workflowName: string
  workflowClassTypes: string[]
  storage: {
    strategy: LtxStorageStrategy
    networkVolumes: RunpodNetworkVolumeSummary[]
    accountHasNetworkVolume: boolean
    preferredDataCenterId: string | null
    dataCenterConflict: boolean
    recommendation: string
  }
  template: {
    image: string
    pinned: boolean
    port: number
    readyForPublish: boolean
    blockers: string[]
  }
  gpuFailover: LtxGpuFailoverCandidate[]
  costEstimate: {
    currency: 'USD'
    maxUsdPerHour: number | null
    cheapestCompatibleUsd: number | null
    notes: string[]
  }
  readiness: {
    level: 'not_ready' | 'planned' | 'ready_for_phase4_auth' | 'phase4_validated_awaiting_paid_ops'
    summary: string
    blockers: string[]
    nextSteps: string[]
  }
  podsSnapshot: Array<Pick<RunpodPodSummary, 'id' | 'name' | 'status' | 'gpuType' | 'dataCenterId' | 'costPerHr'>>
}

/** Aprovação explícita exigida antes do teste LipSync real (pós Fase 4). */
export type LtxControlledLipsyncTestGate = {
  enabled: false
  requiresExplicitApproval: true
  maxUsd: number | null
  maxMinutes: number | null
  sceneLimit: 1
  status: 'blocked_until_approval'
  message: string
}

export function evaluateGpuFailover(
  plan: LtxEnvironmentPlan,
  catalog: RunpodGpuCatalogEntry[],
): LtxGpuFailoverCandidate[] {
  const ordered = [plan.primaryGpuId, plan.alternateGpuIds[0], plan.alternateGpuIds[1]]
  return ordered.map((gpuId, index) => {
    const priority = (index + 1) as 1 | 2 | 3
    if (!gpuId) {
      return {
        priority,
        gpuId: null,
        memoryGb: null,
        priceUsd: null,
        availability: null,
        fitsBudget: null,
        fitsVram: null,
        dataCenterCompatible: null,
        reasons: ['GPU não configurada.'],
      }
    }
    const hit = catalog.find((gpu) => gpu.id === gpuId || gpu.name === gpuId)
    const memoryGb = hit?.memoryGb ?? null
    const priceUsd =
      plan.preferredCloud === 'COMMUNITY' ? hit?.communityPrice ?? null : hit?.securePrice ?? null
    const fitsVram = memoryGb == null ? null : memoryGb >= plan.minVramGb
    const fitsBudget =
      plan.maxUsdPerHour == null || priceUsd == null ? null : priceUsd <= plan.maxUsdPerHour
    const reasons: string[] = []
    if (!hit) reasons.push('GPU não encontrada no catálogo atual da API.')
    if (fitsVram === false) reasons.push(`VRAM ${memoryGb} GB < mínimo ${plan.minVramGb} GB.`)
    if (fitsBudget === false) reasons.push(`Preço US$ ${priceUsd}/h > teto US$ ${plan.maxUsdPerHour}/h.`)
    if (hit && !hit.availability) reasons.push('Disponibilidade não reportada nesta consulta.')
    return {
      priority,
      gpuId,
      memoryGb,
      priceUsd,
      availability: hit?.availability ?? null,
      fitsBudget,
      fitsVram,
      dataCenterCompatible: plan.preferredDataCenterId ? null : null,
      reasons,
    }
  })
}

export function buildLtxPrepReadiness(input: {
  plan: LtxEnvironmentPlan
  accountHasNetworkVolume: boolean
  workflowPresent: boolean
  gpuFailover: LtxGpuFailoverCandidate[]
  templatePinned: boolean
}): LtxEnvironmentPrepStatus['readiness'] {
  const blockers: string[] = []
  const nextSteps: string[] = []

  if (!input.workflowPresent) {
    blockers.push('Importe o workflow LTX IA2V no Atlas (Configurações → Importar).')
  }
  if (!input.plan.primaryGpuId) {
    blockers.push('Defina a GPU principal no plano LTX.')
  }
  if (!input.gpuFailover[0] || input.gpuFailover[0].fitsVram === false) {
    blockers.push('GPU principal incompatível ou sem VRAM suficiente (plano).')
  }
  if (input.plan.storageStrategy === 'undecided') {
    blockers.push('Escolha a estratégia de armazenamento (recomendado: Network Volume).')
  }
  if (input.plan.storageStrategy === 'network_volume' && !input.accountHasNetworkVolume) {
    blockers.push(
      'Conta sem Network Volume. Criação exige autorização (custo de armazenamento) — Fase 3 não cria.',
    )
    nextSteps.push('Autorizar criação de Network Volume no datacenter do Pod LTX (fase seguinte).')
  }
  if (!input.templatePinned || input.plan.templateImage.includes('pending-pin')) {
    blockers.push('Template Docker ainda não pinado (tag/imagem pendente de inspeção no Pod).')
    nextSteps.push('Inspecionar CUDA/PyTorch/ComfyUI no Pod atual e piná-los no manifesto.')
  }
  if (input.plan.dryRunOnly) {
    nextSteps.push('Dry-run permanece ativo: nenhum recurso pago será provisionado nesta fase.')
  }

  const primaryOk = Boolean(
    input.plan.primaryGpuId &&
      input.gpuFailover[0]?.fitsVram !== false &&
      input.gpuFailover[0]?.fitsBudget !== false,
  )

  if (blockers.length === 0 && primaryOk && input.templatePinned) {
    return {
      level: 'ready_for_phase4_auth',
      summary: 'Plano LTX coerente no papel — ainda exige autorização para provisionar recursos.',
      blockers,
      nextSteps: [
        ...nextSteps,
        'Aguardar autorização humana antes de criar volume/template/Pod.',
      ],
    }
  }

  if (input.plan.primaryGpuId || input.plan.storageStrategy !== 'undecided' || input.workflowPresent) {
    return {
      level: 'planned',
      summary: 'Preparação em andamento (somente configuração/diagnóstico).',
      blockers,
      nextSteps,
    }
  }

  return {
    level: 'not_ready',
    summary: 'Ambiente LTX ainda não preparado.',
    blockers: blockers.length > 0 ? blockers : ['Preencha o painel de preparação LTX-2.3.'],
    nextSteps,
  }
}
