/**
 * Fase 4 — análise do workflow LTX IA2V real (formato API JSON).
 * Não reconstrói a partir de stubs; opera sobre o JSON importado no Atlas.
 */

import type { ComfyApiWorkflow } from './comfy'
import {
  LTX_IA2V_OFFICIAL_MODEL_ASSETS,
  type LtxEvidenceLevel,
  type LtxModelAsset,
} from './ltxEnvironment'
import { LTX_MARKER_CLASS_TYPES } from './runpodLtxCompat'

const MODEL_INPUT_FIELDS = new Set([
  'ckpt_name',
  'lora_name',
  'vae_name',
  'model_name',
  'unet_name',
  'clip_name',
  'text_encoder',
  'upscale_model',
  'audio_vae',
])

const MODEL_FILE_RE = /\.(safetensors|ckpt|pt|bin|gguf)$/i

export type LtxWorkflowModelRef = {
  nodeId: string
  classType: string
  title: string | null
  field: string
  fileName: string
  officialMatch: LtxModelAsset | null
  evidence: LtxEvidenceLevel
}

export type LtxWorkflowNodeSummary = {
  nodeId: string
  classType: string
  title: string | null
  inputKeys: string[]
  linkInputs: Array<{ field: string; sourceNodeId: string; outputIndex: number }>
}

export type LtxWorkflowAnalysis = {
  source: 'sqlite_import' | 'empty'
  nodeCount: number
  classTypes: string[]
  hasLtxMarker: boolean
  nodes: LtxWorkflowNodeSummary[]
  modelRefs: LtxWorkflowModelRef[]
  /** Modelos oficiais IA2V presentes nas referências do workflow. */
  officialModelsMatched: string[]
  /** Modelos oficiais IA2V ainda não referenciados no JSON. */
  officialModelsMissingInWorkflow: string[]
  /** Arquivos referenciados que não estão no manifesto oficial. */
  extraModelFiles: string[]
  /** class_types nativos LTXV* / LTX* observados (suporte nativo Comfy). */
  nativeLtxClassTypes: string[]
  /** Entradas de mídia de exemplo no JSON (não usadas pelo Atlas em produção). */
  sampleMedia: Array<{ nodeId: string; classType: string; field: string; value: string }>
  comparisonNotes: string[]
}

function guessOfficialAsset(fileName: string): LtxModelAsset | null {
  const base = fileName.replace(/^.*[\\/]/, '')
  return LTX_IA2V_OFFICIAL_MODEL_ASSETS.find((asset) => asset.expectedFileName === base) ?? null
}

function roleFromField(field: string, classType: string): LtxModelAsset['role'] | 'other' {
  if (field === 'lora_name' || classType.includes('Lora')) return 'lora'
  if (field === 'text_encoder' || classType.includes('TextEncoder')) return 'text_encoder'
  if (field === 'model_name' || classType.includes('Upscale')) return 'upscaler'
  if (field === 'ckpt_name' || classType.includes('Checkpoint')) return 'checkpoint'
  return 'other'
}

export function analyzeLtxWorkflow(workflow: ComfyApiWorkflow | null | undefined): LtxWorkflowAnalysis {
  if (!workflow || Object.keys(workflow).length === 0) {
    return {
      source: 'empty',
      nodeCount: 0,
      classTypes: [],
      hasLtxMarker: false,
      nodes: [],
      modelRefs: [],
      officialModelsMatched: [],
      officialModelsMissingInWorkflow: LTX_IA2V_OFFICIAL_MODEL_ASSETS.map((a) => a.expectedFileName),
      extraModelFiles: [],
      nativeLtxClassTypes: [],
      sampleMedia: [],
      comparisonNotes: ['Nenhum workflow importado no SQLite do Atlas.'],
    }
  }

  const classTypes = [
    ...new Set(
      Object.values(workflow)
        .map((node) => node?.class_type)
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort()
  const hasLtxMarker = LTX_MARKER_CLASS_TYPES.every((marker) => classTypes.includes(marker))
  const nodes: LtxWorkflowNodeSummary[] = []
  const modelRefs: LtxWorkflowModelRef[] = []
  const sampleMedia: LtxWorkflowAnalysis['sampleMedia'] = []
  const nativeLtxClassTypes = classTypes.filter((name) => /^LTX/i.test(name))

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.class_type) continue
    const inputs = node.inputs ?? {}
    const linkInputs: LtxWorkflowNodeSummary['linkInputs'] = []
    const inputKeys = Object.keys(inputs)

    for (const [field, value] of Object.entries(inputs)) {
      if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'string') {
        linkInputs.push({
          field,
          sourceNodeId: String(value[0]),
          outputIndex: Number(value[1]) || 0,
        })
        continue
      }
      if (typeof value !== 'string' || !value.trim()) continue

      if (
        (node.class_type === 'LoadImage' && field === 'image') ||
        (node.class_type === 'LoadAudio' && field === 'audio')
      ) {
        sampleMedia.push({ nodeId, classType: node.class_type, field, value })
      }

      const looksLikeModel =
        MODEL_INPUT_FIELDS.has(field) || MODEL_FILE_RE.test(value) || /lora|ckpt|vae|gemma|ltx/i.test(field)
      if (!looksLikeModel || !MODEL_FILE_RE.test(value)) continue

      const fileName = value.replace(/^.*[\\/]/, '')
      const official = guessOfficialAsset(fileName)
      modelRefs.push({
        nodeId,
        classType: node.class_type,
        title: node._meta?.title ?? null,
        field,
        fileName,
        officialMatch: official,
        evidence: official ? 'confirmed_official_docs' : 'needs_user_validation',
      })
      void roleFromField(field, node.class_type)
    }

    nodes.push({
      nodeId,
      classType: node.class_type,
      title: node._meta?.title ?? null,
      inputKeys,
      linkInputs,
    })
  }

  const referencedFiles = [...new Set(modelRefs.map((ref) => ref.fileName))]
  const officialMatched = LTX_IA2V_OFFICIAL_MODEL_ASSETS.filter((asset) =>
    referencedFiles.includes(asset.expectedFileName),
  ).map((asset) => asset.expectedFileName)
  const officialMissing = LTX_IA2V_OFFICIAL_MODEL_ASSETS.filter(
    (asset) => !referencedFiles.includes(asset.expectedFileName),
  ).map((asset) => asset.expectedFileName)
  const extraModelFiles = referencedFiles.filter(
    (name) => !LTX_IA2V_OFFICIAL_MODEL_ASSETS.some((asset) => asset.expectedFileName === name),
  )

  const comparisonNotes: string[] = [
    'Comparado com o template oficial IA2V (docs.comfy.org/tutorials/video/ltx/ltx-2-3).',
    'Docs oficiais: suporte nativo ComfyUI — custom nodes não são obrigatórios para o template IA2V.',
    `Workflow real: ${Object.keys(workflow).length} nós, ${classTypes.length} class_types únicos.`,
  ]

  if (hasLtxMarker) {
    comparisonNotes.push('Marcador TextGenerateLTX2Prompt presente (IA2V LTX-2.3).')
  } else {
    comparisonNotes.push('Marcador TextGenerateLTX2Prompt ausente — validar se o JSON é o IA2V esperado.')
  }

  if (officialMatched.length === LTX_IA2V_OFFICIAL_MODEL_ASSETS.length) {
    comparisonNotes.push('Todos os 5 assets oficiais IA2V aparecem referenciados no workflow.')
  } else {
    comparisonNotes.push(
      `Assets oficiais no workflow: ${officialMatched.length}/${LTX_IA2V_OFFICIAL_MODEL_ASSETS.length}.`,
    )
  }

  const audioVaeRefs = modelRefs.filter((ref) => ref.classType === 'LTXVAudioVAELoader')
  if (audioVaeRefs.length > 0) {
    comparisonNotes.push(
      `LTXVAudioVAELoader referencia ${audioVaeRefs.map((r) => r.fileName).join(', ')} — confirmar no Pod se o áudio VAE compartilha o checkpoint FP8 (como neste JSON) ou usa arquivo separado.`,
    )
  }

  if (nativeLtxClassTypes.length > 0) {
    comparisonNotes.push(
      `Nós nativos LTX* observados (${nativeLtxClassTypes.length}): exigem ComfyUI com suporte LTX-2.3 atualizado.`,
    )
  }

  return {
    source: 'sqlite_import',
    nodeCount: Object.keys(workflow).length,
    classTypes,
    hasLtxMarker,
    nodes,
    modelRefs,
    officialModelsMatched: officialMatched,
    officialModelsMissingInWorkflow: officialMissing,
    extraModelFiles,
    nativeLtxClassTypes,
    sampleMedia,
    comparisonNotes,
  }
}
