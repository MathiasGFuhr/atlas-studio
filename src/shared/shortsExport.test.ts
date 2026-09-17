import { describe, expect, it } from 'vitest'
import {
  SHORTS_OUTPUT_HEIGHT,
  SHORTS_OUTPUT_WIDTH,
} from './shorts'
import {
  buildSrt,
  buildVerticalCropPlan,
  cuesForClip,
  wrapCaptionLines,
} from './shortsExport'

describe('shortsExport', () => {
  it('faz crop 9:16 central sem distorcer um 16:9', () => {
    const plan = buildVerticalCropPlan(1920, 1080, 'center_9_16')
    expect(plan).not.toBeNull()
    expect(plan?.focusStrategy).toBe('center')
    expect(plan?.cropHeight).toBe(1080)
    expect(plan!.cropWidth / plan!.cropHeight).toBeCloseTo(9 / 16, 2)
    expect(plan?.filter).toContain(`scale=${SHORTS_OUTPUT_WIDTH}:${SHORTS_OUTPUT_HEIGHT}`)
    expect(plan?.filter).toMatch(/^crop=\d+:\d+:\d+:\d+,scale=1080:1920$/)
  })

  it('foco automático na V1 também usa centro', () => {
    const center = buildVerticalCropPlan(1920, 1080, 'center_9_16')
    const auto = buildVerticalCropPlan(1920, 1080, 'auto_focus_9_16')
    expect(auto).toEqual(center)
  })

  it('modo original não aplica crop', () => {
    expect(buildVerticalCropPlan(1920, 1080, 'original')).toBeNull()
  })

  it('gera SRT relativo ao clipe com no máximo 2 linhas', () => {
    const cues = cuesForClip(
      [
        { start: 40, end: 44, text: 'O refrão começa agora com todo mundo cantando junto na frente do palco' },
        { start: 90, end: 94, text: 'fora do corte' },
      ],
      40,
      70,
    )
    expect(cues).toHaveLength(1)
    expect(cues[0].start).toBe(0)
    const srt = buildSrt(cues)
    expect(srt).toContain('00:00:00,000')
    expect(wrapCaptionLines(cues[0].text).split('\n').length).toBeLessThanOrEqual(2)
  })
})
