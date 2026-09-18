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
import { isShortsAnalysisMode, isShortsAspectMode, isShortsClipCount, isShortsDurationMode, isShortsProfile, normalizeShortsClip } from '../../shared/shorts'
import { DEFAULT_FRAMING_SETTINGS, normalizeFramingSettings, normalizeFramingTrack } from '../../shared/shortsFraming'
import type { ContentLanguageSource } from '../../shared/shortsLanguage'
import { defaultShortsLanguageFields } from '../../shared/shortsLanguage'
import { requestedDurationFromLegacyPreset } from '../../shared/shortsDuration'
import {
  matchesShortsProjectSearch,
  shortsProjectNameFromFileName,
  sortShortsProjects,
  type ShortsProjectListFilters,
} from '../../shared/shortsProject'

type JobRow = {
  id: string
  project_id: string | null
  name: string | null
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
  content_language: string | null
  language_source: string | null
  language_confidence: number | null
  language_override: string | null
  detected_language: string | null
  transcript_language: string | null
  analysis_mode: string | null
  analysis_notes: string | null
  framing_track_json: string | null
  framing_settings_json: string | null
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
  const sourceName = row.source_name
  return {
    id: row.id,
    projectId: row.project_id,
    name: String(row.name ?? '').trim() || shortsProjectNameFromFileName(sourceName),
    sourcePath: row.source_path,
    sourceName,
    profile: isShortsProfile(row.profile) ? row.profile : 'history',
    clipCount,
    requestedDuration: requested,
    durationMode: isShortsDurationMode(row.duration_mode) ? row.duration_mode : 'approximate',
    aspectMode: isShortsAspectMode(row.aspect_mode) ? row.aspect_mode : 'center_9_16',
    framingTrack: normalizeFramingTrack(parseJson(row.framing_track_json, [])),
    framingSettings: normalizeFramingSettings(parseJson(row.framing_settings_json, DEFAULT_FRAMING_SETTINGS)),
    captionsEnabled: Boolean(row.captions_enabled),
    probe: parseJson<VideoProbeInfo | null>(row.probe_json, null),
    clips: parseJson<unknown[]>(row.clips_json, [])
      .map((item, index) => normalizeShortsClip(item, index + 1))
      .filter((item): item is ShortsClip => Boolean(item)),
    transcript: parseJson<TranscriptCue[]>(row.transcript_json, []),
    transcriptSource: (row.transcript_source as ShortsTranscriptSource) || 'none',
    contentLanguage: String(row.content_language ?? '').trim(),
    languageSource: (row.language_source as ContentLanguageSource) || 'fallback',
    languageConfidence: Number.isFinite(Number(row.language_confidence)) ? Number(row.language_confidence) : 0,
    languageOverride: row.language_override ? String(row.language_override).trim() || null : null,
    detectedLanguage: row.detected_language ? String(row.detected_language).trim() || null : null,
    transcriptLanguage: row.transcript_language ? String(row.transcript_language).trim() || null : null,
    analysisMode: isShortsAnalysisMode(row.analysis_mode) ? row.analysis_mode : null,
    analysisNotes: row.analysis_notes,
    errorMessage: row.error_message,
    status: (row.status as ShortsJobStatus) || 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceExists: true,
    thumbnailUrl: null,
  }
}

export const shortsRepository = {
  list(filters?: ShortsProjectListFilters): ShortsJob[] {
    let jobs: ShortsJob[]
    if (filters?.projectId) {
      jobs = (
        getDb()
          .prepare('SELECT * FROM shorts_jobs WHERE project_id = ? ORDER BY updated_at DESC')
          .all(filters.projectId) as JobRow[]
      ).map(mapJob)
    } else {
      jobs = (getDb().prepare('SELECT * FROM shorts_jobs ORDER BY updated_at DESC').all() as JobRow[]).map(mapJob)
    }
    if (filters?.query) {
      jobs = jobs.filter((job) => matchesShortsProjectSearch(job, filters.query ?? ''))
    }
    return sortShortsProjects(jobs, filters?.sort ?? 'updated_desc')
  },

  get(id: string): ShortsJob | null {
    const row = getDb().prepare('SELECT * FROM shorts_jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? mapJob(row) : null
  },

  /** Persistência bruta. Novos projetos só via ShortsProjectService.createFromSourceVideo(). */
  create(input: {
    sourcePath: string
    sourceName: string
    name?: string
    projectId?: string | null
    profile?: ShortsProfile
    probe?: VideoProbeInfo | null
  }): ShortsJob {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const name = (input.name?.trim() || shortsProjectNameFromFileName(input.sourceName)).trim()
    const language = defaultShortsLanguageFields()
    getDb()
      .prepare(
        `INSERT INTO shorts_jobs (
          id, project_id, name, source_path, source_name, profile, clip_count, duration_preset,
          requested_duration, duration_mode, aspect_mode, captions_enabled, probe_json, clips_json,
          transcript_json, transcript_source, content_language, language_source, language_confidence,
          language_override, detected_language, transcript_language, analysis_mode, analysis_notes,
          framing_track_json, framing_settings_json, error_message,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId || null,
        name,
        input.sourcePath,
        input.sourceName,
        input.profile || 'history',
        5,
        '30',
        30,
        'approximate',
        'auto',
        1,
        input.probe ? JSON.stringify(input.probe) : null,
        '[]',
        '[]',
        'none',
        language.contentLanguage,
        language.languageSource,
        language.languageConfidence,
        language.languageOverride,
        language.detectedLanguage,
        language.transcriptLanguage,
        null,
        null,
        '[]',
        JSON.stringify(DEFAULT_FRAMING_SETTINGS),
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
      name: string
      sourcePath: string
      sourceName: string
      profile: ShortsProfile
      clipCount: ShortsClipCount
      requestedDuration: number
      durationMode: ShortsDurationMode
      aspectMode: ShortsAspectMode
      framingTrack: ShortsJob['framingTrack']
      framingSettings: ShortsJob['framingSettings']
      captionsEnabled: boolean
      probe: VideoProbeInfo | null
      clips: ShortsClip[]
      transcript: TranscriptCue[]
      transcriptSource: ShortsTranscriptSource
      contentLanguage: string
      languageSource: ContentLanguageSource
      languageConfidence: number
      languageOverride: string | null
      detectedLanguage: string | null
      transcriptLanguage: string | null
      analysisMode: ShortsJob['analysisMode']
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
      name: patch.name != null ? patch.name.trim() || current.name : current.name,
      updatedAt: new Date().toISOString(),
    }
    getDb()
      .prepare(
        `UPDATE shorts_jobs SET
          project_id = ?, name = ?, source_path = ?, source_name = ?, profile = ?, clip_count = ?,
          duration_preset = ?, requested_duration = ?, duration_mode = ?, aspect_mode = ?,
          captions_enabled = ?, probe_json = ?, clips_json = ?, transcript_json = ?,
          transcript_source = ?, content_language = ?, language_source = ?, language_confidence = ?,
          language_override = ?, detected_language = ?, transcript_language = ?, analysis_mode = ?,
          analysis_notes = ?, framing_track_json = ?, framing_settings_json = ?,
          error_message = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.projectId,
        next.name,
        next.sourcePath,
        next.sourceName,
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
        next.contentLanguage,
        next.languageSource,
        next.languageConfidence,
        next.languageOverride,
        next.detectedLanguage,
        next.transcriptLanguage,
        next.analysisMode,
        next.analysisNotes,
        JSON.stringify(next.framingTrack ?? []),
        JSON.stringify(normalizeFramingSettings(next.framingSettings)),
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
