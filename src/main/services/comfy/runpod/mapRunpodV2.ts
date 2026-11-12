import {
  COMFY_RUNPOD_PORT,
  comfyRunpodProxyUrl,
  type RunpodPodCandidate,
} from '../../../../shared/comfy'
import type {
  RunpodGpuCatalogEntry,
  RunpodNetworkVolumeSummary,
  RunpodPodSummary,
  RunpodTemplateSummary,
} from '../../../../shared/runpod'
import type {
  RunpodV2GpuType,
  RunpodV2NetworkVolume,
  RunpodV2Pod,
  RunpodV2Template,
} from './RunpodClientV2'

function parseConfiguredHttpPorts(ports: string[] | null | undefined): number[] {
  return (ports ?? [])
    .map((entry) => {
      const [port, type] = entry.split('/')
      if (type && type.toLowerCase() !== 'http') return NaN
      return Number(port)
    })
    .filter((port) => Number.isFinite(port) && port > 0)
}

export function podHasComfyPort(pod: RunpodV2Pod): boolean {
  return parseConfiguredHttpPorts(pod.ports).includes(COMFY_RUNPOD_PORT)
}

/** Converte pod v2 no formato usado por pickRunpodComfyPod. */
export function v2PodToCandidate(pod: RunpodV2Pod): RunpodPodCandidate {
  const configured = parseConfiguredHttpPorts(pod.ports)
  const runtimePorts =
    configured.length > 0
      ? configured.map((privatePort) => ({ privatePort, type: 'http' }))
      : (pod.runtime?.ports ?? [])
          .map((port) => ({
            privatePort: Number(port.private),
            type: port.type ?? 'http',
          }))
          .filter((port) => Number.isFinite(port.privatePort) && port.privatePort > 0)

  return {
    id: pod.id,
    name: pod.name || pod.id,
    desiredStatus: pod.status ?? null,
    status: pod.status ?? null,
    ports: pod.ports ?? [],
    gpuType: pod.gpu?.id ?? null,
    dataCenterId: pod.dataCenterId ?? null,
    costPerHr: typeof pod.cost === 'number' ? pod.cost : null,
    runtime: { ports: runtimePorts },
  }
}

export function summarizeV2Pod(pod: RunpodV2Pod): RunpodPodSummary {
  const hasComfy = podHasComfyPort(pod)
  const networkMounts = (pod.mounts?.network ?? [])
    .map((mount) => ({
      volumeId: String(mount.volumeId ?? '').trim(),
      path: String(mount.path ?? '').trim() || '/runpod-volume',
    }))
    .filter((mount) => mount.volumeId)
  return {
    id: pod.id,
    name: pod.name || pod.id,
    status: pod.status ?? 'UNKNOWN',
    gpuType: pod.gpu?.id ?? null,
    gpuMemoryGb: typeof pod.gpu?.memory === 'number' ? pod.gpu.memory : null,
    dataCenterId: pod.dataCenterId ?? null,
    ports: Array.isArray(pod.ports) ? pod.ports : [],
    costPerHr: typeof pod.cost === 'number' ? pod.cost : null,
    cloud: pod.cloud ?? null,
    hasComfyPort: hasComfy,
    comfyProxyUrl: hasComfy ? comfyRunpodProxyUrl(pod.id, COMFY_RUNPOD_PORT) : null,
    actions: Array.isArray(pod.actions) ? pod.actions.map(String) : [],
    locked: Boolean(pod.locked),
    image: pod.image ?? null,
    networkMounts,
  }
}

export function summarizeGpuType(gpu: RunpodV2GpuType): RunpodGpuCatalogEntry {
  return {
    id: gpu.id,
    name: gpu.name?.trim() || gpu.id,
    memoryGb: typeof gpu.memory === 'number' ? gpu.memory : null,
    securePrice: typeof gpu.price?.secure === 'number' ? gpu.price.secure : null,
    communityPrice: typeof gpu.price?.community === 'number' ? gpu.price.community : null,
    availability: gpu.availability ?? null,
  }
}

export function summarizeNetworkVolume(volume: RunpodV2NetworkVolume): RunpodNetworkVolumeSummary {
  return {
    id: volume.id,
    name: volume.name?.trim() || volume.id,
    sizeGb: typeof volume.size === 'number' ? volume.size : null,
    dataCenterId: volume.dataCenter ?? null,
  }
}

export function summarizeTemplate(template: RunpodV2Template): RunpodTemplateSummary {
  return {
    id: template.id,
    name: template.name?.trim() || template.id,
    image: template.image ?? null,
    serverless: Boolean(template.serverless),
  }
}
