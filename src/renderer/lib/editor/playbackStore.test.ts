import { describe, expect, it, vi } from 'vitest'
import { createPlaybackStore } from './playbackStore'

describe('createPlaybackStore', () => {
  it('limita seek à duração e evita notificar quando o tempo não muda', () => {
    const store = createPlaybackStore()
    store.setDuration(10)

    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.seek(4)
    expect(store.getTime()).toBe(4)
    expect(listener).toHaveBeenCalledTimes(1)

    store.seek(4)
    expect(listener).toHaveBeenCalledTimes(1)

    store.seek(25)
    expect(store.getTime()).toBe(10)
    expect(listener).toHaveBeenCalledTimes(2)

    store.seek(-5)
    expect(store.getTime()).toBe(0)
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
  })

  it('pausa e zera o playhead quando setDuration(0) ocorre durante reprodução', () => {
    const raf = globalThis.requestAnimationFrame
    const caf = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = vi.fn(() => 1)
    globalThis.cancelAnimationFrame = vi.fn()

    try {
      const store = createPlaybackStore()
      store.setDuration(12)
      store.seek(3)
      store.play()
      expect(store.isPlaying()).toBe(true)

      store.setDuration(0)
      expect(store.isPlaying()).toBe(false)
      expect(store.getTime()).toBe(0)
    } finally {
      globalThis.requestAnimationFrame = raf
      globalThis.cancelAnimationFrame = caf
    }
  })
})
