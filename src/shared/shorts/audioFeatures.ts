import type { MusicAnalysis } from '../musicAnalysis'

export type AudioEventType =
  | 'peak'
  | 'onset'
  | 'build_up'
  | 'drop'
  | 'silence'
  | 'vocal_entry'
  | 'outro'
  | 'sustain'

export interface AudioEvent {
  time: number
  end?: number
  type: AudioEventType
  intensity: number
}

export interface AudioStructureSegment {
  start: number
  end: number
  kind: 'quiet' | 'build' | 'peak' | 'drop' | 'sustain' | 'outro'
}

export interface AudioFeatureAnalysis extends MusicAnalysis {
  zeroCrossing: number[]
  events: AudioEvent[]
  structure: AudioStructureSegment[]
}

function roundTime(value: number) {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function mean(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1)
  return sorted[idx]
}

function windowMean(values: number[], from: number, to: number) {
  const start = clamp(from, 0, values.length)
  const end = clamp(to, 0, values.length)
  if (end <= start) return 0
  let sum = 0
  for (let i = start; i < end; i += 1) sum += values[i] ?? 0
  return sum / (end - start)
}

function pushEvent(list: AudioEvent[], event: AudioEvent, minGap = 0.8) {
  const last = list.filter((item) => item.type === event.type).at(-1)
  if (last && Math.abs(event.time - last.time) < minGap) return
  list.push(event)
}

export function computeZeroCrossingRates(samples: Float32Array, sampleRate: number, frameDuration: number): number[] {
  const frameSize = Math.max(64, Math.round(sampleRate * frameDuration))
  const rates: number[] = []
  for (let i = 0; i < samples.length; i += frameSize) {
    const end = Math.min(samples.length, i + frameSize)
    let crossings = 0
    let prev = samples[i] ?? 0
    for (let j = i + 1; j < end; j += 1) {
      const current = samples[j] ?? 0
      if ((prev < 0 && current >= 0) || (prev >= 0 && current < 0)) crossings += 1
      prev = current
    }
    rates.push(crossings / Math.max(1, end - i))
  }
  return rates
}

export function enrichAudioAnalysis(
  analysis: MusicAnalysis,
  samples?: Float32Array | null,
): AudioFeatureAnalysis {
  const energy = analysis.energy
  const frameDuration = analysis.frameDuration || 0.046
  const duration = analysis.duration
  const zeroCrossing =
    samples && samples.length > 0
      ? computeZeroCrossingRates(samples, analysis.sampleRate || 16000, frameDuration)
      : energy.map(() => 0)

  const events: AudioEvent[] = []
  for (const region of analysis.silence) {
    events.push({
      time: roundTime(region.start),
      end: roundTime(region.end),
      type: 'silence',
      intensity: 0,
    })
  }
  for (const onset of analysis.onsets) {
    pushEvent(events, { time: onset, type: 'onset', intensity: 70 }, 0.25)
  }

  const sorted = [...energy].sort((a, b) => a - b)
  const high = percentile(sorted, 0.82)
  const mid = percentile(sorted, 0.55)
  const low = percentile(sorted, 0.22)
  const zSorted = [...zeroCrossing].sort((a, b) => a - b)
  const zHigh = percentile(zSorted, 0.78)
  const zMid = percentile(zSorted, 0.5)
  const buildFrames = Math.max(4, Math.round(2.4 / frameDuration))
  const peakFrames = Math.max(3, Math.round(1.2 / frameDuration))

  for (let i = buildFrames; i < energy.length; i += 1) {
    const before = windowMean(energy, i - buildFrames, i - Math.round(buildFrames * 0.35))
    const now = windowMean(energy, i - 2, i + 1)
    if (before <= mid && now >= high && now - before > (high - low) * 0.28) {
      const time = roundTime(i * frameDuration)
      const prevWasDip = before <= low * 1.35 || windowMean(energy, i - peakFrames, i) < mid
      pushEvent(
        events,
        {
          time,
          type: prevWasDip && now > high ? 'drop' : 'build_up',
          intensity: clamp(Math.round(40 + (now / Math.max(high, 0.0001)) * 60), 0, 100),
        },
        1.6,
      )
    }
  }

  for (let i = 2; i < energy.length; i += 1) {
    const z = zeroCrossing[i] ?? 0
    const e = energy[i] ?? 0
    const prevE = windowMean(energy, i - 6, i - 1)
    if (z >= zHigh && e >= mid && prevE < mid && z > (zeroCrossing[i - 1] ?? 0)) {
      pushEvent(
        events,
        {
          time: roundTime(i * frameDuration),
          type: 'vocal_entry',
          intensity: clamp(Math.round(50 + (z / Math.max(zMid, 0.0001)) * 20), 0, 100),
        },
        2.2,
      )
    }
  }

  const peakStep = Math.max(1, Math.round(2.5 / frameDuration))
  for (let i = 0; i < energy.length; i += peakStep) {
    const slice = energy.slice(i, i + peakStep)
    const local = Math.max(...slice, 0)
    if (local >= high) {
      const idx = i + slice.indexOf(local)
      pushEvent(
        events,
        {
          time: roundTime(idx * frameDuration),
          type: 'peak',
          intensity: clamp(Math.round((local / Math.max(high, 0.0001)) * 90), 0, 100),
        },
        2,
      )
    }
  }

  const lastStart = Math.max(0, duration - Math.min(12, duration * 0.12))
  const lastEnergy = windowMean(
    energy,
    Math.floor(lastStart / frameDuration),
    energy.length,
  )
  if (lastEnergy <= mid && duration > 8) {
    events.push({ time: roundTime(lastStart), end: roundTime(duration), type: 'outro', intensity: 35 })
  }

  const structure: AudioStructureSegment[] = []
  const chunk = Math.max(6, Math.round(3.2 / frameDuration))
  for (let i = 0; i < energy.length; i += chunk) {
    const slice = energy.slice(i, i + chunk)
    const avg = mean(slice)
    const start = roundTime(i * frameDuration)
    const end = roundTime(Math.min(duration, (i + slice.length) * frameDuration))
    const first = slice[0] ?? 0
    const last = slice[slice.length - 1] ?? 0
    let kind: AudioStructureSegment['kind'] = 'sustain'
    if (avg <= low) kind = 'quiet'
    else if (last - first > (high - low) * 0.25 && avg >= mid) kind = 'build'
    else if (first - last > (high - low) * 0.3 && i >= energy.length - chunk * 2) kind = 'outro'
    else if (avg >= high) kind = 'peak'
    else if (first < mid && avg >= high) kind = 'drop'
    const prev = structure[structure.length - 1]
    if (prev && prev.kind === kind) prev.end = end
    else structure.push({ start, end, kind })
  }

  events.sort((a, b) => a.time - b.time || a.type.localeCompare(b.type))
  return { ...analysis, zeroCrossing, events, structure }
}

export function summarizeAudioEvents(analysis: AudioFeatureAnalysis, limit = 24): string {
  if (analysis.events.length === 0) return '(sem eventos de áudio destacados)'
  return analysis.events
    .slice(0, limit)
    .map((event) => {
      const span = event.end != null ? `–${event.end.toFixed(1)}` : ''
      return `${event.time.toFixed(1)}${span}s ${event.type} (${event.intensity})`
    })
    .join('; ')
}

export function audioEventsNear(analysis: AudioFeatureAnalysis, start: number, end: number): AudioEvent[] {
  return analysis.events.filter((event) => {
    const t = event.time
    const close = t >= start - 0.6 && t <= end + 0.6
    const span = event.end != null && event.end >= start && event.time <= end
    return close || span
  })
}
