import type { ProjectType } from './types'

export type ShortsProfile = ProjectType
export type ShortsClipCount = 3 | 5 | 10
export type ShortsDurationMode = 'approximate' | 'exact'
export type ShortsDurationShortcut = 15 | 30 | 45 | 60
export type ShortsAspectMode = 'original' | 'center_9_16' | 'auto_focus_9_16'
export type ShortsJobStatus = 'draft' | 'analyzing' | 'ready' | 'error'
export type ShortsFocusStrategy = 'center'
export type ShortsTranscriptSource = 'whisper' | 'silence' | 'none'
export type ShortsProgressStage =
  | 'analyzing'
  | 'extracting_audio'
  | 'transcribing'
  | 'detecting_moments'
  | 'preparing_cuts'
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
  accepted: boolean
  exportedPath: string | null
  focusStrategy: ShortsFocusStrategy
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
