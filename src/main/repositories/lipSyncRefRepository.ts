import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getDb } from '../db/database'
import type {
  LipSyncFolderScan,
  LipSyncRef,
  LipSyncRefCreateInput,
  LipSyncRefListFilters,
  LipSyncRefStatus,
  LipSyncRefUpdateInput,
  LipSyncSubject,
} from '../../shared/lipSyncRefs'
import { isLipSyncRefStatus, isLipSyncSubject } from '../../shared/lipSyncRefs'
import { localImageThumbUrl, localImageUrl } from '../services/media/localImageUrl'
import { warmImageThumbnails } from '../services/media/imageThumbnails'
import {
  archiveLipSyncRefToProjectFolder,
  importLipSyncImage,
  removeLipSyncImage,
} from '../services/storage/lipSyncMedia'
import { scanLipSyncFolder } from '../services/storage/lipSyncFolderScan'
import { createProjectFolder, folderExists } from '../services/storage/projectFolders'
import { channelRepository } from './channelRepository'
import { projectRepository } from './projectRepository'

type Row = {
  id: string
  label: string
  prompt: string
  lyrics: string | null
  image_path: string
  project_id: string | null
  project_name: string | null
  project_folder_path: string | null
  subject: string | null
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
    r.lyrics,
    r.image_path,
    r.project_id,
    p.name AS project_name,
    p.folder_path AS project_folder_path,
    r.subject,
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

function mapSubject(value: string | null | undefined): LipSyncSubject {
  return isLipSyncSubject(value) ? value : 'singer'
}

function mapRow(row: Row): LipSyncRef {
  return {
    id: row.id,
    label: row.label ?? '',
    prompt: row.prompt ?? '',
    lyrics: row.lyrics ?? '',
    imagePath: row.image_path,
    imageDataUrl: localImageUrl(row.image_path),
    imageThumbUrl: localImageThumbUrl(row.image_path, 360),
    imagePreviewUrl: localImageThumbUrl(row.image_path, 1080),
    projectId: row.project_id?.trim() || null,
    projectName: row.project_name?.trim() || null,
    subject: mapSubject(row.subject),
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

    if (filters?.subject && isLipSyncSubject(filters.subject)) {
      sql += ` AND COALESCE(NULLIF(TRIM(r.subject), ''), 'singer') = ?`
      params.push(filters.subject)
    }

    sql += ' ORDER BY r.sort_order ASC, r.created_at ASC'
    return (getDb().prepare(sql).all(...params) as Row[]).map(mapRow)
  },

  get(id: string): LipSyncRef | null {
    const row = getDb().prepare(`${SELECT} WHERE r.id = ?`).get(id) as Row | undefined
    return row ? mapRow(row) : null
  },

  create(input: LipSyncRefCreateInput): LipSyncRef {
    const sourceImage = input.imagePath?.trim() ?? ''
    const id = randomUUID()
    const now = new Date().toISOString()
    const stored = sourceImage ? importLipSyncImage(sourceImage, id) : ''
    warmImageThumbnails(stored)
    const label = input.label?.trim() || (sourceImage ? labelFromPath(sourceImage) : '')
    const prompt = input.prompt?.trim() || ''
    const lyrics = input.lyrics?.trim() || ''
    const projectId = normalizeProjectId(input.projectId)
    const subject = mapSubject(input.subject)
    assertProjectExists(projectId)

    const maxOrder = getDb()
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM lipsync_refs')
      .get() as { max_order: number }
    const maxValue = Number(maxOrder?.max_order)
    const sortOrder = (Number.isFinite(maxValue) ? maxValue : -1) + 1

    getDb()
      .prepare(
        `INSERT INTO lipsync_refs (id, label, prompt, lyrics, image_path, project_id, subject, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .run(id, label, prompt, lyrics, stored, projectId, subject, sortOrder, now, now)

    return this.get(id)!
  },

  createMany(
    imagePaths: string[],
    projectId?: string | null,
    subject?: LipSyncSubject,
  ): LipSyncRef[] {
    const created: LipSyncRef[] = []
    for (const imagePath of imagePaths) {
      created.push(this.create({ imagePath, projectId, subject }))
    }
    return created
  },

  update(id: string, patch: LipSyncRefUpdateInput): LipSyncRef | null {
    const current = this.get(id)
    if (!current) return null
    const label = patch.label !== undefined ? patch.label.trim() : current.label
    const prompt = patch.prompt !== undefined ? patch.prompt : current.prompt
    const lyrics = patch.lyrics !== undefined ? patch.lyrics : current.lyrics
    const projectId =
      patch.projectId !== undefined ? normalizeProjectId(patch.projectId) : current.projectId
    const subject = patch.subject !== undefined ? mapSubject(patch.subject) : current.subject
    assertProjectExists(projectId)

    let imagePath = current.imagePath
    let previousImage: string | null = null
    if (patch.imagePath !== undefined) {
      const source = patch.imagePath.trim()
      if (!source) throw new Error('Selecione uma imagem.')
      const stored = importLipSyncImage(source, id)
      warmImageThumbnails(stored)
      if (current.imagePath.trim() && path.resolve(stored) !== path.resolve(current.imagePath)) {
        previousImage = current.imagePath
      }
      imagePath = stored
    }

    const now = new Date().toISOString()
    getDb()
      .prepare(
        `UPDATE lipsync_refs
         SET label = ?, prompt = ?, lyrics = ?, project_id = ?, subject = ?, image_path = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(label, prompt, lyrics, projectId, subject, imagePath, now, id)

    if (previousImage) {
      removeLipSyncImage(previousImage)
    }

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

  removeByProject(projectId: string, subject?: LipSyncSubject): number {
    const id = normalizeProjectId(projectId)
    if (!id) throw new Error('Informe o projeto.')
    assertProjectExists(id)
    const rows = (
      getDb().prepare(`${SELECT} WHERE r.project_id = ?`).all(id) as Row[]
    ).filter((row) => !subject || mapSubject(row.subject) === subject)
    let removed = 0
    for (const row of rows) {
      if (this.remove(row.id)) removed += 1
    }
    return removed
  },

  scanFolder(folder: string): LipSyncFolderScan {
    return scanLipSyncFolder(folder)
  },

  archiveByProject(projectId: string, subject?: LipSyncSubject): LipSyncRef[] {
    const id = normalizeProjectId(projectId)
    if (!id) throw new Error('Informe o projeto.')
    assertProjectExists(id)

    const active = this.list({ projectId: id, status: 'all', subject })
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
        lyrics: item.lyrics,
        refId: item.id,
      })
      archived.push(item)
      this.remove(item.id)
    }

    return archived
  },
}
