import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type {
  Channel,
  ChannelVideo,
  ChannelVideoStatus,
  ChannelVideoWriteInput,
  TitleStrengthAnalysis,
  VideoListFilters,
} from '../../shared/types'
import { isProjectType } from '../../shared/types'
import { hydrateStoredTitleAnalysis } from '../../shared/antigravity/titleAnalysis'
import { readImageDataUrl } from '../services/storage/profilePhoto'
import { removeChannelMedia, removeVideoThumbnailFile } from '../services/storage/channelMedia'
import { folderExists } from '../services/storage/projectFolders'

type ChannelRow = {
  id: string
  name: string
  description: string
  avatar_path: string | null
  niche_id: string | null
  youtube_url: string | null
  color: string | null
  channel_type: string | null
  active: number
  created_at: string
  updated_at: string
  niche_name?: string | null
  video_count?: number
}

type VideoRow = {
  id: string
  channel_id: string
  title: string
  description: string
  thumbnail_path: string | null
  scheduled_date: string
  status: string
  script_id: string | null
  project_id: string | null
  project_name?: string | null
  title_score: number | null
  title_analysis: string | null
  title_analyzed_at: string | null
  project_folder_path: string | null
  created_at: string
  updated_at: string
  channel_name?: string | null
  channel_type?: string | null
  channel_color?: string | null
}

const VIDEO_STATUSES: ChannelVideoStatus[] = ['colocando', 'editando', 'agendando', 'publicado']

function normalizeVideoStatus(value: string): ChannelVideoStatus {
  if (value === 'planejado') return 'colocando'
  if (value === 'gravado') return 'editando'
  return VIDEO_STATUSES.includes(value as ChannelVideoStatus) ? (value as ChannelVideoStatus) : 'colocando'
}

function parseTitleAnalysis(value: string | null, title?: string): TitleStrengthAnalysis | null {
  if (!value?.trim()) return null
  try {
    return hydrateStoredTitleAnalysis(JSON.parse(value) as unknown, title)
  } catch {
    return null
  }
}

function mapChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    avatarPath: row.avatar_path ?? '',
    avatarDataUrl: readImageDataUrl(row.avatar_path ?? ''),
    nicheId: row.niche_id ?? null,
    nicheName: row.niche_name ?? null,
    youtubeUrl: row.youtube_url ?? '',
    color: row.color || '#35e58b',
    channelType: isProjectType(row.channel_type) ? row.channel_type : 'history',
    active: Number(row.active) === 1,
    videoCount: Number(row.video_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapVideo(row: VideoRow): ChannelVideo {
  const status = normalizeVideoStatus(row.status)
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    description: row.description ?? '',
    thumbnailPath: row.thumbnail_path ?? '',
    thumbnailDataUrl: readImageDataUrl(row.thumbnail_path ?? ''),
    scheduledDate: row.scheduled_date,
    status,
    scriptId: row.script_id ?? null,
    projectId: row.project_id?.trim() ? row.project_id : null,
    projectName: row.project_name ?? null,
    projectFolderPath: row.project_folder_path?.trim() ? row.project_folder_path : null,
    folderExists: folderExists(row.project_folder_path),
    titleScore: row.title_score == null ? null : Number(row.title_score),
    titleAnalysis: parseTitleAnalysis(row.title_analysis, row.title),
    titleAnalyzedAt: row.title_analyzed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    channelName: row.channel_name ?? null,
    channelType: isProjectType(row.channel_type) ? row.channel_type : null,
    channelColor: row.channel_color ?? null,
  }
}

export const channelRepository = {
  list(filters?: { query?: string; channelType?: Channel['channelType'] }): Channel[] {
    const db = getDb()
    let sql = `
      SELECT c.*, n.name AS niche_name,
        (SELECT COUNT(*) FROM channel_videos v WHERE v.channel_id = c.id) AS video_count
      FROM channels c
      LEFT JOIN niches n ON n.id = c.niche_id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (filters?.channelType) {
      sql += ' AND c.channel_type = ?'
      params.push(filters.channelType)
    }
    if (filters?.query) {
      sql += ' AND (c.name LIKE ? OR c.description LIKE ?)'
      params.push(`%${filters.query}%`, `%${filters.query}%`)
    }
    sql += ' ORDER BY c.name ASC'
    return (db.prepare(sql).all(...params) as ChannelRow[]).map(mapChannel)
  },

  existsOfType(type: Channel['channelType']): boolean {
    const db = getDb()
    if (type === 'music') {
      const row = db
        .prepare(`SELECT 1 AS ok FROM channels WHERE channel_type = 'music' LIMIT 1`)
        .get() as { ok: number } | undefined
      return Boolean(row)
    }
    const row = db
      .prepare(
        `SELECT 1 AS ok FROM channels WHERE channel_type IS NULL OR channel_type != 'music' LIMIT 1`,
      )
      .get() as { ok: number } | undefined
    return Boolean(row)
  },

  get(id: string): Channel | null {
    const row = getDb()
      .prepare(
        `SELECT c.*, n.name AS niche_name,
          (SELECT COUNT(*) FROM channel_videos v WHERE v.channel_id = c.id) AS video_count
         FROM channels c
         LEFT JOIN niches n ON n.id = c.niche_id
         WHERE c.id = ?`,
      )
      .get(id) as ChannelRow | undefined
    return row ? mapChannel(row) : null
  },

  create(
    input: Omit<Channel, 'id' | 'createdAt' | 'updatedAt' | 'avatarDataUrl' | 'videoCount' | 'nicheName'>,
  ): Channel {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO channels (id, name, description, avatar_path, niche_id, youtube_url, color, channel_type, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name.trim(),
        input.description ?? '',
        input.avatarPath ?? '',
        input.nicheId || null,
        input.youtubeUrl ?? '',
        input.color || '#35e58b',
        isProjectType(input.channelType) ? input.channelType : 'history',
        input.active ? 1 : 0,
        timestamp,
        timestamp,
      )
    return this.get(id)!
  },

  update(
    id: string,
    patch: Partial<Omit<Channel, 'id' | 'createdAt' | 'avatarDataUrl' | 'videoCount' | 'nicheName'>>,
  ): Channel | null {
    const current = this.get(id)
    if (!current) return null
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    getDb()
      .prepare(
        `UPDATE channels SET
          name = ?, description = ?, avatar_path = ?, niche_id = ?, youtube_url = ?,
          color = ?, channel_type = ?, active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.name.trim(),
        next.description ?? '',
        next.avatarPath ?? '',
        next.nicheId || null,
        next.youtubeUrl ?? '',
        next.color || '#35e58b',
        isProjectType(next.channelType) ? next.channelType : 'history',
        next.active ? 1 : 0,
        next.updatedAt,
        id,
      )
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    const videos = this.listVideos({ channelId: id })
    getDb().prepare('DELETE FROM channel_videos WHERE channel_id = ?').run(id)
    getDb().prepare('DELETE FROM channel_prompts WHERE channel_id = ?').run(id)
    getDb().prepare('UPDATE projects SET channel_id = NULL WHERE channel_id = ?').run(id)
    getDb().prepare('DELETE FROM channels WHERE id = ?').run(id)
    for (const video of videos) {
      removeVideoThumbnailFile(video.thumbnailPath)
    }
    removeChannelMedia(id)
    return true
  },

  listVideos(filters: VideoListFilters = {}): ChannelVideo[] {
    const db = getDb()
    let sql = `
      SELECT v.*, c.name AS channel_name, c.channel_type AS channel_type, c.color AS channel_color,
        p.name AS project_name
      FROM channel_videos v
      LEFT JOIN channels c ON c.id = v.channel_id
      LEFT JOIN projects p ON p.id = v.project_id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (filters.channelId) {
      sql += ' AND v.channel_id = ?'
      params.push(filters.channelId)
    }
    if (filters.projectId) {
      sql += ' AND v.project_id = ?'
      params.push(filters.projectId)
    }
    if (filters.from) {
      sql += ' AND v.scheduled_date >= ?'
      params.push(filters.from)
    }
    if (filters.to) {
      sql += ' AND v.scheduled_date <= ?'
      params.push(filters.to)
    }
    if (filters.status && VIDEO_STATUSES.includes(filters.status)) {
      sql += ' AND v.status = ?'
      params.push(filters.status)
    }
    if (filters.excludeStatus && VIDEO_STATUSES.includes(filters.excludeStatus)) {
      sql += ' AND v.status != ?'
      params.push(filters.excludeStatus)
    }
    sql += ' ORDER BY v.scheduled_date ASC, v.created_at ASC'
    if (filters.limit != null) {
      sql += ' LIMIT ?'
      params.push(Math.max(1, Math.min(filters.limit, 200)))
    }
    return (db.prepare(sql).all(...params) as VideoRow[]).map(mapVideo)
  },

  listRecentTitles(channelId: string, opts?: { excludeVideoId?: string; limit?: number }): string[] {
    const limit = Math.max(1, Math.min(opts?.limit ?? 20, 40))
    const rows = getDb()
      .prepare(
        `SELECT id, title FROM channel_videos
         WHERE channel_id = ?
         ORDER BY scheduled_date DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(channelId, limit) as Array<{ id: string; title: string }>
    return rows
      .filter((row) => row.id !== opts?.excludeVideoId)
      .map((row) => row.title.trim())
      .filter(Boolean)
  },

  getVideo(id: string): ChannelVideo | null {
    const row = getDb()
      .prepare(
        `SELECT v.*, c.name AS channel_name, c.channel_type AS channel_type, c.color AS channel_color,
          p.name AS project_name
         FROM channel_videos v
         LEFT JOIN channels c ON c.id = v.channel_id
         LEFT JOIN projects p ON p.id = v.project_id
         WHERE v.id = ?`,
      )
      .get(id) as VideoRow | undefined
    return row ? mapVideo(row) : null
  },

  getVideoByProjectId(projectId: string): ChannelVideo | null {
    const id = projectId.trim()
    if (!id) return null
    const row = getDb()
      .prepare(
        `SELECT v.*, c.name AS channel_name, c.channel_type AS channel_type, c.color AS channel_color,
          p.name AS project_name
         FROM channel_videos v
         LEFT JOIN channels c ON c.id = v.channel_id
         LEFT JOIN projects p ON p.id = v.project_id
         WHERE v.project_id = ?
         LIMIT 1`,
      )
      .get(id) as VideoRow | undefined
    return row ? mapVideo(row) : null
  },

  createVideo(input: ChannelVideoWriteInput): ChannelVideo {
    if (!this.get(input.channelId)) {
      throw new Error('Canal não encontrado')
    }
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const status = normalizeVideoStatus(input.status)
    getDb()
      .prepare(
        `INSERT INTO channel_videos
          (id, channel_id, title, description, thumbnail_path, scheduled_date, status, script_id, project_id, project_folder_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.channelId,
        input.title.trim(),
        input.description ?? '',
        input.thumbnailPath ?? '',
        input.scheduledDate,
        status,
        input.scriptId || null,
        input.projectId?.trim() || null,
        input.projectFolderPath?.trim() || null,
        timestamp,
        timestamp,
      )
    return this.getVideo(id)!
  },

  updateVideo(
    id: string,
    patch: Partial<Omit<ChannelVideo, 'id' | 'channelId' | 'createdAt' | 'thumbnailDataUrl' | 'folderExists'>>,
  ): ChannelVideo | null {
    const current = this.getVideo(id)
    if (!current) return null
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    if (patch.title && patch.title.trim() !== current.title) {
      next.titleScore = null
      next.titleAnalysis = null
      next.titleAnalyzedAt = null
    }
    const status = normalizeVideoStatus(next.status)
    getDb()
      .prepare(
        `UPDATE channel_videos SET
          title = ?, description = ?, thumbnail_path = ?, scheduled_date = ?,
          status = ?, script_id = ?, project_folder_path = ?, title_score = ?, title_analysis = ?, title_analyzed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.title.trim(),
        next.description ?? '',
        next.thumbnailPath ?? '',
        next.scheduledDate,
        status,
        next.scriptId || null,
        next.projectFolderPath?.trim() || null,
        next.titleScore ?? null,
        next.titleAnalysis ? JSON.stringify(next.titleAnalysis) : null,
        next.titleAnalyzedAt ?? null,
        next.updatedAt,
        id,
      )
    return this.getVideo(id)
  },

  removeVideo(id: string): boolean {
    const current = this.getVideo(id)
    if (!current) return false
    getDb().prepare('DELETE FROM channel_videos WHERE id = ?').run(id)
    removeVideoThumbnailFile(current.thumbnailPath)
    return true
  },
}
