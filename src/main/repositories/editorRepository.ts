import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getDb } from '../db/database'
import { createEmptyTimeline, normalizeTimeline, timelineDuration } from '../../shared/editor/timelineOps'
import type {
  EditorAspect,
  EditorAsset,
  EditorAssetKind,
  EditorAssetOrigin,
  EditorProject,
  EditorProjectPatch,
  EditorProxyStatus,
} from '../../shared/editor/types'

type ProjectRow = {
  id: string
  name: string
  timeline_json: string | null
  last_export_path: string | null
  music_project_id: string | null
  music_track_id: string | null
  channel_id: string | null
  created_at: string
  updated_at: string
}

type AssetRow = {
  id: string
  project_id: string
  kind: string
  origin: string
  name: string
  source_path: string
  duration: number
  width: number
  height: number
  fps: number
  has_audio: number
  proxy_status: string
  proxy_path: string | null
  thumbs_path: string | null
  thumbs_count: number
  thumbs_tile_width: number
  waveform_path: string | null
  created_at: string
}

const PROJECT_SELECT = `
  SELECT id, name, timeline_json, last_export_path, music_project_id, music_track_id, channel_id, created_at, updated_at
  FROM editor_projects
`

const ASSET_SELECT = `
  SELECT
    id, project_id, kind, origin, name, source_path, duration, width, height, fps, has_audio,
    proxy_status, proxy_path, thumbs_path, thumbs_count, thumbs_tile_width, waveform_path, created_at
  FROM editor_assets
`

function parseTimeline(raw: string | null) {
  if (!raw) return createEmptyTimeline()
  try {
    return normalizeTimeline(JSON.parse(raw))
  } catch {
    return createEmptyTimeline()
  }
}

function mapProject(row: ProjectRow): EditorProject {
  const timeline = parseTimeline(row.timeline_json)
  return {
    id: row.id,
    name: row.name,
    timeline,
    musicProjectId: row.music_project_id?.trim() || null,
    musicTrackId: row.music_track_id?.trim() || null,
    channelId: row.channel_id?.trim() || null,
    duration: timelineDuration(timeline),
    lastExportPath: row.last_export_path?.trim() || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function asKind(value: string): EditorAssetKind {
  return value === 'audio' || value === 'image' ? value : 'video'
}

function asOrigin(value: string): EditorAssetOrigin {
  return value === 'lipsync' ? 'lipsync' : 'file'
}

function asProxyStatus(value: string): EditorProxyStatus {
  return value === 'pending' || value === 'ready' || value === 'failed' ? value : 'none'
}

function mapAsset(row: AssetRow): EditorAsset {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: asKind(row.kind),
    origin: asOrigin(row.origin),
    name: row.name,
    sourcePath: row.source_path,
    duration: Number(row.duration) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    fps: Number(row.fps) || 0,
    hasAudio: Boolean(row.has_audio),
    proxyStatus: asProxyStatus(row.proxy_status),
    proxyPath: row.proxy_path || null,
    thumbsPath: row.thumbs_path || null,
    thumbsCount: Number(row.thumbs_count) || 0,
    thumbsTileWidth: Number(row.thumbs_tile_width) || 0,
    waveformPath: row.waveform_path || null,
    createdAt: row.created_at,
  }
}

/** Caminhos de origem liberados no protocolo atlas-media (consultado a cada requisição de mídia). */
let sourcePathCache: Set<string> | null = null

function invalidateSourcePaths() {
  sourcePathCache = null
}

export type EditorAssetCreateInput = {
  projectId: string
  kind: EditorAssetKind
  origin: EditorAssetOrigin
  name: string
  sourcePath: string
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

export type EditorAssetMediaPatch = Partial<
  Pick<
    EditorAsset,
    'proxyStatus' | 'proxyPath' | 'thumbsPath' | 'thumbsCount' | 'thumbsTileWidth' | 'waveformPath'
  >
>

export const editorRepository = {
  listProjects(): EditorProject[] {
    return (getDb().prepare(`${PROJECT_SELECT} ORDER BY updated_at DESC`).all() as ProjectRow[]).map(
      mapProject,
    )
  },

  getProject(id: string): EditorProject | null {
    const row = getDb().prepare(`${PROJECT_SELECT} WHERE id = ?`).get(id) as ProjectRow | undefined
    return row ? mapProject(row) : null
  },

  createProject(input: {
    name: string
    aspect: EditorAspect
    musicProjectId?: string | null
    musicTrackId?: string | null
    channelId?: string | null
  }): EditorProject {
    const id = randomUUID()
    const now = new Date().toISOString()
    const name = input.name.trim() || 'Novo projeto'
    getDb()
      .prepare(
        `INSERT INTO editor_projects (
           id, name, timeline_json, last_export_path, music_project_id, music_track_id, channel_id, created_at, updated_at
         ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        JSON.stringify(createEmptyTimeline(input.aspect)),
        input.musicProjectId?.trim() || null,
        input.musicTrackId?.trim() || null,
        input.channelId?.trim() || null,
        now,
        now,
      )
    const created = this.getProject(id)
    if (!created) throw new Error('Falha ao criar o projeto de edição.')
    return created
  },

  findByMusicProjectId(musicProjectId: string): EditorProject | null {
    const id = String(musicProjectId ?? '').trim()
    if (!id) return null
    const row = getDb()
      .prepare(`${PROJECT_SELECT} WHERE music_project_id = ? ORDER BY updated_at DESC LIMIT 1`)
      .get(id) as ProjectRow | undefined
    return row ? mapProject(row) : null
  },

  updateProject(id: string, patch: EditorProjectPatch): EditorProject | null {
    const current = this.getProject(id)
    if (!current) return null
    const name = patch.name !== undefined ? patch.name.trim() || current.name : current.name
    const timeline =
      patch.timeline !== undefined ? normalizeTimeline(patch.timeline, current.timeline.aspect) : current.timeline
    const musicProjectId =
      patch.musicProjectId !== undefined
        ? patch.musicProjectId?.trim() || null
        : current.musicProjectId
    const musicTrackId =
      patch.musicTrackId !== undefined ? patch.musicTrackId?.trim() || null : current.musicTrackId
    const channelId =
      patch.channelId !== undefined ? patch.channelId?.trim() || null : current.channelId
    getDb()
      .prepare(
        `UPDATE editor_projects
         SET name = ?, timeline_json = ?, music_project_id = ?, music_track_id = ?, channel_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        name,
        JSON.stringify(timeline),
        musicProjectId,
        musicTrackId,
        channelId,
        new Date().toISOString(),
        id,
      )
    return this.getProject(id)
  },

  setLastExport(id: string, outputPath: string) {
    getDb()
      .prepare('UPDATE editor_projects SET last_export_path = ?, updated_at = ? WHERE id = ?')
      .run(outputPath, new Date().toISOString(), id)
  },

  removeProject(id: string): boolean {
    if (!this.getProject(id)) return false
    getDb().prepare('DELETE FROM editor_assets WHERE project_id = ?').run(id)
    getDb().prepare('DELETE FROM editor_projects WHERE id = ?').run(id)
    invalidateSourcePaths()
    return true
  },

  listAssets(projectId: string): EditorAsset[] {
    return (
      getDb().prepare(`${ASSET_SELECT} WHERE project_id = ? ORDER BY created_at ASC`).all(projectId) as AssetRow[]
    ).map(mapAsset)
  },

  getAsset(id: string): EditorAsset | null {
    const row = getDb().prepare(`${ASSET_SELECT} WHERE id = ?`).get(id) as AssetRow | undefined
    return row ? mapAsset(row) : null
  },

  findAssetBySource(projectId: string, sourcePath: string): EditorAsset | null {
    const target = path.resolve(sourcePath).toLowerCase()
    return this.listAssets(projectId).find((asset) => path.resolve(asset.sourcePath).toLowerCase() === target) ?? null
  },

  createAsset(input: EditorAssetCreateInput): EditorAsset {
    const id = randomUUID()
    const now = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO editor_assets (
          id, project_id, kind, origin, name, source_path, duration, width, height, fps, has_audio,
          proxy_status, proxy_path, thumbs_path, thumbs_count, thumbs_tile_width, waveform_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', NULL, NULL, 0, 0, NULL, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.kind,
        input.origin,
        input.name,
        path.resolve(input.sourcePath),
        input.duration,
        Math.round(input.width),
        Math.round(input.height),
        input.fps,
        input.hasAudio ? 1 : 0,
        now,
      )
    invalidateSourcePaths()
    const created = this.getAsset(id)
    if (!created) throw new Error('Falha ao registrar a mídia.')
    return created
  },

  updateAssetMedia(id: string, patch: EditorAssetMediaPatch): EditorAsset | null {
    const current = this.getAsset(id)
    if (!current) return null
    const next = { ...current, ...patch }
    getDb()
      .prepare(
        `UPDATE editor_assets SET
          proxy_status = ?, proxy_path = ?, thumbs_path = ?, thumbs_count = ?, thumbs_tile_width = ?, waveform_path = ?
        WHERE id = ?`,
      )
      .run(
        next.proxyStatus,
        next.proxyPath,
        next.thumbsPath,
        next.thumbsCount,
        next.thumbsTileWidth,
        next.waveformPath,
        id,
      )
    return this.getAsset(id)
  },

  updateAssetOrigin(id: string, origin: EditorAssetOrigin): EditorAsset | null {
    const current = this.getAsset(id)
    if (!current) return null
    if (current.origin === origin) return current
    getDb().prepare('UPDATE editor_assets SET origin = ? WHERE id = ?').run(origin, id)
    return this.getAsset(id)
  },

  removeAsset(id: string): boolean {
    if (!this.getAsset(id)) return false
    getDb().prepare('DELETE FROM editor_assets WHERE id = ?').run(id)
    invalidateSourcePaths()
    return true
  },

  isKnownSourcePath(resolved: string): boolean {
    if (!sourcePathCache) {
      const rows = getDb().prepare('SELECT source_path FROM editor_assets').all() as Array<{ source_path: string }>
      sourcePathCache = new Set(rows.map((row) => path.resolve(row.source_path).toLowerCase()))
    }
    return sourcePathCache.has(path.resolve(resolved).toLowerCase())
  },
}
