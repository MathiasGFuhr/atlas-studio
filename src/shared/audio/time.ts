export const TIME_EPS = 0.008
export const MIN_SEGMENT = 0.05
export const SMALL_SEEK = 0.1
export const LARGE_SEEK = 1

export function roundTime(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function clampTime(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function formatTimecode(seconds: number, digits = 3): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const m = Math.floor(safe / 60)
  const s = Math.floor(safe % 60)
  const frac = safe - Math.floor(safe)
  const fracStr = frac.toFixed(digits).slice(2).padEnd(digits, '0')
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${fracStr}`
}

export function parseTimecodeInput(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null
  const clock = trimmed.match(/^(\d+):(\d+(?:\.\d+)?)$/)
  if (clock) {
    const minutes = Number(clock[1])
    const seconds = Number(clock[2])
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return roundTime(minutes * 60 + seconds)
  }
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return null
  return roundTime(numeric)
}

export function timesNear(a: number, b: number, eps = TIME_EPS): boolean {
  return Math.abs(a - b) <= eps
}
