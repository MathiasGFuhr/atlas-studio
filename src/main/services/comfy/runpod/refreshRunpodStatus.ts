import {
  pickRunpodComfyPod,
  podIdFromComfyUrl,
  type ComfyConnectionInfo,
} from '../../../../shared/comfy'
import type { RunpodInfraStatus, RunpodPodLifecycleState } from '../../../../shared/runpod'
import { assessLtxPodCompatibility } from '../../../../shared/runpodLtxCompat'
import { logger } from '../../logging/logger'
import { isRunpodAuthError, createRunpodClient } from '../runpod'
import {
  summarizeGpuType,
  summarizeNetworkVolume,
  summarizeTemplate,
  summarizeV2Pod,
  v2PodToCandidate,
} from './mapRunpodV2'

export type RefreshRunpodStatusDeps = {
  getApiKey: () => string
  getConfiguredUrl: () => string
  getAutoInfraEnabled: () => boolean
  getPreferredPodId?: () => string | null
  getDryRunStarts?: () => boolean
  getLifecycle?: () => RunpodPodLifecycleState | null
  testComfy: (baseUrl: string) => Promise<ComfyConnectionInfo>
}

/**
 * Painel de estado: só GET na API v2 + teste HTTP no ComfyUI.
 * Nunca cria/inicia/para/exclui pods.
 */
export async function refreshRunpodInfraStatus(
  deps: RefreshRunpodStatusDeps,
): Promise<RunpodInfraStatus> {
  const fetchedAt = new Date().toISOString()
  const configuredUrl = deps.getConfiguredUrl()
  const autoInfraEnabled = deps.getAutoInfraEnabled()
  const preferredPodId = deps.getPreferredPodId?.()?.trim() || null
  const dryRunStarts = deps.getDryRunStarts?.() ?? true
  const lifecycle = deps.getLifecycle?.() ?? null
  const apiKey = deps.getApiKey().trim()

  const empty: RunpodInfraStatus = {
    fetchedAt,
    apiKeyPresent: Boolean(apiKey),
    apiKeyValid: null,
    error: null,
    autoInfraEnabled,
    preferredPodId,
    dryRunStarts,
    configuredUrl,
    urlStale: false,
    selectedPod: null,
    pods: [],
    suggestedUrl: null,
    comfy: null,
    gpuCatalog: [],
    networkVolumes: [],
    templates: [],
    mutationCalls: 0,
    lifecycle,
  }

  if (!apiKey) {
    return {
      ...empty,
      error: 'Cole a chave da API do RunPod nas Configurações para consultar os pods.',
    }
  }

  const client = createRunpodClient(apiKey)
  logger.info('runpod.status.refresh.start', { hasKey: true })

  try {
    const podsV2 = await client.listPods()
    const [gpus, volumes, templates] = await Promise.all([
      client.listGpuTypes({ includeAvailability: true }).catch((error) => {
        logger.warn('runpod.status.gpus_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }),
      client.listNetworkVolumes().catch((error) => {
        logger.warn('runpod.status.volumes_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }),
      client.listTemplates().catch((error) => {
        logger.warn('runpod.status.templates_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
        return []
      }),
    ])

    const gpuCatalog = gpus.map(summarizeGpuType).slice(0, 40)
    const pods = podsV2
      .filter((pod) => pod.id)
      .map(summarizeV2Pod)
      .map((pod) => ({ ...pod, ltxCompat: assessLtxPodCompatibility(pod, gpuCatalog) }))
    const candidates = podsV2.filter((pod) => pod.id).map(v2PodToCandidate)
    const urlPodId = podIdFromComfyUrl(configuredUrl)
    const pickPreferred = preferredPodId || urlPodId
    const pickedRunning = pickRunpodComfyPod(candidates, pickPreferred)
    const preferredSummary =
      (preferredPodId ? pods.find((pod) => pod.id === preferredPodId) : null) ??
      (pickedRunning ? pods.find((pod) => pod.id === pickedRunning.id) : null) ??
      null
    const preferredStillRunning = Boolean(
      urlPodId && pickedRunning && pickedRunning.id === urlPodId,
    )
    const urlStale = Boolean(configuredUrl && urlPodId && !preferredStillRunning)
    const suggestedUrl = pickedRunning
      ? pods.find((pod) => pod.id === pickedRunning.id)?.comfyProxyUrl ??
        `https://${pickedRunning.id}-${pickedRunning.port}.proxy.runpod.net`
      : preferredSummary?.comfyProxyUrl ?? null

    let comfy: ComfyConnectionInfo | null = null
    const urlToProbe = preferredStillRunning ? configuredUrl : suggestedUrl
    if (urlToProbe) {
      try {
        comfy = await deps.testComfy(urlToProbe)
      } catch (error) {
        comfy = {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    logger.info('runpod.status.refresh.ok', {
      pods: pods.length,
      urlStale,
      selectedPodId: preferredSummary?.id ?? null,
      comfyOk: comfy?.ok ?? null,
    })

    return {
      fetchedAt,
      apiKeyPresent: true,
      apiKeyValid: true,
      error: null,
      autoInfraEnabled,
      preferredPodId,
      dryRunStarts,
      configuredUrl,
      urlStale,
      selectedPod: preferredSummary,
      pods,
      suggestedUrl,
      comfy,
      gpuCatalog,
      networkVolumes: volumes.map(summarizeNetworkVolume),
      templates: templates.filter((row) => !row.serverless).map(summarizeTemplate).slice(0, 40),
      mutationCalls: 0,
      lifecycle,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('runpod.status.refresh.failed', {
      auth: isRunpodAuthError(error),
      message,
    })
    return {
      ...empty,
      apiKeyValid: isRunpodAuthError(error) ? false : null,
      error: message,
    }
  }
}
