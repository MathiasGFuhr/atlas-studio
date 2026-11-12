import {
  comfyRunpodProxyUrl,
  pickRunpodComfyPod,
  podIdFromComfyUrl,
  type RunpodPodCandidate,
} from '../../../shared/comfy'
import { logger } from '../logging/logger'
import { v2PodToCandidate } from './runpod/mapRunpodV2'
import { RunpodApiError, RunpodClientV2 } from './runpod/RunpodClientV2'

export function createRunpodClient(apiKey: string): RunpodClientV2 {
  return new RunpodClientV2({
    apiKey,
    log: (event, data) => logger.info(event, data),
  })
}

/** Lista pods via REST v2 (somente leitura). */
export async function listRunpodPods(apiKey: string): Promise<RunpodPodCandidate[]> {
  const client = createRunpodClient(apiKey)
  const pods = await client.listPods()
  return pods.filter((pod) => pod.id).map(v2PodToCandidate)
}

export async function resolveRunpodComfyUrl(
  apiKey: string,
  currentUrl = '',
): Promise<{ baseUrl: string; podId: string; podName: string }> {
  const pods = await listRunpodPods(apiKey.trim())
  const picked = pickRunpodComfyPod(pods, podIdFromComfyUrl(currentUrl))
  if (!picked) {
    throw new Error('Pod desligado. Ligue no RunPod e clique em Atualizar.')
  }
  return {
    baseUrl: comfyRunpodProxyUrl(picked.id, picked.port),
    podId: picked.id,
    podName: picked.name,
  }
}

export function isRunpodAuthError(error: unknown): boolean {
  return error instanceof RunpodApiError && (error.status === 401 || error.status === 403)
}

export { RunpodClientV2, RunpodApiError }
