import type { MusicAnalysis, MusicCaption, MusicSegment } from '../musicAnalysis'
import { enrichAudioAnalysis } from '../shorts/audioFeatures'
import { makeSegment } from './audioCutService'
import { clampTime, roundTime } from './time'

export type VocalRegionKind = 'vocal' | 'instrumental'

export interface VocalRegion {
  start: number
  end: number
  kind: VocalRegionKind
}

export interface VocalAutoCutOptions {
  minSec: number
  maxSec: number
  captions?: MusicCaption[] | null
  samples?: Float32Array | null
}

const DEFAULT_MIN = 12
const DEFAULT_MAX = 25
const CAPTION_MERGE_GAP = 0.55
const HEURISTIC_MERGE_GAP = 0.35

export function normalizeVocalCutBounds(minSec: number, maxSec: number): { minSec: number; maxSec: number } {
  const min = clampTime(Number(minSec) || DEFAULT_MIN, 3, 180)
  const max = clampTime(Number(maxSec) || DEFAULT_MAX, min + 1, 240)
  return { minSec: roundTime(min, 1), maxSec: roundTime(max, 1) }
}

/** Une cues consecutivos da legenda em blocos de canto. */
export function vocalRegionsFromCaptions(
  captions: MusicCaption[],
  duration: number,
  mergeGap = CAPTION_MERGE_GAP,
): VocalRegion[] {
  const cues = [...captions]
    .filter((cue) => cue.text.trim() && cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  if (cues.length === 0) return []

  const vocals: Array<{ start: number; end: number }> = [{ start: cues[0].start, end: cues[0].end }]
  for (let i = 1; i < cues.length; i += 1) {
    const cue = cues[i]
    const prev = vocals[vocals.length - 1]
    if (cue.start - prev.end <= mergeGap) {
      prev.end = Math.max(prev.end, cue.end)
    } else {
      vocals.push({ start: cue.start, end: cue.end })
    }
  }

  return interleaveKinds(
    vocals.map((region) => ({
      start: roundTime(clampTime(region.start, 0, duration)),
      end: roundTime(clampTime(region.end, 0, duration)),
    })),
    duration,
  )
}

/**
 * Estima canto vs instrumental por energia + taxa de cruzamento zero.
 * Vocais tendem a ter ZCR mais alto com energia audível; trechos só instrumentais
 * costumam ter energia com ZCR mais baixo/estável.
 */
export function vocalRegionsFromAnalysis(
  analysis: MusicAnalysis,
  samples?: Float32Array | null,
): VocalRegion[] {
  const enriched = enrichAudioAnalysis(analysis, samples)
  const energy = enriched.energy
  const zcr = enriched.zeroCrossing
  if (energy.length === 0) {
    return [{ start: 0, end: roundTime(analysis.duration), kind: 'instrumental' }]
  }

  const sortedE = [...energy].sort((a, b) => a - b)
  const sortedZ = [...zcr].sort((a, b) => a - b)
  const silenceFloor = Math.max(0.008, percentile(sortedE, 0.12) * 1.7)
  const eMid = percentile(sortedE, 0.45)
  const zVocal = percentile(sortedZ, 0.58)
  const frame = analysis.frameDuration || 0.046

  const flags: boolean[] = energy.map((e, i) => {
    if (e <= silenceFloor) return false
    const z = zcr[i] ?? 0
    const prev = energy[i - 1] ?? e
    const rising = e > prev
    // Canto: energia audível + ZCR elevado, ou entrada após trecho mais quieto.
    return z >= zVocal * 0.92 && e >= eMid * 0.72 && (z >= zVocal || rising)
  })

  // Suaviza flutuações curtas.
  const smoothed = flags.map((value, i) => {
    let votes = 0
    for (let k = i - 2; k <= i + 2; k += 1) {
      if (k >= 0 && k < flags.length && flags[k]) votes += 1
    }
    return votes >= 3 ? true : votes <= 1 ? false : value
  })

  const raw: Array<{ start: number; end: number; vocal: boolean }> = []
  let cursor = 0
  let current = smoothed[0] ?? false
  for (let i = 1; i <= smoothed.length; i += 1) {
    const next = i < smoothed.length ? smoothed[i] : null
    if (next === current) continue
    raw.push({
      start: roundTime(cursor * frame),
      end: roundTime(Math.min(analysis.duration, i * frame)),
      vocal: current,
    })
    cursor = i
    current = next ?? current
  }

  const merged = mergeAdjacentSameKind(
    raw
      .filter((region) => region.end - region.start >= 0.12)
      .map((region) => ({
        start: region.start,
        end: region.end,
        kind: (region.vocal ? 'vocal' : 'instrumental') as VocalRegionKind,
      })),
    HEURISTIC_MERGE_GAP,
  )

  if (merged.length === 0) {
    return [{ start: 0, end: roundTime(analysis.duration), kind: 'instrumental' }]
  }
  return fillCoverage(merged, analysis.duration)
}

function interleaveKinds(
  vocals: Array<{ start: number; end: number }>,
  duration: number,
): VocalRegion[] {
  const regions: VocalRegion[] = []
  let cursor = 0
  for (const vocal of vocals) {
    if (vocal.start - cursor >= 0.18) {
      regions.push({ start: roundTime(cursor), end: roundTime(vocal.start), kind: 'instrumental' })
    }
    if (vocal.end - vocal.start >= 0.12) {
      regions.push({ start: roundTime(vocal.start), end: roundTime(vocal.end), kind: 'vocal' })
    }
    cursor = Math.max(cursor, vocal.end)
  }
  if (duration - cursor >= 0.18) {
    regions.push({ start: roundTime(cursor), end: roundTime(duration), kind: 'instrumental' })
  }
  return fillCoverage(regions, duration)
}

function fillCoverage(regions: VocalRegion[], duration: number): VocalRegion[] {
  if (regions.length === 0) return [{ start: 0, end: roundTime(duration), kind: 'instrumental' }]
  const next = sortRegions(regions).map((region) => ({ ...region }))
  if (next[0].start > 0.05) {
    next.unshift({ start: 0, end: next[0].start, kind: oppositeKind(next[0].kind) })
  } else {
    next[0].start = 0
  }
  for (let i = 1; i < next.length; i += 1) {
    if (next[i].start > next[i - 1].end + 0.05) {
      next.splice(i, 0, {
        start: next[i - 1].end,
        end: next[i].start,
        kind: oppositeKind(next[i - 1].kind),
      })
      i += 1
    } else {
      next[i].start = next[i - 1].end
    }
  }
  next[next.length - 1].end = roundTime(duration)
  return mergeAdjacentSameKind(next, 0.08)
}

function oppositeKind(kind: VocalRegionKind): VocalRegionKind {
  return kind === 'vocal' ? 'instrumental' : 'vocal'
}

function sortRegions(regions: VocalRegion[]): VocalRegion[] {
  return [...regions].sort((a, b) => a.start - b.start || a.end - b.end)
}

function mergeAdjacentSameKind(regions: VocalRegion[], maxGap: number): VocalRegion[] {
  if (regions.length === 0) return []
  const sorted = sortRegions(regions)
  const out: VocalRegion[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = out[out.length - 1]
    const curr = sorted[i]
    if (curr.kind === prev.kind && curr.start - prev.end <= maxGap) {
      prev.end = Math.max(prev.end, curr.end)
    } else {
      out.push({ ...curr })
    }
  }
  return out
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[idx]
}

/** Alvos irregulares dentro de [min, max] — evita fatias iguais em sequência. */
export function irregularTargetLength(index: number, minSec: number, maxSec: number): number {
  const span = Math.max(0.5, maxSec - minSec)
  // Fases distintas: ~42%, ~68%, ~85% do intervalo, depois repete.
  const phases = [0.42, 0.68, 0.85, 0.55, 0.78]
  const phase = phases[index % phases.length]
  // Pequena variação por índice para não repetir o mesmo tamanho relativo.
  const wobble = ((index * 17) % 9) / 100
  return roundTime(minSec + span * Math.min(0.95, phase + wobble), 2)
}

function collectBoundaries(analysis: MusicAnalysis, captions: MusicCaption[] | null | undefined): number[] {
  const points = new Set<number>()
  for (const onset of analysis.onsets) points.add(roundTime(onset))
  for (const gap of analysis.silence) {
    points.add(roundTime(gap.start))
    points.add(roundTime(gap.end))
  }
  for (const cue of captions ?? []) {
    if (cue.text.trim()) {
      points.add(roundTime(cue.start))
      points.add(roundTime(cue.end))
    }
  }
  return [...points].sort((a, b) => a - b)
}

function bestBoundary(
  ideal: number,
  lo: number,
  hi: number,
  boundaries: number[],
): number {
  let best = ideal
  let bestDist = Number.POSITIVE_INFINITY
  for (const point of boundaries) {
    if (point < lo || point > hi) continue
    const dist = Math.abs(point - ideal)
    if (dist < bestDist) {
      best = point
      bestDist = dist
    }
  }
  if (bestDist === Number.POSITIVE_INFINITY) return roundTime(clampTime(ideal, lo, hi))
  return roundTime(best)
}

function regionMeta(kind: VocalRegionKind, split: boolean) {
  if (kind === 'vocal') {
    return {
      kindLabel: 'Canto' as const,
      reason: split
        ? 'Parte de um bloco de canto (duração ajustada à música)'
        : 'Trecho com canto detectado',
      confidence: split ? 0.8 : 0.84,
    }
  }
  return {
    kindLabel: 'Instrumental' as const,
    reason: split
      ? 'Parte de um bloco instrumental (duração ajustada à música)'
      : 'Trecho sem canto (instrumental/pausa)',
    confidence: split ? 0.8 : 0.78,
  }
}

function packRegion(
  region: VocalRegion,
  minSec: number,
  maxSec: number,
  boundaries: number[],
  startIndex: number,
): Array<MusicSegment & { kindLabel: 'Canto' | 'Instrumental' }> {
  const duration = region.end - region.start
  if (duration <= 0.05) return []

  if (duration <= maxSec) {
    const meta = regionMeta(region.kind, false)
    return [
      {
        ...makeSegment(region.start, region.end, startIndex + 1, 'auto', {
          label: meta.kindLabel,
          reason: meta.reason,
          confidence: meta.confidence,
        }),
        kindLabel: meta.kindLabel,
      },
    ]
  }

  const cuts: Array<MusicSegment & { kindLabel: 'Canto' | 'Instrumental' }> = []
  let cursor = region.start
  let piece = 0
  while (region.end - cursor > maxSec + 0.05) {
    const remaining = region.end - cursor
    const targetLen = irregularTargetLength(startIndex + piece, minSec, maxSec)
    // Garante que o resto ainda possa fechar >= min (quando possível).
    const maxCut = Math.min(maxSec, Math.max(minSec, remaining - minSec))
    const lo = cursor + minSec
    const hi = cursor + Math.max(minSec, maxCut)
    if (hi <= lo + 0.05) break
    const ideal = cursor + Math.min(maxCut, Math.max(minSec, targetLen))
    const split = bestBoundary(ideal, lo, hi, boundaries)
    const meta = regionMeta(region.kind, true)
    cuts.push({
      ...makeSegment(cursor, split, startIndex + piece + 1, 'auto', {
        label: meta.kindLabel,
        reason: meta.reason,
        confidence: meta.confidence,
      }),
      kindLabel: meta.kindLabel,
    })
    cursor = split
    piece += 1
    if (piece > 200) break
  }

  if (region.end - cursor >= 0.05) {
    const lastLen = region.end - cursor
    if (lastLen < minSec && cuts.length > 0) {
      // Absorve resto curto no corte anterior.
      const prev = cuts[cuts.length - 1]
      cuts[cuts.length - 1] = {
        ...prev,
        end: roundTime(region.end),
      }
    } else {
      const meta = regionMeta(region.kind, false)
      cuts.push({
        ...makeSegment(cursor, region.end, startIndex + piece + 1, 'auto', {
          label: meta.kindLabel,
          reason: meta.reason,
          confidence: meta.confidence,
        }),
        kindLabel: meta.kindLabel,
      })
    }
  }

  return cuts
}

function mergeUndersizedRegions(regions: VocalRegion[], minSec: number): VocalRegion[] {
  if (regions.length <= 1) return regions
  const next = sortRegions(regions).map((region) => ({ ...region }))
  let i = 0
  while (i < next.length) {
    const current = next[i]
    const len = current.end - current.start
    if (len >= minSec || next.length === 1) {
      i += 1
      continue
    }
    // Preferir fundir com vizinho do mesmo tipo; senão com o menor vizinho.
    const prev = i > 0 ? next[i - 1] : null
    const following = i < next.length - 1 ? next[i + 1] : null
    if (prev && following) {
      const samePrev = prev.kind === current.kind
      const sameNext = following.kind === current.kind
      if (samePrev && !sameNext) {
        prev.end = current.end
        next.splice(i, 1)
        continue
      }
      if (sameNext && !samePrev) {
        following.start = current.start
        next.splice(i, 1)
        continue
      }
      if (prev.end - prev.start <= following.end - following.start) {
        prev.end = current.end
        next.splice(i, 1)
        continue
      }
      following.start = current.start
      next.splice(i, 1)
      continue
    }
    if (prev) {
      prev.end = current.end
      next.splice(i, 1)
      continue
    }
    if (following) {
      following.start = current.start
      next.splice(i, 1)
      continue
    }
    i += 1
  }
  return mergeAdjacentSameKind(next, 0.05)
}

export function detectVocalRegions(
  analysis: MusicAnalysis,
  options: Pick<VocalAutoCutOptions, 'captions' | 'samples'>,
): VocalRegion[] {
  const fromCaptions = vocalRegionsFromCaptions(options.captions ?? [], analysis.duration)
  if (fromCaptions.some((region) => region.kind === 'vocal')) {
    return fromCaptions
  }
  return vocalRegionsFromAnalysis(analysis, options.samples)
}

/**
 * Cria cortes automáticos em trechos com e sem canto.
 * Durações respeitam min/max e variam conforme a música — nunca fatias iguais em sequência.
 */
export function autoCutByVocals(analysis: MusicAnalysis, options: VocalAutoCutOptions): MusicSegment[] {
  if (analysis.duration <= 0) return []
  const { minSec, maxSec } = normalizeVocalCutBounds(options.minSec, options.maxSec)
  const regions = mergeUndersizedRegions(
    detectVocalRegions(analysis, options),
    Math.min(minSec, Math.max(4, minSec * 0.55)),
  )
  const boundaries = collectBoundaries(analysis, options.captions)
  const packed: Array<MusicSegment & { kindLabel: 'Canto' | 'Instrumental' }> = []
  for (const region of regions) {
    packed.push(...packRegion(region, minSec, maxSec, boundaries, packed.length))
  }

  return [...packed]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((cut, index) => {
      const { kindLabel, ...segment } = cut
      return {
        ...segment,
        id: `cut-${index + 1}-${Math.round(segment.start * 1000)}`,
        label: `Trecho ${index + 1} · ${kindLabel}`,
      }
    })
}
