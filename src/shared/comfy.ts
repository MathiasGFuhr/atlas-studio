import { comfyDurationSeconds } from './lipSyncRefs'

/** Workflow do ComfyUI exportado em "formato API" (Workflow → Export (API)). */
export type ComfyApiNode = {
  inputs: Record<string, unknown>
  class_type: string
  _meta?: { title?: string }
}

export type ComfyApiWorkflow = Record<string, ComfyApiNode>

/** Quais nós do workflow recebem os dados de cada cena. */
export type ComfyWorkflowMapping = {
  imageNode: string
  audioNode: string
  promptNode: string
  promptField: string
  durationNode: string
  saveNode: string
  seedNodes: Array<{ node: string; field: string }>
  /** Nó booleano do "Prompt Enhance"; o Atlas sempre o desliga. */
  enhanceNode: string | null
}

export type ComfyConfig = {
  baseUrl: string
  /** Trabalhos mantidos na fila do ComfyUI ao mesmo tempo (1 renderizando + o resto aguardando). */
  queueSize: number
  /** Segundos somados à parte inteira do áudio no campo Duration. */
  durationPadding: number
  workflowName: string
  workflowMapping: ComfyWorkflowMapping | null
}

export const COMFY_QUEUE_SIZE_DEFAULT = 5
export const COMFY_QUEUE_SIZE_MAX = 10
export const COMFY_DURATION_PADDING_MAX = 5

export const DEFAULT_COMFY_CONFIG: ComfyConfig = {
  baseUrl: '',
  queueSize: COMFY_QUEUE_SIZE_DEFAULT,
  durationPadding: 1,
  workflowName: '',
  workflowMapping: null,
}

export type ComfyJobStatus =
  | 'pending'
  | 'uploading'
  | 'queued'
  | 'downloading'
  | 'done'
  | 'error'
  | 'canceled'

export type ComfyBatchStatus = 'running' | 'paused' | 'done' | 'canceled'

export type ComfyJob = {
  id: string
  batchId: string
  refId: string
  sceneNumber: number
  imagePath: string
  audioPath: string
  prompt: string
  duration: number
  seed: number
  status: ComfyJobStatus
  promptId: string | null
  outputPath: string | null
  error: string | null
  attempts: number
  createdAt: string
  updatedAt: string
}

export type ComfyBatch = {
  id: string
  projectId: string | null
  outputDir: string
  status: ComfyBatchStatus
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type ComfyBatchView = {
  batch: ComfyBatch
  jobs: ComfyJob[]
  counts: Record<ComfyJobStatus, number>
}

export type ComfyStartResult = {
  view: ComfyBatchView
  /** Cenas que ficaram de fora por falta de imagem, áudio ou prompt. */
  skipped: string[]
}

export type ComfyConnectionInfo = {
  ok: boolean
  message: string
  gpu?: string
  vramTotalGb?: number
  comfyVersion?: string
}

/** Arquivo de saída como aparece no `/history` do ComfyUI. */
export type ComfyOutputFile = {
  filename: string
  subfolder: string
  type: string
}

export const COMFY_ACTIVE_STATUSES: ComfyJobStatus[] = ['uploading', 'queued']
export const COMFY_TERMINAL_STATUSES: ComfyJobStatus[] = ['done', 'error', 'canceled']

export function normalizeComfyBaseUrl(raw: string): string {
  let value = raw.trim()
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  return value.replace(/\/+$/, '')
}

export function normalizeComfyConfig(input: Partial<ComfyConfig> | null | undefined): ComfyConfig {
  const queueSize = Math.round(Number(input?.queueSize))
  const padding = Math.round(Number(input?.durationPadding))
  return {
    baseUrl: normalizeComfyBaseUrl(String(input?.baseUrl ?? '')),
    queueSize: Number.isFinite(queueSize)
      ? Math.min(COMFY_QUEUE_SIZE_MAX, Math.max(1, queueSize))
      : COMFY_QUEUE_SIZE_DEFAULT,
    durationPadding: Number.isFinite(padding)
      ? Math.min(COMFY_DURATION_PADDING_MAX, Math.max(0, padding))
      : DEFAULT_COMFY_CONFIG.durationPadding,
    workflowName: String(input?.workflowName ?? ''),
    workflowMapping: input?.workflowMapping ?? null,
  }
}

function title(node: ComfyApiNode): string {
  return node._meta?.title?.trim() ?? ''
}

function nodesOf(workflow: ComfyApiWorkflow, classType: string): string[] {
  return Object.keys(workflow).filter((id) => workflow[id]?.class_type === classType)
}

/** Lê o JSON exportado e garante que é o formato API (o formato normal tem `nodes` e `links`). */
export function parseComfyWorkflow(text: string): ComfyApiWorkflow {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um JSON válido.')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('O arquivo não é um workflow do ComfyUI.')
  }
  const record = data as Record<string, unknown>
  if (Array.isArray(record.nodes) && Array.isArray(record.links)) {
    throw new Error('Este é o workflow normal. No ComfyUI, use Workflow → Export (API).')
  }
  const entries = Object.entries(record)
  const valid =
    entries.length > 0 &&
    entries.every(
      ([, node]) =>
        node &&
        typeof node === 'object' &&
        typeof (node as ComfyApiNode).class_type === 'string' &&
        typeof (node as ComfyApiNode).inputs === 'object',
    )
  if (!valid) throw new Error('O arquivo não está no formato API do ComfyUI.')
  return record as ComfyApiWorkflow
}

function single(workflow: ComfyApiWorkflow, classType: string, label: string): string {
  const ids = nodesOf(workflow, classType)
  if (ids.length === 0) throw new Error(`O workflow não tem o nó ${classType} (${label}).`)
  if (ids.length > 1) {
    throw new Error(`O workflow tem ${ids.length} nós ${classType}; deixe só um para ${label}.`)
  }
  return ids[0]
}

function findByTitle(
  workflow: ComfyApiWorkflow,
  pattern: RegExp,
  accept: (node: ComfyApiNode) => boolean,
): string | null {
  return Object.keys(workflow).find((id) => pattern.test(title(workflow[id])) && accept(workflow[id])) ?? null
}

/** Encontra os nós pelo tipo e pelo título, não pelo número (os IDs mudam quando o workflow é remontado). */
export function detectComfyWorkflowMapping(workflow: ComfyApiWorkflow): ComfyWorkflowMapping {
  const imageNode = single(workflow, 'LoadImage', 'a imagem da cena')
  const audioNode = single(workflow, 'LoadAudio', 'o áudio da cena')
  const saveNode = single(workflow, 'SaveVideo', 'salvar o vídeo')

  const isText = (node: ComfyApiNode) => typeof node.inputs.value === 'string'
  let promptNode = findByTitle(workflow, /^prompt$/i, isText)
  if (!promptNode) {
    const multiline = nodesOf(workflow, 'PrimitiveStringMultiline')
    if (multiline.length === 1) promptNode = multiline[0]
  }
  if (!promptNode) throw new Error('Não encontrei o nó de texto com título "Prompt".')

  const isNumber = (node: ComfyApiNode) => typeof node.inputs.value === 'number'
  const durationNode = findByTitle(workflow, /^duration$/i, isNumber)
  if (!durationNode) throw new Error('Não encontrei o nó numérico com título "Duration".')

  const seedNodes: ComfyWorkflowMapping['seedNodes'] = []
  for (const [id, node] of Object.entries(workflow)) {
    if (typeof node.inputs.noise_seed === 'number') seedNodes.push({ node: id, field: 'noise_seed' })
    else if (typeof node.inputs.seed === 'number') seedNodes.push({ node: id, field: 'seed' })
  }

  const enhanceNode = findByTitle(
    workflow,
    /enhance/i,
    (node) => node.class_type === 'PrimitiveBoolean' && typeof node.inputs.value === 'boolean',
  )

  return {
    imageNode,
    audioNode,
    promptNode,
    promptField: 'value',
    durationNode,
    saveNode,
    seedNodes,
    enhanceNode,
  }
}

export type ComfySceneInput = {
  imageName: string
  audioName: string
  prompt: string
  duration: number
  seed: number
  outputPrefix: string
}

function setInput(workflow: ComfyApiWorkflow, nodeId: string, field: string, value: unknown) {
  const node = workflow[nodeId]
  if (!node) throw new Error(`O nó ${nodeId} não existe mais no workflow. Importe o workflow de novo.`)
  node.inputs[field] = value
}

export function buildComfySceneWorkflow(
  template: ComfyApiWorkflow,
  mapping: ComfyWorkflowMapping,
  scene: ComfySceneInput,
): ComfyApiWorkflow {
  const workflow = structuredClone(template)
  setInput(workflow, mapping.imageNode, 'image', scene.imageName)
  setInput(workflow, mapping.audioNode, 'audio', scene.audioName)
  setInput(workflow, mapping.promptNode, mapping.promptField, scene.prompt)
  setInput(workflow, mapping.durationNode, 'value', scene.duration)
  setInput(workflow, mapping.saveNode, 'filename_prefix', scene.outputPrefix)
  mapping.seedNodes.forEach((entry, index) => {
    setInput(workflow, entry.node, entry.field, scene.seed + index)
  })
  if (mapping.enhanceNode) setInput(workflow, mapping.enhanceNode, 'value', false)
  return workflow
}

/** Seed aleatória dentro do inteiro seguro do JS e do limite do ComfyUI. */
export function randomComfySeed(random: () => number = Math.random): number {
  return Math.floor(random() * 2 ** 48)
}

export function sceneStem(sceneNumber: number): string {
  return `cena-${String(sceneNumber).padStart(2, '0')}`
}

export function comfyUploadName(batchId: string, sceneNumber: number, ext: string): string {
  return `atlas_${batchId.slice(0, 8)}_${sceneStem(sceneNumber)}${ext.toLowerCase()}`
}

export function comfyOutputPrefix(batchId: string, sceneNumber: number): string {
  return `atlas/${batchId.slice(0, 8)}/${sceneStem(sceneNumber)}`
}

/** Quantos e quais trabalhos pendentes entram na fila agora, em ordem de cena. */
export function jobsToSubmit<T extends Pick<ComfyJob, 'status' | 'sceneNumber'>>(
  jobs: T[],
  queueSize: number,
): T[] {
  const active = jobs.filter((job) => COMFY_ACTIVE_STATUSES.includes(job.status)).length
  const free = Math.max(0, queueSize - active)
  if (free === 0) return []
  return jobs
    .filter((job) => job.status === 'pending')
    .sort((a, b) => a.sceneNumber - b.sceneNumber)
    .slice(0, free)
}

const VIDEO_EXT = /\.(mp4|webm|mov|mkv|gif)$/i

/** Procura o vídeo gerado nas saídas do `/history`, preferindo o nó SaveVideo do workflow. */
export function pickComfyVideoOutput(
  outputs: Record<string, unknown> | null | undefined,
  saveNode: string,
): ComfyOutputFile | null {
  if (!outputs) return null
  const files = (nodeOutput: unknown): ComfyOutputFile[] => {
    if (!nodeOutput || typeof nodeOutput !== 'object') return []
    const found: ComfyOutputFile[] = []
    for (const value of Object.values(nodeOutput as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      for (const entry of value) {
        if (entry && typeof entry === 'object' && typeof (entry as ComfyOutputFile).filename === 'string') {
          const file = entry as Partial<ComfyOutputFile>
          found.push({ filename: file.filename!, subfolder: file.subfolder ?? '', type: file.type ?? 'output' })
        }
      }
    }
    return found
  }
  const preferred = files(outputs[saveNode]).find((file) => VIDEO_EXT.test(file.filename))
  if (preferred) return preferred
  for (const nodeOutput of Object.values(outputs)) {
    const video = files(nodeOutput).find((file) => VIDEO_EXT.test(file.filename))
    if (video) return video
  }
  return null
}

export type ComfyScenePlan = {
  refId: string
  sceneNumber: number
  imagePath: string
  audioPath: string
  prompt: string
  duration: number
}

/** Cena N é a posição N na fila de cenas; só entra quem tem imagem, áudio e prompt. */
export function planComfyScenes(
  refs: Array<{ id: string; imagePath: string; audioPath: string; audioDuration: number | null; prompt: string }>,
  durationPadding: number,
): { scenes: ComfyScenePlan[]; problems: string[] } {
  const scenes: ComfyScenePlan[] = []
  const problems: string[] = []
  refs.forEach((ref, index) => {
    const sceneNumber = index + 1
    const missing: string[] = []
    if (!ref.imagePath.trim()) missing.push('imagem')
    if (!ref.audioPath.trim()) missing.push('áudio')
    if (!ref.prompt.trim()) missing.push('prompt')
    const duration = comfyDurationSeconds(ref.audioDuration, durationPadding)
    if (ref.audioPath.trim() && duration === null) missing.push('duração do áudio')
    if (missing.length > 0 || duration === null) {
      problems.push(`Cena ${String(sceneNumber).padStart(2, '0')}: falta ${missing.join(', ')}`)
      return
    }
    scenes.push({
      refId: ref.id,
      sceneNumber,
      imagePath: ref.imagePath,
      audioPath: ref.audioPath,
      prompt: ref.prompt.trim(),
      duration,
    })
  })
  return { scenes, problems }
}

export function emptyComfyCounts(): Record<ComfyJobStatus, number> {
  return { pending: 0, uploading: 0, queued: 0, downloading: 0, done: 0, error: 0, canceled: 0 }
}

export function countComfyJobs(jobs: Pick<ComfyJob, 'status'>[]): Record<ComfyJobStatus, number> {
  const counts = emptyComfyCounts()
  for (const job of jobs) counts[job.status] += 1
  return counts
}
