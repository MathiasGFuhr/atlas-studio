export const FLOW_IMAGE_ASPECTS = ['16:9', '4:3', '1:1', '3:4', '9:16'] as const
export type FlowImageAspect = (typeof FLOW_IMAGE_ASPECTS)[number]

export const FLOW_IMAGE_MODELS = [
  { key: 'nano-banana-pro', label: 'Nano Banana Pro' },
  { key: 'nano-banana-2-lite', label: 'Nano Banana 2 Lite' },
  { key: 'nano-banana-2.1', label: 'Nano Banana 2.1' },
] as const
export type FlowImageModelKey = (typeof FLOW_IMAGE_MODELS)[number]['key']

export const FLOW_IMAGE_REASONING = [
  { key: 'low', label: 'Baixo', detail: 'Rápido' },
  { key: 'medium', label: 'Médio', detail: 'Equilíbrio' },
  { key: 'high', label: 'Alto', detail: 'Muito detalhado' },
] as const
export type FlowImageReasoning = (typeof FLOW_IMAGE_REASONING)[number]['key']

export const FLOW_IMAGE_OUTPUTS = [1, 2, 3, 4] as const
export type FlowImageOutputs = (typeof FLOW_IMAGE_OUTPUTS)[number]

/** Ajustes de imagem do compositor do Flow. Vídeo fica fora deste contrato. */
export type FlowImageSettings = {
  mode: 'image'
  aspectRatio: FlowImageAspect
  modelKey: FlowImageModelKey
  modelLabel: string
  reasoning: FlowImageReasoning
  outputs: FlowImageOutputs
}

export const DEFAULT_FLOW_IMAGE_SETTINGS: FlowImageSettings = {
  mode: 'image',
  aspectRatio: '16:9',
  modelKey: 'nano-banana-2.1',
  modelLabel: 'Nano Banana 2.1',
  reasoning: 'high',
  outputs: 3,
}

export function flowImageSettingsStorageKey(atlasProjectId: string): string {
  return `atlas-flow-v1.imageSettings.${atlasProjectId}`
}

export function reasoningDetail(reasoning: FlowImageReasoning): string {
  return FLOW_IMAGE_REASONING.find((item) => item.key === reasoning)?.detail || 'Muito detalhado'
}

/** Nano Banana 2.1 não consome créditos do Flow. Os outros modelos mostram o custo no próprio Flow. */
export function flowImageCreditsLabel(modelKey: FlowImageModelKey = 'nano-banana-2.1'): string | null {
  if (modelKey === 'nano-banana-2.1') return 'A geração vai usar 0 créditos'
  return null
}

export function normalizeFlowImageSettings(raw: unknown): FlowImageSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const aspect = FLOW_IMAGE_ASPECTS.includes(source.aspectRatio as FlowImageAspect)
    ? (source.aspectRatio as FlowImageAspect)
    : DEFAULT_FLOW_IMAGE_SETTINGS.aspectRatio
  const reasoning = FLOW_IMAGE_REASONING.some((item) => item.key === source.reasoning)
    ? (source.reasoning as FlowImageReasoning)
    : DEFAULT_FLOW_IMAGE_SETTINGS.reasoning
  const outputsRaw = Number(source.outputs)
  const outputs = (FLOW_IMAGE_OUTPUTS as readonly number[]).includes(outputsRaw)
    ? (outputsRaw as FlowImageOutputs)
    : DEFAULT_FLOW_IMAGE_SETTINGS.outputs
  const model =
    FLOW_IMAGE_MODELS.find((item) => item.key === source.modelKey) ||
    FLOW_IMAGE_MODELS.find((item) => item.label === source.modelLabel) ||
    FLOW_IMAGE_MODELS.find((item) => item.key === DEFAULT_FLOW_IMAGE_SETTINGS.modelKey) ||
    FLOW_IMAGE_MODELS[0]
  return {
    mode: 'image',
    aspectRatio: aspect,
    modelKey: model.key,
    modelLabel: model.label,
    reasoning,
    outputs,
  }
}

export function readStoredFlowImageSettings(raw: string | null | undefined): FlowImageSettings {
  if (!raw?.trim()) return { ...DEFAULT_FLOW_IMAGE_SETTINGS }
  try {
    return normalizeFlowImageSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_FLOW_IMAGE_SETTINGS }
  }
}
