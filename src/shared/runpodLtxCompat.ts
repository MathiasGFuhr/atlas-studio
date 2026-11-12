/**
 * Avaliação heurística de compatibilidade Pod × ComfyUI LTX-2.3.
 * Não altera o workflow — só diagnostica antes/depois do start.
 */

import type { ComfyApiWorkflow } from './comfy'
import type { RunpodGpuCatalogEntry, RunpodPodSummary } from './runpod'

/** VRAM recomendada para LTX-2.3 com margem (aviso abaixo disso). */
export const LTX_RECOMMENDED_VRAM_GB = 24
/**
 * Mínimo para FP8 distilled com offload (docs públicos LTX 2.3).
 * Abaixo disso, bloqueamos o start no plano de compatibilidade.
 */
export const LTX_MINIMUM_VRAM_GB = 16

/** Marcadores típicos do workflow LTX 2.3 usados no Atlas. */
export const LTX_MARKER_CLASS_TYPES = ['TextGenerateLTX2Prompt'] as const

export const LTX_CORE_CLASS_TYPES = [
  'LoadImage',
  'LoadAudio',
  'SaveVideo',
  'PrimitiveStringMultiline',
  'PrimitiveFloat',
  'TextGenerateLTX2Prompt',
] as const

export type LtxCompatLevel = 'ok' | 'warn' | 'block'

export type LtxPodCompatibility = {
  level: LtxCompatLevel
  canStart: boolean
  reasons: string[]
  warnings: string[]
  gpuType: string | null
  vramGb: number | null
  hasComfyPort: boolean
  startAllowedByApi: boolean
}

function guessVramGb(
  pod: RunpodPodSummary,
  catalog: RunpodGpuCatalogEntry[] | undefined,
): number | null {
  if (typeof pod.gpuMemoryGb === 'number' && pod.gpuMemoryGb > 0) {
    // Em vários pods o campo memory é RAM de sistema, não VRAM — se > 48 trate como incerto.
    if (pod.gpuMemoryGb <= 48) return pod.gpuMemoryGb
  }
  const gpuId = pod.gpuType?.trim()
  if (!gpuId || !catalog?.length) return null
  const hit = catalog.find((gpu) => gpu.id === gpuId || gpu.name === gpuId)
  return hit?.memoryGb ?? null
}

export function assessLtxPodCompatibility(
  pod: RunpodPodSummary,
  catalog?: RunpodGpuCatalogEntry[],
): LtxPodCompatibility {
  const reasons: string[] = []
  const warnings: string[] = []
  const vramGb = guessVramGb(pod, catalog)
  const status = String(pod.status || '').toUpperCase()
  const actions = pod.actions ?? []
  const startAllowedByApi = actions.includes('start') || status === 'EXITED' || status === 'ERROR'
  const alreadyRunning = status === 'RUNNING'

  if (status === 'TERMINATED') {
    reasons.push('Pod terminado permanentemente — não pode ser iniciado (Fase 2 não cria Pod novo).')
  }
  if (pod.locked) {
    reasons.push('Pod bloqueado na conta RunPod.')
  }
  if (!pod.hasComfyPort) {
    reasons.push('Porta 8188/http não está configurada neste Pod (ComfyUI).')
  }
  if (!alreadyRunning && !startAllowedByApi && status !== 'PROVISIONING' && status !== 'STARTING') {
    reasons.push(`Status ${status || 'desconhecido'} não permite start agora.`)
  }
  if (vramGb != null && vramGb < LTX_MINIMUM_VRAM_GB) {
    reasons.push(`VRAM estimada ${vramGb} GB abaixo do mínimo ${LTX_MINIMUM_VRAM_GB} GB para LTX-2.3.`)
  } else if (vramGb != null && vramGb < LTX_RECOMMENDED_VRAM_GB) {
    warnings.push(
      `VRAM estimada ${vramGb} GB abaixo do recomendado (${LTX_RECOMMENDED_VRAM_GB} GB) para LTX-2.3.`,
    )
  } else if (vramGb == null) {
    warnings.push('Não foi possível confirmar a VRAM da GPU pelo catálogo — valide no painel RunPod.')
  }

  const blob = `${pod.name} ${pod.image ?? ''}`.toLowerCase()
  if (!/comfy|ltx/.test(blob)) {
    warnings.push(
      'Nome/imagem do Pod não menciona Comfy/LTX — confirme que este é o ambiente com LTX-2.3 instalado.',
    )
  }

  const level: LtxCompatLevel = reasons.length > 0 ? 'block' : warnings.length > 0 ? 'warn' : 'ok'
  const canStart =
    reasons.length === 0 && (alreadyRunning || startAllowedByApi || status === 'PROVISIONING' || status === 'STARTING')

  return {
    level,
    canStart,
    reasons,
    warnings,
    gpuType: pod.gpuType,
    vramGb,
    hasComfyPort: pod.hasComfyPort,
    startAllowedByApi: alreadyRunning || startAllowedByApi,
  }
}

/** Lista class_types únicos do workflow importado (para checar /object_info). */
export function workflowRequiredClassTypes(workflow: ComfyApiWorkflow | null | undefined): string[] {
  if (!workflow) return [...LTX_CORE_CLASS_TYPES]
  const set = new Set<string>()
  for (const node of Object.values(workflow)) {
    if (node?.class_type) set.add(node.class_type)
  }
  for (const marker of LTX_MARKER_CLASS_TYPES) set.add(marker)
  return [...set].sort()
}

export type ComfyNodeReadiness = {
  ok: boolean
  present: string[]
  missing: string[]
  hasLtxMarker: boolean
  message: string
}

export function evaluateComfyNodeReadiness(
  availableClassTypes: Iterable<string>,
  required: string[],
): ComfyNodeReadiness {
  const available = new Set(availableClassTypes)
  const present = required.filter((name) => available.has(name))
  const missing = required.filter((name) => !available.has(name))
  const hasLtxMarker = LTX_MARKER_CLASS_TYPES.some((name) => available.has(name))
  if (!hasLtxMarker) {
    missing.push(
      ...LTX_MARKER_CLASS_TYPES.filter((name) => !missing.includes(name) && !available.has(name)),
    )
  }
  const uniqueMissing = [...new Set(missing)]
  const ok = uniqueMissing.length === 0 && hasLtxMarker
  return {
    ok,
    present,
    missing: uniqueMissing,
    hasLtxMarker,
    message: ok
      ? 'ComfyUI responde e os nós do workflow LTX-2.3 estão registrados.'
      : uniqueMissing.length > 0
        ? `Nós ausentes no ComfyUI: ${uniqueMissing.slice(0, 8).join(', ')}${uniqueMissing.length > 8 ? '…' : ''}`
        : 'Marcador LTX-2.3 (TextGenerateLTX2Prompt) não encontrado no ComfyUI.',
  }
}
