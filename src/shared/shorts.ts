import type { ProjectType } from './types'
import type { ContentLanguageSource } from './shortsLanguage'
import type { ShortsFramingSample, ShortsFramingSettings } from './shortsFraming'

export type ShortsProfile = ProjectType
export type ShortsClipCount = 3 | 5 | 10
export type ShortsDurationMode = 'approximate' | 'exact'
export type ShortsDurationShortcut = 15 | 30 | 45 | 60
export type ShortsAspectMode =
  | 'original'
  | 'center_9_16'
  | 'auto_focus_9_16'
  | 'auto'
  | 'lead_singer'
  | 'active_subject'
  | 'wide_stage'
  | 'two_subjects'
  | 'split_screen'
export type ShortsJobStatus = 'draft' | 'analyzing' | 'ready' | 'error'
export type ShortsFocusStrategy = 'center' | 'lead' | 'active' | 'pair' | 'split'
export type ShortsTranscriptSource = 'whisper' | 'silence' | 'none'
export type ShortsCopyFields = 'title' | 'description' | 'all'
export type ShortsProgressStage =
  | 'preparing_video'
  | 'analyzing_visual'
  | 'analyzing_audio'
  | 'detecting_language'
  | 'understanding_structure'
  | 'selecting_moments'
  | 'validating_cuts'
  | 'writing_copy'
  | 'exporting'
  /** @deprecated etapas antigas ainda aceitas na leitura */
  | 'analyzing'
  | 'extracting_audio'
  | 'transcribing'
  | 'detecting_moments'
  | 'preparing_cuts'

export type ShortsAnalysisMode = 'audiovisual' | 'frames_audio_transcript'
export type ShortsModelDecision = 'current' | 'use_compatible' | 'continue_frames'

export const SHORTS_CLIP_COUNTS: ShortsClipCount[] = [3, 5, 10]

export const SHORTS_ASPECT_MODES: Array<{ id: ShortsAspectMode; label: string; hint: string }> = [
  { id: 'original', label: 'Original', hint: 'Mantém a proporção do arquivo. Sem crop.' },
  { id: 'wide_stage', label: '9:16', hint: 'Recorte vertical. O enquadramento inteligente define o foco.' },
]

export const SHORTS_OUTPUT_WIDTH = 1080
export const SHORTS_OUTPUT_HEIGHT = 1920

export const SHORTS_VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpeg', 'mpg', 'wmv']

export const SHORTS_PROGRESS_LABEL: Record<ShortsProgressStage, string> = {
  preparing_video: 'Preparando vídeo...',
  analyzing_visual: 'Analisando conteúdo visual...',
  analyzing_audio: 'Analisando áudio...',
  detecting_language: 'Detectando idioma...',
  understanding_structure: 'Compreendendo estrutura...',
  selecting_moments: 'Selecionando momentos...',
  validating_cuts: 'Validando cortes...',
  writing_copy: 'Criando títulos e descrições...',
  exporting: 'Exportando...',
  analyzing: 'Preparando vídeo...',
  extracting_audio: 'Analisando áudio...',
  transcribing: 'Analisando áudio...',
  detecting_moments: 'Selecionando momentos...',
  preparing_cuts: 'Validando cortes...',
}

export const SHORTS_ANALYSIS_MODE_LABEL: Record<ShortsAnalysisMode, string> = {
  audiovisual: 'Audiovisual por IA',
  frames_audio_transcript: 'Frames + áudio + transcrição',
}

export function isShortsAnalysisMode(value: unknown): value is ShortsAnalysisMode {
  return value === 'audiovisual' || value === 'frames_audio_transcript'
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
  fileSize?: number | null
  mtimeMs?: number | null
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
  id: string
  start: number
  end: number
  score: number
  reason: string
  source: 'energy' | 'scene' | 'speech' | 'onset' | 'structure'
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
  /** URL atlas-media do frame deste corte, gerada na apresentação. */
  posterUrl?: string | null
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
  contentLanguage: string
  languageName: string
  languageSource: ContentLanguageSource
  languageConfidence: number
  channelName?: string
  artistName?: string
  songTitle?: string
  sourceName: string
}

export interface ShortsJob {
  id: string
  projectId: string | null
  /** Nome exibido do projeto. Por padrão, o arquivo sem extensão. */
  name: string
  sourcePath: string
  sourceName: string
  profile: ShortsProfile
  clipCount: ShortsClipCount
  requestedDuration: number
  durationMode: ShortsDurationMode
  aspectMode: ShortsAspectMode
  framingTrack: ShortsFramingSample[]
  framingSettings: ShortsFramingSettings
  captionsEnabled: boolean
  probe: VideoProbeInfo | null
  clips: ShortsClip[]
  transcript: TranscriptCue[]
  transcriptSource: ShortsTranscriptSource
  /** ISO do conteúdo (de, en, pt-BR). Independente do idioma da UI. */
  contentLanguage: string
  languageSource: ContentLanguageSource
  languageConfidence: number
  /** Escolha manual. Se preenchido, não redetectar automaticamente. */
  languageOverride: string | null
  /** Idioma auto-detectado, ignorando o override. */
  detectedLanguage: string | null
  /** Idioma devolvido pelo Whisper, se houver. */
  transcriptLanguage: string | null
  /** Como a IA analisou de verdade. Nunca marcar audiovisual sem enviar o vídeo. */
  analysisMode: ShortsAnalysisMode | null
  analysisNotes: string | null
  errorMessage: string | null
  status: ShortsJobStatus
  createdAt: string
  updatedAt: string
  /** Calculado na leitura: o arquivo original ainda existe neste path. */
  sourceExists: boolean
  /** URL atlas-media da thumbnail em cache, se já gerada. */
  thumbnailUrl: string | null
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
  allowExternalVideoAnalysis?: boolean
  modelDecision?: ShortsModelDecision
  modelOverride?: string | null
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
  return (
    value === 'original' ||
    value === 'center_9_16' ||
    value === 'auto_focus_9_16' ||
    value === 'auto' ||
    value === 'lead_singer' ||
    value === 'active_subject' ||
    value === 'wide_stage' ||
    value === 'two_subjects' ||
    value === 'split_screen'
  )
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

export function shortsClipPreviewKey(clip: Pick<ShortsClip, 'id' | 'start' | 'end'>): string {
  return `${clip.id}:${clip.start}:${clip.end}`
}

/** Tempo do frame de capa: dentro do próprio corte, não no início do vídeo. */
export function clipPosterSeekSeconds(clip: Pick<ShortsClip, 'start' | 'end'>): number {
  const duration = Math.max(0, clip.end - clip.start)
  if (duration <= 0) return Math.max(0, clip.start)
  return clip.start + Math.min(1.5, Math.max(0.15, duration * 0.18))
}

/**
 * URL única por corte. Sem isso o Chromium compartilha o decoder e todos
 * os cards mostram o mesmo frame do vídeo original.
 */
export function shortsClipPreviewSrc(
  mediaUrl: string | null,
  clip: Pick<ShortsClip, 'id' | 'start' | 'end'>,
): string | null {
  if (!mediaUrl) return null
  try {
    const url = new URL(mediaUrl)
    url.searchParams.set('clip', clip.id || 'clip')
    url.searchParams.set('from', clip.start.toFixed(3))
    url.searchParams.set('to', clip.end.toFixed(3))
    url.hash = `t=${clip.start.toFixed(3)},${clip.end.toFixed(3)}`
    return url.toString()
  } catch {
    return mediaUrl
  }
}

export function shortsExportWindow(clip: Pick<ShortsClip, 'id' | 'start' | 'end'>): {
  clipId: string
  start: number
  end: number
  duration: number
} {
  return {
    clipId: clip.id,
    start: clip.start,
    end: clip.end,
    duration: clipDuration(clip),
  }
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
    focusStrategy: isShortsFocusStrategy(record.focusStrategy) ? record.focusStrategy : 'center',
  }
}

function isShortsFocusStrategy(value: unknown): value is ShortsFocusStrategy {
  return value === 'center' || value === 'lead' || value === 'active' || value === 'pair' || value === 'split'
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
