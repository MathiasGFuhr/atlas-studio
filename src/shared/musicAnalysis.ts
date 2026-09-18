import { formatTimecode as formatTimecodeMs, roundTime as roundTimeMs } from './audio/time'

export type MusicCutMode = 'automatico' | 'manual'
export type MusicSegmentSource = 'auto' | 'manual' | 'codex'

export interface MusicSegment {
  id: string
  start: number
  end: number
  label: string
  source: MusicSegmentSource
  reason?: string
  confidence?: number
}

export interface MusicSilenceRegion {
  start: number
  end: number
}

export interface MusicAnalysis {
  duration: number
  sampleRate: number
  energy: number[]
  frameDuration: number
  silence: MusicSilenceRegion[]
  onsets: number[]
}

export interface MusicTrack {
  id: string
  /** Projeto de Música dono desta faixa. */
  projectId?: string | null
  name: string
  originalPath: string
  previewPath: string
  duration: number
  cutMode: MusicCutMode
  cuts: MusicSegment[]
  selectedId?: string | null
  appliedPreset?: AutoCutPreset | null
  createdAt: string
  updatedAt: string
}

export type AutoCutPreset = 'completo' | 'silencio' | 'gancho15' | 'gancho30' | 'estrutura'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundTime(value: number) {
  return roundTimeMs(value)
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1)
  return sorted[idx]
}

export function computePeaks(samples: Float32Array, buckets: number): number[] {
  const count = Math.max(1, buckets)
  const peaks = new Array<number>(count).fill(0)
  const bucketSize = samples.length / count
  for (let i = 0; i < samples.length; i += 1) {
    const bucket = Math.min(count - 1, Math.floor(i / bucketSize))
    const amp = Math.abs(samples[i] ?? 0)
    if (amp > peaks[bucket]) peaks[bucket] = amp
  }
  return peaks
}

export function mixToMono(buffer: { numberOfChannels: number; length: number; getChannelData: (ch: number) => Float32Array }) {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  if (channels <= 1) return buffer.getChannelData(0)
  const mixed = new Float32Array(length)
  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i += 1) mixed[i] += data[i] / channels
  }
  return mixed
}

export function analyzeMusic(samples: Float32Array, sampleRate: number): MusicAnalysis {
  const frameMs = 46
  const frameSize = Math.max(64, Math.round((sampleRate * frameMs) / 1000))
  const energy: number[] = []
  for (let i = 0; i < samples.length; i += frameSize) {
    const end = Math.min(samples.length, i + frameSize)
    let sum = 0
    for (let j = i; j < end; j += 1) sum += samples[j] * samples[j]
    energy.push(Math.sqrt(sum / Math.max(1, end - i)))
  }

  const smoothed = energy.map((_, idx) => {
    let acc = 0
    let n = 0
    for (let k = idx - 2; k <= idx + 2; k += 1) {
      if (k < 0 || k >= energy.length) continue
      acc += energy[k]
      n += 1
    }
    return acc / Math.max(1, n)
  })

  const sorted = [...smoothed].sort((a, b) => a - b)
  const silenceThreshold = Math.max(0.008, percentile(sorted, 0.12) * 1.8)
  const frameDuration = frameSize / sampleRate
  const duration = samples.length / sampleRate

  const silence: MusicSilenceRegion[] = []
  let silenceStart: number | null = null
  for (let i = 0; i < smoothed.length; i += 1) {
    const isSilent = smoothed[i] <= silenceThreshold
    if (isSilent && silenceStart == null) silenceStart = i
    if (!isSilent && silenceStart != null) {
      const start = silenceStart * frameDuration
      const end = i * frameDuration
      if (end - start >= 0.18) silence.push({ start: roundTime(start), end: roundTime(end) })
      silenceStart = null
    }
  }
  if (silenceStart != null) {
    const start = silenceStart * frameDuration
    if (duration - start >= 0.18) silence.push({ start: roundTime(start), end: roundTime(duration) })
  }

  const mean = smoothed.reduce((a, b) => a + b, 0) / Math.max(1, smoothed.length)
  const variance =
    smoothed.reduce((acc, value) => acc + (value - mean) ** 2, 0) / Math.max(1, smoothed.length)
  const std = Math.sqrt(variance)
  const onsetThreshold = mean + std * 0.85
  const onsets: number[] = []
  for (let i = 1; i < smoothed.length; i += 1) {
    const delta = smoothed[i] - smoothed[i - 1]
    if (smoothed[i] > onsetThreshold && delta > std * 0.35) {
      const time = i * frameDuration
      const last = onsets[onsets.length - 1]
      if (last == null || time - last >= 0.09) onsets.push(roundTime(time))
    }
  }

  return {
    duration: roundTime(duration),
    sampleRate,
    energy: smoothed,
    frameDuration,
    silence,
    onsets,
  }
}

function snapToOnset(time: number, onsets: number[], window = 0.08) {
  let best = time
  let bestDist = window
  for (const onset of onsets) {
    const dist = Math.abs(onset - time)
    if (dist < bestDist) {
      best = onset
      bestDist = dist
    }
  }
  return roundTime(best)
}

function invertSilence(duration: number, silence: MusicSilenceRegion[]): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const gap of silence) {
    if (gap.start - cursor >= 0.28) regions.push({ start: cursor, end: gap.start })
    cursor = Math.max(cursor, gap.end)
  }
  if (duration - cursor >= 0.28) regions.push({ start: cursor, end: duration })
  return regions
}

function mergeShortGaps(
  regions: Array<{ start: number; end: number }>,
  maxGap = 0.22,
  minKeep = 1.6,
) {
  if (regions.length === 0) return regions
  const merged: Array<{ start: number; end: number }> = [{ ...regions[0] }]
  for (let i = 1; i < regions.length; i += 1) {
    const prev = merged[merged.length - 1]
    const next = regions[i]
    const gap = next.start - prev.end
    if (gap <= maxGap || prev.end - prev.start < minKeep) {
      prev.end = next.end
    } else {
      merged.push({ ...next })
    }
  }
  return merged.filter((region) => region.end - region.start >= 0.45)
}

function makeSegment(
  start: number,
  end: number,
  index: number,
  source: MusicSegmentSource,
  extra?: Partial<Pick<MusicSegment, 'label' | 'reason' | 'confidence'>>,
): MusicSegment {
  return {
    id: `cut-${index}-${Math.round(start * 1000)}`,
    start: roundTime(Math.max(0, start)),
    end: roundTime(Math.max(start + 0.05, end)),
    label: extra?.label ?? `Corte ${index}`,
    source,
    reason: extra?.reason,
    confidence: extra?.confidence,
  }
}

function highestEnergyWindow(analysis: MusicAnalysis, windowSec: number): MusicSegment {
  const windowFrames = Math.max(1, Math.round(windowSec / analysis.frameDuration))
  let bestStart = 0
  let bestScore = -1
  for (let i = 0; i + windowFrames <= analysis.energy.length; i += 1) {
    let score = 0
    for (let j = 0; j < windowFrames; j += 1) score += analysis.energy[i + j]
    if (score > bestScore) {
      bestScore = score
      bestStart = i
    }
  }
  const start = snapToOnset(bestStart * analysis.frameDuration, analysis.onsets)
  const end = Math.min(analysis.duration, start + windowSec)
  return makeSegment(start, end, 1, 'auto')
}

function structureCuts(analysis: MusicAnalysis): MusicSegment[] {
  const energy = analysis.energy
  if (energy.length === 0) return [makeSegment(0, analysis.duration, 1, 'auto')]
  const avg = energy.reduce((a, b) => a + b, 0) / energy.length
  const variance = energy.reduce((acc, value) => acc + (value - avg) ** 2, 0) / energy.length
  const std = Math.sqrt(variance)
  const times: number[] = []
  const minGap = Math.max(5, Math.min(12, analysis.duration / 8))
  for (let i = 4; i < energy.length - 4; i += 1) {
    const before = energy.slice(i - 4, i).reduce((a, b) => a + b, 0) / 4
    const after = energy.slice(i, i + 4).reduce((a, b) => a + b, 0) / 4
    const time = i * analysis.frameDuration
    if (Math.abs(after - before) < std * 0.55) continue
    const last = times[times.length - 1]
    if (last != null && time - last < minGap) continue
    const snapped = snapToOnset(time, analysis.onsets, 0.18)
    times.push(snapped)
  }
  const points = [0, ...times, analysis.duration]
  const segments: MusicSegment[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    if (points[i + 1] - points[i] < 0.8) continue
    segments.push(
      makeSegment(points[i], points[i + 1], segments.length + 1, 'auto', {
        label: `Bloco ${segments.length + 1}`,
        reason: 'Mudança local de dinâmica/seção',
      }),
    )
  }
  return segments.length > 0 ? segments : [makeSegment(0, analysis.duration, 1, 'auto')]
}

export function autoCutMusic(analysis: MusicAnalysis, preset: AutoCutPreset = 'completo'): MusicSegment[] {
  if (analysis.duration <= 0) return []

  if (preset === 'gancho15') return [highestEnergyWindow(analysis, Math.min(15, analysis.duration))]
  if (preset === 'gancho30') return [highestEnergyWindow(analysis, Math.min(30, analysis.duration))]
  if (preset === 'estrutura') return structureCuts(analysis)

  const audible = mergeShortGaps(invertSilence(analysis.duration, analysis.silence))
  if (audible.length === 0) {
    return [makeSegment(0, analysis.duration, 1, 'auto')]
  }

  if (preset === 'silencio') {
    const start = snapToOnset(audible[0].start, analysis.onsets)
    const end = audible[audible.length - 1].end
    return [
      makeSegment(start, Math.min(analysis.duration, end), 1, 'auto', {
        label: 'Faixa (sem pontas)',
        reason: 'Remove silêncio/fade das extremidades',
      }),
    ]
  }

  return audible.map((region, index) => {
    const start = snapToOnset(region.start, analysis.onsets)
    const end = Math.min(analysis.duration, region.end)
    return makeSegment(start, end, index + 1, 'auto')
  })
}

export function formatTimecode(seconds: number) {
  return formatTimecodeMs(seconds)
}
