import fs from 'node:fs'
import path from 'node:path'
import type {
  ComfyBatchView,
  ComfyConfig,
  ComfyConfigPatch,
  ComfyConnectionInfo,
  ComfyDiscoverResult,
  ComfyStartResult,
} from '../../../shared/comfy'
import { detectComfyWorkflowMapping, normalizeComfyConfig, parseComfyWorkflow, planComfyScenes } from '../../../shared/comfy'
import { lipSyncRefRepository } from '../../repositories/lipSyncRefRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { folderExists } from '../storage/projectFolders'
import { logger } from '../logging/logger'
import { ComfyClient } from './ComfyClient'
import { ComfyQueueService } from './ComfyQueueService'
import { sqliteComfyStore } from './comfyStore'
import { coerceComfyDownloadDir, ensureComfyDownloadDir } from './outputDir'
import { resolveRunpodComfyUrl } from './runpod'
import { trimComfyVideoToAudio } from './trimComfyVideo'

function liveComfyDownloadDir(projectId: string | null): string | null {
  if (!projectId) return null
  const folder = projectRepository.get(projectId)?.projectFolderPath ?? null
  return ensureComfyDownloadDir(folder)
}

export const comfyQueueService = new ComfyQueueService({
  store: sqliteComfyStore,
  createClient: (baseUrl) => new ComfyClient(baseUrl),
  log: (event, data) => logger.info(event, data),
  trimOutput: trimComfyVideoToAudio,
  resolveOutputDir: (batch) =>
    liveComfyDownloadDir(batch.projectId) ?? coerceComfyDownloadDir(batch.outputDir, null),
})

export function getComfyConfig(): ComfyConfig {
  return sqliteComfyStore.getConfig()
}

/** O mapeamento do workflow só muda pela importação, nunca pelo formulário. */
export function saveComfyConfig(patch: ComfyConfigPatch) {
  if (patch.runpodApiKey !== undefined) sqliteComfyStore.saveRunpodApiKey(patch.runpodApiKey)
  const current = sqliteComfyStore.getConfig()
  return sqliteComfyStore.saveConfig(
    normalizeComfyConfig({
      ...current,
      baseUrl: patch.baseUrl ?? current.baseUrl,
      queueSize: patch.queueSize ?? current.queueSize,
      durationPadding: patch.durationPadding ?? current.durationPadding,
      trimToAudio: patch.trimToAudio ?? current.trimToAudio,
    }),
  )
}

export function importComfyWorkflow(filePath: string): ComfyConfig {
  const text = fs.readFileSync(filePath, 'utf8')
  const workflow = parseComfyWorkflow(text)
  const mapping = detectComfyWorkflowMapping(workflow)
  sqliteComfyStore.saveWorkflow(workflow)
  const current = sqliteComfyStore.getConfig()
  return sqliteComfyStore.saveConfig({
    ...current,
    workflowName: path.basename(filePath),
    workflowMapping: mapping,
  })
}

export async function testComfyConnection(baseUrl?: string): Promise<ComfyConnectionInfo> {
  try {
    return await new ComfyClient(baseUrl ?? sqliteComfyStore.getConfig().baseUrl).systemStats()
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function discoverComfyUrl(): Promise<ComfyDiscoverResult> {
  const apiKey = sqliteComfyStore.getRunpodApiKey()
  if (!apiKey) {
    throw new Error(
      'Cole a chave da API do RunPod nas Configurações (uma vez). Depois o Atlas puxa a URL sozinho.',
    )
  }
  const current = sqliteComfyStore.getConfig()
  if (current.baseUrl) {
    const connection = await testComfyConnection(current.baseUrl)
    if (connection.ok) {
      return {
        ok: true,
        changed: false,
        baseUrl: current.baseUrl,
        podId: '',
        podName: '',
        message: connection.message,
        connection,
      }
    }
  }

  const resolved = await resolveRunpodComfyUrl(apiKey, current.baseUrl)
  const saved = saveComfyConfig({ baseUrl: resolved.baseUrl })
  const connection = await testComfyConnection(saved.baseUrl)
  return {
    ok: connection.ok,
    changed: saved.baseUrl !== current.baseUrl,
    baseUrl: saved.baseUrl,
    podId: resolved.podId,
    podName: resolved.podName,
    message: connection.ok
      ? `URL do pod ${resolved.podName}`
      : `Pod ${resolved.podName} encontrado, mas o ComfyUI ainda não respondeu. Espere uns segundos e teste.`,
    connection,
  }
}

function withProjectName(view: ComfyBatchView | null): ComfyBatchView | null {
  if (!view) return null
  const name = view.batch.projectId ? projectRepository.get(view.batch.projectId)?.name ?? null : null
  return { ...view, projectName: name }
}

export function listComfyViews(): ComfyBatchView[] {
  return comfyQueueService.listViews().map((view) => withProjectName(view)!)
}

export function latestComfyView(): ComfyBatchView | null {
  return withProjectName(comfyQueueService.latestView())
}

/** Lotes em andamento passam a gravar em `{pasta vinculada}/lipsync`. */
export function remapActiveComfyOutputDirs() {
  for (const batch of sqliteComfyStore.activeBatches()) {
    const resolved = liveComfyDownloadDir(batch.projectId)
    if (!resolved) continue
    if (path.resolve(batch.outputDir) === resolved) continue
    sqliteComfyStore.updateBatch(batch.id, { outputDir: resolved })
  }
}

/**
 * Envia as cenas ativas do projeto. Os vídeos vão para `{pasta vinculada}/lipsync`
 * (`1.mp4`, `2.mp4`…). Nunca para outro lugar.
 */
export function startComfyBatch(projectId: string | null): ComfyStartResult {
  if (!projectId?.trim()) throw new Error('Selecione um projeto para gerar.')
  const project = projectRepository.get(projectId)
  if (!project) throw new Error('Projeto não encontrado.')
  const folder = project.projectFolderPath?.trim() ?? ''
  if (!folder || !folderExists(folder)) {
    throw new Error(
      'Vincule a pasta das imagens e áudios neste projeto (Puxar da pasta). Os vídeos são gravados em lipsync, dentro dessa pasta.',
    )
  }
  const outputDir = ensureComfyDownloadDir(folder)
  if (!outputDir) {
    throw new Error(
      'Vincule a pasta das imagens e áudios neste projeto (Puxar da pasta). Os vídeos são gravados em lipsync, dentro dessa pasta.',
    )
  }
  const config = sqliteComfyStore.getConfig()
  const refs = lipSyncRefRepository.list({ status: 'active', projectId })
  const { scenes, problems } = planComfyScenes(refs, config.durationPadding)
  const view = withProjectName(comfyQueueService.startBatch({ projectId, outputDir, scenes }))!
  return { view, skipped: problems }
}
