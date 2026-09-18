import type { ShortsDurationMode, ShortsProfile, TranscriptCue } from './shorts'
import {
  formatInsufficientShortsNote,
  selectDiverseClips,
  shortsCandidatePoolSize,
  type ShortsDiscardedWindow,
  type ShortsRankedWindow,
} from './shortsDiversity'
import {
  autoMinClipDuration,
  constrainClipWindow,
  durationBounds,
  evaluateShortsFeasibility,
  formatShortsOverlapResultNote,
  shortsOverlapRequired,
  type DurationBoundLevel,
} from './shortsDuration'
import { snapClipToCues } from './shortsMoments'

export type ShortsSelectionDiagnostics = {
  generated: Array<{ id: string; start: number; end: number; score: number }>
  selected: string[]
  discarded: ShortsDiscardedWindow[]
  slidingWindows: number
  overlapPass?: number
  durationAdapted: boolean
}

export type FinalizeShortsSelectionInput = {
  ranked: ShortsRankedWindow[]
  fallback: ShortsRankedWindow[]
  clipCount: number
  videoDuration: number
  requestedDuration: number
  durationMode: ShortsDurationMode
  profile: ShortsProfile
  cues?: TranscriptCue[]
}

export type FinalizeShortsSelectionResult = {
  clips: ShortsRankedWindow[]
  requested: number
  insufficient: boolean
  note: string
  diagnostics: ShortsSelectionDiagnostics
}

function roundTime(value: number) {
  return Math.round(value * 100) / 100
}

function mergeRanked(ranked: ShortsRankedWindow[], fallback: ShortsRankedWindow[]): ShortsRankedWindow[] {
  const byId = new Map<string, ShortsRankedWindow>()
  for (const item of fallback) byId.set(item.id, item)
  for (const item of ranked) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => b.score - a.score || a.start - b.start)
}

function appendWindows(target: ShortsRankedWindow[], extra: ShortsRankedWindow[]) {
  const keys = new Set(target.map((item) => `${item.start.toFixed(2)}-${item.end.toFixed(2)}`))
  for (const item of extra) {
    const key = `${item.start.toFixed(2)}-${item.end.toFixed(2)}`
    if (keys.has(key)) continue
    keys.add(key)
    target.push(item)
  }
}

function spreadStarts(videoDuration: number, clipDuration: number, count: number): number[] {
  const size = Math.min(clipDuration, videoDuration)
  const spare = Math.max(0, videoDuration - size)
  if (count <= 1 || spare <= 0.05) return [0]
  return Array.from({ length: count }, (_, index) => roundTime((spare * index) / (count - 1)))
}

export function buildSlidingWindowCandidates(input: {
  videoDuration: number
  clipDuration: number
  requestedCount: number
  reason?: string
  score?: number
  idPrefix?: string
}): ShortsRankedWindow[] {
  const video = Math.max(0, input.videoDuration)
  const duration = Math.min(Math.max(0.8, input.clipDuration), video)
  if (video < 0.8 || duration < 0.8) return []
  const spare = Math.max(0, video - duration)
  const poolSize = shortsCandidatePoolSize(input.requestedCount)
  const step = spare > 0 ? Math.min(2, Math.max(0.4, spare / Math.max(1, poolSize - 1))) : video
  const starts = new Set<number>()
  for (let time = 0; time <= spare + 0.001; time += step) {
    starts.add(roundTime(Math.min(time, spare)))
  }
  starts.add(0)
  starts.add(roundTime(spare))
  for (const start of spreadStarts(video, duration, input.requestedCount)) starts.add(start)

  const prefix = input.idPrefix ?? 'slide'
  const baseScore = input.score ?? 58
  const reason = input.reason ?? 'Janela deslizante para cumprir a quantidade pedida'
  const sorted = [...starts].sort((a, b) => a - b)
  return sorted.map((start, index) => {
    const end = roundTime(Math.min(video, start + duration))
    const spreadBonus = spreadStarts(video, duration, input.requestedCount).some(
      (anchor) => Math.abs(anchor - start) < 0.08,
    )
      ? 8
      : 0
    return {
      id: `${prefix}-${index + 1}`,
      start,
      end,
      score: Math.min(72, baseScore + spreadBonus),
      reason,
      hook: '',
      source: 'structure' as const,
    }
  })
}

function refineWindow(
  clip: ShortsRankedWindow,
  input: FinalizeShortsSelectionInput,
  level: DurationBoundLevel = 'standard',
): ShortsRankedWindow | null {
  const cues = (input.cues ?? []).filter((cue) => cue.text.trim())
  const snapped = snapClipToCues(clip.start, clip.end, cues, input.videoDuration, input.profile)
  const window = constrainClipWindow({
    start: snapped.start,
    end: input.durationMode === 'exact' ? snapped.start + input.requestedDuration : snapped.end,
    videoDuration: input.videoDuration,
    requestedDuration: input.requestedDuration,
    mode: input.durationMode,
    moved: 'start',
    level,
  })
  if (window.end - window.start < 0.8) return null
  if (window.end > input.videoDuration + 0.04) return null
  return { ...clip, start: window.start, end: window.end }
}

function refineAll(
  items: ShortsRankedWindow[],
  input: FinalizeShortsSelectionInput,
  level: DurationBoundLevel,
  discarded: ShortsDiscardedWindow[],
): ShortsRankedWindow[] {
  const refined: ShortsRankedWindow[] = []
  for (const item of items) {
    const next = refineWindow(item, input, level)
    if (!next) {
      discarded.push({ id: item.id, reason: 'janela inválida após clamp' })
      continue
    }
    refined.push(next)
  }
  return refined
}

function selectionNote(input: {
  clips: ShortsRankedWindow[]
  requested: number
  videoDuration: number
  requestedDuration: number
  durationMode: ShortsDurationMode
  possibleCount: number
}): string {
  if (input.clips.length >= input.requested) {
    if (
      shortsOverlapRequired(input.videoDuration, input.requested, input.requestedDuration)
    ) {
      return formatShortsOverlapResultNote({
        requestedCount: input.requested,
        requestedDuration: input.requestedDuration,
        durationMode: input.durationMode,
      })
    }
    return ''
  }
  if (input.possibleCount < input.requested) {
    return formatInsufficientShortsNote(input.clips.length, input.requested)
  }
  return formatInsufficientShortsNote(input.clips.length, input.requested)
}

/** Garante selected.length === requestedCount quando o vídeo permite janelas distintas. */
export function validateAndFill(input: FinalizeShortsSelectionInput): FinalizeShortsSelectionResult {
  const feasibility = evaluateShortsFeasibility({
    videoDuration: input.videoDuration,
    requestedCount: input.clipCount,
    requestedDuration: input.requestedDuration,
    durationMode: input.durationMode,
  })
  const discarded: ShortsDiscardedWindow[] = []
  const generated = mergeRanked(input.ranked, input.fallback)
  const bounds = durationBounds(input.requestedDuration, input.videoDuration, input.durationMode)
  const sliding = buildSlidingWindowCandidates({
    videoDuration: input.videoDuration,
    clipDuration: bounds.target,
    requestedCount: input.clipCount,
  })
  const merged = [...generated]
  appendWindows(merged, sliding)

  let refined = refineAll(merged, input, 'standard', discarded)
  let durationAdapted = false

  let diversity = selectDiverseClips({
    candidates: refined,
    count: input.clipCount,
    videoDuration: input.videoDuration,
    requestedDuration: input.requestedDuration,
    role: 'final',
  })

  if (
    diversity.selected.length < input.clipCount &&
    input.durationMode === 'approximate' &&
    feasibility.possibleCount >= input.clipCount
  ) {
    const fillBounds = durationBounds(input.requestedDuration, input.videoDuration, 'approximate', 'fill')
    const fillMin = autoMinClipDuration(input.requestedDuration, input.videoDuration)
    if (fillBounds.min + 0.05 < bounds.min) {
      durationAdapted = true
      const mid = roundTime((bounds.target + fillMin) / 2)
      const extra = [
        ...buildSlidingWindowCandidates({
          videoDuration: input.videoDuration,
          clipDuration: mid,
          requestedCount: input.clipCount,
          idPrefix: 'fill-mid',
          score: 56,
          reason: 'Janela encurtada para cumprir a quantidade pedida',
        }),
        ...buildSlidingWindowCandidates({
          videoDuration: input.videoDuration,
          clipDuration: fillMin,
          requestedCount: input.clipCount,
          idPrefix: 'fill-min',
          score: 54,
          reason: 'Janela no piso automático para cumprir a quantidade pedida',
        }),
      ]
      appendWindows(refined, refineAll(extra, input, 'fill', discarded))
      diversity = selectDiverseClips({
        candidates: refined,
        count: input.clipCount,
        videoDuration: input.videoDuration,
        requestedDuration: input.requestedDuration,
        role: 'final',
      })
    }
  }

  const clips = diversity.selected.map((clip, index) => ({
    ...clip,
    id: clip.id || `c${index + 1}`,
  }))

  return {
    clips,
    requested: input.clipCount,
    insufficient: clips.length < input.clipCount,
    note: selectionNote({
      clips,
      requested: input.clipCount,
      videoDuration: input.videoDuration,
      requestedDuration: input.requestedDuration,
      durationMode: input.durationMode,
      possibleCount: feasibility.possibleCount,
    }),
    diagnostics: {
      generated: generated.map((item) => ({
        id: item.id,
        start: item.start,
        end: item.end,
        score: item.score,
      })),
      selected: clips.map((item) => item.id),
      discarded: [...discarded, ...diversity.discarded],
      slidingWindows: sliding.length,
      overlapPass: diversity.pass,
      durationAdapted,
    },
  }
}

export function finalizeShortsSelection(input: FinalizeShortsSelectionInput): FinalizeShortsSelectionResult {
  return validateAndFill(input)
}
