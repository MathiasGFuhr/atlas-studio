import type { ProjectType } from './types'

export type ShortsProfile = ProjectType
export type ShortsClipCount = 3 | 5 | 10
export type ShortsDurationMode = 'approximate' | 'exact'
export type ShortsDurationShortcut = 15 | 30 | 45 | 60
export type ShortsAspectMode = 'original' | 'center_9_16' | 'auto_focus_9_16'
export type ShortsJobStatus = 'draft' | 'analyzing' | 'ready' | 'error'
export type ShortsFocusStrategy = 'center'
export type ShortsTranscriptSource = 'whisper' | 'silence' | 'none'
export type ShortsCopyFields = 'title' | 'description' | 'all'
export type ShortsProgressStage =
  | 'analyzing'
  | 'extracting_audio'
  | 'transcribing'
  | 'detecting_moments'
  | 'preparing_cuts'
  | 'writing_copy'
  | 'exporting'

export const SHORTS_CLIP_COUNTS: ShortsClipCount[] = [3, 5, 10]

export const SHORTS_ASPECT_MODES: Array<{ id: ShortsAspectMode; label: string; hint: string }> = [
  { id: 'original', label: 'Original', hint: 'Mantém a proporção do arquivo. Sem crop.' },
  { id: 'center_9_16', label: '9:16 centro', hint: 'Crop central seguro + scale 1080×1920.' },
  { id: 'auto_focus_9_16', label: '9:16 foco automático', hint: 'Na V1 usa o mesmo crop central. Tracking vem depois.' },
]

export const SHORTS_OUTPUT_WIDTH = 1080
export const SHORTS_OUTPUT_HEIGHT = 1920

export const SHORTS_VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpeg', 'mpg', 'wmv']

export const SHORTS_PROGRESS_LABEL: Record<ShortsProgressStage, string> = {
  analyzing: 'Analisando vídeo...',
  extracting_audio: 'Extraindo áudio...',
  transcribing: 'Transcrevendo...',
  detecting_moments: 'Analisando melhores momentos...',
  preparing_cuts: 'Preparando cortes...',
  writing_copy: 'Gerando títulos e descrições...',
  exporting: 'Exportando...',
}

export interface VideoProbeInfo {
  name: string
  path: string
  duration: number
  width: number
  height: number
  fps: number
  aspectRatio: string
  format: string
  hasAudio: boolean
}

export interface TranscriptCue {
  start: number
  end: number
  text: string
}

export interface SceneMarker {
  time: number
}

export interface ShortsLocalCandidate {
  start: number
  end: number
  score: number
  reason: string
  source: 'energy' | 'scene' | 'speech' | 'onset'
}

export interface ShortsClip {
  id: string
  index: number
  start: number
  end: number
  score: number
  reason: string
  hook: string
  title: string
  description: string
  hashtags: string[]
  accepted: boolean
  exportedPath: string | null
  focusStrategy: ShortsFocusStrategy
}

export type ShortsClipPatch = Partial<
  Pick<ShortsClip, 'start' | 'end' | 'title' | 'description' | 'hashtags'>
>

export interface ShortsCopyRequest {
  jobId: string
  clipId: string
  fields: ShortsCopyFields
}

/** Snapshot editorial para calendário/publicação futura — não publica nesta V1. */
export interface ShortsEditorialRecord {
  sourceVideo: string
  sourceName: string
  start: number
  end: number
  duration: number
  score: number
  reason: string
  hook: string
  title: string
  description: string
  hashtags: string[]
  format: ShortsAspectMode
  crop: {
    cropWidth: number
    cropHeight: number
    cropX: number
    cropY: number
    focusStrategy: ShortsFocusStrategy
  } | null
  exportPath: string | null
}

export interface ShortsEditorialContext {
  language: string
  channelName?: string
  artistName?: string
  songTitle?: string
  sourceName: string
}

export interface ShortsJob {
  id: string
  projectId: string | null
  sourcePath: string
  sourceName: string
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
  createdAt: string
  updatedAt: string
}

export interface ShortsProgressEvent {
  jobId: string
  stage: ShortsProgressStage
  message: string
}

export interface ShortsAnalyzeInput {
  jobId: string
  profile: ShortsProfile
  clipCount: ShortsClipCount
  requestedDuration: number
  durationMode: ShortsDurationMode
  aspectMode: ShortsAspectMode
  captionsEnabled: boolean
}

export interface ShortsExportInput {
  jobId: string
  clipId: string
  aspectMode?: ShortsAspectMode
  captionsEnabled?: boolean
}

export function isShortsClipCount(value: unknown): value is ShortsClipCount {
  return value === 3 || value === 5 || value === 10
}

export function isShortsDurationMode(value: unknown): value is ShortsDurationMode {
  return value === 'approximate' || value === 'exact'
}

export function isShortsAspectMode(value: unknown): value is ShortsAspectMode {
  return value === 'original' || value === 'center_9_16' || value === 'auto_focus_9_16'
}

export function isShortsProfile(value: unknown): value is ShortsProfile {
  return value === 'history' || value === 'music'
}

export function formatAspectRatio(width: number, height: number): string {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const g = gcd(w, h)
  return `${w / g}:${h / g}`
}

export function formatShortsTimecode(seconds: number): string {
  const safe = Math.max(0, seconds)
  const m = Math.floor(safe / 60)
  const s = Math.floor(safe % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatShortsDuration(seconds: number): string {
  return `${Math.max(1, Math.round(seconds))}s`
}

export function clipDuration(clip: Pick<ShortsClip, 'start' | 'end'>): number {
  return Math.max(0, clip.end - clip.start)
}

export function normalizeHashtags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,;]+/)
      : []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of raw) {
    const tag = String(item ?? '')
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '')
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= 5) break
  }
  return tags
}

export function formatHashtags(tags: string[]): string {
  return normalizeHashtags(tags)
    .map((tag) => `#${tag}`)
    .join(' ')
}

export function formatShortsCopy(clip: Pick<ShortsClip, 'title' | 'description' | 'hashtags'>, part: 'title' | 'description' | 'all'): string {
  const tags = formatHashtags(clip.hashtags)
  if (part === 'title') return clip.title.trim()
  if (part === 'description') return [clip.description.trim(), tags].filter(Boolean).join('\n\n')
  return [clip.title.trim(), clip.description.trim(), tags].filter(Boolean).join('\n\n')
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

export function normalizeShortsClip(value: unknown, fallbackIndex = 1): ShortsClip | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const start = Number(record.start)
  const end = Number(record.end)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const index = Number(record.index)
  const score = Number(record.score)
  return {
    id: asText(record.id),
    index: Number.isFinite(index) && index > 0 ? Math.round(index) : fallbackIndex,
    start,
    end,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    reason: asText(record.reason),
    hook: asText(record.hook),
    title: asText(record.title),
    description: asText(record.description),
    hashtags: normalizeHashtags(record.hashtags),
    accepted: Boolean(record.accepted),
    exportedPath: record.exportedPath ? asText(record.exportedPath) : null,
    focusStrategy: 'center',
  }
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}
