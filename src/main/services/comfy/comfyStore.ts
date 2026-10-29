import { getDb } from '../../db/database'
import type {
  ComfyApiWorkflow,
  ComfyBatch,
  ComfyBatchStatus,
  ComfyConfig,
  ComfyJob,
  ComfyJobStatus,
  ComfyOutputFile,
} from '../../../shared/comfy'
import { normalizeComfyConfig } from '../../../shared/comfy'

export type ComfyJobPatch = Partial<
  Pick<ComfyJob, 'status' | 'promptId' | 'outputPath' | 'error' | 'attempts'>
> & { output?: ComfyOutputFile | null }

export type StoredComfyJob = ComfyJob & { output: ComfyOutputFile | null }

export interface ComfyStore {
  getConfig(): ComfyConfig
  getWorkflow(): ComfyApiWorkflow | null
  createBatch(batch: ComfyBatch, jobs: ComfyJob[]): void
  getBatch(id: string): ComfyBatch | null
  latestBatch(): ComfyBatch | null
  activeBatches(): ComfyBatch[]
  updateBatch(id: string, patch: Partial<Pick<ComfyBatch, 'status' | 'lastError' | 'outputDir'>>): void
  listJobs(batchId: string): StoredComfyJob[]
  updateJob(id: string, patch: ComfyJobPatch): void
}

const CONFIG_KEY = 'comfyConfig'
const WORKFLOW_KEY = 'comfyWorkflowJson'
const RUNPOD_API_KEY = 'comfyRunpodApiKey'

type BatchRow = {
  id: string
  project_id: string | null
  output_dir: string
  status: string
  last_error: string | null
  created_at: string
  updated_at: string
}

type JobRow = {
  id: string
  batch_id: string
  ref_id: string
  scene_number: number
  image_path: string
  audio_path: string
  prompt: string
  duration: number
  seed: number
  status: string
  prompt_id: string | null
  output_json: string | null
  output_path: string | null
  error: string | null
  attempts: number
  created_at: string
  updated_at: string
}

function readSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function writeSetting(key: string, value: string) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

function mapBatch(row: BatchRow): ComfyBatch {
  return {
    id: row.id,
    projectId: row.project_id,
    outputDir: row.output_dir,
    status: row.status as ComfyBatchStatus,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseOutput(raw: string | null): ComfyOutputFile | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ComfyOutputFile
  } catch {
    return null
  }
}

function mapJob(row: JobRow): StoredComfyJob {
  return {
    id: row.id,
    batchId: row.batch_id,
    refId: row.ref_id,
    sceneNumber: Number(row.scene_number),
    imagePath: row.image_path,
    audioPath: row.audio_path,
    prompt: row.prompt,
    duration: Number(row.duration),
    seed: Number(row.seed),
    status: row.status as ComfyJobStatus,
    promptId: row.prompt_id,
    outputPath: row.output_path,
    error: row.error,
    attempts: Number(row.attempts) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    output: parseOutput(row.output_json),
  }
}

export const sqliteComfyStore: ComfyStore & {
  saveConfig(config: ComfyConfig): ComfyConfig
  saveWorkflow(workflow: ComfyApiWorkflow): void
  getRunpodApiKey(): string
  saveRunpodApiKey(apiKey: string): void
} = {
  getConfig() {
    const raw = readSetting(CONFIG_KEY)
    const hasRunpodApiKey = Boolean(readSetting(RUNPOD_API_KEY)?.trim())
    if (!raw) return normalizeComfyConfig({ hasRunpodApiKey })
    try {
      return normalizeComfyConfig({ ...(JSON.parse(raw) as Partial<ComfyConfig>), hasRunpodApiKey })
    } catch {
      return normalizeComfyConfig({ hasRunpodApiKey })
    }
  },

  saveConfig(config) {
    const next = normalizeComfyConfig({ ...config, hasRunpodApiKey: Boolean(this.getRunpodApiKey()) })
    writeSetting(
      CONFIG_KEY,
      JSON.stringify({
        baseUrl: next.baseUrl,
        queueSize: next.queueSize,
        durationPadding: next.durationPadding,
        trimToAudio: next.trimToAudio,
        workflowName: next.workflowName,
        workflowMapping: next.workflowMapping,
      }),
    )
    return next
  },

  getRunpodApiKey() {
    return readSetting(RUNPOD_API_KEY)?.trim() ?? ''
  },

  saveRunpodApiKey(apiKey) {
    const value = apiKey.trim()
    if (!value) {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(RUNPOD_API_KEY)
      return
    }
    writeSetting(RUNPOD_API_KEY, value)
  },

  getWorkflow() {
    const raw = readSetting(WORKFLOW_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ComfyApiWorkflow
    } catch {
      return null
    }
  },

  saveWorkflow(workflow) {
    writeSetting(WORKFLOW_KEY, JSON.stringify(workflow))
  },

  createBatch(batch, jobs) {
    const db = getDb()
    db.prepare(
      `INSERT INTO comfy_batches (id, project_id, output_dir, status, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(batch.id, batch.projectId, batch.outputDir, batch.status, batch.lastError, batch.createdAt, batch.updatedAt)
    const insert = db.prepare(
      `INSERT INTO comfy_jobs (id, batch_id, ref_id, scene_number, image_path, audio_path, prompt, duration, seed,
         status, prompt_id, output_json, output_path, error, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?, ?)`,
    )
    for (const job of jobs) {
      insert.run(
        job.id,
        job.batchId,
        job.refId,
        job.sceneNumber,
        job.imagePath,
        job.audioPath,
        job.prompt,
        job.duration,
        job.seed,
        job.status,
        job.createdAt,
        job.updatedAt,
      )
    }
  },

  getBatch(id) {
    const row = getDb().prepare('SELECT * FROM comfy_batches WHERE id = ?').get(id) as BatchRow | undefined
    return row ? mapBatch(row) : null
  },

  latestBatch() {
    const row = getDb()
      .prepare('SELECT * FROM comfy_batches ORDER BY created_at DESC LIMIT 1')
      .get() as BatchRow | undefined
    return row ? mapBatch(row) : null
  },

  activeBatches() {
    return (
      getDb()
        .prepare("SELECT * FROM comfy_batches WHERE status IN ('running', 'paused') ORDER BY created_at ASC")
        .all() as BatchRow[]
    ).map(mapBatch)
  },

  updateBatch(id, patch) {
    const current = this.getBatch(id)
    if (!current) return
    getDb()
      .prepare('UPDATE comfy_batches SET status = ?, last_error = ?, output_dir = ?, updated_at = ? WHERE id = ?')
      .run(
        patch.status ?? current.status,
        patch.lastError !== undefined ? patch.lastError : current.lastError,
        patch.outputDir ?? current.outputDir,
        new Date().toISOString(),
        id,
      )
  },

  listJobs(batchId) {
    return (
      getDb()
        .prepare('SELECT * FROM comfy_jobs WHERE batch_id = ? ORDER BY scene_number ASC')
        .all(batchId) as JobRow[]
    ).map(mapJob)
  },

  updateJob(id, patch) {
    const row = getDb().prepare('SELECT * FROM comfy_jobs WHERE id = ?').get(id) as JobRow | undefined
    if (!row) return
    const current = mapJob(row)
    const output = patch.output !== undefined ? patch.output : current.output
    getDb()
      .prepare(
        `UPDATE comfy_jobs
         SET status = ?, prompt_id = ?, output_json = ?, output_path = ?, error = ?, attempts = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.status ?? current.status,
        patch.promptId !== undefined ? patch.promptId : current.promptId,
        output ? JSON.stringify(output) : null,
        patch.outputPath !== undefined ? patch.outputPath : current.outputPath,
        patch.error !== undefined ? patch.error : current.error,
        patch.attempts ?? current.attempts,
        new Date().toISOString(),
        id,
      )
  },
}
