/**
 * Detecção automática LTX — GET only (+ ListObjects S3 read-only).
 * Salva preferências verificadas localmente. Não provisiona nem inicia GPU.
 */

import { createHash } from 'node:crypto'
import type { ComfyApiWorkflow } from '../../../../shared/comfy'
import {
  analyzeWorkflowForDetect,
  buildLtxAutoDetectReadiness,
  buildModelsSummaryLabel,
  classifyModelStoragePath,
  pickLtxComfyPod,
  pickPreferredNetworkVolume,
  recommendGpusForLtx,
  resolveComfyEnvironmentKind,
  type LtxAutoDetectResult,
  type LtxComfyPowerState,
  type LtxDetectedModel,
  type LtxVolumeMountBinding,
} from '../../../../shared/ltxAutoDetect'
import {
  DEFAULT_LTX_ENVIRONMENT_PLAN,
  LTX_IA2V_OFFICIAL_MODEL_ASSETS,
  type LtxEnvironmentPlan,
} from '../../../../shared/ltxEnvironment'
import {
  DEFAULT_LTX_GPU_PRIORITIES,
  isRejectedLtxGpuId,
  resolveLtxPreferredGpuOrder,
} from '../../../../shared/ltxControlledValidation'
import {
  extractCommonPrefixes,
  matchLtxModelsInS3Objects,
  runpodS3EndpointForDataCenter,
  type LtxModelsInspectionStatus,
  type LtxVolumeModelMatch,
} from '../../../../shared/runpodS3'
import {
  fingerprintWorkflowPayload,
  shouldReuseStoredInventory,
  type LtxDetectionSnapshot,
} from '../../../../shared/ltxDetectionSnapshot'
import { logger } from '../../logging/logger'
import { createRunpodClient } from '../runpod'
import { ComfyClient } from '../ComfyClient'
import { summarizeGpuType, summarizeNetworkVolume, summarizeV2Pod } from './mapRunpodV2'
import { getLtxEnvironmentPlan, saveLtxEnvironmentPlan } from './ltxEnvironmentService'
import { getLtxDetectionSnapshot, saveLtxDetectionSnapshot } from './ltxDetectionStore'
import { RunpodS3Client, type RunpodS3Credentials } from './RunpodS3Client'

export type DetectLtxMode = 'full' | 'light' | 'auto'

export type DetectLtxDeps = {
  getApiKey: () => string
  getWorkflow: () => ComfyApiWorkflow | null
  getWorkflowName: () => string
  getComfyBaseUrl: () => string
  getPreferredPodId: () => string | null
  getS3Credentials?: () => RunpodS3Credentials | null
  getPlan?: () => LtxEnvironmentPlan
  savePlan?: (patch: Partial<LtxEnvironmentPlan>) => LtxEnvironmentPlan
  createClient?: typeof createRunpodClient
  createS3Client?: (options: {
    credentials: RunpodS3Credentials
    dataCenterId: string
    volumeId: string
  }) => Pick<RunpodS3Client, 'listAllObjects' | 'endpointUrl'>
  getStoredSnapshot?: (accountFingerprint: string | null) => LtxDetectionSnapshot | null
  saveSnapshot?: typeof saveLtxDetectionSnapshot
  /** full = S3 completo; light = reutiliza inventário; auto = light se fresco senão full. */
  mode?: DetectLtxMode
  /** Quando false, não persiste o plano sugerido. */
  persistSuggestedPlan?: boolean
  /** Quando false, não grava snapshot no SQLite. */
  persistSnapshot?: boolean
}

function fingerprintAccount(apiKey: string): string | null {
  const key = apiKey.trim()
  if (!key) return null
  return createHash('sha256').update(`atlas-runpod:${key}`).digest('hex').slice(0, 16)
}

async function inspectModelsViaComfy(
  baseUrl: string,
  networkMounts: Array<{ volumeId: string; path: string }>,
  selectedVolumeId: string | null,
): Promise<LtxDetectedModel[]> {
  const getJson = async (route: string) => {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${route}`, {
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`${route} → ${response.status}`)
    return response.json()
  }

  let folderMeta: Array<{ name: string; folders?: string[] }> = []
  try {
    folderMeta = (await getJson('/experiment/models')) as Array<{ name: string; folders?: string[] }>
  } catch {
    folderMeta = []
  }
  const folderMap = Object.fromEntries(folderMeta.map((row) => [row.name, row]))

  const models: LtxDetectedModel[] = []
  for (const asset of LTX_IA2V_OFFICIAL_MODEL_ASSETS) {
    const folder = asset.relativeDir.replace(/^models\//, '')
    let listed: Array<{ name?: string; pathIndex?: number; size?: number }> = []
    try {
      listed = (await getJson(`/experiment/models/${encodeURIComponent(folder)}`)) as typeof listed
    } catch {
      listed = []
    }
    const hit = listed.find((row) => row.name === asset.expectedFileName)
    const pathIndex = hit?.pathIndex ?? 0
    const absDir = folderMap[folder]?.folders?.[pathIndex] ?? null
    const absolutePath = absDir ? `${String(absDir).replace(/\/+$/, '')}/${asset.expectedFileName}` : null
    const sizeBytes = typeof hit?.size === 'number' ? hit.size : null
    const storage = classifyModelStoragePath(absolutePath, networkMounts, selectedVolumeId)
    models.push({
      role: asset.role,
      fileName: asset.expectedFileName,
      folder,
      present: Boolean(hit),
      absolutePath,
      sizeBytes,
      sizeGib: sizeBytes != null ? Math.round((sizeBytes / 1024 ** 3) * 1000) / 1000 : null,
      storageKind: storage.storageKind,
      onSelectedNetworkVolume: storage.onSelectedNetworkVolume,
    })
  }
  return models
}

function resolveComfyPowerState(input: {
  accessible: boolean
  podStatus: string | null
}): LtxComfyPowerState {
  if (input.accessible) return 'online'
  const status = String(input.podStatus ?? '').toUpperCase()
  if (!status) return 'unknown'
  if (['EXITED', 'TERMINATED', 'ERROR', 'STOPPED'].includes(status)) return 'offline'
  if (['RUNNING', 'STARTING', 'PROVISIONING'].includes(status)) return 'offline'
  return 'unknown'
}

export async function detectAndConfigureLtxEnvironment(
  deps: DetectLtxDeps,
): Promise<LtxAutoDetectResult> {
  const fetchedAt = new Date().toISOString()
  const plan = deps.getPlan?.() ?? getLtxEnvironmentPlan()
  const apiKey = deps.getApiKey().trim()
  const accountFingerprint = fingerprintAccount(apiKey)
  const workflow = deps.getWorkflow()
  const workflowName = deps.getWorkflowName()
  const s3Credentials = deps.getS3Credentials?.() ?? null
  const hasS3Credentials = Boolean(s3Credentials?.accessKeyId && s3Credentials?.secretAccessKey)
  const mode: DetectLtxMode = deps.mode ?? 'full'
  const workflowFingerprint = fingerprintWorkflowPayload(
    workflow ? JSON.stringify(workflow) : null,
  )
  const storedSnapshot =
    (deps.getStoredSnapshot ?? getLtxDetectionSnapshot)(accountFingerprint) ?? null
  const log = (event: string, data?: Record<string, unknown>) => logger.info(event, data)

  log('ltx.auto_detect.start', {
    dryRun: true,
    hasKey: Boolean(apiKey),
    hasS3: hasS3Credentials,
    mode,
  })

  let pods = [] as ReturnType<typeof summarizeV2Pod>[]
  let catalog = [] as ReturnType<typeof summarizeGpuType>[]
  let networkVolumes = [] as ReturnType<typeof summarizeNetworkVolume>[]
  let dataCenterGpuAvailability: Array<{
    dataCenterId: string
    gpus: Array<{ id: string; availability: string }>
  }> = []

  if (apiKey) {
    try {
      const client = (deps.createClient ?? createRunpodClient)(apiKey)
      const [podsV2, gpus, volumes, dcs] = await Promise.all([
        client.listPods(),
        client.listGpuTypes({ includeAvailability: true }).catch(() => []),
        client.listNetworkVolumes().catch(() => []),
        client.listDataCenters({ includeGpuAvailability: true }).catch(() => []),
      ])
      pods = podsV2.filter((pod) => pod.id).map(summarizeV2Pod)
      pods = await Promise.all(
        pods.map(async (summary) => {
          try {
            const detailed = await client.getPod(summary.id)
            return { ...summary, ...summarizeV2Pod(detailed) }
          } catch {
            return summary
          }
        }),
      )
      catalog = gpus.map(summarizeGpuType)
      networkVolumes = volumes.map(summarizeNetworkVolume)
      dataCenterGpuAvailability = dcs.map((dc) => ({
        dataCenterId: dc.id,
        gpus: (dc.gpuAvailability ?? []).map((gpu) => ({
          id: gpu.id,
          availability: gpu.availability,
        })),
      }))
    } catch (error) {
      log('ltx.auto_detect.api_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const accountSwitched =
    Boolean(accountFingerprint) &&
    Boolean(plan.accountFingerprint) &&
    plan.accountFingerprint !== accountFingerprint

  const preferredId = accountSwitched ? null : deps.getPreferredPodId()?.trim() || null
  const preferredPod = preferredId ? pods.find((pod) => pod.id === preferredId) : null
  const ltxPodSummary =
    (preferredPod?.hasComfyPort ? preferredPod : null) || pickLtxComfyPod(pods)

  const selectedVolume = pickPreferredNetworkVolume(
    networkVolumes,
    ltxPodSummary?.dataCenterId ?? (accountSwitched ? null : plan.preferredDataCenterId),
    accountSwitched ? null : plan.networkVolumeId,
  )

  const volumeMountBindings: LtxVolumeMountBinding[] = pods.flatMap((pod) =>
    (pod.networkMounts ?? [])
      .filter((mount) => !selectedVolume || mount.volumeId === selectedVolume.id)
      .map((mount) => ({
        podId: pod.id,
        podName: pod.name,
        podStatus: String(pod.status),
        volumeId: mount.volumeId,
        mountPath: mount.path,
      })),
  )

  let comfyAccessible = false
  let comfyVersion: string | null = null
  let pytorchVersion: string | null = null
  let pythonVersion: string | null = null
  let gpuName: string | null = null
  let vramTotalGb: number | null = null
  let availableClassTypes: string[] = []
  let models: LtxDetectedModel[] = []
  let volumeModels: LtxVolumeModelMatch[] = []
  let inspectionStatus: LtxModelsInspectionStatus = 'not_attempted'
  let inspectionSource: 's3' | 'comfy' | 'none' = 'none'
  let storageAccessible = false
  let storageAccessSource: 's3' | 'comfy_mount' | 'none' = 'none'
  let storageAccessMessage = 'Storage ainda não inspecionado.'
  const modelChecks: string[] = []
  let s3Endpoint: string | null = selectedVolume
    ? runpodS3EndpointForDataCenter(selectedVolume.dataCenterId)
    : null
  let listedPrefixes: string[] = []
  let fromStoredInventory = false
  let inventoryVerifiedAt: string | null = null
  let lastFullScanAt: string | null = null

  const baseUrl =
    (ltxPodSummary?.comfyProxyUrl || deps.getComfyBaseUrl() || '').trim() ||
    deps.getComfyBaseUrl().trim()

  if (baseUrl) {
    try {
      const client = new ComfyClient(baseUrl)
      const raw = await client.systemStatsRaw()
      comfyAccessible = true
      comfyVersion = raw.system?.comfyui_version ?? null
      pytorchVersion = raw.system?.pytorch_version ?? null
      pythonVersion = raw.system?.python_version ?? null
      const device = raw.devices?.[0]
      gpuName = device?.name ?? null
      vramTotalGb = device?.vram_total
        ? Math.round((device.vram_total / 1024 ** 3) * 10) / 10
        : null
      availableClassTypes = await client.listObjectInfoClassTypes().catch(() => [])
      models = await inspectModelsViaComfy(
        baseUrl,
        ltxPodSummary?.networkMounts ?? [],
        selectedVolume?.id ?? null,
      )
      inspectionSource = 'comfy'
      inspectionStatus =
        models.filter((model) => model.present).length === LTX_IA2V_OFFICIAL_MODEL_ASSETS.length
          ? 'found'
          : 'incomplete'
      modelChecks.push('Listagem via ComfyUI /experiment/models (Pod online).')
      if ((ltxPodSummary?.networkMounts ?? []).some((m) => m.volumeId === selectedVolume?.id)) {
        storageAccessible = true
        storageAccessSource = 'comfy_mount'
        storageAccessMessage = 'Volume acessível via mount do Pod em execução.'
      }
    } catch (error) {
      log('ltx.auto_detect.comfy_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const forceFullScan = mode === 'full'
  const canReuseInventory = shouldReuseStoredInventory({
    snapshot: storedSnapshot,
    accountFingerprint,
    selectedVolumeId: selectedVolume?.id ?? null,
    workflowName,
    workflowFingerprint,
    forceFullScan,
  })
  const preferLight = mode === 'light' || (mode === 'auto' && canReuseInventory)

  // Inspeção S3 do Network Volume — funciona com GPU desligada.
  // Em modo light/auto fresco: reutiliza inventário persistido (não lista milhares de objetos).
  if (selectedVolume?.id && selectedVolume.dataCenterId) {
    s3Endpoint = runpodS3EndpointForDataCenter(selectedVolume.dataCenterId)
    if (preferLight && canReuseInventory && storedSnapshot) {
      fromStoredInventory = true
      inventoryVerifiedAt = storedSnapshot.inventoryVerifiedAt
      lastFullScanAt = storedSnapshot.inventoryVerifiedAt
      volumeModels = storedSnapshot.result.volumeModels
      models = storedSnapshot.result.models
      inspectionStatus = storedSnapshot.result.modelsSummary.inspectionStatus
      inspectionSource = storedSnapshot.inventorySource
      storageAccessible = true
      storageAccessSource = storedSnapshot.inventorySource === 's3' ? 's3' : 'comfy_mount'
      storageAccessMessage = `Inventário armazenado de ${storedSnapshot.inventoryVerifiedAt ?? storedSnapshot.savedAt} (sem nova listagem S3).`
      modelChecks.push(
        `Cache de inventário reutilizado · volume ${selectedVolume.id} · verificado em ${storedSnapshot.inventoryVerifiedAt ?? 'n/d'}.`,
      )
      for (const model of volumeModels) {
        if (model.present) {
          modelChecks.push(`${model.fileName}: ${model.key ?? 'ok'} (armazenado)`)
        }
      }
    } else if (!hasS3Credentials) {
      // Sem S3: ainda pode aproveitar inventário salvo se o volume bater.
      if (canReuseInventory && storedSnapshot) {
        fromStoredInventory = true
        inventoryVerifiedAt = storedSnapshot.inventoryVerifiedAt
        lastFullScanAt = storedSnapshot.inventoryVerifiedAt
        volumeModels = storedSnapshot.result.volumeModels
        models = storedSnapshot.result.models
        inspectionStatus = storedSnapshot.result.modelsSummary.inspectionStatus
        inspectionSource = storedSnapshot.inventorySource
        storageAccessible = storedSnapshot.result.storage.accessible
        storageAccessSource = storedSnapshot.result.storage.accessSource
        storageAccessMessage = storedSnapshot.result.storage.accessMessage
        modelChecks.push('Inventário reutilizado (credenciais S3 ausentes nesta sessão).')
      } else {
        if (inspectionStatus === 'not_attempted') inspectionStatus = 'pending_credentials'
        storageAccessMessage =
          'Storage encontrado, mas a chave S3 ainda não está cadastrada — necessária para verificar modelos com a GPU desligada.'
        modelChecks.push('S3 não consultado: credenciais ausentes.')
      }
    } else if (!s3Endpoint) {
      if (inspectionStatus === 'not_attempted') inspectionStatus = 'pending_unreachable'
      storageAccessMessage = `Datacenter ${selectedVolume.dataCenterId} sem endpoint S3 documentado.`
      modelChecks.push('Endpoint S3 indisponível para o datacenter do volume.')
    } else {
      try {
        const s3 =
          deps.createS3Client?.({
            credentials: s3Credentials!,
            dataCenterId: selectedVolume.dataCenterId,
            volumeId: selectedVolume.id,
          }) ??
          new RunpodS3Client({
            credentials: s3Credentials!,
            dataCenterId: selectedVolume.dataCenterId,
            volumeId: selectedVolume.id,
          })
        const objects = await s3.listAllObjects('')
        listedPrefixes = extractCommonPrefixes(objects.map((obj) => obj.key))
        const matched = matchLtxModelsInS3Objects(objects)
        volumeModels = matched.models
        storageAccessible = true
        storageAccessSource = 's3'
        storageAccessMessage = `ListObjects S3 ok em ${s3.endpointUrl} (${objects.length} objeto(s)).`
        modelChecks.push(
          `S3 ListObjects somente leitura · volume ${selectedVolume.id} · DC ${selectedVolume.dataCenterId}.`,
        )
        if (listedPrefixes.length) {
          modelChecks.push(`Prefixos no volume: ${listedPrefixes.slice(0, 8).join(', ')}`)
        }
        for (const model of matched.models) {
          if (model.present) {
            modelChecks.push(
              `${model.fileName}: ${model.key} · ${model.sizeGib ?? '?'} GiB` +
                (model.sizeMatchesExpected === false ? ' · tamanho diverge do manifesto' : '') +
                (model.nestedPath ? ' · caminho aninhado diferente do esperado' : ''),
            )
          } else {
            modelChecks.push(`${model.fileName}: não encontrado no volume`)
          }
        }
        inspectionSource = 's3'
        inspectionStatus = matched.present === matched.required ? 'found' : 'incomplete'
        inventoryVerifiedAt = fetchedAt
        lastFullScanAt = fetchedAt

        models = matched.models.map((model) => ({
          role: model.role,
          fileName: model.fileName,
          folder: model.expectedRelativeDir.replace(/^models\//, ''),
          present: model.present,
          absolutePath: model.podPathHint,
          sizeBytes: model.sizeBytes,
          sizeGib: model.sizeGib,
          storageKind: model.present ? 'network_volume' : 'unknown',
          onSelectedNetworkVolume: model.present ? true : false,
        }))
      } catch (error) {
        log('ltx.auto_detect.s3_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
        // Se a listagem falhar, preserve inventário anterior em vez de zerar.
        if (storedSnapshot && storedSnapshot.accountFingerprint === accountFingerprint) {
          fromStoredInventory = true
          inventoryVerifiedAt = storedSnapshot.inventoryVerifiedAt
          volumeModels = storedSnapshot.result.volumeModels
          models = storedSnapshot.result.models
          inspectionStatus = storedSnapshot.result.modelsSummary.inspectionStatus
          inspectionSource = storedSnapshot.inventorySource
          storageAccessible = storedSnapshot.result.storage.accessible
          storageAccessSource = storedSnapshot.result.storage.accessSource
          storageAccessMessage = `Falha S3 agora; exibindo inventário salvo de ${storedSnapshot.inventoryVerifiedAt ?? storedSnapshot.savedAt}.`
          modelChecks.push(storageAccessMessage)
        } else {
          if (inspectionStatus === 'not_attempted' || inspectionSource !== 's3') {
            inspectionStatus = 'pending_unreachable'
          }
          storageAccessMessage = `Falha ao listar o volume via S3: ${
            error instanceof Error ? error.message : String(error)
          }`
          modelChecks.push(storageAccessMessage)
        }
      }
    }
  } else if (!selectedVolume) {
    if (inspectionStatus === 'not_attempted') inspectionStatus = 'pending_unreachable'
    storageAccessMessage = 'Nenhum Network Volume selecionado/encontrado na conta.'
  }

  const workflowInfo = analyzeWorkflowForDetect(
    workflow,
    workflowName,
    availableClassTypes,
    comfyAccessible,
  )
  const envKind = resolveComfyEnvironmentKind({
    accessible: comfyAccessible,
    image: ltxPodSummary?.image ?? null,
    templatePinned: plan.templateTagPinned,
    templateImage: plan.templateImage,
  })

  const presentCount =
    inspectionStatus === 'found' || inspectionStatus === 'incomplete'
      ? models.filter((model) => model.present).length
      : null
  const onNetworkVolume = models.filter(
    (model) => model.present && model.storageKind === 'network_volume',
  ).length
  const onContainerDiskOnly = models.filter(
    (model) => model.present && model.storageKind === 'container_disk',
  ).length
  const persistentReady =
    inspectionSource === 's3' &&
    inspectionStatus === 'found' &&
    presentCount === LTX_IA2V_OFFICIAL_MODEL_ASSETS.length

  const modelsWarning =
    inspectionStatus === 'pending_credentials'
      ? 'Cadastre a Access Key S3 (user_…) e o Secret (rps_…) para inspecionar o Network Volume sem ligar a GPU.'
      : presentCount != null && onContainerDiskOnly > 0 && onNetworkVolume === 0
        ? 'Os modelos estão no disco do container/workspace. Sem mount confirmado do Network Volume, não trate /workspace como persistente.'
        : null

  const gpuRecommendations = recommendGpusForLtx({
    plan,
    catalog,
    selectedVolume,
    ltxPod: ltxPodSummary,
    dataCenterGpuAvailability,
  })

  const powerState = resolveComfyPowerState({
    accessible: comfyAccessible,
    podStatus: ltxPodSummary ? String(ltxPodSummary.status) : null,
  })

  const volumeLinkedToPod = Boolean(
    selectedVolume &&
      volumeMountBindings.some((binding) => binding.volumeId === selectedVolume.id),
  )

  const readiness = buildLtxAutoDetectReadiness({
    runpodConnected: Boolean(apiKey),
    comfyAccessible,
    comfyPowerState: powerState,
    workflowStatus: workflowInfo.status,
    modelsPresent: presentCount,
    modelsRequired: LTX_IA2V_OFFICIAL_MODEL_ASSETS.length,
    modelsInspectionStatus: inspectionStatus,
    persistentReady,
    hasVolume: networkVolumes.length > 0,
    storageAccessible,
    gpuOk: Boolean(
      gpuRecommendations[0] &&
        gpuRecommendations[0].fitsVram &&
        gpuRecommendations[0].fitsBudget !== false,
    ),
    volumeLinkedToPod,
  })

  const primary = gpuRecommendations[0]
  const alts = gpuRecommendations.slice(1)
  const suggestedPlan: Partial<LtxEnvironmentPlan> = {
    dryRunOnly: true,
    accountFingerprint,
    storageStrategy: selectedVolume ? 'network_volume' : accountSwitched ? 'undecided' : plan.storageStrategy,
    preferredDataCenterId:
      selectedVolume?.dataCenterId ||
      ltxPodSummary?.dataCenterId ||
      (accountSwitched ? null : plan.preferredDataCenterId),
    networkVolumeId: selectedVolume?.id ?? (accountSwitched ? null : plan.networkVolumeId),
    networkVolumeSizeGb: selectedVolume?.sizeGb ?? (accountSwitched ? null : plan.networkVolumeSizeGb),
    primaryGpuId: (() => {
      const candidate = primary?.gpuId ?? (accountSwitched ? null : plan.primaryGpuId)
      if (candidate && !isRejectedLtxGpuId(candidate)) return candidate
      return (
        gpuRecommendations.find((row) => row.gpuId && !isRejectedLtxGpuId(row.gpuId))?.gpuId ??
        DEFAULT_LTX_GPU_PRIORITIES[0]
      )
    })(),
    alternateGpuIds: (() => {
      const preferred = resolveLtxPreferredGpuOrder({
        primaryGpuId: primary?.gpuId ?? plan.primaryGpuId,
        alternateGpuIds: [
          alts[0]?.gpuId ?? plan.alternateGpuIds[0],
          alts[1]?.gpuId ?? plan.alternateGpuIds[1],
        ],
      })
      const withoutPrimary = preferred.filter(
        (id) => id !== (primary?.gpuId ?? plan.primaryGpuId) && !isRejectedLtxGpuId(id),
      )
      return [withoutPrimary[0] ?? DEFAULT_LTX_GPU_PRIORITIES[1] ?? null, withoutPrimary[1] ?? null]
    })(),
    templateImage: envKind.dockerImageIsPlaceholder
      ? plan.templateImage.includes('pending')
        ? plan.templateImage
        : 'atlas-studio/comfyui-ltx2.3:pending-pin'
      : envKind.dockerImageField || plan.templateImage,
    templateTagPinned: envKind.kind === 'reproducible_validated',
    modelsMountPath:
      volumeMountBindings.find((b) => b.volumeId === selectedVolume?.id)?.mountPath
        ? `${volumeMountBindings
            .find((b) => b.volumeId === selectedVolume?.id)!
            .mountPath.replace(/\/+$/, '')}/models`
        : accountSwitched
          ? DEFAULT_LTX_ENVIRONMENT_PLAN.modelsMountPath
          : plan.modelsMountPath,
    notes: [
      `auto-detect ${fetchedAt}`,
      accountSwitched ? 'conta-trocada' : null,
      selectedVolume ? `volume=${selectedVolume.id}` : 'sem volume',
      ltxPodSummary ? `pod=${ltxPodSummary.id}` : 'sem pod LTX',
      `models=${inspectionStatus}`,
      envKind.kind,
    ]
      .filter(Boolean)
      .join(' · '),
  }

  if (deps.persistSuggestedPlan !== false && apiKey) {
    ;(deps.savePlan ?? saveLtxEnvironmentPlan)(suggestedPlan)
  }

  const modelsPersistentlyVerified =
    (inspectionStatus === 'found' || inspectionStatus === 'incomplete') &&
    (inspectionSource === 's3' || fromStoredInventory) &&
    presentCount != null &&
    presentCount === LTX_IA2V_OFFICIAL_MODEL_ASSETS.length

  const result: LtxAutoDetectResult = {
    fetchedAt,
    dryRun: true,
    mutationCalls: 0,
    accountFingerprint,
    runpodConnected: Boolean(apiKey),
    hasS3Credentials,
    pods: pods.map((pod) => ({
      id: pod.id,
      name: pod.name,
      status: pod.status,
      gpuType: pod.gpuType,
      dataCenterId: pod.dataCenterId,
      costPerHr: pod.costPerHr,
      hasComfyPort: pod.hasComfyPort,
      image: pod.image,
    })),
    networkVolumes,
    selectedVolume,
    storage: {
      found: Boolean(selectedVolume),
      accessible: storageAccessible,
      volumeId: selectedVolume?.id ?? null,
      volumeName: selectedVolume?.name ?? null,
      dataCenterId: selectedVolume?.dataCenterId ?? null,
      sizeGb: selectedVolume?.sizeGb ?? null,
      s3Endpoint,
      accessSource: storageAccessSource,
      accessMessage: storageAccessMessage,
    },
    volumeMountBindings,
    ltxPod: ltxPodSummary
      ? {
          id: ltxPodSummary.id,
          name: ltxPodSummary.name,
          status: String(ltxPodSummary.status),
          dataCenterId: ltxPodSummary.dataCenterId,
          gpuType: ltxPodSummary.gpuType,
          costPerHr: ltxPodSummary.costPerHr,
          image: ltxPodSummary.image,
          comfyProxyUrl: ltxPodSummary.comfyProxyUrl,
          networkMounts: ltxPodSummary.networkMounts,
          persistentMountPath:
            ltxPodSummary.networkMounts.find((m) => m.volumeId === selectedVolume?.id)?.path ??
            ltxPodSummary.networkMounts[0]?.path ??
            null,
          linkedToSelectedVolume: Boolean(
            selectedVolume &&
              ltxPodSummary.networkMounts.some((m) => m.volumeId === selectedVolume.id),
          ),
        }
      : null,
    comfy: {
      accessible: comfyAccessible,
      powerState,
      version: comfyVersion,
      pytorchVersion,
      pythonVersion,
      gpuName,
      vramTotalGb,
      environmentKind: envKind.kind,
      dockerImageField: envKind.dockerImageField,
      dockerImageIsPlaceholder: envKind.dockerImageIsPlaceholder,
      message: comfyAccessible
        ? `ComfyUI ligado (${comfyVersion ?? 'versão n/d'}).`
        : powerState === 'offline'
          ? 'ComfyUI desligado — inicie o Pod para testar a execução.'
          : 'ComfyUI indisponível (status desconhecido).',
    },
    workflow: {
      present: workflowInfo.present,
      name: workflowInfo.name,
      nodeCount: workflowInfo.nodeCount,
      hasLtxMarker: workflowInfo.hasLtxMarker,
      classTypesOk: workflowInfo.classTypesOk,
      classTypesPending: workflowInfo.classTypesPending,
      status: workflowInfo.status,
      missingClassTypes: workflowInfo.missingClassTypes,
    },
    models,
    volumeModels,
    modelsSummary: {
      required: LTX_IA2V_OFFICIAL_MODEL_ASSETS.length,
      present: presentCount,
      inspectionStatus,
      inspectionSource,
      onNetworkVolume,
      onContainerDiskOnly,
      persistentReady,
      label: buildModelsSummaryLabel({
        inspectionStatus,
        present: presentCount,
        required: LTX_IA2V_OFFICIAL_MODEL_ASSETS.length,
      }),
      warning: modelsWarning,
      checks: modelChecks,
    },
    gpuRecommendations,
    readiness,
    suggestedPlan,
    persistence: {
      savedAt: storedSnapshot?.savedAt ?? null,
      inventoryVerifiedAt,
      fromStoredInventory,
      lastFullScanAt: lastFullScanAt ?? storedSnapshot?.inventoryVerifiedAt ?? null,
      environmentConfigured: Boolean(
        apiKey && selectedVolume && workflowInfo.present && workflowInfo.hasLtxMarker,
      ),
      modelsPersistentlyVerified: Boolean(modelsPersistentlyVerified),
    },
    futureLipsyncIntegration: {
      prepared: true,
      autoStartPod: false,
      autoShutdown: false,
      notes: [
        'Configuração salva para o fluxo futuro “Gerar LipSync”.',
        'auto-start / auto-shutdown de GPU permanecem desligados até autorização explícita.',
        'Modelos já validados no volume não devem ser baixados de novo.',
        'ComfyQueueService, downloads e FFmpeg não foram alterados.',
      ],
    },
  }

  if (deps.persistSnapshot !== false && accountFingerprint) {
    const inventoryJustVerified =
      !fromStoredInventory &&
      (inspectionStatus === 'found' || inspectionStatus === 'incomplete') &&
      (inspectionSource === 's3' || inspectionSource === 'comfy')
    ;(deps.saveSnapshot ?? saveLtxDetectionSnapshot)(result, {
      inventoryVerifiedAt: inventoryJustVerified
        ? fetchedAt
        : inventoryVerifiedAt ?? storedSnapshot?.inventoryVerifiedAt ?? null,
      inventoryVolumeId: selectedVolume?.id ?? storedSnapshot?.inventoryVolumeId ?? null,
      inventoryWorkflowName: workflowName || storedSnapshot?.inventoryWorkflowName || null,
      inventoryWorkflowFingerprint:
        workflowFingerprint ?? storedSnapshot?.inventoryWorkflowFingerprint ?? null,
      inventorySource: inspectionSource === 'none' ? storedSnapshot?.inventorySource ?? 'none' : inspectionSource,
    })
    result.persistence.savedAt = new Date().toISOString()
    if (inventoryJustVerified) {
      result.persistence.inventoryVerifiedAt = fetchedAt
      result.persistence.lastFullScanAt = fetchedAt
    }
  }

  log('ltx.auto_detect.done', {
    readyForLipsync: readiness.readyForLipsync,
    readyForRecovery: readiness.readyForRecoveryOnOtherPod,
    inspectionStatus,
    fromStoredInventory,
    persistentReady,
    volumes: networkVolumes.length,
    pods: pods.length,
  })

  return result
}
