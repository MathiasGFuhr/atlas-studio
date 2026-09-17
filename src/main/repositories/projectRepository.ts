import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type { ChannelVideoStatus, Project, ProjectType } from '../../shared/types'
import { isProjectType, MUSIC_PROJECT_HAS_PUBLICATION_ERROR } from '../../shared/types'
import { folderExists } from '../services/storage/projectFolders'
import { channelRepository } from './channelRepository'

type ProjectRow = {
  id: string
  name: string
  description: string | null
  project_type: string
  folder_path: string | null
  channel_id: string | null
  channel_name?: string | null
  created_at: string
  updated_at: string
  script_count?: number
  track_count?: number
  scheduled_video_id?: string | null
  scheduled_video_channel_id?: string | null
  scheduled_date?: string | null
  scheduled_video_status?: string | null
  scheduled_video_title?: string | null
}

function mapProject(row: ProjectRow): Project {
  const folderPath = row.folder_path?.trim() ? row.folder_path : null
  const channelId = row.channel_id?.trim() ? row.channel_id : null
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    projectType: isProjectType(row.project_type) ? row.project_type : 'history',
    channelId,
    channelName: row.channel_name ?? null,
    projectFolderPath: folderPath,
    folderExists: folderExists(folderPath),
    scriptCount: Number(row.script_count ?? 0),
    trackCount: Number(row.track_count ?? 0),
    scheduledVideoId: row.scheduled_video_id?.trim() || null,
    scheduledVideoChannelId: row.scheduled_video_channel_id?.trim() || null,
    scheduledDate: row.scheduled_date?.trim() || null,
    scheduledVideoStatus: (row.scheduled_video_status as ChannelVideoStatus | null) ?? null,
    scheduledVideoTitle: row.scheduled_video_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_WITH_COUNTS = `
  SELECT p.*,
    c.name AS channel_name,
    (SELECT COUNT(*) FROM scripts s WHERE s.project_id = p.id) AS script_count,
    (SELECT COUNT(*) FROM music_tracks m WHERE m.project_id = p.id) AS track_count,
    v.id AS scheduled_video_id,
    v.channel_id AS scheduled_video_channel_id,
    v.scheduled_date AS scheduled_date,
    v.status AS scheduled_video_status,
    v.title AS scheduled_video_title
  FROM projects p
  LEFT JOIN channels c ON c.id = p.channel_id
  LEFT JOIN channel_videos v ON v.project_id = p.id
`

function resolveChannelId(projectType: ProjectType, channelId?: string | null): string | null {
  const id = channelId?.trim() || null
  if (!id) return null
  const channel = channelRepository.get(id)
  if (!channel) throw new Error('Canal não encontrado.')
  if (channel.channelType !== projectType) {
    throw new Error('Este canal não pertence a este ambiente.')
  }
  return channel.id
}

export const projectRepository = {
  list(filters?: { projectType?: ProjectType; query?: string }): Project[] {
    let sql = `${SELECT_WITH_COUNTS} WHERE 1=1`
    const params: unknown[] = []

    if (filters?.projectType) {
      sql += ' AND p.project_type = ?'
      params.push(filters.projectType)
    }
    if (filters?.query?.trim()) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'
      const like = `%${filters.query.trim()}%`
      params.push(like, like)
    }

    sql += ' ORDER BY p.updated_at DESC'
    return (getDb().prepare(sql).all(...params) as ProjectRow[]).map(mapProject)
  },

  existsOfType(type: ProjectType): boolean {
    const row = getDb()
      .prepare('SELECT 1 AS ok FROM projects WHERE project_type = ? LIMIT 1')
      .get(type) as { ok: number } | undefined
    return Boolean(row)
  },

  get(id: string): Project | null {
    const row = getDb().prepare(`${SELECT_WITH_COUNTS} WHERE p.id = ?`).get(id) as
      | ProjectRow
      | undefined
    return row ? mapProject(row) : null
  },

  getByFolderPath(folderPath: string): Project | null {
    const normalized = folderPath.trim()
    if (!normalized) return null
    const row = getDb()
      .prepare(`${SELECT_WITH_COUNTS} WHERE p.folder_path = ?`)
      .get(normalized) as ProjectRow | undefined
    return row ? mapProject(row) : null
  },

  countByType(): Record<ProjectType, number> {
    const rows = getDb()
      .prepare('SELECT project_type, COUNT(*) AS c FROM projects GROUP BY project_type')
      .all() as Array<{ project_type: string; c: number }>
    const counts: Record<ProjectType, number> = { history: 0, music: 0 }
    for (const row of rows) {
      if (isProjectType(row.project_type)) counts[row.project_type] = Number(row.c)
    }
    return counts
  },

  create(input: {
    name: string
    description?: string
    projectType: ProjectType
    channelId?: string | null
    projectFolderPath?: string | null
  }): Project {
    const name = input.name?.trim()
    if (!name) throw new Error('Informe o nome do projeto.')
    if (!isProjectType(input.projectType)) throw new Error('Tipo de projeto inválido.')
    const channelId = resolveChannelId(input.projectType, input.channelId)

    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO projects (id, name, description, project_type, folder_path, channel_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        input.description?.trim() ?? '',
        input.projectType,
        input.projectFolderPath?.trim() || null,
        channelId,
        timestamp,
        timestamp,
      )
    return this.get(id)!
  },

  update(
    id: string,
    patch: Partial<Pick<Project, 'name' | 'description' | 'projectFolderPath' | 'channelId'>>,
  ): Project | null {
    const current = this.get(id)
    if (!current) return null

    const name = patch.name !== undefined ? patch.name.trim() : current.name
    if (!name) throw new Error('Informe o nome do projeto.')

    const description =
      patch.description !== undefined ? patch.description.trim() : current.description
    const folderPath =
      patch.projectFolderPath !== undefined
        ? patch.projectFolderPath?.trim() || null
        : current.projectFolderPath
    const channelId =
      patch.channelId !== undefined
        ? resolveChannelId(current.projectType, patch.channelId)
        : current.channelId
    const updatedAt = new Date().toISOString()

    getDb()
      .prepare(
        'UPDATE projects SET name = ?, description = ?, folder_path = ?, channel_id = ?, updated_at = ? WHERE id = ?',
      )
      .run(name, description, folderPath, channelId, updatedAt, id)
    return this.get(id)
  },

  /** Marca o projeto como atualizado quando algo vinculado a ele muda. */
  touch(id: string): void {
    getDb()
      .prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
  },

  /**
   * Remove o cadastro do projeto da fonte de verdade (`projects`).
   * Roteiros, faixas e prompts rápidos continuam no Atlas, só perdem o vínculo.
   * A pasta física não é apagada. O boot não recria o projeto a partir desses órfãos.
   * Vídeo musical vinculado precisa ser removido antes (serviço de publicação).
   */
  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    if (channelRepository.getVideoByProjectId(id)) {
      throw new Error(MUSIC_PROJECT_HAS_PUBLICATION_ERROR)
    }
    const db = getDb()
    db.prepare('UPDATE scripts SET project_id = NULL WHERE project_id = ?').run(id)
    db.prepare('UPDATE music_tracks SET project_id = NULL WHERE project_id = ?').run(id)
    db.prepare('UPDATE quick_prompts SET project_id = NULL WHERE project_id = ?').run(id)
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return true
  },
}
