/**
 * Fase 4 — inventário somente leitura do Pod ComfyUI.
 * Não modifica, reinstala nem remove arquivos no container.
 */

import type { ComfyApiWorkflow } from '../../../../shared/comfy'
import { LTX_IA2V_OFFICIAL_MODEL_ASSETS } from '../../../../shared/ltxEnvironment'
import type { ComfyModelPresence, ComfyPodInventoryResult } from '../../../../shared/ltxPhase4'
import { analyzeLtxWorkflow } from '../../../../shared/ltxWorkflowAnalysis'
import { evaluateComfyNodeReadiness, workflowRequiredClassTypes } from '../../../../shared/runpodLtxCompat'
import { ComfyClient, ComfyUnreachableError, type ComfySystemStatsRaw } from '../ComfyClient'

export type { ComfyPodInventoryResult }

const MODEL_FOLDERS_OF_INTEREST = [
  'checkpoints',
  'loras',
  'text_encoders',
  'latent_upscale_models',
  'vae',
  'diffusion_models',
] as const

export type ComfyInventoryClient = {
  systemStatsRaw(): Promise<ComfySystemStatsRaw>
  listObjectInfoClassTypes(): Promise<string[]>
  listModelFolders(): Promise<string[]>
  listModels(folder: string): Promise<string[]>
}

function emptyInventory(baseUrl: string, pending: string[], notes: string[]): ComfyPodInventoryResult {
  return {
    dryRun: true,
    mutationCalls: 0,
    accessible: false,
    baseUrl,
    pendingChecks: pending,
    system: {
      comfyuiVersion: null,
      pytorchVersion: null,
      pythonVersion: null,
      os: null,
      gpuName: null,
      vramTotalGb: null,
    },
    classTypes: {
      availableCount: 0,
      requiredPresent: [],
      requiredMissing: [],
      hasLtxMarker: false,
      message: 'Pod inacessível — inventário pendente.',
    },
    models: LTX_IA2V_OFFICIAL_MODEL_ASSETS.map((asset) => ({
      folder: asset.relativeDir.replace(/^models\//, ''),
      expectedFileName: asset.expectedFileName,
      present: null,
      listedInFolder: [],
    })),
    modelFoldersAvailable: [],
    notes,
  }
}

/**
 * Inspeção GET-only do ComfyUI. Se o Pod estiver desligado, devolve pendências.
 */
export async function inspectComfyPodReadOnly(
  baseUrl: string,
  workflow: ComfyApiWorkflow | null,
  options?: {
    createClient?: (url: string) => ComfyInventoryClient
  },
): Promise<ComfyPodInventoryResult> {
  const url = baseUrl.trim()
  const analysis = analyzeLtxWorkflow(workflow)
  const required = workflowRequiredClassTypes(workflow)

  if (!url) {
    return emptyInventory('', [
      'Informe a URL do ComfyUI nas Configurações.',
      'Ligar o Pod preferido (Fase 2, com autorização) para inspecionar versões/modelos.',
      'Confirmar CUDA via nvidia-smi no terminal do Pod (não disponível pela API HTTP).',
    ], ['URL ComfyUI vazia — inventário não iniciado.'])
  }

  const client = options?.createClient?.(url) ?? new ComfyClient(url)
  const notes: string[] = [
    'Somente leitura: /system_stats, /object_info, /models. Nenhuma mutação no container.',
    `Workflow analisado: ${analysis.nodeCount} nós · ${analysis.modelRefs.length} refs de modelo.`,
  ]

  let raw: ComfySystemStatsRaw
  try {
    raw = await client.systemStatsRaw()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return emptyInventory(url, [
      'Pod/ComfyUI inacessível agora — tentar com Pod RUNNING.',
      'Ler comfyui_version / pytorch_version / python_version em /system_stats.',
      'Listar modelos em /models/checkpoints|loras|text_encoders|latent_upscale_models.',
      'Confirmar class_types do workflow em /object_info.',
      'CUDA/driver: nvidia-smi no shell do Pod (fora do HTTP).',
      `Último erro: ${message}`,
    ], ['Inventário pendente: ComfyUI não respondeu.'])
  }

  const device = raw.devices?.[0]
  const vramTotalGb = device?.vram_total
    ? Math.round((device.vram_total / 1024 ** 3) * 10) / 10
    : null

  let classTypes: string[] = []
  let classMessage = ''
  try {
    classTypes = await client.listObjectInfoClassTypes()
    const readiness = evaluateComfyNodeReadiness(classTypes, required)
    classMessage = readiness.message
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    classMessage = `/object_info falhou: ${message}`
    notes.push(classMessage)
  }

  const readiness = evaluateComfyNodeReadiness(classTypes, required)

  let modelFoldersAvailable: string[] = []
  try {
    modelFoldersAvailable = await client.listModelFolders()
  } catch (error) {
    if (!(error instanceof ComfyUnreachableError)) {
      notes.push(`GET /models (tipos) falhou: ${error instanceof Error ? error.message : String(error)}`)
    } else {
      throw error
    }
  }

  const models: ComfyModelPresence[] = []
  for (const asset of LTX_IA2V_OFFICIAL_MODEL_ASSETS) {
    const folder = asset.relativeDir.replace(/^models\//, '')
    let listed: string[] = []
    let present: boolean | null = null
    try {
      listed = await client.listModels(folder)
      present = listed.some((name) => name === asset.expectedFileName || name.endsWith(`/${asset.expectedFileName}`))
    } catch (error) {
      notes.push(
        `Pasta ${folder}: ${error instanceof Error ? error.message : String(error)}`,
      )
      present = null
    }
    models.push({
      folder,
      expectedFileName: asset.expectedFileName,
      present,
      listedInFolder: listed,
    })
  }

  // Também verifica arquivos extras referenciados no workflow.
  for (const ref of analysis.modelRefs) {
    if (models.some((row) => row.expectedFileName === ref.fileName)) continue
    const folderGuess =
      ref.field === 'lora_name'
        ? 'loras'
        : ref.field === 'text_encoder'
          ? 'text_encoders'
          : ref.field === 'model_name'
            ? 'latent_upscale_models'
            : 'checkpoints'
    let listed: string[] = []
    let present: boolean | null = null
    try {
      listed = await client.listModels(folderGuess)
      present = listed.some((name) => name === ref.fileName || name.endsWith(`/${ref.fileName}`))
    } catch {
      present = null
    }
    models.push({
      folder: folderGuess,
      expectedFileName: ref.fileName,
      present,
      listedInFolder: listed,
    })
  }

  const pendingChecks: string[] = []
  if (!raw.system?.comfyui_version) pendingChecks.push('comfyui_version ausente em /system_stats.')
  if (!raw.system?.pytorch_version) pendingChecks.push('pytorch_version ausente — pinagem Docker ainda incompleta.')
  if (!raw.system?.python_version) pendingChecks.push('python_version ausente.')
  pendingChecks.push('CUDA/driver via nvidia-smi (não exposto no HTTP ComfyUI).')
  if (models.some((row) => row.present === null)) {
    pendingChecks.push('Algumas pastas de modelo não puderam ser listadas.')
  }
  if (models.some((row) => row.present === false)) {
    pendingChecks.push('Um ou mais modelos oficiais/IA2V não aparecem na listagem HTTP (validar caminho no disco).')
  }

  for (const folder of MODEL_FOLDERS_OF_INTEREST) {
    if (modelFoldersAvailable.length && !modelFoldersAvailable.includes(folder)) {
      notes.push(`Pasta de modelo "${folder}" não listada em GET /models.`)
    }
  }

  return {
    dryRun: true,
    mutationCalls: 0,
    accessible: true,
    baseUrl: url,
    pendingChecks,
    system: {
      comfyuiVersion: raw.system?.comfyui_version ?? null,
      pytorchVersion: raw.system?.pytorch_version ?? null,
      pythonVersion: raw.system?.python_version ?? null,
      os: raw.system?.os ?? null,
      gpuName: device?.name?.replace(/^cuda:\d+\s*/, '').replace(/\s*:\s*cudaMallocAsync$/, '') ?? null,
      vramTotalGb,
    },
    classTypes: {
      availableCount: classTypes.length,
      requiredPresent: readiness.present,
      requiredMissing: readiness.missing,
      hasLtxMarker: readiness.hasLtxMarker,
      message: classMessage || readiness.message,
    },
    models,
    modelFoldersAvailable,
    notes,
  }
}
