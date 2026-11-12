import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type { FlowProject, FlowProjectCreateInput, FlowProjectPatch, FlowSyncStatus } from '../../shared/flowProjects'
import {
  isFlowSyncStatus,
  normalizeFlowImageModel,
  normalizeFlowImageOutputs,
  normalizeFlowProjectPrompt,
} from '../../shared/flowProjects'
import { folderExists } from '../services/storage/projectFolders'

type Row = {
  id: string
  name: string
  local_folder_path: string
  remote_url: string | null
  remote_id: string | null
  account_hint: string | null
  sync_status: string
  last_error: string | null
  create_in_flow: number
  operation_id: string
  prompt: string | null
  image_model: string | null
  image_outputs: number | null
  generation_paused: number | null
  created_at: string
  updated_at: string
}

const SELECT = `
  SELECT
    id,
    name,
    local_folder_path,
    remote_url,
    remote_id,
    account_hint,
    sync_status,
    last_error,
    create_in_flow,
    operation_id,
    prompt,
    image_model,
    image_outputs,
    generation_paused,
    created_at,
    updated_at
  FROM google_flow_projects
`

function mapStatus(value: string | null | undefined): FlowSyncStatus {
  return isFlowSyncStatus(value) ? value : 'local_created'
}

function mapRow(row: Row): FlowProject {
  return {
    id: row.id,
    name: row.name,
    localFolderPath: row.local_folder_path,
    remoteUrl: row.remote_url?.trim() || null,
    remoteId: row.remote_id?.trim() || null,
    accountHint: row.account_hint?.trim() || null,
    syncStatus: mapStatus(row.sync_status),
    lastError: row.last_error?.trim() || null,
    createInFlow: Number(row.create_in_flow) !== 0,
    operationId: row.operation_id,
    prompt: normalizeFlowProjectPrompt(row.prompt),
    imageModel: normalizeFlowImageModel(row.image_model),
    imageOutputs: normalizeFlowImageOutputs(row.image_outputs),
    generationPaused: Number(row.generation_paused) !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const flowProjectRepository = {
  list(filters?: { query?: string }): FlowProject[] {
    let sql = `${SELECT} WHERE 1=1`
    const params: unknown[] = []
    if (filters?.query?.trim()) {
      sql += ' AND (name LIKE ? OR local_folder_path LIKE ? OR remote_id LIKE ?)'
      const like = `%${filters.query.trim()}%`
      params.push(like, like, like)
    }
    sql += ' ORDER BY updated_at DESC'
    return (getDb().prepare(sql).all(...params) as Row[]).map(mapRow)
  },

  get(id: string): FlowProject | null {
    const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined
    return row ? mapRow(row) : null
  },

  getByOperationId(operationId: string): FlowProject | null {
    const row = getDb().prepare(`${SELECT} WHERE operation_id = ?`).get(operationId) as
      | Row
      | undefined
    return row ? mapRow(row) : null
  },

  getByRemoteId(remoteId: string): FlowProject | null {
    const id = remoteId.trim()
    if (!id) return null
    const row = getDb().prepare(`${SELECT} WHERE remote_id = ?`).get(id) as Row | undefined
    return row ? mapRow(row) : null
  },

  create(input: FlowProjectCreateInput & { operationId?: string; syncStatus?: FlowSyncStatus }): FlowProject {
    const id = randomUUID()
    const now = new Date().toISOString()
    const operationId = input.operationId?.trim() || randomUUID()
    const createInFlow = input.createInFlow !== false
    const syncStatus: FlowSyncStatus = input.syncStatus ?? 'local_created'

    getDb()
      .prepare(
        `INSERT INTO google_flow_projects (
          id, name, local_folder_path, remote_url, remote_id, account_hint,
          sync_status, last_error, create_in_flow, operation_id, prompt,
          image_model, image_outputs, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, '', 'nano-banana-2.1', 3, ?, ?)`,
      )
      .run(
        id,
        input.name.trim(),
        input.localFolderPath.trim(),
        syncStatus,
        createInFlow ? 1 : 0,
        operationId,
        now,
        now,
      )

    const created = this.get(id)
    if (!created) throw new Error('Falha ao criar projeto Flow local.')
    return created
  },

  update(id: string, patch: FlowProjectPatch): FlowProject | null {
    const current = this.get(id)
    if (!current) return null

    const next: FlowProject = {
      ...current,
      name: patch.name !== undefined ? patch.name.trim() : current.name,
      localFolderPath:
        patch.localFolderPath !== undefined
          ? patch.localFolderPath.trim()
          : current.localFolderPath,
      remoteUrl:
        patch.remoteUrl !== undefined
          ? patch.remoteUrl?.trim() || null
          : current.remoteUrl,
      remoteId:
        patch.remoteId !== undefined
          ? patch.remoteId?.trim() || null
          : current.remoteId,
      accountHint:
        patch.accountHint !== undefined
          ? patch.accountHint?.trim() || null
          : current.accountHint,
      syncStatus: patch.syncStatus ?? current.syncStatus,
      lastError:
        patch.lastError !== undefined
          ? patch.lastError?.trim() || null
          : current.lastError,
      createInFlow: patch.createInFlow ?? current.createInFlow,
      prompt:
        patch.prompt !== undefined ? normalizeFlowProjectPrompt(patch.prompt) : current.prompt,
      imageModel:
        patch.imageModel !== undefined
          ? normalizeFlowImageModel(patch.imageModel)
          : current.imageModel,
      imageOutputs:
        patch.imageOutputs !== undefined
          ? normalizeFlowImageOutputs(patch.imageOutputs)
          : current.imageOutputs,
      generationPaused:
        patch.generationPaused !== undefined
          ? Boolean(patch.generationPaused)
          : current.generationPaused,
      updatedAt: new Date().toISOString(),
    }

    getDb()
      .prepare(
        `UPDATE google_flow_projects SET
          name = ?,
          local_folder_path = ?,
          remote_url = ?,
          remote_id = ?,
          account_hint = ?,
          sync_status = ?,
          last_error = ?,
          create_in_flow = ?,
          prompt = ?,
          image_model = ?,
          image_outputs = ?,
          generation_paused = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        next.name,
        next.localFolderPath,
        next.remoteUrl,
        next.remoteId,
        next.accountHint,
        next.syncStatus,
        next.lastError,
        next.createInFlow ? 1 : 0,
        next.prompt,
        next.imageModel,
        next.imageOutputs,
        next.generationPaused ? 1 : 0,
        next.updatedAt,
        id,
      )

    return this.get(id)
  },

  remove(id: string): boolean {
    getDb().prepare('DELETE FROM google_flow_projects WHERE id = ?').run(id)
    return true
  },

  /** Projetos interrompidos no meio da sincronização — recuperáveis ao reabrir. */
  listRecoverable(): FlowProject[] {
    return this.list().filter((project) =>
      project.createInFlow &&
      project.syncStatus !== 'linked' &&
      (project.syncStatus === 'creating' ||
        project.syncStatus === 'awaiting_login' ||
        Boolean(project.remoteId)),
    )
  },

  folderStillExists(project: FlowProject): boolean {
    return folderExists(project.localFolderPath)
  },
}
