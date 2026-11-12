/**
 * Relógio mestre do editor. Fica fora do estado React: o playhead e o preview
 * assinam direto e só eles re-renderizam a cada quadro.
 */
export type PlaybackStore = {
  getTime: () => number
  isPlaying: () => boolean
  subscribe: (listener: () => void) => () => void
  seek: (time: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  setDuration: (duration: number) => void
  getDuration: () => number
}

export function createPlaybackStore(): PlaybackStore {
  let time = 0
  let playing = false
  let duration = 0
  let frame = 0
  let anchorPerf = 0
  let anchorTime = 0
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const tick = () => {
    if (!playing) return
    const next = anchorTime + (performance.now() - anchorPerf) / 1000
    if (next >= duration) {
      time = duration
      playing = false
      notify()
      return
    }
    time = next
    notify()
    frame = requestAnimationFrame(tick)
  }

  const store: PlaybackStore = {
    getTime: () => time,
    isPlaying: () => playing,
    getDuration: () => duration,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    seek(next) {
      time = Math.max(0, Math.min(duration, Number.isFinite(next) ? next : 0))
      anchorTime = time
      anchorPerf = performance.now()
      notify()
    },
    play() {
      if (playing || duration <= 0) return
      if (time >= duration - 0.01) time = 0
      playing = true
      anchorTime = time
      anchorPerf = performance.now()
      notify()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(tick)
    },
    pause() {
      if (!playing) return
      playing = false
      cancelAnimationFrame(frame)
      notify()
    },
    toggle() {
      if (playing) store.pause()
      else store.play()
    },
    setDuration(next) {
      duration = Math.max(0, next)
      if (time > duration) store.seek(duration)
    },
  }
  return store
}
