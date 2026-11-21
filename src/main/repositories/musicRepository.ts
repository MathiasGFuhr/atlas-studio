import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import { getUserDataPath } from '../paths'
import type { MusicCaption, MusicTrack } from '../../shared/musicAnalysis'
import { parseMusicCutsJson, serializeMusicCutsJson } from '../../shared/audio/persist'
import { runFfmpeg } from '../services/audio/ffmpeg'
import { buildFfmpegExportArgs, type AudioExportFormat, type Mp3Bitrate } from '../../shared/audio/audioExport'

type TrackRow = {
  id: string
  project_id: string | null
  channel_id?: string | null
  resolved_channel_id?: string | null
  channel_name?: string | null
  name: string
  original_path: string
  preview_path: string
  duration: number
  cut_mode: string
  cuts_json: string
  captions_json?: string | null
  captions_language?: string | null
  created_at: string
  updated_at: string
}

function ensureMusicColumns() {
  const database = getDb()
  const columns = database.prepare('PRAGMA table_info(music_tracks)').all() as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))
  if (!names.has('captions_json')) {
    database.exec(`ALTER TABLE music_tracks ADD COLUMN captions_json TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!names.has('captions_language')) {
    database.exec('ALTER TABLE music_tracks ADD COLUMN captions_language TEXT')
  }
  if (!names.has('channel_id')) {
    database.exec('ALTER TABLE music_tracks ADD COLUMN channel_id TEXT')
  }
}

function hasTable(name: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(name) as { ok?: number } | undefined
  return Boolean(row?.ok)
}

function buildTrackSelectSql(): string {
  const hasProjects = hasTable('projects')
  const hasChannels = hasTable('channels')
  const hasEditor = hasTable('editor_projects')
  if (!hasProjects || !hasChannels) {
    return 'SELECT m.*, m.channel_id AS resolved_channel_id, NULL AS channel_name FROM music_tracks m'
  }
  const editorChannelExpr = hasEditor
    ? `(SELECT NULLIF(TRIM(ep.channel_id), '')
        FROM editor_projects ep
        WHERE ep.music_track_id = m.id
          AND ep.channel_id IS NOT NULL
          AND TRIM(ep.channel_id) != ''
        ORDER BY ep.updated_at DESC
        LIMIT 1)`
    : 'NULL'
  const resolvedExpr = `COALESCE(NULLIF(TRIM(m.channel_id), ''), NULLIF(TRIM(p.channel_id), ''), ${editorChannelExpr})`
  return `
    SELECT m.*,
      c.id AS resolved_channel_id,
      c.name AS channel_name
    FROM music_tracks m
    LEFT JOIN projects p ON p.id = m.project_id
    LEFT JOIN channels c ON c.id = ${resolvedExpr}
  `
}

function parseCaptions(value: string | null | undefined): MusicCaption[] {
  try {
    const parsed = JSON.parse(value || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const start = Number(record.start)
      const end = Number(record.end)
      const text = String(record.text ?? '').replace(/\s+/g, ' ').trim()
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return []
      return [{ start, end, text }]
    })
  } catch {
    return []
  }
}

function parseCuts(value: string) {
  return parseMusicCutsJson(value)
}

function mapTrack(row: TrackRow): MusicTrack {
  const parsed = parseCuts(row.cuts_json ?? '[]')
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    channelId: row.resolved_channel_id?.trim() || null,
    channelName: row.channel_name?.trim() || null,
    name: row.name,
    originalPath: row.original_path,
    previewPath: row.preview_path,
    duration: Number(row.duration) || 0,
    cutMode: row.cut_mode === 'manual' ? 'manual' : 'automatico',
    cuts: parsed.cuts,
    captions: parseCaptions(row.captions_json),
    captionsLanguage: row.captions_language?.trim() || null,
    selectedId: parsed.selectedId,
    appliedPreset: parsed.appliedPreset,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function trackDir(id: string) {
  return path.join(getUserDataPath(), 'music', id)
}

export const musicRepository = {
  list(filters?: { projectId?: string; channelId?: string }): MusicTrack[] {
    ensureMusicColumns()
    const baseSelect = buildTrackSelectSql()
    if (filters?.projectId) {
      return (
        getDb()
          .prepare(`${baseSelect} WHERE m.project_id = ? ORDER BY m.created_at DESC`)
          .all(filters.projectId) as TrackRow[]
      ).map(mapTrack)
    }
    const items = (
      getDb()
        .prepare(`${baseSelect} ORDER BY m.created_at DESC`)
        .all() as TrackRow[]
    ).map(mapTrack)
    if (filters?.channelId) {
      return items.filter((item) => item.channelId === filters.channelId)
    }
    return items
  },

  get(id: string): MusicTrack | null {
    ensureMusicColumns()
    const baseSelect = buildTrackSelectSql()
    const row = getDb().prepare(`${baseSelect} WHERE m.id = ?`).get(id) as TrackRow | undefined
    return row ? mapTrack(row) : null
  },

  async importFromFile(
    sourcePath: string,
    projectId?: string | null,
    channelId?: string | null,
  ): Promise<MusicTrack> {
    ensureMusicColumns()
    const resolved = path.resolve(sourcePath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error('Arquivo de áudio não encontrado.')
    }

    const id = randomUUID()
    const ext = path.extname(resolved) || '.mp3'
    const name = path.basename(resolved, ext)
    const destDir = trackDir(id)
    fs.mkdirSync(destDir, { recursive: true })
    const originalPath = path.join(destDir, `original${ext}`)
    const previewPath = path.join(destDir, 'preview.wav')
    fs.copyFileSync(resolved, originalPath)

    await runFfmpeg(['-y', '-i', originalPath, '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', previewPath])

    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO music_tracks
          (id, project_id, channel_id, name, original_path, preview_path, duration, cut_mode, cuts_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId || null,
        channelId?.trim() || null,
        name,
        originalPath,
        previewPath,
        0,
        'automatico',
        '[]',
        timestamp,
        timestamp,
      )

    return this.get(id)!
  },

  update(
    id: string,
    patch: Partial<
      Pick<MusicTrack, 'name' | 'duration' | 'cutMode' | 'cuts' | 'selectedId' | 'appliedPreset' | 'channelId'>
    >,
  ): MusicTrack | null {
    ensureMusicColumns()
    const current = this.get(id)
    if (!current) return null
    const nextChannelId =
      patch.channelId !== undefined ? patch.channelId?.trim() || null : current.channelId ?? null
    const next = {
      ...current,
      ...patch,
      channelId: nextChannelId,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `UPDATE music_tracks SET name = ?, channel_id = ?, duration = ?, cut_mode = ?, cuts_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        next.name,
        nextChannelId,
        next.duration,
        next.cutMode,
        serializeMusicCutsJson({
          cuts: next.cuts ?? [],
          selectedId: next.selectedId ?? null,
          appliedPreset: next.appliedPreset ?? null,
        }),
        next.updatedAt,
        id,
      )
    if (patch.channelId !== undefined && hasTable('editor_projects')) {
      getDb()
        .prepare('UPDATE editor_projects SET channel_id = ? WHERE music_track_id = ?')
        .run(nextChannelId, id)
    }
    return this.get(id)
  },

  saveCaptions(id: string, captions: MusicCaption[], language: string | null): MusicTrack | null {
    const current = this.get(id)
    if (!current) return null
    ensureMusicColumns()
    getDb()
      .prepare(
        `UPDATE music_tracks SET captions_json = ?, captions_language = ?, updated_at = ? WHERE id = ?`,
      )
      .run(JSON.stringify(captions), language, new Date().toISOString(), id)
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM music_tracks WHERE id = ?').run(id)
    const dir = trackDir(id)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    return true
  },

  async exportSegment(
    id: string,
    start: number,
    end: number,
    targetPath: string,
    format: AudioExportFormat = 'mp3',
    bitrate: Mp3Bitrate = 320,
  ): Promise<string> {
    const track = this.get(id)
    if (!track) throw new Error('Música não encontrada')
    await runFfmpeg(
      buildFfmpegExportArgs({
        sourcePath: track.originalPath,
        targetPath,
        start,
        end,
        format,
        bitrate,
      }),
    )
    return targetPath
  },
}
