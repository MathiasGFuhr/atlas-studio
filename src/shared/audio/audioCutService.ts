import type { MusicSegment, MusicSegmentSource } from '../musicAnalysis'
import { MIN_SEGMENT, clampTime, roundTime, timesNear } from './time'

export interface CutMarker {
  time: number
  leftId: string | null
  rightId: string | null
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6)}`
}

export function makeSegment(
  start: number,
  end: number,
  index: number,
  source: MusicSegmentSource,
  extra?: Partial<MusicSegment>,
): MusicSegment {
  return {
    id: extra?.id ?? `cut-${index}-${Math.round(start * 1000)}`,
    start: roundTime(Math.max(0, start)),
    end: roundTime(Math.max(start + MIN_SEGMENT, end)),
    label: extra?.label ?? `Corte ${index}`,
    source,
    reason: extra?.reason,
    confidence: extra?.confidence,
  }
}

export function sortCuts(cuts: MusicSegment[]): MusicSegment[] {
  return [...cuts].sort((a, b) => a.start - b.start || a.end - b.end)
}

export function clampSegment(
  start: number,
  end: number,
  duration: number,
  minLength = MIN_SEGMENT,
): { start: number; end: number } {
  const safeDuration = Math.max(minLength, duration)
  const nextStart = clampTime(start, 0, safeDuration - minLength)
  const nextEnd = clampTime(end, nextStart + minLength, safeDuration)
  return { start: roundTime(nextStart), end: roundTime(nextEnd) }
}

export function segmentDuration(cut: Pick<MusicSegment, 'start' | 'end'>): number {
  return Math.max(0, cut.end - cut.start)
}

export function findCutAtTime(cuts: MusicSegment[], time: number): MusicSegment | null {
  const hit = [...cuts].reverse().find((cut) => time >= cut.start && time <= cut.end)
  return hit ?? null
}

export function getCutMarkers(cuts: MusicSegment[], duration: number): CutMarker[] {
  const markers = new Map<string, CutMarker>()
  const key = (time: number) => roundTime(time).toFixed(3)

  for (const cut of cuts) {
    if (cut.start > MIN_SEGMENT && cut.start < duration - MIN_SEGMENT) {
      const existing = markers.get(key(cut.start)) ?? { time: roundTime(cut.start), leftId: null, rightId: null }
      existing.rightId = cut.id
      markers.set(key(cut.start), existing)
    }
    if (cut.end > MIN_SEGMENT && cut.end < duration - MIN_SEGMENT) {
      const existing = markers.get(key(cut.end)) ?? { time: roundTime(cut.end), leftId: null, rightId: null }
      existing.leftId = cut.id
      markers.set(key(cut.end), existing)
    }
  }

  return [...markers.values()].sort((a, b) => a.time - b.time)
}

const TIME_GAP = 0.04

export function isCoveringPartition(cuts: MusicSegment[], duration: number): boolean {
  if (cuts.length === 0 || duration <= 0) return false
  const sorted = sortCuts(cuts)
  if (sorted[0].start > TIME_GAP) return false
  if (Math.abs(sorted[sorted.length - 1].end - duration) > TIME_GAP) return false
  for (let i = 1; i < sorted.length; i += 1) {
    if (Math.abs(sorted[i].start - sorted[i - 1].end) > TIME_GAP) return false
  }
  return true
}

export function segmentsFromTimes(
  times: number[],
  duration: number,
  source: MusicSegmentSource,
  extras?: Array<Partial<MusicSegment> | undefined>,
): MusicSegment[] {
  const points = [0, ...times.filter((time) => time > MIN_SEGMENT && time < duration - MIN_SEGMENT), duration]
    .map((time) => roundTime(clampTime(time, 0, duration)))
    .sort((a, b) => a - b)
    .filter((time, index, all) => index === 0 || time - all[index - 1] >= MIN_SEGMENT)

  const segments: MusicSegment[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const extra = extras?.[i]
    segments.push(
      makeSegment(points[i], points[i + 1], i + 1, extra?.source ?? source, {
        ...extra,
        id: extra?.id,
        label: extra?.label ?? `Trecho ${i + 1}`,
      }),
    )
  }
  return segments
}

export function splitAtPlayhead(cuts: MusicSegment[], time: number, duration: number): MusicSegment[] {
  const split = roundTime(clampTime(time, MIN_SEGMENT, Math.max(MIN_SEGMENT, duration - MIN_SEGMENT)))
  if (duration < MIN_SEGMENT * 2) return cuts

  const containing = cuts.find((cut) => split > cut.start + MIN_SEGMENT / 2 && split < cut.end - MIN_SEGMENT / 2)
  if (containing) {
    const left = { ...containing, end: split, source: 'manual' as const, id: containing.id }
    const right: MusicSegment = {
      ...containing,
      id: nextId('cut-split'),
      start: split,
      label: nextLabel(cuts, containing.label),
      source: 'manual',
    }
    return sortCuts(cuts.flatMap((cut) => (cut.id === containing.id ? [left, right] : [cut])))
  }

  const points = collectSplitPoints(cuts, duration)
  if (!points.some((point) => timesNear(point, split, MIN_SEGMENT))) points.push(split)
  return segmentsFromTimes(points, duration, 'manual', labelExtrasFromCuts(cuts, duration))
}

function nextLabel(cuts: MusicSegment[], base: string): string {
  const used = new Set(cuts.map((cut) => cut.label))
  if (!used.has(`${base} B`)) return `${base} B`
  let index = cuts.length + 1
  while (used.has(`Corte ${index}`)) index += 1
  return `Corte ${index}`
}

function collectSplitPoints(cuts: MusicSegment[], duration: number): number[] {
  const points: number[] = []
  for (const cut of sortCuts(cuts)) {
    if (cut.start > MIN_SEGMENT) points.push(cut.start)
    if (cut.end < duration - MIN_SEGMENT) points.push(cut.end)
  }
  return points
}

function labelExtrasFromCuts(cuts: MusicSegment[], duration: number): Array<Partial<MusicSegment> | undefined> {
  const sorted = sortCuts(cuts)
  if (!isCoveringPartition(sorted, duration)) return []
  return sorted.map((cut) => ({ label: cut.label, reason: cut.reason, confidence: cut.confidence }))
}

export function addManualSelection(
  cuts: MusicSegment[],
  playhead: number,
  duration: number,
): { cuts: MusicSegment[]; selectedId: string } {
  const start = clampTime(playhead, 0, Math.max(0, duration - MIN_SEGMENT))
  const remaining = Math.max(MIN_SEGMENT, duration - start)
  const length = Math.min(remaining, remaining < 8 ? remaining : 4)
  const cut = makeSegment(start, start + length, cuts.length + 1, 'manual', {
    id: nextId('cut-manual'),
    label: `Corte ${cuts.length + 1}`,
  })
  return { cuts: [...cuts, cut], selectedId: cut.id }
}

export function removeCut(cuts: MusicSegment[], cutId: string): MusicSegment[] {
  return cuts.filter((cut) => cut.id !== cutId)
}

export function renameCut(cuts: MusicSegment[], cutId: string, label: string): MusicSegment[] {
  return cuts.map((cut) => (cut.id === cutId ? { ...cut, label } : cut))
}

export function updateCutBounds(
  cuts: MusicSegment[],
  cutId: string,
  start: number,
  end: number,
  duration: number,
): MusicSegment[] {
  return cuts.map((cut) => {
    if (cut.id !== cutId) return cut
    const next = clampSegment(start, end, duration)
    return { ...cut, ...next, source: 'manual' }
  })
}

export function moveMarker(
  cuts: MusicSegment[],
  marker: CutMarker,
  nextTime: number,
  duration: number,
): MusicSegment[] {
  const others = getCutMarkers(cuts, duration).filter((item) => !timesNear(item.time, marker.time))
  const leftCut = cuts.find((cut) => cut.id === marker.leftId)
  const rightCut = cuts.find((cut) => cut.id === marker.rightId)
  const min = leftCut ? leftCut.start + MIN_SEGMENT : MIN_SEGMENT
  const max = rightCut ? rightCut.end - MIN_SEGMENT : duration - MIN_SEGMENT
  let clamped = clampTime(nextTime, min, max)
  for (const other of others) {
    if (other.time < marker.time) clamped = Math.max(clamped, other.time + MIN_SEGMENT)
    if (other.time > marker.time) clamped = Math.min(clamped, other.time - MIN_SEGMENT)
  }
  const time = roundTime(clamped)
  return cuts.map((cut) => {
    if (cut.id === marker.leftId) {
      return { ...cut, end: Math.max(cut.start + MIN_SEGMENT, time), source: 'manual' }
    }
    if (cut.id === marker.rightId) {
      return { ...cut, start: Math.min(cut.end - MIN_SEGMENT, time), source: 'manual' }
    }
    return cut
  })
}

export function sanitizeExportName(label: string, fallback: string): string {
  const cleaned = label
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

export function numberedExportName(index: number, label: string, extension: string): string {
  const name = sanitizeExportName(label, `Corte ${index}`)
  const ext = extension.replace(/^\./, '')
  return `${String(index).padStart(2, '0')} - ${name}.${ext}`
}
