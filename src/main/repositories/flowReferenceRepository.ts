import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getDb } from '../db/database'
import type { FlowReference, FlowReferenceUpdateInput } from '../../shared/flowProjects'
import {
  labelFromImagePath,
  normalizeFlowReferenceSyncStatus,
  validateFlowReferenceLabel,
} from '../../shared/flowProjects'
import { localImageThumbUrl, localImageUrl } from '../services/media/localImageUrl'
import {
  importFlowReferenceImage,
  removeFlowProjectReferenceFiles,
  removeFlowReferenceImage,
} from '../services/storage/flowRefMedia'
import { flowProjectRepository } from './flowProjectRepository'

type Row = {
  id: string
  project_id: string
  label: string
  image_path: string
  sort_order: number
  flow_upload_key: string | null
  flow_file_name: string | null
  sync_status: string | null
  synced_at: string | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

const SELECT = `
  SELECT
    id,
    project_id,
    label,
    image_path,
    sort_order,
    flow_upload_key,
    flow_file_name,
    sync_status,
    synced_at,
    last_sync_error,
    created_at,
    updated_at
  FROM google_flow_references
`

function mapRow(row: Row): FlowReference {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label || 'Referência',
    imagePath: row.image_path,
    imageUrl: localImageUrl(row.image_path),
    imageThumbUrl: localImageThumbUrl(row.image_path, 360) ?? localImageUrl(row.image_path),
    sortOrder: Number(row.sort_order) || 0,
    flowUploadKey: row.flow_upload_key?.trim() || null,
    flowFileName: row.flow_file_name?.trim() || null,
    syncStatus: normalizeFlowReferenceSyncStatus(row.sync_status),
    syncedAt: row.synced_at?.trim() || null,
    lastSyncError: row.last_sync_error?.trim() || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function assertProject(projectId: string) {
  const project = flowProjectRepository.get(projectId)
  if (!project) throw new Error('Projeto Flow não encontrado.')
  return project
}

export const flowReferenceRepository = {
  listByProject(projectId: string): FlowReference[] {
    const id = projectId.trim()
    if (!id) return []
    return (
      getDb()
        .prepare(`${SELECT} WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC`)
        .all(id) as Row[]
    ).map(mapRow)
  },

  get(id: string): FlowReference | null {
    const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined
    return row ? mapRow(row) : null
  },

  addFromFiles(projectId: string, filePaths: string[]): FlowReference[] {
    const project = assertProject(projectId)
    const paths = filePaths.map((item) => item.trim()).filter(Boolean)
    if (paths.length === 0) return []

    const existing = this.listByProject(project.id)
    let sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
    const created: FlowReference[] = []

    for (const filePath of paths) {
      const id = randomUUID()
      const now = new Date().toISOString()
      const imagePath = importFlowReferenceImage(filePath, project.id, id)
      const label = validateFlowReferenceLabel(labelFromImagePath(filePath))
      getDb()
        .prepare(
          `INSERT INTO google_flow_references (
            id, project_id, label, image_path, sort_order,
            flow_upload_key, flow_file_name, sync_status, synced_at, last_sync_error,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'local', NULL, NULL, ?, ?)`,
        )
        .run(id, project.id, label, imagePath, sortOrder, now, now)
      const row = this.get(id)
      if (row) created.push(row)
      sortOrder += 1
    }

    return created
  },

  update(id: string, patch: FlowReferenceUpdateInput): FlowReference | null {
    const current = this.get(id)
    if (!current) return null
    const label =
      patch.label !== undefined ? validateFlowReferenceLabel(patch.label) : current.label
    const labelChanged =
      patch.label !== undefined &&
      validateFlowReferenceLabel(patch.label).toLowerCase() !== current.label.toLowerCase()

    const flowUploadKey =
      patch.flowUploadKey !== undefined
        ? patch.flowUploadKey?.trim() || null
        : labelChanged
          ? null
          : current.flowUploadKey
    const flowFileName =
      patch.flowFileName !== undefined
        ? patch.flowFileName?.trim() || null
        : labelChanged
          ? null
          : current.flowFileName
    const syncStatus =
      patch.syncStatus !== undefined
        ? normalizeFlowReferenceSyncStatus(patch.syncStatus)
        : labelChanged
          ? 'local'
          : current.syncStatus
    const syncedAt =
      patch.syncedAt !== undefined
        ? patch.syncedAt?.trim() || null
        : labelChanged
          ? null
          : current.syncedAt
    const lastSyncError =
      patch.lastSyncError !== undefined
        ? patch.lastSyncError?.trim() || null
        : labelChanged
          ? null
          : current.lastSyncError

    const updatedAt = new Date().toISOString()
    getDb()
      .prepare(
        `UPDATE google_flow_references SET
          label = ?,
          flow_upload_key = ?,
          flow_file_name = ?,
          sync_status = ?,
          synced_at = ?,
          last_sync_error = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        label,
        flowUploadKey,
        flowFileName,
        syncStatus,
        syncedAt,
        lastSyncError,
        updatedAt,
        id,
      )
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM google_flow_references WHERE id = ?').run(id)
    removeFlowReferenceImage(current.imagePath)
    return true
  },

  removeByProject(projectId: string): number {
    const id = projectId.trim()
    if (!id) return 0
    const rows = getDb()
      .prepare('SELECT image_path FROM google_flow_references WHERE project_id = ?')
      .all(id) as Array<{ image_path: string }>
    getDb().prepare('DELETE FROM google_flow_references WHERE project_id = ?').run(id)
    for (const row of rows) removeFlowReferenceImage(row.image_path)
    removeFlowProjectReferenceFiles(id)
    return rows.length
  },

  /** Ajuda testes / debug — nome do arquivo sem path. */
  fileName(ref: Pick<FlowReference, 'imagePath'>): string {
    return path.basename(ref.imagePath)
  },
}
