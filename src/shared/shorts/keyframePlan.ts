export interface KeyframePlanInput {
  duration: number
  scenes?: number[]
  energyPeaks?: number[]
  audioEvents?: Array<{ time: number; type: string }>
  candidateEdges?: number[]
  maxFrames?: number
}

function roundTime(value: number) {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const EVENT_PRIORITY: Record<string, number> = {
  drop: 100,
  peak: 95,
  vocal_entry: 90,
  build_up: 85,
  scene: 80,
  candidate: 70,
  onset: 60,
  outro: 55,
  sustain: 20,
  silence: 10,
}

export function planKeyframeTimes(input: KeyframePlanInput): number[] {
  const duration = Math.max(0, input.duration)
  if (duration <= 0) return []
  const maxFrames = Math.max(6, Math.min(36, input.maxFrames ?? 28))
  const scored = new Map<number, number>()

  const add = (time: number, score: number) => {
    const t = roundTime(clamp(time, 0, Math.max(0, duration - 0.04)))
    const current = scored.get(t) ?? 0
    if (score > current) scored.set(t, score)
  }

  for (const scene of input.scenes ?? []) add(scene, EVENT_PRIORITY.scene)
  for (const peak of input.energyPeaks ?? []) add(peak, EVENT_PRIORITY.peak)
  for (const edge of input.candidateEdges ?? []) add(edge, EVENT_PRIORITY.candidate)
  for (const event of input.audioEvents ?? []) {
    add(event.time, EVENT_PRIORITY[event.type] ?? 40)
  }

  const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
  const picked: number[] = []
  for (const [time] of ranked) {
    if (picked.some((item) => Math.abs(item - time) < 1.2)) continue
    picked.push(time)
    if (picked.length >= maxFrames) break
  }

  if (picked.length < Math.min(8, maxFrames)) {
    const extras = [duration * 0.12, duration * 0.38, duration * 0.62, duration * 0.88]
    for (const extra of extras) {
      if (picked.some((item) => Math.abs(item - extra) < 2.5)) continue
      picked.push(roundTime(clamp(extra, 0.2, duration - 0.2)))
      if (picked.length >= Math.min(8, maxFrames)) break
    }
  }

  return picked.sort((a, b) => a - b)
}

export function planClipKeyframeTimes(input: {
  start: number
  end: number
  globalTimes: number[]
  maxFrames?: number
}): number[] {
  const start = Math.min(input.start, input.end)
  const end = Math.max(input.start, input.end)
  const maxFrames = Math.max(3, Math.min(8, input.maxFrames ?? 6))
  const inside = input.globalTimes.filter((time) => time >= start - 0.15 && time <= end + 0.15)
  const picked: number[] = []
  for (const time of inside) {
    if (picked.some((item) => Math.abs(item - time) < 0.9)) continue
    picked.push(roundTime(time))
    if (picked.length >= maxFrames) break
  }
  if (picked.length < 3) {
    const span = Math.max(0.6, end - start)
    for (const ratio of [0.12, 0.5, 0.86]) {
      const time = roundTime(start + span * ratio)
      if (picked.some((item) => Math.abs(item - time) < 0.7)) continue
      picked.push(time)
    }
  }
  return picked.sort((a, b) => a - b).slice(0, maxFrames)
}
