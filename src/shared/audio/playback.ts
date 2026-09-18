import { clampTime, LARGE_SEEK, SMALL_SEEK } from './time'

export type PlaybackMode = 'full' | 'region'

export interface AudioPlayerState {
  currentTime: number
  duration: number
  playing: boolean
  selectedRegion: { start: number; end: number } | null
  volume: number
  muted: boolean
  loop: boolean
  mode: PlaybackMode
}

export function createAudioPlayerState(duration = 0): AudioPlayerState {
  return {
    currentTime: 0,
    duration,
    playing: false,
    selectedRegion: null,
    volume: 1,
    muted: false,
    loop: false,
    mode: 'full',
  }
}

export function seekBy(currentTime: number, delta: number, duration: number): number {
  return clampTime(currentTime + delta, 0, Math.max(0, duration))
}

export function seekStep(currentTime: number, direction: -1 | 1, large: boolean, duration: number): number {
  return seekBy(currentTime, direction * (large ? LARGE_SEEK : SMALL_SEEK), duration)
}

export function timeFromClientX(
  clientX: number,
  rect: { left: number; width: number } | null,
  duration: number,
): number {
  if (!rect || rect.width <= 0 || duration <= 0) return 0
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return clampTime(ratio * duration, 0, duration)
}

export function nextPlaybackTime(input: {
  currentTime: number
  duration: number
  mode: PlaybackMode
  loop: boolean
  region: { start: number; end: number } | null
}): { currentTime: number; playing: boolean; looped: boolean } {
  const duration = Math.max(0, input.duration)
  if (input.mode === 'region' && input.region) {
    const end = Math.min(duration, input.region.end)
    const start = clampTime(input.region.start, 0, end)
    if (input.currentTime >= end - 0.004) {
      if (input.loop) return { currentTime: start, playing: true, looped: true }
      return { currentTime: end, playing: false, looped: false }
    }
  }
  if (input.currentTime >= duration - 0.004) {
    return { currentTime: duration, playing: false, looped: false }
  }
  return { currentTime: input.currentTime, playing: true, looped: false }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
