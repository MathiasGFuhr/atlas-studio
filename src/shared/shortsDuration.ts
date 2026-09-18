import { formatShortsTimecode, type ShortsDurationMode } from './shorts'

export const SHORTS_DURATION_SHORTCUTS = [15, 30, 45, 60] as const
export const SHORTS_MIN_CLIP_SECONDS = 1
/** Tolerância aproximada: ±15% ou ±3s, o que for maior. */
export const SHORTS_APPROX_RATIO = 0.15
export const SHORTS_APPROX_MIN_SLACK = 3
/** Folga de encode/frame no modo exato. */
export const SHORTS_EXACT_TOLERANCE = 0.12
/** Piso para encurtar automaticamente no modo aproximado ao cumprir quantidade. */
export const SHORTS_AUTO_MIN_SECONDS = 15
export const SHORTS_AUTO_MIN_RATIO = 0.6
/** Distância mínima de start para duas janelas contarem como temporalmente distintas. */
export const SHORTS_MIN_START_DELTA = 0.4

export type DurationBoundLevel = 'standard' | 'fill'

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
  level: DurationBoundLevel
}

export type ShortsFeasibility = {
  videoDuration: number
  requestedCount: number
  requestedDuration: number
  durationMode: ShortsDurationMode
  cappedDuration: number
  durationCapped: boolean
  durationMessage: string | null
  possibleCount: number
  overlapRequired: boolean
  overlapHint: string | null
  countHint: string | null
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

/** Piso para adaptação automática: max(15s, requested × 0.6), sem ultrapassar o vídeo. */
export function autoMinClipDuration(requestedDuration: number, videoDuration?: number | null): number {
  const requested = Math.max(SHORTS_MIN_CLIP_SECONDS, requestedDuration)
  const floor = Math.max(SHORTS_AUTO_MIN_SECONDS, roundTime(requested * SHORTS_AUTO_MIN_RATIO))
  if (Number.isFinite(videoDuration) && (videoDuration as number) > 0) {
    return roundTime(Math.min(floor, videoDuration as number))
  }
  return floor
}

export function durationBounds(
  requested: number,
  videoDuration: number,
  mode: ShortsDurationMode,
  level: DurationBoundLevel = 'standard',
): DurationBounds {
  const cap = capRequestedDuration(requested, videoDuration)
  const target = cap.requested
  if (mode === 'exact') {
    return { target, min: target, max: Math.min(videoDuration, target), level: 'standard' }
  }
  const slack = Math.max(SHORTS_APPROX_MIN_SLACK, target * SHORTS_APPROX_RATIO)
  const standardMin = Math.max(SHORTS_MIN_CLIP_SECONDS, roundTime(target - slack))
  const max = roundTime(Math.min(videoDuration, target + slack))
  const fillFloor = autoMinClipDuration(target, videoDuration)
  const min = level === 'fill' ? Math.min(standardMin, fillFloor) : standardMin
  return { target, min: Math.min(min, max), max: Math.max(min, max), level }
}

export function maxDistinctWindowCount(videoDuration: number, clipDuration: number): number {
  return maxEditorialDistinctCount(videoDuration, clipDuration)
}

/** Quantos recortes com núcleos realmente diferentes cabem nesta duração. */
export function maxEditorialDistinctCount(videoDuration: number, clipDuration: number): number {
  const video = Math.max(0, videoDuration)
  const length = Math.min(Math.max(0, clipDuration), video)
  if (video < 0.8 || length < 0.8) return 0
  const core = length * 0.6
  if (core >= video * 0.82) return 1
  const minCenterDelta = length * 0.42
  const first = length / 2
  const last = video - length / 2
  if (last - first < minCenterDelta - 0.05) return 1
  return Math.floor((last - first) / minCenterDelta) + 1
}

export function shortsOverlapRequired(
  videoDuration: number,
  requestedCount: number,
  clipDuration: number,
): boolean {
  if (requestedCount <= 1) return false
  return requestedCount * clipDuration > videoDuration + 0.05
}

export function formatShortsOverlapPreview(input: {
  requestedCount: number
  requestedDuration: number
  videoDuration: number
  durationMode: ShortsDurationMode
}): string {
  const approx = input.durationMode === 'approximate' ? '~' : ''
  const duration = Math.max(1, Math.round(input.requestedDuration))
  const video = Math.max(1, Math.round(input.videoDuration))
  return `${input.requestedCount} Shorts de ${approx}${duration}s em um vídeo de ${video}s terão sobreposição entre os trechos.`
}

export function formatShortsOverlapResultNote(input: {
  requestedCount: number
  requestedDuration: number
  durationMode: ShortsDurationMode
}): string {
  const approx = input.durationMode === 'approximate' ? '~' : ''
  const duration = Math.max(1, Math.round(input.requestedDuration))
  return `Como o vídeo é curto para ${input.requestedCount} cortes de ${approx}${duration}s, alguns trechos compartilham partes da apresentação.`
}

export function evaluateShortsFeasibility(input: {
  videoDuration: number
  requestedCount: number
  requestedDuration: number
  durationMode: ShortsDurationMode
}): ShortsFeasibility {
  const cap = capRequestedDuration(input.requestedDuration, input.videoDuration)
  const video = Math.max(0, input.videoDuration)
  const possibleCount = maxEditorialDistinctCount(video, cap.requested)
  const overlapRequired = shortsOverlapRequired(video, input.requestedCount, cap.requested)
  const countHint =
    possibleCount < input.requestedCount && possibleCount > 0
      ? possibleCount === 1
        ? 'Este vídeo permite 1 Short realmente distinto nesta duração. Para gerar mais, reduza a duração desejada ou aceite maior repetição.'
        : `Este vídeo permite ${possibleCount} Shorts realmente distintos nesta duração. Para gerar mais, reduza a duração desejada ou aceite maior repetição.`
      : possibleCount <= 0
        ? videoDurationMessage(video)
        : null
  const overlapHint =
    possibleCount >= input.requestedCount && overlapRequired
      ? formatShortsOverlapPreview({
          requestedCount: input.requestedCount,
          requestedDuration: cap.requested,
          videoDuration: video,
          durationMode: input.durationMode,
        })
      : null
  return {
    videoDuration: roundTime(video),
    requestedCount: input.requestedCount,
    requestedDuration: cap.requested,
    durationMode: input.durationMode,
    cappedDuration: cap.requested,
    durationCapped: cap.capped,
    durationMessage: cap.message,
    possibleCount,
    overlapRequired,
    overlapHint,
    countHint,
  }
}

export function constrainClipWindow(input: {
  start: number
  end?: number
  videoDuration: number
  requestedDuration: number
  mode: ShortsDurationMode
  moved?: 'start' | 'end' | 'both'
  level?: DurationBoundLevel
}): { start: number; end: number } {
  const video = Math.max(0, input.videoDuration)
  const bounds = durationBounds(input.requestedDuration, video, input.mode, input.level)
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
  if (end - start < bounds.min) {
    end = Math.min(video, start + bounds.min)
    if (end - start < bounds.min) start = Math.max(0, end - bounds.min)
  }
  if (end - start > bounds.max) {
    if (input.moved === 'end') start = Math.max(0, end - bounds.max)
    else end = Math.min(video, start + bounds.max)
  }
  if (end > video) {
    end = video
    if (end - start > bounds.max) start = Math.max(0, end - bounds.max)
    if (end - start < bounds.min) start = Math.max(0, end - bounds.min)
  }
  return { start: roundTime(start), end: roundTime(Math.max(start + SHORTS_MIN_CLIP_SECONDS, end)) }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundTime(value: number) {
  return Math.round(value * 100) / 100
}
