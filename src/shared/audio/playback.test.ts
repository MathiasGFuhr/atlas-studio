import { describe, expect, it } from 'vitest'
import { createAudioPlayerState, nextPlaybackTime, seekStep, timeFromClientX } from './playback'

describe('playback', () => {
  it('play/pause são estados explícitos do player único', () => {
    const state = createAudioPlayerState(120)
    expect(state.playing).toBe(false)
    expect(state.currentTime).toBe(0)
    expect(state.mode).toBe('full')
  })

  it('seek a partir do clique na waveform', () => {
    expect(timeFromClientX(150, { left: 100, width: 200 }, 100)).toBe(25)
  })

  it('setas fazem seek pequeno e Shift faz seek maior', () => {
    expect(seekStep(10, 1, false, 100)).toBe(10.1)
    expect(seekStep(10, -1, true, 100)).toBe(9)
  })

  it('loop do corte volta ao start e para no end sem loop', () => {
    const looping = nextPlaybackTime({
      currentTime: 20,
      duration: 100,
      mode: 'region',
      loop: true,
      region: { start: 12, end: 20 },
    })
    expect(looping.looped).toBe(true)
    expect(looping.currentTime).toBe(12)
    expect(looping.playing).toBe(true)

    const stopped = nextPlaybackTime({
      currentTime: 20,
      duration: 100,
      mode: 'region',
      loop: false,
      region: { start: 12, end: 20 },
    })
    expect(stopped.playing).toBe(false)
    expect(stopped.currentTime).toBe(20)
  })
})
