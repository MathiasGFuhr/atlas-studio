import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type { Channel, ChannelVideo, ChannelVideoStatus, TitleStrengthAnalysis } from '../../shared/types'
import { isProjectType } from '../../shared/types'
import { readImageDataUrl } from '../services/storage/profilePhoto'
import { removeChannelMedia, removeVideoThumbnailFile } from '../services/storage/channelMedia'

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
  title_score: number | null
  title_analysis: string | null
  title_analyzed_at: string | null
  created_at: string
  updated_at: string
}

const VIDEO_STATUSES: ChannelVideoStatus[] = ['planejado', 'gravado', 'publicado']

function parseTitleAnalysis(value: string | null): TitleStrengthAnalysis | null {
  if (!value?.trim()) return null
  try {
    const parsed = JSON.parse(value) as TitleStrengthAnalysis
    if (!parsed || typeof parsed.score !== 'number') return null
    return parsed
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
  const status = VIDEO_STATUSES.includes(row.status as ChannelVideoStatus)
    ? (row.status as ChannelVideoStatus)
    : 'planejado'
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
    titleScore: row.title_score == null ? null : Number(row.title_score),
    titleAnalysis: parseTitleAnalysis(row.title_analysis),
    titleAnalyzedAt: row.title_analyzed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

  listVideos(filters: { channelId: string; from?: string; to?: string }): ChannelVideo[] {
    const db = getDb()
    let sql = 'SELECT * FROM channel_videos WHERE channel_id = ?'
    const params: unknown[] = [filters.channelId]
    if (filters.from) {
      sql += ' AND scheduled_date >= ?'
      params.push(filters.from)
    }
    if (filters.to) {
      sql += ' AND scheduled_date <= ?'
      params.push(filters.to)
    }
    sql += ' ORDER BY scheduled_date ASC, created_at ASC'
    return (db.prepare(sql).all(...params) as VideoRow[]).map(mapVideo)
  },

  getVideo(id: string): ChannelVideo | null {
    const row = getDb().prepare('SELECT * FROM channel_videos WHERE id = ?').get(id) as
      | VideoRow
      | undefined
    return row ? mapVideo(row) : null
  },

  createVideo(
    input: Omit<ChannelVideo, 'id' | 'createdAt' | 'updatedAt' | 'thumbnailDataUrl'>,
  ): ChannelVideo {
    if (!this.get(input.channelId)) {
      throw new Error('Canal não encontrado')
    }
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const status = VIDEO_STATUSES.includes(input.status) ? input.status : 'planejado'
    getDb()
      .prepare(
        `INSERT INTO channel_videos
          (id, channel_id, title, description, thumbnail_path, scheduled_date, status, script_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        timestamp,
        timestamp,
      )
    return this.getVideo(id)!
  },

  updateVideo(
    id: string,
    patch: Partial<Omit<ChannelVideo, 'id' | 'channelId' | 'createdAt' | 'thumbnailDataUrl'>>,
  ): ChannelVideo | null {
    const current = this.getVideo(id)
    if (!current) return null
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    if (patch.title && patch.title.trim() !== current.title) {
      next.titleScore = null
      next.titleAnalysis = null
      next.titleAnalyzedAt = null
    }
    const status = VIDEO_STATUSES.includes(next.status) ? next.status : 'planejado'
    getDb()
      .prepare(
        `UPDATE channel_videos SET
          title = ?, description = ?, thumbnail_path = ?, scheduled_date = ?,
          status = ?, script_id = ?, title_score = ?, title_analysis = ?, title_analyzed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.title.trim(),
        next.description ?? '',
        next.thumbnailPath ?? '',
        next.scheduledDate,
        status,
        next.scriptId || null,
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
