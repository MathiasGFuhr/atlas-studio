/**
 * Preparação da validação real de recovery — somente GET / dry-run.
 * Não cria Pod, não inicia GPU, não para Pod.
 */

import { COMFY_DOWNLOAD_SUBDIR } from '../../../../shared/comfy'
import { buildComfyAutoShutdownPlan } from '../../../../shared/comfyAutoShutdown'
import {
  buildGpuRecoveryValidationPlan,
  type GpuRecoveryValidationBundle,
} from '../../../../shared/gpuRecoveryValidation'
import { assessLtxPodCompatibility } from '../../../../shared/runpodLtxCompat'

export type { GpuRecoveryValidationBundle }
import { lipSyncRefRepository } from '../../../repositories/lipSyncRefRepository'
import { projectRepository } from '../../../repositories/projectRepository'
import { folderExists } from '../../storage/projectFolders'
import { sqliteComfyStore } from '../comfyStore'
import { ensureComfyDownloadDir } from '../outputDir'
import { createRunpodClient } from '../runpod'
import { ComfyClient } from '../ComfyClient'
import { getLtxEnvironmentPlan } from './ltxEnvironmentService'
import { getSavedLtxDetectionForAccount } from './ltxDetectionBootstrap'
import { buildGpuRecoveryPreview } from './gpuRecoveryService'
import { summarizeGpuType } from './mapRunpodV2'
import { pickLtxComfyPod } from '../../../../shared/ltxAutoDetect'
import type { RunpodInfraStatus } from '../../../../shared/runpod'
import { refreshRunpodInfraStatus } from './refreshRunpodStatus'

function sceneNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

export async function prepareGpuRecoveryValidation(options?: {
  projectId?: string | null
  refId?: string | null
}): Promise<GpuRecoveryValidationBundle> {
  const config = sqliteComfyStore.getConfig()
  const plan = getLtxEnvironmentPlan()
  const apiKey = sqliteComfyStore.getRunpodApiKey()
  const saved = getSavedLtxDetectionForAccount(apiKey)
  const modelsPersistentlyVerified = Boolean(
    saved.detection?.persistence?.modelsPersistentlyVerified,
  )

  let status: RunpodInfraStatus | null = null
  if (apiKey.trim()) {
    try {
      status = await refreshRunpodInfraStatus({
        getApiKey: () => apiKey,
        getConfiguredUrl: () => config.baseUrl,
        getAutoInfraEnabled: () => config.runpodAutoInfraEnabled,
        getPreferredPodId: () => config.runpodPreferredPodId || null,
        getDryRunStarts: () => config.runpodDryRunStarts,
        getLifecycle: () => null,
        testComfy: async (baseUrl) => {
          try {
            return await new ComfyClient(baseUrl).systemStats()
          } catch (error) {
            return {
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            }
          }
        },
      })
    } catch {
      status = null
    }
  }

  const preferredId = config.runpodPreferredPodId.trim() || status?.preferredPodId || null
  const preferred =
    (preferredId ? status?.pods.find((pod) => pod.id === preferredId) : null) ??
    status?.selectedPod ??
    (status ? pickLtxComfyPod(status.pods) : null)

  const volumeDc = plan.preferredDataCenterId || preferred?.dataCenterId || 'EU-RO-1'
  const volume =
    (plan.networkVolumeId
      ? status?.networkVolumes.find((vol) => vol.id === plan.networkVolumeId)
      : null) ??
    status?.networkVolumes.find((vol) => vol.dataCenterId === volumeDc) ??
    status?.networkVolumes[0] ??
    null

  const recovery =
    status && apiKey.trim()
      ? await buildGpuRecoveryPreview(
          {
            createClient: createRunpodClient,
            getApiKey: () => apiKey,
            getConfig: () => config,
            saveConfig: () => config,
            getWorkflow: () => sqliteComfyStore.getWorkflow(),
            getLtxPlan: () => plan,
            modelsPersistentlyVerified: () => modelsPersistentlyVerified,
            lifecycle: {
              startExistingPod: async () => {
                throw new Error('prepareGpuRecoveryValidation é GET-only')
              },
              getLatest: () => null,
              previewStart: async () => {
                throw new Error('prepareGpuRecoveryValidation é GET-only')
              },
            } as never,
            getRunpodStatus: async () => status!,
            log: undefined,
          },
          preferred,
          status,
        )
      : null

  let availableGpusInDc: Array<{ gpuId: string; availability: string; priceUsd: number | null }> = []
  if (apiKey.trim() && volumeDc) {
    try {
      const client = createRunpodClient(apiKey)
      const [dcs, gpus] = await Promise.all([
        client.listDataCenters({ includeGpuAvailability: true }),
        client.listGpuTypes({ includeAvailability: true }),
      ])
      const catalog = gpus.map(summarizeGpuType)
      const hit = dcs.find((dc) => dc.id === volumeDc)
      availableGpusInDc = (hit?.gpuAvailability ?? [])
        .filter((gpu) => {
          const upper = String(gpu.availability || '').toUpperCase()
          return upper && !upper.includes('UNAVAIL') && upper !== 'NONE' && upper !== '0'
        })
        .map((gpu) => {
          const entry = catalog.find((row) => row.id === gpu.id || row.name === gpu.id)
          const price =
            plan.preferredCloud === 'COMMUNITY'
              ? entry?.communityPrice ?? null
              : entry?.securePrice ?? entry?.communityPrice ?? null
          const withinBudget =
            plan.maxUsdPerHour == null || price == null || price <= plan.maxUsdPerHour
          return {
            gpuId: gpu.id,
            availability: gpu.availability,
            priceUsd: withinBudget ? price : null,
            _drop: !withinBudget,
          }
        })
        .filter((row) => !row._drop)
        .map(({ gpuId, availability, priceUsd }) => ({ gpuId, availability, priceUsd }))
    } catch {
      availableGpusInDc = []
    }
  }

  const compat = preferred
    ? preferred.ltxCompat ?? assessLtxPodCompatibility(preferred, status?.gpuCatalog)
    : null
  const statusUpper = String(preferred?.status || '').toUpperCase()
  const gpuUnavailableDetected = Boolean(
    preferred &&
      ((compat && !compat.canStart && statusUpper !== 'RUNNING' && statusUpper !== 'STARTING') ||
        statusUpper === 'TERMINATED' ||
        (statusUpper === 'EXITED' && compat && !compat.startAllowedByApi) ||
        (status && status.comfy && status.comfy.ok === false && statusUpper === 'EXITED')),
  )
  const unavailableDetail = preferred
    ? [
        `Pod ${preferred.id} · ${preferred.status}`,
        ...(compat?.reasons ?? []),
        status?.comfy && !status.comfy.ok ? status.comfy.message : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const projectId = options?.projectId?.trim() || null
  const refs = projectId
    ? lipSyncRefRepository.list({ status: 'active', projectId })
    : []
  const requested = options?.refId?.trim()
  const shortScene =
    (requested ? refs.find((ref) => ref.id === requested) : null) ??
    refs.find((ref) => ref.imagePath?.trim() && ref.audioPath?.trim() && ref.prompt?.trim()) ??
    refs[0] ??
    null
  const sceneIndex = shortScene ? refs.findIndex((ref) => ref.id === shortScene.id) : -1
  const project = projectId ? projectRepository.get(projectId) : null
  const folder = project?.projectFolderPath?.trim() ?? ''
  const outputDir =
    folder && folderExists(folder)
      ? ensureComfyDownloadDir(folder) ?? `${folder.replace(/[\\/]+$/, '')}\\${COMFY_DOWNLOAD_SUBDIR}`
      : null

  const dockerImage =
    preferred?.image?.trim() ||
    (plan.templateTagPinned ? plan.templateImage : null) ||
    plan.templateImage ||
    null

  const validation = buildGpuRecoveryValidationPlan({
    config,
    preferredPod: preferred,
    volumeId: volume?.id || plan.networkVolumeId,
    volumeDc: volume?.dataCenterId || plan.preferredDataCenterId,
    volumeSizeGb: volume?.sizeGb ?? plan.networkVolumeSizeGb,
    maxUsdPerHour: plan.maxUsdPerHour,
    modelsPersistentlyVerified,
    workflowName: config.workflowName || null,
    hasWorkflowMapping: Boolean(config.workflowMapping),
    dockerImage,
    templatePinned: plan.templateTagPinned,
    gpuUnavailableDetected,
    unavailableDetail,
    availableGpusInDc,
    recovery,
    scene: {
      refId: shortScene?.id ?? null,
      number: sceneIndex >= 0 ? sceneNumber(sceneIndex) : null,
      hasImage: Boolean(shortScene?.imagePath?.trim()),
      hasAudio: Boolean(shortScene?.audioPath?.trim()),
      hasPrompt: Boolean(shortScene?.prompt?.trim()),
      outputDir,
    },
  })

  return {
    validation,
    autoShutdown: buildComfyAutoShutdownPlan(),
    fetchedAt: new Date().toISOString(),
    mutationCalls: 0,
    paidOperationsExecuted: false,
  }
}
