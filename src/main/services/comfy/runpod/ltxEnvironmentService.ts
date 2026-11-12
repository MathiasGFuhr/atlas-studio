/**
 * Fase 3 — diagnóstico e persistência do plano LTX (somente dry-run / leitura).
 * Nunca cria Pod, volume, template nem inicia GPU.
 */

import {
  auditLtxWorkflowEvidence,
  buildLtxPrepReadiness,
  evaluateGpuFailover,
  LTX_IA2V_OFFICIAL_MODEL_ASSETS,
  normalizeLtxEnvironmentPlan,
  type LtxEnvironmentPlan,
  type LtxEnvironmentPrepStatus,
  DEFAULT_LTX_ENVIRONMENT_PLAN,
} from '../../../../shared/ltxEnvironment'
import { workflowRequiredClassTypes } from '../../../../shared/runpodLtxCompat'
import { getDb } from '../../../db/database'
import { logger } from '../../logging/logger'
import { createRunpodClient } from '../runpod'
import { sqliteComfyStore } from '../comfyStore'
import { summarizeGpuType, summarizeNetworkVolume, summarizeV2Pod } from './mapRunpodV2'

const PLAN_KEY = 'ltxEnvironmentPlan'

type SettingsIo = {
  read(key: string): string | null
  write(key: string, value: string): void
}

function defaultSettingsIo(): SettingsIo {
  return {
    read(key) {
      const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined
      return row?.value ?? null
    },
    write(key, value) {
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    },
  }
}

export function getLtxEnvironmentPlan(io: SettingsIo = defaultSettingsIo()): LtxEnvironmentPlan {
  const raw = io.read(PLAN_KEY)
  if (!raw) return normalizeLtxEnvironmentPlan(DEFAULT_LTX_ENVIRONMENT_PLAN)
  try {
    return normalizeLtxEnvironmentPlan(JSON.parse(raw) as Partial<LtxEnvironmentPlan>)
  } catch {
    return normalizeLtxEnvironmentPlan(DEFAULT_LTX_ENVIRONMENT_PLAN)
  }
}

export function saveLtxEnvironmentPlan(
  patch: Partial<LtxEnvironmentPlan>,
  io: SettingsIo = defaultSettingsIo(),
): LtxEnvironmentPlan {
  const current = getLtxEnvironmentPlan(io)
  const next = normalizeLtxEnvironmentPlan({
    ...current,
    ...patch,
    // Fase 3: dry-run obrigatório — nunca desliga por patch acidental.
    dryRunOnly: true,
    alternateGpuIds: patch.alternateGpuIds ?? current.alternateGpuIds,
  })
  io.write(PLAN_KEY, JSON.stringify(next))
  return next
}

export type DiagnoseLtxDeps = {
  getApiKey: () => string
  getPlan?: () => LtxEnvironmentPlan
  getWorkflowName: () => string
  getWorkflow: () => ReturnType<typeof sqliteComfyStore.getWorkflow>
  createClient?: typeof createRunpodClient
  log?: (event: string, data?: Record<string, unknown>) => void
}

/**
 * Monta o painel de preparação. Só GET na API RunPod (se houver chave).
 */
export async function diagnoseLtxEnvironmentPrep(
  deps: DiagnoseLtxDeps,
): Promise<LtxEnvironmentPrepStatus> {
  const fetchedAt = new Date().toISOString()
  const plan = deps.getPlan?.() ?? getLtxEnvironmentPlan()
  const workflow = deps.getWorkflow()
  const workflowName = deps.getWorkflowName()
  const evidence = auditLtxWorkflowEvidence(workflow, workflowName)
  const workflowClassTypes = workflowRequiredClassTypes(workflow)
  const log = deps.log ?? ((event, data) => logger.info(event, data))

  let pods: ReturnType<typeof summarizeV2Pod>[] = []
  let gpuCatalog = [] as ReturnType<typeof summarizeGpuType>[]
  let networkVolumes = [] as ReturnType<typeof summarizeNetworkVolume>[]
  const apiKey = deps.getApiKey().trim()

  if (apiKey) {
    try {
      const client = (deps.createClient ?? createRunpodClient)(apiKey)
      log('ltx.prep.diagnose.start', { hasKey: true, dryRun: true })
      const [podsV2, gpus, volumes] = await Promise.all([
        client.listPods(),
        client.listGpuTypes({ includeAvailability: true }).catch(() => []),
        client.listNetworkVolumes().catch(() => []),
      ])
      pods = podsV2.filter((pod) => pod.id).map(summarizeV2Pod)
      gpuCatalog = gpus.map(summarizeGpuType)
      networkVolumes = volumes.map(summarizeNetworkVolume)
    } catch (error) {
      log('ltx.prep.diagnose.api_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const gpuFailover = evaluateGpuFailover(plan, gpuCatalog)
  const accountHasNetworkVolume = networkVolumes.length > 0
  const preferredDataCenterId =
    plan.preferredDataCenterId ||
    pods.find((pod) => /comfy|ltx/i.test(`${pod.name} ${pod.image ?? ''}`))?.dataCenterId ||
    pods[0]?.dataCenterId ||
    null

  let dataCenterConflict = false
  if (plan.networkVolumeId && preferredDataCenterId) {
    const vol = networkVolumes.find((entry) => entry.id === plan.networkVolumeId)
    if (vol?.dataCenterId && vol.dataCenterId !== preferredDataCenterId) {
      dataCenterConflict = true
    }
  }

  const storageRecommendation =
    plan.storageStrategy === 'network_volume'
      ? accountHasNetworkVolume
        ? 'Network Volume presente — validar datacenter e anexação apenas em criação futura de Pod.'
        : 'Sem Network Volume na conta. Docker reproduz software; modelos precisam de volume no mesmo DC (autorização futura).'
      : plan.storageStrategy === 'pod_disk_only'
        ? 'Disco do Pod não migra com troca de GPU. Adequado só enquanto o Pod “bom” for único.'
        : plan.storageStrategy === 'global_volume'
          ? 'Global Volume atravessa DCs, mas modelos grandes ainda preferem Network Volume no mesmo DC.'
          : 'Defina Network Volume como estratégia preferida para failover de GPU sem reinstalar pesos.'

  const templateBlockers: string[] = []
  if (!plan.templateTagPinned || plan.templateImage.includes('pending-pin')) {
    templateBlockers.push('Imagem/tag ainda não pinadas após inspeção do Pod.')
  }
  if (plan.containerPort !== 8188) {
    templateBlockers.push('Porta do container deve ser 8188.')
  }

  const prices = gpuFailover
    .map((row) => row.priceUsd)
    .filter((value): value is number => typeof value === 'number')
  const cheapestCompatibleUsd =
    gpuFailover
      .filter((row) => row.gpuId && row.fitsVram !== false && row.fitsBudget !== false)
      .map((row) => row.priceUsd)
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b)[0] ?? null

  const readiness = buildLtxPrepReadiness({
    plan,
    accountHasNetworkVolume,
    workflowPresent: Boolean(workflow),
    gpuFailover,
    templatePinned: plan.templateTagPinned && !plan.templateImage.includes('pending-pin'),
  })

  return {
    fetchedAt,
    dryRun: true,
    mutationCalls: 0,
    plan,
    evidence,
    models: LTX_IA2V_OFFICIAL_MODEL_ASSETS,
    workflowName,
    workflowClassTypes,
    storage: {
      strategy: plan.storageStrategy,
      networkVolumes,
      accountHasNetworkVolume,
      preferredDataCenterId,
      dataCenterConflict,
      recommendation: storageRecommendation,
    },
    template: {
      image: plan.templateImage,
      pinned: plan.templateTagPinned && !plan.templateImage.includes('pending-pin'),
      port: plan.containerPort,
      readyForPublish: templateBlockers.length === 0,
      blockers: templateBlockers,
    },
    gpuFailover,
    costEstimate: {
      currency: 'USD',
      maxUsdPerHour: plan.maxUsdPerHour,
      cheapestCompatibleUsd,
      notes: [
        'Estimativas só a partir do catálogo GET /v2/catalog/gpus — não reservam GPU.',
        accountHasNetworkVolume
          ? 'Volume já existente: custo de armazenamento contínuo depende do tamanho no RunPod (consultar console).'
          : 'Criar Network Volume gerará custo de armazenamento; Fase 3 não cria.',
        prices.length === 0 ? 'Sem preços de GPU no plano/catálogo para comparar.' : '',
        dataCenterConflict ? 'Volume e Pod preferencial em datacenters diferentes — anexação futura falhará.' : '',
      ].filter(Boolean),
    },
    readiness,
    podsSnapshot: pods.map((pod) => ({
      id: pod.id,
      name: pod.name,
      status: pod.status,
      gpuType: pod.gpuType,
      dataCenterId: pod.dataCenterId,
      costPerHr: pod.costPerHr,
    })),
  }
}
