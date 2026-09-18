import type { ShortsDurationMode, ShortsProfile, TranscriptCue } from './shorts'
import { constrainClipWindow } from './shortsDuration'
import {
  formatInsufficientShortsNote,
  selectDiverseClips,
  type ShortsDiscardedWindow,
  type ShortsRankedWindow,
} from './shortsDiversity'
import { snapClipToCues } from './shortsMoments'

export type ShortsSelectionDiagnostics = {
  generated: Array<{ id: string; start: number; end: number; score: number }>
  selected: string[]
  discarded: ShortsDiscardedWindow[]
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

function mergeRanked(ranked: ShortsRankedWindow[], fallback: ShortsRankedWindow[]): ShortsRankedWindow[] {
  const byId = new Map<string, ShortsRankedWindow>()
  for (const item of fallback) byId.set(item.id, item)
  for (const item of ranked) byId.set(item.id, item)
  return [...byId.values()].sort((a, b) => b.score - a.score || a.start - b.start)
}

function refineWindow(
  clip: ShortsRankedWindow,
  input: FinalizeShortsSelectionInput,
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
  })
  if (window.end - window.start < 0.8) return null
  return { ...clip, start: window.start, end: window.end }
}

export function finalizeShortsSelection(input: FinalizeShortsSelectionInput): FinalizeShortsSelectionResult {
  const generated = mergeRanked(input.ranked, input.fallback)
  const refined: ShortsRankedWindow[] = []
  const discarded: ShortsDiscardedWindow[] = []

  for (const item of generated) {
    const next = refineWindow(item, input)
    if (!next) {
      discarded.push({ id: item.id, reason: 'janela inválida após clamp' })
      continue
    }
    refined.push(next)
  }

  const diversity = selectDiverseClips({
    candidates: refined,
    count: input.clipCount,
    videoDuration: input.videoDuration,
    requestedDuration: input.requestedDuration,
    role: 'final',
  })

  const clips = diversity.selected.map((clip, index) => ({
    ...clip,
    id: clip.id || `c${index + 1}`,
  }))

  return {
    clips,
    requested: input.clipCount,
    insufficient: clips.length < input.clipCount,
    note: formatInsufficientShortsNote(clips.length, input.clipCount),
    diagnostics: {
      generated: generated.map((item) => ({
        id: item.id,
        start: item.start,
        end: item.end,
        score: item.score,
      })),
      selected: clips.map((item) => item.id),
      discarded: [...discarded, ...diversity.discarded],
    },
  }
}
