/** Contrato de ajustes de IMAGEM enviado no generation.run. Vídeo não entra. */

export const FLOW_IMAGE_ASPECTS = ['16:9', '4:3', '1:1', '3:4', '9:16']

export const FLOW_IMAGE_MODELS = [
  { key: 'nano-banana-pro', label: 'Nano Banana Pro' },
  { key: 'nano-banana-2-lite', label: 'Nano Banana 2 Lite' },
  { key: 'nano-banana-2.1', label: 'Nano Banana 2.1' },
]

export const FLOW_IMAGE_REASONING = [
  { key: 'low', labels: ['baixo', 'low'] },
  { key: 'medium', labels: ['medio', 'medium'] },
  { key: 'high', labels: ['alto', 'high'] },
]

export const DEFAULT_FLOW_IMAGE_SETTINGS = {
  mode: 'image',
  aspectRatio: '16:9',
  modelKey: 'nano-banana-2.1',
  modelLabel: 'Nano Banana 2.1',
  reasoning: 'high',
  outputs: 3,
}

export function normalizeFlowLabel(label) {
  return String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeFlowImageSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const aspect = FLOW_IMAGE_ASPECTS.includes(source.aspectRatio)
    ? source.aspectRatio
    : DEFAULT_FLOW_IMAGE_SETTINGS.aspectRatio
  const reasoning = FLOW_IMAGE_REASONING.some((item) => item.key === source.reasoning)
    ? source.reasoning
    : DEFAULT_FLOW_IMAGE_SETTINGS.reasoning
  const outputsRaw = Number(source.outputs)
  const outputs = [1, 2, 3, 4].includes(outputsRaw)
    ? outputsRaw
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

export function flowImageControlPlan(settings) {
  const normalized = normalizeFlowImageSettings(settings)
  const reasoning = FLOW_IMAGE_REASONING.find((item) => item.key === normalized.reasoning)
  return {
    settings: normalized,
    imageTabLabels: ['imagem', 'image'],
    aspectLabel: normalized.aspectRatio,
    modelLabel: normalized.modelLabel,
    reasoningLabels: reasoning?.labels || ['alto', 'high'],
    outputLabels: [`x${normalized.outputs}`, `×${normalized.outputs}`],
  }
}

/** O rótulo fechado precisa ser um único modelo. Lista aberta com os três não conta como seleção. */
export function closedModelMatches(text, wantedLabel) {
  const key = normalizeFlowLabel(text)
  const wanted = normalizeFlowLabel(wantedLabel)
  const known = FLOW_IMAGE_MODELS.map((item) => normalizeFlowLabel(item.label)).sort(
    (a, b) => b.length - a.length,
  )
  const present = known.filter((label) => key.includes(label))
  return present.length === 1 && present[0] === wanted
}

export function labelMatchesFlowControl(label, candidates) {
  const normalized = normalizeFlowLabel(label)
  return candidates.some((candidate) => normalizeFlowLabel(candidate) === normalized)
}
