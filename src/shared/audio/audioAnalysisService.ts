import type { MusicAnalysis, MusicSilenceRegion } from '../musicAnalysis'
import { detectEdgeTrim, detectMusicEnd } from '../musicAnalysis'
import { enrichAudioAnalysis, type AudioFeatureAnalysis } from '../shorts/audioFeatures'
import { roundTime } from './time'

export interface EnergyChange {
  time: number
  delta: number
  kind: 'rise' | 'fall'
}

export interface SectionCandidate {
  time: number
  kind: string
  score: number
}

export interface CutCandidate {
  id: string
  time: number
  end?: number
  score: number
  kind: 'split' | 'window' | 'trim-start' | 'trim-end'
  reason: string
}

export interface MusicAnalysisSummary {
  duration: number
  silences: MusicSilenceRegion[]
  energyChanges: EnergyChange[]
  transients: number[]
  sectionCandidates: SectionCandidate[]
  peaks: Array<{ time: number; intensity: number }>
  rmsMean: number
  inputKind: 'analysis-summary'
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const avg = mean(values)
  const variance = values.reduce((acc, value) => acc + (value - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function detectEnergyChanges(analysis: MusicAnalysis, limit = 80): EnergyChange[] {
  const energy = analysis.energy
  const sigma = stddev(energy)
  const threshold = Math.max(0.004, sigma * 0.4)
  const changes: EnergyChange[] = []
  for (let i = 1; i < energy.length; i += 1) {
    const delta = (energy[i] ?? 0) - (energy[i - 1] ?? 0)
    if (Math.abs(delta) < threshold) continue
    const time = roundTime(i * analysis.frameDuration)
    const last = changes[changes.length - 1]
    if (last && time - last.time < 0.18) continue
    changes.push({
      time,
      delta: roundTime(delta, 4),
      kind: delta >= 0 ? 'rise' : 'fall',
    })
    if (changes.length >= limit) break
  }
  return changes
}

export function detectSectionBoundaries(
  analysis: MusicAnalysis,
  limit = 20,
): Array<{ time: number; score: number; reason: string; kind: 'rise' | 'fall' }> {
  const energy = analysis.energy
  const frame = analysis.frameDuration || 0.046
  const win = Math.max(6, Math.round(1.8 / frame))
  const step = Math.max(1, Math.round(0.32 / frame))
  const sigma = stddev(energy)
  const threshold = Math.max(0.014, sigma * 0.9)
  const out: Array<{ time: number; score: number; reason: string; kind: 'rise' | 'fall'; delta: number }> = []
  for (let i = win; i < energy.length - win; i += step) {
    const before = mean(energy.slice(i - win, i))
    const after = mean(energy.slice(i, i + win))
    const delta = after - before
    if (Math.abs(delta) < threshold) continue
    const time = roundTime(i * frame)
    const last = out[out.length - 1]
    if (last && time - last.time < 3.4) {
      if (Math.abs(delta) > Math.abs(last.delta)) {
        out[out.length - 1] = {
          time,
          delta,
          kind: delta >= 0 ? 'rise' : 'fall',
          score: Math.min(0.9, 0.66 + Math.min(0.22, Math.abs(delta) * 4)),
          reason: delta >= 0 ? 'Entrada de seção mais forte' : 'Queda de dinâmica da seção',
        }
      }
      continue
    }
    out.push({
      time,
      delta,
      kind: delta >= 0 ? 'rise' : 'fall',
      score: Math.min(0.9, 0.66 + Math.min(0.22, Math.abs(delta) * 4)),
      reason: delta >= 0 ? 'Entrada de seção mais forte' : 'Queda de dinâmica da seção',
    })
    if (out.length >= limit) break
  }
  return out.map(({ time, score, reason, kind }) => ({ time, score, reason, kind }))
}

export function detectSectionCandidates(enriched: AudioFeatureAnalysis): SectionCandidate[] {
  const candidates: SectionCandidate[] = []
  for (const segment of enriched.structure) {
    if (segment.start <= 0.05) continue
    candidates.push({
      time: roundTime(segment.start),
      kind: segment.kind,
      score: segment.kind === 'drop' || segment.kind === 'peak' || segment.kind === 'build' ? 0.84 : 0.62,
    })
  }
  for (const event of enriched.events) {
    if (event.type === 'silence' || event.type === 'onset') continue
    candidates.push({
      time: roundTime(event.time),
      kind: event.type,
      score: Math.min(1, event.intensity / 100),
    })
  }
  const unique: SectionCandidate[] = []
  for (const candidate of candidates.sort((a, b) => a.time - b.time || b.score - a.score)) {
    const prev = unique[unique.length - 1]
    if (prev && Math.abs(prev.time - candidate.time) < 0.35) {
      if (candidate.score > prev.score) unique[unique.length - 1] = candidate
      continue
    }
    unique.push(candidate)
  }
  return unique.slice(0, 48)
}

export function summarizeMusicAnalysis(
  analysis: MusicAnalysis,
  samples?: Float32Array | null,
): { enriched: AudioFeatureAnalysis; summary: MusicAnalysisSummary } {
  const enriched = enrichAudioAnalysis(analysis, samples)
  const energyChanges = detectEnergyChanges(analysis)
  const sectionCandidates = detectSectionCandidates(enriched)
  const peaks = enriched.events
    .filter((event) => event.type === 'peak' || event.type === 'drop')
    .map((event) => ({ time: event.time, intensity: event.intensity }))
    .slice(0, 40)

  return {
    enriched,
    summary: {
      duration: analysis.duration,
      silences: analysis.silence,
      energyChanges,
      transients: analysis.onsets.slice(0, 80),
      sectionCandidates,
      peaks,
      rmsMean: roundTime(mean(analysis.energy), 5),
      inputKind: 'analysis-summary',
    },
  }
}

export function scoreWindow(
  analysis: MusicAnalysis,
  enriched: AudioFeatureAnalysis,
  start: number,
  windowSec: number,
): number {
  const end = Math.min(analysis.duration, start + windowSec)
  const from = Math.floor(start / analysis.frameDuration)
  const to = Math.min(analysis.energy.length, Math.ceil(end / analysis.frameDuration))
  if (to <= from) return 0
  let energySum = 0
  for (let i = from; i < to; i += 1) energySum += analysis.energy[i] ?? 0
  const energyAvg = energySum / (to - from)
  const onsetCount = analysis.onsets.filter((time) => time >= start && time <= end).length
  const silenceOverlap = analysis.silence.reduce((acc, gap) => {
    const overlap = Math.max(0, Math.min(end, gap.end) - Math.max(start, gap.start))
    return acc + overlap
  }, 0)
  const rise =
    enriched.events.filter(
      (event) =>
        event.time >= start - 0.4 &&
        event.time <= start + 1.2 &&
        (event.type === 'drop' || event.type === 'build_up' || event.type === 'vocal_entry'),
    ).length * 0.12
  const changeAtStart = energyChangesNear(analysis, start)
  return energyAvg * 1.4 + onsetCount * 0.08 + rise + changeAtStart - silenceOverlap * 0.35
}

function energyChangesNear(analysis: MusicAnalysis, time: number): number {
  const idx = Math.max(1, Math.min(analysis.energy.length - 1, Math.round(time / analysis.frameDuration)))
  const before = mean(analysis.energy.slice(Math.max(0, idx - 8), idx))
  const after = mean(analysis.energy.slice(idx, Math.min(analysis.energy.length, idx + 8)))
  return Math.max(0, after - before) * 2.4
}

export function candidateWindows(
  analysis: MusicAnalysis,
  enriched: AudioFeatureAnalysis,
  windowSec: number,
  limit = 8,
): CutCandidate[] {
  const duration = analysis.duration
  const length = Math.min(windowSec, duration)
  if (length < 1) {
    return [
      {
        id: 'C1',
        time: 0,
        end: duration,
        score: 1,
        kind: 'window',
        reason: 'Faixa inteira — duração menor que a janela pedida',
      },
    ]
  }
  const step = Math.max(0.35, length * 0.08)
  const scored: CutCandidate[] = []
  for (let start = 0; start + length <= duration + 0.02; start += step) {
    const snapped = snapToNearbyOnset(start, analysis.onsets, 0.12)
    const end = Math.min(duration, snapped + length)
    const score = scoreWindow(analysis, enriched, snapped, length)
    scored.push({
      id: '',
      time: roundTime(snapped),
      end: roundTime(end),
      score,
      kind: 'window',
      reason: windowReason(enriched, snapped, end),
    })
  }
  scored.sort((a, b) => b.score - a.score)
  const unique: CutCandidate[] = []
  for (const candidate of scored) {
    if (unique.some((item) => Math.abs(item.time - candidate.time) < 1.2)) continue
    unique.push(candidate)
    if (unique.length >= limit) break
  }
  return unique.map((candidate, index) => ({ ...candidate, id: `C${index + 1}` }))
}

function windowReason(enriched: AudioFeatureAnalysis, start: number, end: number): string {
  const nearby = enriched.events.filter((event) => event.time >= start - 0.5 && event.time <= start + 1.4)
  if (nearby.some((event) => event.type === 'drop')) return 'Entrada forte após mudança de dinâmica'
  if (nearby.some((event) => event.type === 'vocal_entry')) return 'Possível entrada de frase/vocal'
  if (nearby.some((event) => event.type === 'build_up')) return 'Build-up seguido de trecho energético'
  const section = enriched.structure.find((item) => start >= item.start && start < item.end)
  if (section?.kind === 'peak') return 'Janela sobre região de pico'
  return 'Janela com energia, transientes e pouca pausa'
}

export function candidateSplits(
  analysis: MusicAnalysis,
  enriched: AudioFeatureAnalysis,
  mode: 'completo' | 'estrutura',
): CutCandidate[] {
  const points: Array<{ time: number; score: number; reason: string }> = []
  const push = (time: number, score: number, reason: string) => {
    if (time <= 0.45 || time >= analysis.duration - 0.45) return
    points.push({ time: roundTime(time), score, reason })
  }

  for (const gap of analysis.silence) {
    const duration = gap.end - gap.start
    if (duration < 0.32) continue
    const restart = snapToNearbyOnset(gap.end, analysis.onsets, 0.22)
    push(
      restart,
      Math.min(0.98, 0.8 + Math.min(duration, 1.6) * 0.08),
      duration >= 0.9 ? 'Retomada após pausa musical' : 'Fim de frase musical',
    )
  }

  for (const section of detectSectionCandidates(enriched)) {
    const strong = section.kind === 'drop' || section.kind === 'peak' || section.kind === 'vocal_entry' || section.kind === 'build'
    push(
      section.time,
      Math.min(0.94, Math.max(0.7, section.score) + (strong ? 0.08 : 0)),
      `Mudança de seção (${section.kind})`,
    )
  }

  for (const boundary of detectSectionBoundaries(analysis)) {
    push(boundary.time, boundary.score, boundary.reason)
  }

  if (mode === 'completo') {
    for (const onset of analysis.onsets) {
      const gap = analysis.silence.find((item) => Math.abs(item.end - onset) < 0.22 && item.end - item.start >= 0.32)
      if (!gap) continue
      push(onset, 0.88, 'Ataque após pausa')
    }
  }

  const probeStep = mode === 'estrutura' ? 14 : 11
  for (let time = probeStep; time < analysis.duration - probeStep * 0.4; time += probeStep) {
    const covered = points.some((point) => Math.abs(point.time - time) < probeStep * 0.42)
    if (covered) continue
    push(snapToNearbyOnset(time, analysis.onsets, 0.9), 0.63, 'Transição no decorrer da faixa')
  }

  points.sort((a, b) => a.time - b.time || b.score - a.score)
  const unique: typeof points = []
  const minGap = mode === 'estrutura' ? 5.5 : 4
  for (const point of points) {
    const prev = unique[unique.length - 1]
    if (prev && Math.abs(prev.time - point.time) < minGap) {
      if (point.score > prev.score) unique[unique.length - 1] = point
      continue
    }
    unique.push(point)
  }
  const limit = Math.min(36, Math.max(16, Math.ceil(analysis.duration / 8)))
  return keepSpreadPoints(unique, analysis.duration, minGap, limit).map((point, index) => ({
    id: `C${index + 1}`,
    time: point.time,
    score: point.score,
    kind: 'split' as const,
    reason: point.reason,
  }))
}

function keepSpreadPoints<T extends { time: number; score: number }>(
  points: T[],
  duration: number,
  minGap: number,
  limit: number,
): T[] {
  if (points.length <= limit) return points
  const buckets = Math.max(6, Math.min(limit, Math.ceil(duration / Math.max(minGap, 8))))
  const width = duration / buckets
  const chosen: T[] = []
  for (let i = 0; i < buckets; i += 1) {
    const lo = i * width
    const hi = (i + 1) * width
    const inBucket = points.filter((point) => point.time >= lo && point.time < hi)
    if (inBucket.length === 0) continue
    inBucket.sort((a, b) => b.score - a.score)
    chosen.push(inBucket[0])
  }
  const leftover = points
    .filter((point) => !chosen.some((item) => item.time === point.time))
    .sort((a, b) => b.score - a.score)
  for (const point of leftover) {
    if (chosen.length >= limit) break
    if (chosen.some((item) => Math.abs(item.time - point.time) < minGap)) continue
    chosen.push(point)
  }
  return chosen.sort((a, b) => a.time - b.time).slice(0, limit)
}

export function candidateEdgeTrims(analysis: MusicAnalysis): CutCandidate[] {
  const audibleStart = firstAudible(analysis)
  const audibleEnd = lastAudible(analysis)
  const startOptions = [audibleStart, ...analysis.onsets.filter((time) => time <= audibleStart + 1.5 && time >= 0.05)]
  const endOptions = [audibleEnd, ...analysis.silence.filter((gap) => gap.start >= analysis.duration * 0.7).map((gap) => gap.start)]
  const candidates: CutCandidate[] = []
  let index = 1
  for (const time of uniqueTimes(startOptions, 0.12)) {
    candidates.push({
      id: `C${index}`,
      time: roundTime(time),
      score: 1 - Math.min(0.4, Math.abs(time - audibleStart) * 0.2),
      kind: 'trim-start',
      reason: time <= 0.05 ? 'Início da faixa' : 'Fim do silêncio/fade inicial',
    })
    index += 1
  }
  for (const time of uniqueTimes(endOptions, 0.12)) {
    candidates.push({
      id: `C${index}`,
      time: roundTime(Math.min(analysis.duration, time)),
      score: 1 - Math.min(0.4, Math.abs(time - audibleEnd) * 0.15),
      kind: 'trim-end',
      reason: time >= analysis.duration - 0.08 ? 'Fim da faixa' : 'Início do silêncio/fade final',
    })
    index += 1
  }
  return candidates.map((candidate, idx) => ({ ...candidate, id: `C${idx + 1}` }))
}

export function firstAudible(analysis: MusicAnalysis): number {
  return detectEdgeTrim(analysis).start
}

export function lastAudible(analysis: MusicAnalysis): number {
  return detectMusicEnd(analysis)
}

function uniqueTimes(values: number[], minGap: number): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const value of sorted) {
    if (!Number.isFinite(value)) continue
    const prev = out[out.length - 1]
    if (prev != null && Math.abs(prev - value) < minGap) continue
    out.push(value)
  }
  return out
}

function snapToNearbyOnset(time: number, onsets: number[], window: number): number {
  let best = time
  let bestDist = window
  for (const onset of onsets) {
    const dist = Math.abs(onset - time)
    if (dist < bestDist) {
      best = onset
      bestDist = dist
    }
  }
  return best
}

export type AudioInputKind = 'analysis-summary' | 'raw-audio'

export interface AudioInputProvider {
  kind: AudioInputKind
  getAudio?: () => Promise<Uint8Array | null>
}
