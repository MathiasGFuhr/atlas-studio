import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import { getUserDataPath } from '../paths'
import type { MusicTrack } from '../../shared/musicAnalysis'
import { parseMusicCutsJson, serializeMusicCutsJson } from '../../shared/audio/persist'
import { runFfmpeg } from '../services/audio/ffmpeg'
import { buildFfmpegExportArgs, type AudioExportFormat, type Mp3Bitrate } from '../../shared/audio/audioExport'

type TrackRow = {
  id: string
  project_id: string | null
  name: string
  original_path: string
  preview_path: string
  duration: number
  cut_mode: string
  cuts_json: string
  created_at: string
  updated_at: string
}

function parseCuts(value: string) {
  return parseMusicCutsJson(value)
}

function mapTrack(row: TrackRow): MusicTrack {
  const parsed = parseCuts(row.cuts_json ?? '[]')
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name,
    originalPath: row.original_path,
    previewPath: row.preview_path,
    duration: Number(row.duration) || 0,
    cutMode: row.cut_mode === 'manual' ? 'manual' : 'automatico',
    cuts: parsed.cuts,
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
  list(filters?: { projectId?: string }): MusicTrack[] {
    if (filters?.projectId) {
      return (
        getDb()
          .prepare('SELECT * FROM music_tracks WHERE project_id = ? ORDER BY created_at DESC')
          .all(filters.projectId) as TrackRow[]
      ).map(mapTrack)
    }
    return (
      getDb()
        .prepare('SELECT * FROM music_tracks ORDER BY created_at DESC')
        .all() as TrackRow[]
    ).map(mapTrack)
  },

  get(id: string): MusicTrack | null {
    const row = getDb().prepare('SELECT * FROM music_tracks WHERE id = ?').get(id) as TrackRow | undefined
    return row ? mapTrack(row) : null
  },

  async importFromFile(sourcePath: string, projectId?: string | null): Promise<MusicTrack> {
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
          (id, project_id, name, original_path, preview_path, duration, cut_mode, cuts_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId || null,
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
    patch: Partial<Pick<MusicTrack, 'name' | 'duration' | 'cutMode' | 'cuts' | 'selectedId' | 'appliedPreset'>>,
  ): MusicTrack | null {
    const current = this.get(id)
    if (!current) return null
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `UPDATE music_tracks SET name = ?, duration = ?, cut_mode = ?, cuts_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        next.name,
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
