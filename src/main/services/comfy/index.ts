import fs from 'node:fs'
import path from 'node:path'
import type { ComfyConfig, ComfyConnectionInfo, ComfyStartResult } from '../../../shared/comfy'
import { detectComfyWorkflowMapping, normalizeComfyConfig, parseComfyWorkflow, planComfyScenes } from '../../../shared/comfy'
import { getUserDataPath } from '../../paths'
import { ensureProjectFolder, lipSyncRefRepository } from '../../repositories/lipSyncRefRepository'
import { logger } from '../logging/logger'
import { ComfyClient } from './ComfyClient'
import { ComfyQueueService } from './ComfyQueueService'
import { sqliteComfyStore } from './comfyStore'

export const comfyQueueService = new ComfyQueueService({
  store: sqliteComfyStore,
  createClient: (baseUrl) => new ComfyClient(baseUrl),
  log: (event, data) => logger.info(event, data),
})

export function getComfyConfig(): ComfyConfig {
  return sqliteComfyStore.getConfig()
}

/** O mapeamento do workflow só muda pela importação, nunca pelo formulário. */
export function saveComfyConfig(patch: Partial<Pick<ComfyConfig, 'baseUrl' | 'queueSize' | 'durationPadding'>>) {
  const current = sqliteComfyStore.getConfig()
  return sqliteComfyStore.saveConfig(
    normalizeComfyConfig({
      ...current,
      baseUrl: patch.baseUrl ?? current.baseUrl,
      queueSize: patch.queueSize ?? current.queueSize,
      durationPadding: patch.durationPadding ?? current.durationPadding,
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

function batchFolderName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

/** Envia as cenas ativas, na ordem da fila de lipsync. Cenas incompletas ficam de fora e são listadas. */
export function startComfyBatch(projectId: string | null): ComfyStartResult {
  const config = sqliteComfyStore.getConfig()
  const refs = lipSyncRefRepository.list({ status: 'active' })
  const { scenes, problems } = planComfyScenes(refs, config.durationPadding)
  const root = projectId ? path.join(ensureProjectFolder(projectId), 'Comfy') : path.join(getUserDataPath(), 'comfy')
  const outputDir = path.join(root, batchFolderName())
  const view = comfyQueueService.startBatch({ projectId, outputDir, scenes })
  return { view, skipped: problems }
}
