/**
 * Fase 4 — procedimento de migração (dry-run) e apresentação de custos.
 * Não cria volumes, não copia arquivos, não exclui Pods.
 */

import type { LtxEnvironmentPlan } from './ltxEnvironment'
import type { RunpodNetworkVolumeSummary, RunpodPodSummary } from './runpod'
import type { LtxWorkflowAnalysis } from './ltxWorkflowAnalysis'
import { LTX_IA2V_OFFICIAL_MODEL_ASSETS } from './ltxEnvironment'

/** Preço público típico RunPod Network Volume (USD/GB/mês) — confirmar no console. */
export const RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE = 0.07

export type LtxMigrationStep = {
  id: string
  title: string
  status: 'pending_approval' | 'blocked' | 'ready_when_authorized' | 'informational'
  paid: boolean
  detail: string
}

export type LtxStorageCostEstimate = {
  currency: 'USD'
  volumeSizeGb: number | null
  /** Estimativa mensal de armazenamento; null se tamanho indefinido. */
  estimatedStorageUsdPerMonth: number | null
  rateUsdPerGbMonth: number
  notes: string[]
  /** Confirmação humana obrigatória antes de qualquer cobrança. */
  requiresExplicitApproval: true
}

export type LtxMigrationPlan = {
  dryRun: true
  mutationCalls: 0
  preserveExistingPods: true
  existingPodIds: string[]
  strategy: LtxEnvironmentPlan['storageStrategy']
  preferredDataCenterId: string | null
  networkVolumes: RunpodNetworkVolumeSummary[]
  steps: LtxMigrationStep[]
  storageCost: LtxStorageCostEstimate
  modelCopyChecklist: Array<{
    expectedFileName: string
    relativeDir: string
    referencedInWorkflow: boolean
  }>
  apiCaveats: string[]
  paidActionsRequiringApproval: string[]
}

export function buildLtxMigrationPlan(input: {
  plan: LtxEnvironmentPlan
  pods: RunpodPodSummary[]
  networkVolumes: RunpodNetworkVolumeSummary[]
  workflowAnalysis: LtxWorkflowAnalysis
}): LtxMigrationPlan {
  const preferredDataCenterId =
    input.plan.preferredDataCenterId ||
    input.pods.find((pod) => /comfy|ltx/i.test(`${pod.name} ${pod.image ?? ''}`))?.dataCenterId ||
    input.pods[0]?.dataCenterId ||
    null

  const sizeGb = input.plan.networkVolumeSizeGb
  const estimatedStorageUsdPerMonth =
    sizeGb != null && sizeGb > 0
      ? Math.round(sizeGb * RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE * 100) / 100
      : null

  const referenced = new Set(input.workflowAnalysis.modelRefs.map((ref) => ref.fileName))
  const modelCopyChecklist = LTX_IA2V_OFFICIAL_MODEL_ASSETS.map((asset) => ({
    expectedFileName: asset.expectedFileName,
    relativeDir: asset.relativeDir,
    referencedInWorkflow: referenced.has(asset.expectedFileName),
  }))

  const steps: LtxMigrationStep[] = [
    {
      id: 'inventory-readonly',
      title: 'Inventariar Pod atual (somente leitura)',
      status: 'informational',
      paid: false,
      detail:
        'GET /system_stats, /object_info, /models/{folder}. Não modifica arquivos no container.',
    },
    {
      id: 'export-workflow',
      title: 'Exportar workflow API JSON do SQLite',
      status: 'informational',
      paid: false,
      detail: 'Snapshot local em resources/ltx-environment — sem tocar no ComfyUI remoto.',
    },
    {
      id: 'create-network-volume',
      title:
        input.networkVolumes.length > 0 || input.plan.networkVolumeId
          ? 'Usar Network Volume já existente (não criar outro)'
          : 'Criar Network Volume no mesmo datacenter',
      status:
        input.networkVolumes.length > 0 || input.plan.networkVolumeId
          ? 'informational'
          : 'pending_approval',
      paid: !(input.networkVolumes.length > 0 || input.plan.networkVolumeId),
      detail: preferredDataCenterId
        ? `DC alvo: ${preferredDataCenterId}. Conta tem ${input.networkVolumes.length} volume(s)${
            input.plan.networkVolumeId ? ` · plano=${input.plan.networkVolumeId}` : ''
          }. ${
            input.networkVolumes.length > 0 || input.plan.networkVolumeId
              ? 'Não criar outro volume.'
              : 'Criação gera custo de armazenamento.'
          }`
        : 'Datacenter ainda não determinado — definir antes de criar volume.',
    },
    {
      id: 'create-new-pod-attach',
      title: 'Criar Pod novo anexando o volume na criação',
      status: 'pending_approval',
      paid: true,
      detail:
        'Docs do console: Network Volume anexa na criação do Pod. Não apagar os 4 Pods atuais. UpdatePodMounts na API não deve ser assumido como equivalente ao migrate do painel sem confirmação documental.',
    },
    {
      id: 'copy-models',
      title: 'Copiar modelos verificados para o volume',
      status: 'blocked',
      paid: false,
      detail:
        'Checksum/tamanho após inventário. Bloqueado até autorização explícita de cópia (pode consumir egress/tempo de GPU se feito de dentro do Pod).',
    },
    {
      id: 'validate-boot',
      title: 'Validar boot ComfyUI + class_types + modelos',
      status: 'ready_when_authorized',
      paid: true,
      detail: 'Só após Pod novo autorizado. Dry-run de prontidão via /system_stats e /object_info.',
    },
    {
      id: 'controlled-lipsync',
      title: 'Teste real: uma cena curta LipSync',
      status: 'pending_approval',
      paid: true,
      detail:
        'Exige aprovação explícita com custo máximo e limite de tempo. Não dispara nesta fase.',
    },
  ]

  const volumeAlreadyExists = input.networkVolumes.length > 0 || Boolean(input.plan.networkVolumeId)
  const paidActionsRequiringApproval = [
    volumeAlreadyExists
      ? 'Network Volume já existe — NÃO criar outro; só autorizar cópia/anexação futura.'
      : 'Criar Network Volume (armazenamento mensal).',
    'Criar Pod novo com volume anexado (compute horário) — sem excluir Pods atuais.',
    'Build/push de imagem Docker pinada (registry; custo de build se aplicável).',
    'Teste LipSync real de uma cena no Pod atual (caminho A — separado da migração).',
  ]

  return {
    dryRun: true,
    mutationCalls: 0,
    preserveExistingPods: true,
    existingPodIds: input.pods.map((pod) => pod.id),
    strategy: input.plan.storageStrategy,
    preferredDataCenterId,
    networkVolumes: input.networkVolumes,
    steps,
    storageCost: {
      currency: 'USD',
      volumeSizeGb: sizeGb,
      estimatedStorageUsdPerMonth,
      rateUsdPerGbMonth: RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE,
      notes: [
        `Estimativa ${RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE} USD/GB/mês — confirmar preço vigente no console RunPod antes de pagar.`,
        sizeGb == null
          ? 'Defina o tamanho planejado (GB) no plano LTX para ver a estimativa mensal.'
          : `Volume planejado ${sizeGb} GB ≈ US$ ${estimatedStorageUsdPerMonth}/mês (ordem de grandeza).`,
        'Compute GPU é cobrado à parte, só com Pod RUNNING.',
        'Nenhum dos quatro Pods atuais será excluído por este plano.',
      ],
      requiresExplicitApproval: true,
    },
    modelCopyChecklist,
    apiCaveats: [
      'Não presumir que “Migrate” do painel RunPod possui POST equivalente na REST v2 sem confirmar na documentação.',
      'Network Volume: mesmo dataCenterId; anexação preferencial na criação do Pod.',
      'Fase 4 não chama endpoints de create/delete de pods ou volumes.',
    ],
    paidActionsRequiringApproval,
  }
}
