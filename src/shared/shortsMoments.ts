import type { MusicAnalysis } from './musicAnalysis'
import type {
  SceneMarker,
  ShortsDurationMode,
  ShortsLocalCandidate,
  ShortsProfile,
  TranscriptCue,
} from './shorts'
import { durationBounds } from './shortsDuration'

function roundTime(value: number) {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function invertSilence(
  duration: number,
  silence: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const gap of silence) {
    if (gap.start - cursor >= 0.35) regions.push({ start: cursor, end: gap.start })
    cursor = Math.max(cursor, gap.end)
  }
  if (duration - cursor >= 0.35) regions.push({ start: cursor, end: duration })
  return regions
}

function snapToPoints(time: number, points: number[], window = 0.18) {
  let best = time
  let bestDist = window
  for (const point of points) {
    const dist = Math.abs(point - time)
    if (dist < bestDist) {
      best = point
      bestDist = dist
    }
  }
  return roundTime(best)
}

function windowEnergy(analysis: MusicAnalysis, start: number, end: number): number {
  const from = Math.max(0, Math.floor(start / analysis.frameDuration))
  const to = Math.min(analysis.energy.length, Math.ceil(end / analysis.frameDuration))
  if (to <= from) return 0
  let sum = 0
  for (let i = from; i < to; i += 1) sum += analysis.energy[i] ?? 0
  return sum / Math.max(1, to - from)
}

function makeWindow(
  duration: number,
  center: number,
  length: number,
  prefer: 'start' | 'center',
): { start: number; end: number } {
  const size = clamp(length, 1, duration)
  if (prefer === 'start') {
    const start = clamp(center, 0, Math.max(0, duration - size))
    return { start: roundTime(start), end: roundTime(Math.min(duration, start + size)) }
  }
  const start = clamp(center - size * 0.28, 0, Math.max(0, duration - size))
  return { start: roundTime(start), end: roundTime(Math.min(duration, start + size)) }
}

function overlapRatio(a: { start: number; end: number }, b: { start: number; end: number }) {
  const from = Math.max(a.start, b.start)
  const to = Math.min(a.end, b.end)
  const overlap = Math.max(0, to - from)
  const shorter = Math.min(a.end - a.start, b.end - b.start)
  return shorter <= 0 ? 0 : overlap / shorter
}

export function buildLocalShortsCandidates(input: {
  profile: ShortsProfile
  duration: number
  requestedDuration: number
  durationMode: ShortsDurationMode
  count: number
  analysis?: MusicAnalysis | null
  scenes?: SceneMarker[]
  cues?: TranscriptCue[]
}): ShortsLocalCandidate[] {
  const bounds = durationBounds(input.requestedDuration, input.duration, input.durationMode)
  const duration = Math.max(0.5, input.duration)
  const maxCount = Math.max(1, input.count)
  const target = Math.min(bounds.target, duration)
  const candidates: ShortsLocalCandidate[] = []

  if (input.profile === 'music' && input.analysis) {
    const onsets = input.analysis.onsets
    const step = Math.max(1.2, target * 0.35)
    for (let t = 0; t + bounds.min <= duration; t += step) {
      const window = makeWindow(duration, t, target, 'start')
      const snappedStart = snapToPoints(window.start, onsets, 0.22)
      let snappedEnd =
        input.durationMode === 'exact'
          ? snappedStart + target
          : snapToPoints(window.end, onsets, 0.22)
      if (input.durationMode === 'approximate' && snappedEnd <= snappedStart + bounds.min * 0.7) {
        snappedEnd = window.end
      }
      const end = roundTime(Math.min(duration, Math.max(snappedStart + bounds.min, snappedEnd)))
      const energy = windowEnergy(input.analysis, snappedStart, end)
      candidates.push({
        start: snappedStart,
        end,
        score: Math.round(clamp(40 + energy * 180, 40, 92)),
        reason: 'Pico de energia / mudança de dinâmica',
        source: 'energy',
      })
    }
    for (const onset of onsets.slice(0, 40)) {
      const window = makeWindow(duration, onset, target, 'start')
      candidates.push({
        start: window.start,
        end: window.end,
        score: 78,
        reason: 'Entrada forte detectada no áudio',
        source: 'onset',
      })
    }
  } else {
    const speech = invertSilence(duration, input.analysis?.silence ?? [])
    const cueStarts = (input.cues ?? []).map((cue) => cue.start)
    const bases = speech.length > 0 ? speech : [{ start: 0, end: duration }]
    for (const region of bases) {
      const start = snapToPoints(region.start, cueStarts, 0.4)
      const window = makeWindow(duration, start, target, 'start')
      const end = Math.min(duration, Math.max(window.end, start + bounds.min))
      candidates.push({
        start: roundTime(start),
        end: roundTime(end),
        score: 70,
        reason: 'Trecho falado contínuo, com começo e fim naturais',
        source: 'speech',
      })
    }
  }

  for (const scene of input.scenes ?? []) {
    const window = makeWindow(duration, scene.time, target, 'start')
    candidates.push({
      start: window.start,
      end: window.end,
      score: input.profile === 'history' ? 74 : 66,
      reason: input.profile === 'history' ? 'Mudança de cena / virada visual' : 'Corte de cena próximo de um climax',
      source: 'scene',
    })
  }

  if (candidates.length === 0) {
    const window = makeWindow(duration, 0, target, 'start')
    candidates.push({
      start: window.start,
      end: window.end,
      score: 55,
      reason: 'Trecho inicial contínuo',
      source: 'speech',
    })
  }

  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.start - b.start)
  const picked: ShortsLocalCandidate[] = []
  for (const candidate of sorted) {
    const length = candidate.end - candidate.start
    if (length < bounds.min * 0.85) continue
    if (picked.some((item) => overlapRatio(item, candidate) > 0.55)) continue
    let start = roundTime(clamp(candidate.start, 0, duration))
    let end = roundTime(clamp(candidate.end, start + 1, duration))
    if (input.durationMode === 'exact') {
      end = roundTime(Math.min(duration, start + target))
      if (end - start < target) start = roundTime(Math.max(0, end - target))
    }
    picked.push({ ...candidate, start, end })
    if (picked.length >= maxCount) break
  }

  return picked.slice(0, maxCount)
}

export function snapClipToCues(
  start: number,
  end: number,
  cues: TranscriptCue[],
  duration: number,
  profile: ShortsProfile,
): { start: number; end: number } {
  if (cues.length === 0) {
    return {
      start: roundTime(clamp(start, 0, duration)),
      end: roundTime(clamp(end, start + 0.5, duration)),
    }
  }
  const startCue = cues.find((cue) => cue.start <= start && cue.end >= start) ?? cues.find((cue) => Math.abs(cue.start - start) < 0.45)
  const endCue = [...cues].reverse().find((cue) => cue.start <= end && cue.end >= end)
  let nextStart = startCue ? startCue.start : start
  let nextEnd = endCue ? endCue.end : end
  if (profile === 'music') {
    nextStart = startCue?.start ?? nextStart
    nextEnd = endCue?.end ?? nextEnd
  }
  return {
    start: roundTime(clamp(nextStart, 0, duration)),
    end: roundTime(clamp(nextEnd, nextStart + 0.5, duration)),
  }
}
