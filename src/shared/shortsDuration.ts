import { formatShortsTimecode, type ShortsDurationMode } from './shorts'

export const SHORTS_DURATION_SHORTCUTS = [15, 30, 45, 60] as const
export const SHORTS_MIN_CLIP_SECONDS = 1
/** Tolerância aproximada: ±15% ou ±3s, o que for maior. */
export const SHORTS_APPROX_RATIO = 0.15
export const SHORTS_APPROX_MIN_SLACK = 3
/** Folga de encode/frame no modo exato. */
export const SHORTS_EXACT_TOLERANCE = 0.12

export type DurationCapResult = {
  requested: number
  capped: boolean
  videoDuration: number
  message: string | null
}

export type DurationBounds = {
  target: number
  min: number
  max: number
}

export function parseDurationInput(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(',', '.')
  if (!text) return null

  const mixed = text.match(
    /^(\d+)\s*(?:m(?:in(?:uto)?s?)?)\s*(?:e\s*)?(\d+(?:\.\d+)?)?\s*(?:s(?:eg(?:undos?)?)?)?$/,
  )
  if (mixed) {
    const minutes = Number(mixed[1])
    const seconds = mixed[2] ? Number(mixed[2]) : 0
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return roundTime(minutes * 60 + seconds)
  }

  if (/^\d+(?:\.\d+)?s(?:eg(?:undos?)?)?$/.test(text)) {
    const value = Number(text.replace(/[^\d.]/g, ''))
    return Number.isFinite(value) ? roundTime(value) : null
  }

  const clock = text.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (clock) {
    const minutes = Number(clock[1])
    const seconds = Number(clock[2])
    const fraction = clock[3] ? Number(`0.${clock[3]}`) : 0
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null
    return roundTime(minutes * 60 + seconds + fraction)
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const value = Number(text)
    return Number.isFinite(value) ? roundTime(value) : null
  }

  return null
}

export function formatDurationInput(seconds: number): string {
  return formatShortsTimecode(Math.max(0, seconds))
}

export function formatClipLength(seconds: number): string {
  const safe = Math.max(0, seconds)
  const m = Math.floor(safe / 60)
  const rest = safe - m * 60
  const whole = Math.floor(rest)
  const tenth = Math.round((rest - whole) * 10)
  const carry = tenth === 10
  const s = carry ? whole + 1 : whole
  const t = carry ? 0 : tenth
  const minutes = s >= 60 ? m + 1 : m
  const secs = s >= 60 ? 0 : s
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${t}`
}

export function requestedDurationFromLegacyPreset(preset: string | null | undefined): number {
  if (preset === '15-30') return 30
  if (preset === '20-45') return 30
  if (preset === '30-60') return 45
  const numeric = Number(preset)
  if (Number.isFinite(numeric) && numeric > 0) return roundTime(numeric)
  return 30
}

export function isDurationShortcut(seconds: number): boolean {
  return SHORTS_DURATION_SHORTCUTS.some((item) => Math.abs(item - seconds) < 0.05)
}

export function clampRequestedDuration(requested: number, videoDuration?: number | null): DurationCapResult {
  const video = Number.isFinite(videoDuration) ? Math.max(0, videoDuration as number) : Number.POSITIVE_INFINITY
  const safeRequest = Math.max(SHORTS_MIN_CLIP_SECONDS, requested)
  if (!Number.isFinite(video) || video <= 0) {
    return { requested: roundTime(safeRequest), capped: false, videoDuration: 0, message: null }
  }
  if (safeRequest > video + 0.04) {
    return {
      requested: roundTime(Math.max(SHORTS_MIN_CLIP_SECONDS, video)),
      capped: true,
      videoDuration: roundTime(video),
      message: videoDurationMessage(video),
    }
  }
  return {
    requested: roundTime(Math.min(safeRequest, video)),
    capped: false,
    videoDuration: roundTime(video),
    message: null,
  }
}

export function videoDurationMessage(videoDuration: number): string {
  const rounded = Math.round(videoDuration)
  if (Math.abs(videoDuration - rounded) < 0.05) {
    return `O vídeo possui apenas ${rounded} ${rounded === 1 ? 'segundo' : 'segundos'}.`
  }
  return `O vídeo possui apenas ${formatDurationInput(videoDuration)}.`
}

export function capRequestedDuration(requested: number, videoDuration?: number | null): DurationCapResult {
  return clampRequestedDuration(requested, videoDuration)
}

export function durationBounds(
  requested: number,
  videoDuration: number,
  mode: ShortsDurationMode,
): DurationBounds {
  const cap = capRequestedDuration(requested, videoDuration)
  const target = cap.requested
  if (mode === 'exact') {
    return { target, min: target, max: Math.min(videoDuration, target) }
  }
  const slack = Math.max(SHORTS_APPROX_MIN_SLACK, target * SHORTS_APPROX_RATIO)
  const min = Math.max(SHORTS_MIN_CLIP_SECONDS, roundTime(target - slack))
  const max = roundTime(Math.min(videoDuration, target + slack))
  return { target, min: Math.min(min, max), max: Math.max(min, max) }
}

export function constrainClipWindow(input: {
  start: number
  end?: number
  videoDuration: number
  requestedDuration: number
  mode: ShortsDurationMode
  moved?: 'start' | 'end' | 'both'
}): { start: number; end: number } {
  const video = Math.max(0, input.videoDuration)
  const bounds = durationBounds(input.requestedDuration, video, input.mode)
  const target = bounds.target
  let start = Number.isFinite(input.start) ? input.start : 0
  let end = Number.isFinite(input.end) ? (input.end as number) : start + target

  if (input.mode === 'exact') {
    if (input.moved === 'end') {
      end = clamp(end, SHORTS_MIN_CLIP_SECONDS, video)
      start = end - target
      if (start < 0) {
        start = 0
        end = Math.min(video, target)
      }
    } else {
      start = clamp(start, 0, Math.max(0, video - Math.min(target, video)))
      end = start + Math.min(target, video)
      if (end > video) {
        end = video
        start = Math.max(0, end - target)
      }
    }
    return { start: roundTime(start), end: roundTime(Math.max(start + SHORTS_MIN_CLIP_SECONDS, end)) }
  }

  start = clamp(start, 0, video)
  end = clamp(end, 0, video)
  if (end <= start) end = Math.min(video, start + target)
  const length = end - start
  if (length < bounds.min) {
    end = Math.min(video, start + bounds.min)
    if (end - start < bounds.min) start = Math.max(0, end - bounds.min)
  }
  if (end - start > bounds.max) {
    if (input.moved === 'start') end = Math.min(video, start + bounds.max)
    else start = Math.max(0, end - bounds.max)
  }
  if (start + (end - start) > video) {
    end = video
    start = Math.max(0, end - Math.min(bounds.max, target))
  }
  return { start: roundTime(start), end: roundTime(Math.max(start + SHORTS_MIN_CLIP_SECONDS, end)) }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundTime(value: number) {
  return Math.round(value * 100) / 100
}
