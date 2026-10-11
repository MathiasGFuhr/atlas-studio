import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getDb } from '../db/database'
import type {
  LipSyncRef,
  LipSyncRefCreateInput,
  LipSyncRefListFilters,
  LipSyncRefStatus,
  LipSyncRefUpdateInput,
} from '../../shared/lipSyncRefs'
import { isLipSyncRefStatus } from '../../shared/lipSyncRefs'
import { readImageDataUrl } from '../services/storage/profilePhoto'
import {
  archiveLipSyncRefToProjectFolder,
  importLipSyncImage,
  removeLipSyncImage,
} from '../services/storage/lipSyncMedia'
import { createProjectFolder, folderExists } from '../services/storage/projectFolders'
import { channelRepository } from './channelRepository'
import { projectRepository } from './projectRepository'

type Row = {
  id: string
  label: string
  prompt: string
  image_path: string
  project_id: string | null
  project_name: string | null
  project_folder_path: string | null
  status: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

const SELECT = `
  SELECT
    r.id,
    r.label,
    r.prompt,
    r.image_path,
    r.project_id,
    p.name AS project_name,
    p.folder_path AS project_folder_path,
    r.status,
    r.sort_order,
    r.created_at,
    r.updated_at
  FROM lipsync_refs r
  LEFT JOIN projects p ON p.id = r.project_id
`

function mapStatus(value: string | null | undefined): LipSyncRefStatus {
  return isLipSyncRefStatus(value) ? value : 'active'
}

function mapRow(row: Row): LipSyncRef {
  return {
    id: row.id,
    label: row.label ?? '',
    prompt: row.prompt ?? '',
    imagePath: row.image_path,
    imageDataUrl: readImageDataUrl(row.image_path),
    projectId: row.project_id?.trim() || null,
    projectName: row.project_name?.trim() || null,
    status: mapStatus(row.status),
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function labelFromPath(filePath: string): string {
  const base = path.basename(filePath)
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
  return stem.trim() || 'Referência'
}

function normalizeProjectId(value: string | null | undefined): string | null {
  const id = value?.trim() || ''
  return id || null
}

function assertProjectExists(projectId: string | null) {
  if (!projectId) return
  const row = getDb()
    .prepare('SELECT id FROM projects WHERE id = ?')
    .get(projectId) as { id: string } | undefined
  if (!row) throw new Error('Projeto não encontrado.')
}

function ensureProjectFolder(projectId: string): string {
  const project = projectRepository.get(projectId)
  if (!project) throw new Error('Projeto não encontrado.')
  if (project.projectFolderPath && folderExists(project.projectFolderPath)) {
    return path.resolve(project.projectFolderPath)
  }
  const parentFolder = project.channelId
    ? channelRepository.get(project.channelId)?.folderPath ?? null
    : null
  const folder = createProjectFolder({
    name: project.name,
    projectType: project.projectType,
    parentFolder,
  })
  const updated = projectRepository.update(projectId, { projectFolderPath: folder })
  if (!updated?.projectFolderPath) throw new Error('Não foi possível criar a pasta do projeto.')
  return path.resolve(updated.projectFolderPath)
}

export const lipSyncRefRepository = {
  list(filters?: LipSyncRefListFilters): LipSyncRef[] {
    let sql = `${SELECT} WHERE 1=1`
    const params: unknown[] = []

    if (filters?.unassignedOnly) {
      sql += ` AND (r.project_id IS NULL OR TRIM(r.project_id) = '')`
    } else if (filters?.projectId !== undefined) {
      const projectId = normalizeProjectId(filters.projectId)
      if (projectId) {
        sql += ' AND r.project_id = ?'
        params.push(projectId)
      }
    }

    const status = filters?.status ?? 'active'
    if (status !== 'all') {
      sql += ' AND COALESCE(NULLIF(TRIM(r.status), \'\'), \'active\') = ?'
      params.push(status)
    }

    sql += ' ORDER BY r.sort_order ASC, r.created_at ASC'
    return (getDb().prepare(sql).all(...params) as Row[]).map(mapRow)
  },

  get(id: string): LipSyncRef | null {
    const row = getDb().prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined
    return row ? mapRow(row) : null
  },

  create(input: LipSyncRefCreateInput): LipSyncRef {
    const imagePath = input.imagePath?.trim()
    if (!imagePath) throw new Error('Selecione uma imagem.')

    const id = randomUUID()
    const now = new Date().toISOString()
    const stored = importLipSyncImage(imagePath, id)
    const label = input.label?.trim() || labelFromPath(imagePath)
    const prompt = input.prompt?.trim() || ''
    const projectId = normalizeProjectId(input.projectId)
    assertProjectExists(projectId)

    const maxOrder = getDb()
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM lipsync_refs')
      .get() as { max_order: number }
    const maxValue = Number(maxOrder?.max_order)
    const sortOrder = (Number.isFinite(maxValue) ? maxValue : -1) + 1

    getDb()
      .prepare(
        `INSERT INTO lipsync_refs (id, label, prompt, image_path, project_id, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .run(id, label, prompt, stored, projectId, sortOrder, now, now)

    return this.get(id)!
  },

  createMany(imagePaths: string[], projectId?: string | null): LipSyncRef[] {
    const created: LipSyncRef[] = []
    for (const imagePath of imagePaths) {
      created.push(this.create({ imagePath, projectId }))
    }
    return created
  },

  update(id: string, patch: LipSyncRefUpdateInput): LipSyncRef | null {
    const current = this.get(id)
    if (!current) return null
    const label = patch.label !== undefined ? patch.label.trim() : current.label
    const prompt = patch.prompt !== undefined ? patch.prompt : current.prompt
    const projectId =
      patch.projectId !== undefined ? normalizeProjectId(patch.projectId) : current.projectId
    assertProjectExists(projectId)
    const now = new Date().toISOString()
    getDb()
      .prepare(
        `UPDATE lipsync_refs
         SET label = ?, prompt = ?, project_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(label, prompt, projectId, now, id)
    return this.get(id)
  },

  remove(id: string): boolean {
    const row = getDb().prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined
    if (!row) return false
    getDb().prepare('DELETE FROM lipsync_refs WHERE id = ?').run(id)
    removeLipSyncImage(row.image_path, {
      projectFolder: row.project_folder_path,
    })
    return true
  },

  removeByProject(projectId: string): number {
    const id = normalizeProjectId(projectId)
    if (!id) throw new Error('Informe o projeto.')
    assertProjectExists(id)
    const rows = getDb()
      .prepare(`${SELECT} WHERE r.project_id = ?`)
      .all(id) as Row[]
    let removed = 0
    for (const row of rows) {
      if (this.remove(row.id)) removed += 1
    }
    return removed
  },

  archiveByProject(projectId: string): LipSyncRef[] {
    const id = normalizeProjectId(projectId)
    if (!id) throw new Error('Informe o projeto.')
    assertProjectExists(id)

    const active = this.list({ projectId: id, status: 'all' })
    if (active.length === 0) {
      throw new Error('Não há referências neste projeto para salvar.')
    }

    const projectFolder = ensureProjectFolder(id)
    const archived: LipSyncRef[] = []

    for (const item of active) {
      archiveLipSyncRefToProjectFolder({
        sourceImagePath: item.imagePath,
        projectFolder,
        label: item.label,
        prompt: item.prompt,
        refId: item.id,
      })
      archived.push(item)
      this.remove(item.id)
    }

    return archived
  },
}
