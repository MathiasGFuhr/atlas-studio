import { describe, expect, it } from 'vitest'
import { planClipKeyframeTimes, planKeyframeTimes } from './keyframePlan'

describe('frames-chave', () => {
  it('prioriza cenas, picos e eventos, não 1 frame a cada X segundos', () => {
    const times = planKeyframeTimes({
      duration: 120,
      scenes: [12.4, 40, 88],
      energyPeaks: [41.2, 90],
      audioEvents: [
        { time: 18, type: 'vocal_entry' },
        { time: 42, type: 'drop' },
        { time: 110, type: 'outro' },
      ],
      candidateEdges: [40, 70, 88, 118],
      maxFrames: 10,
    })
    expect(times.length).toBeGreaterThan(4)
    expect(times.length).toBeLessThanOrEqual(10)
    expect(times.some((time) => Math.abs(time - 42) < 1.3)).toBe(true)
    expect(times.some((time) => Math.abs(time - 12.4) < 0.2)).toBe(true)
    const uniform = Array.from({ length: 12 }, (_, i) => i * 10)
    expect(times).not.toEqual(uniform)
  })

  it('não duplica timestamps vizinhos', () => {
    const times = planKeyframeTimes({
      duration: 60,
      scenes: [10, 10.3, 10.8],
      energyPeaks: [10.4],
      maxFrames: 8,
    })
    expect(times.filter((time) => time >= 9 && time <= 12).length).toBe(1)
  })

  it('recorta frames do próprio clip', () => {
    const times = planClipKeyframeTimes({
      start: 40,
      end: 70,
      globalTimes: [12, 41, 55, 69, 90],
      maxFrames: 4,
    })
    expect(times.every((time) => time >= 39 && time <= 71)).toBe(true)
    expect(times.length).toBeGreaterThanOrEqual(3)
  })
})
