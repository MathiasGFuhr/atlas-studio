import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type {
  ShortsAspectMode,
  ShortsClip,
  ShortsClipCount,
  ShortsDurationMode,
  ShortsJob,
  ShortsJobStatus,
  ShortsProfile,
  ShortsTranscriptSource,
  TranscriptCue,
  VideoProbeInfo,
} from '../../shared/shorts'
import { isShortsAspectMode, isShortsClipCount, isShortsDurationMode, isShortsProfile } from '../../shared/shorts'
import { requestedDurationFromLegacyPreset } from '../../shared/shortsDuration'

type JobRow = {
  id: string
  project_id: string | null
  source_path: string
  source_name: string
  profile: string
  clip_count: number
  duration_preset: string
  requested_duration: number | null
  duration_mode: string | null
  aspect_mode: string
  captions_enabled: number
  probe_json: string | null
  clips_json: string
  transcript_json: string
  transcript_source: string | null
  analysis_notes: string | null
  error_message: string | null
  status: string
  created_at: string
  updated_at: string
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapJob(row: JobRow): ShortsJob {
  const clipCount = isShortsClipCount(row.clip_count) ? row.clip_count : 5
  const requested =
    Number(row.requested_duration) > 0
      ? Number(row.requested_duration)
      : requestedDurationFromLegacyPreset(row.duration_preset)
  return {
    id: row.id,
    projectId: row.project_id,
    sourcePath: row.source_path,
    sourceName: row.source_name,
    profile: isShortsProfile(row.profile) ? row.profile : 'history',
    clipCount,
    requestedDuration: requested,
    durationMode: isShortsDurationMode(row.duration_mode) ? row.duration_mode : 'approximate',
    aspectMode: isShortsAspectMode(row.aspect_mode) ? row.aspect_mode : 'center_9_16',
    captionsEnabled: Boolean(row.captions_enabled),
    probe: parseJson<VideoProbeInfo | null>(row.probe_json, null),
    clips: parseJson<ShortsClip[]>(row.clips_json, []),
    transcript: parseJson<TranscriptCue[]>(row.transcript_json, []),
    transcriptSource: (row.transcript_source as ShortsTranscriptSource) || 'none',
    analysisNotes: row.analysis_notes,
    errorMessage: row.error_message,
    status: (row.status as ShortsJobStatus) || 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const shortsRepository = {
  list(filters?: { projectId?: string | null }): ShortsJob[] {
    if (filters?.projectId) {
      return (
        getDb()
          .prepare('SELECT * FROM shorts_jobs WHERE project_id = ? ORDER BY updated_at DESC')
          .all(filters.projectId) as JobRow[]
      ).map(mapJob)
    }
    return (getDb().prepare('SELECT * FROM shorts_jobs ORDER BY updated_at DESC').all() as JobRow[]).map(mapJob)
  },

  get(id: string): ShortsJob | null {
    const row = getDb().prepare('SELECT * FROM shorts_jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? mapJob(row) : null
  },

  create(input: {
    sourcePath: string
    sourceName: string
    projectId?: string | null
    profile?: ShortsProfile
    probe?: VideoProbeInfo | null
  }): ShortsJob {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO shorts_jobs (
          id, project_id, source_path, source_name, profile, clip_count, duration_preset,
          requested_duration, duration_mode, aspect_mode, captions_enabled, probe_json, clips_json,
          transcript_json, transcript_source, analysis_notes, error_message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId || null,
        input.sourcePath,
        input.sourceName,
        input.profile || 'history',
        5,
        '30',
        30,
        'approximate',
        'center_9_16',
        1,
        input.probe ? JSON.stringify(input.probe) : null,
        '[]',
        '[]',
        'none',
        null,
        null,
        'draft',
        timestamp,
        timestamp,
      )
    return this.get(id)!
  },

  update(
    id: string,
    patch: Partial<{
      projectId: string | null
      profile: ShortsProfile
      clipCount: ShortsClipCount
      requestedDuration: number
      durationMode: ShortsDurationMode
      aspectMode: ShortsAspectMode
      captionsEnabled: boolean
      probe: VideoProbeInfo | null
      clips: ShortsClip[]
      transcript: TranscriptCue[]
      transcriptSource: ShortsTranscriptSource
      analysisNotes: string | null
      errorMessage: string | null
      status: ShortsJobStatus
    }>,
  ): ShortsJob | null {
    const current = this.get(id)
    if (!current) return null
    const next: ShortsJob = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `UPDATE shorts_jobs SET
          project_id = ?, profile = ?, clip_count = ?, duration_preset = ?, requested_duration = ?,
          duration_mode = ?, aspect_mode = ?, captions_enabled = ?, probe_json = ?, clips_json = ?,
          transcript_json = ?, transcript_source = ?, analysis_notes = ?, error_message = ?, status = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.projectId,
        next.profile,
        next.clipCount,
        String(next.requestedDuration),
        next.requestedDuration,
        next.durationMode,
        next.aspectMode,
        next.captionsEnabled ? 1 : 0,
        next.probe ? JSON.stringify(next.probe) : null,
        JSON.stringify(next.clips),
        JSON.stringify(next.transcript),
        next.transcriptSource,
        next.analysisNotes,
        next.errorMessage,
        next.status,
        next.updatedAt,
        id,
      )
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM shorts_jobs WHERE id = ?').run(id)
    return true
  },
}
