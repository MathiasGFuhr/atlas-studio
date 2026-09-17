import type { MusicAnalysis } from './musicAnalysis'
import type {
  SceneMarker,
  ShortsDurationMode,
  ShortsLocalCandidate,
  ShortsProfile,
  TranscriptCue,
} from './shorts'
import {
  overlapRatio,
  selectDiverseClips,
  shortsCandidatePoolSize,
  SHORTS_POOL_OVERLAP_LIMIT,
  withCandidateIds,
} from './shortsDiversity'
import { durationBounds } from './shortsDuration'

/** Snap à fala só corrige o corte por poucos segundos — nunca engole o vídeo inteiro. */
export const SHORTS_SNAP_MAX_SECONDS = 2.5

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

function pushCandidate(
  list: Array<Omit<ShortsLocalCandidate, 'id'>>,
  candidate: Omit<ShortsLocalCandidate, 'id'>,
) {
  if (candidate.end - candidate.start < 0.8) return
  list.push(candidate)
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
  const poolSize = shortsCandidatePoolSize(input.count)
  const target = Math.min(bounds.target, duration)
  const raw: Array<Omit<ShortsLocalCandidate, 'id'>> = []

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
      pushCandidate(raw, {
        start: snappedStart,
        end,
        score: Math.round(clamp(40 + energy * 180, 40, 92)),
        reason: 'Pico de energia / mudança de dinâmica',
        source: 'energy',
      })
    }
    for (const onset of onsets.slice(0, 40)) {
      const window = makeWindow(duration, onset, target, 'start')
      pushCandidate(raw, {
        start: window.start,
        end: window.end,
        score: 78,
        reason: 'Entrada forte detectada no áudio',
        source: 'onset',
      })
    }
  } else {
    const speech = invertSilence(duration, input.analysis?.silence ?? [])
    const cueStarts = (input.cues ?? []).filter((cue) => cue.text.trim()).map((cue) => cue.start)
    const bases = speech.length > 0 ? speech : [{ start: 0, end: duration }]
    const slide = Math.max(bounds.min * 0.85, target * 0.65)
    for (const region of bases) {
      for (let t = region.start; t + bounds.min * 0.85 <= region.end; t += slide) {
        const start = snapToPoints(t, cueStarts, 0.4)
        const window = makeWindow(duration, start, target, 'start')
        const end = Math.min(duration, Math.max(window.end, start + bounds.min), region.end || duration)
        const safeEnd = end - start < bounds.min * 0.85 ? Math.min(duration, start + target) : end
        pushCandidate(raw, {
          start: roundTime(start),
          end: roundTime(safeEnd),
          score: 70,
          reason: 'Trecho falado contínuo, com começo e fim naturais',
          source: 'speech',
        })
        if (region.end - region.start <= target * 1.15) break
      }
    }
  }

  if (input.analysis && input.analysis.energy.length > 0 && input.profile === 'history') {
    const step = Math.max(1.4, target * 0.4)
    for (let t = 0; t + bounds.min <= duration; t += step) {
      const window = makeWindow(duration, t, target, 'start')
      const energy = windowEnergy(input.analysis, window.start, window.end)
      pushCandidate(raw, {
        start: window.start,
        end: window.end,
        score: Math.round(clamp(46 + energy * 140, 46, 84)),
        reason: 'Trecho com energia de fala/áudio mais alta',
        source: 'energy',
      })
    }
  }

  for (const scene of input.scenes ?? []) {
    const window = makeWindow(duration, scene.time, target, 'start')
    pushCandidate(raw, {
      start: window.start,
      end: window.end,
      score: input.profile === 'history' ? 74 : 66,
      reason: input.profile === 'history' ? 'Mudança de cena / virada visual' : 'Corte de cena próximo de um climax',
      source: 'scene',
    })
  }

  const structureStep = Math.max(target * 0.7, (duration - target) / Math.max(poolSize - 1, 1))
  for (let t = 0; t + bounds.min <= duration; t += structureStep) {
    const window = makeWindow(duration, t, target, 'start')
    const energy = input.analysis ? windowEnergy(input.analysis, window.start, window.end) : 0.2
    pushCandidate(raw, {
      start: window.start,
      end: window.end,
      score: Math.round(clamp(44 + energy * 90, 44, 76)),
      reason:
        input.profile === 'music'
          ? 'Outra região da faixa com dinâmica aproveitável'
          : 'Outra região contínua do vídeo',
      source: 'structure',
    })
  }

  if (raw.length === 0) {
    const window = makeWindow(duration, 0, target, 'start')
    pushCandidate(raw, {
      start: window.start,
      end: window.end,
      score: 55,
      reason: 'Trecho inicial contínuo',
      source: 'speech',
    })
  }

  const normalized = withCandidateIds(
    raw.map((candidate) => {
      let start = roundTime(clamp(candidate.start, 0, duration))
      let end = roundTime(clamp(candidate.end, start + 1, duration))
      if (input.durationMode === 'exact') {
        end = roundTime(Math.min(duration, start + target))
        if (end - start < target) start = roundTime(Math.max(0, end - target))
      } else if (end - start > bounds.max) {
        end = roundTime(Math.min(duration, start + bounds.max))
      }
      return { ...candidate, start, end }
    }),
  ).filter((candidate) => candidate.end - candidate.start >= bounds.min * 0.85)

  const picked = selectDiverseClips({
    candidates: normalized.map((item) => ({ ...item, hook: '' })),
    count: poolSize,
    videoDuration: duration,
    overlapLimit: SHORTS_POOL_OVERLAP_LIMIT,
  })

  return picked.selected.map(({ hook: _hook, source, ...item }) => ({
    ...item,
    source: source && source !== 'ai' ? source : 'speech',
  }))
}

export function snapClipToCues(
  start: number,
  end: number,
  cues: TranscriptCue[],
  duration: number,
  _profile: ShortsProfile,
): { start: number; end: number } {
  const safeStart = roundTime(clamp(start, 0, duration))
  const safeEnd = roundTime(clamp(end, safeStart + 0.5, duration))
  const usable = cues.filter((cue) => {
    const text = cue.text.trim()
    const length = cue.end - cue.start
    return text.length > 0 && length > 0.2 && length <= 90
  })
  if (usable.length === 0) {
    return { start: safeStart, end: safeEnd }
  }

  const startCue =
    usable.find((cue) => cue.start <= safeStart && cue.end >= safeStart) ??
    usable.find((cue) => Math.abs(cue.start - safeStart) < 0.45)
  const endCue = [...usable].reverse().find((cue) => cue.start <= safeEnd && cue.end >= safeEnd)

  let nextStart = safeStart
  let nextEnd = safeEnd
  if (startCue && Math.abs(startCue.start - safeStart) <= SHORTS_SNAP_MAX_SECONDS) {
    nextStart = startCue.start
  }
  if (endCue && Math.abs(endCue.end - safeEnd) <= SHORTS_SNAP_MAX_SECONDS) {
    nextEnd = endCue.end
  }
  if (nextEnd - nextStart > safeEnd - safeStart + SHORTS_SNAP_MAX_SECONDS * 2) {
    nextStart = safeStart
    nextEnd = safeEnd
  }
  if (overlapRatio({ start: nextStart, end: nextEnd }, { start: safeStart, end: safeEnd }) < 0.2) {
    nextStart = safeStart
    nextEnd = safeEnd
  }

  return {
    start: roundTime(clamp(nextStart, 0, duration)),
    end: roundTime(clamp(nextEnd, nextStart + 0.5, duration)),
  }
}
