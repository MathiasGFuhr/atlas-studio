import { describe, expect, it } from 'vitest'
import {
  SHORTS_OUTPUT_HEIGHT,
  SHORTS_OUTPUT_WIDTH,
} from './shorts'
import {
  buildSrt,
  buildShortsEditorialRecord,
  buildShortsPreviewFrame,
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

  it('preview 9:16 reproduz o crop central de um 16:9, não só uma caixa vertical', () => {
    const plan = buildVerticalCropPlan(1920, 1080, 'center_9_16')!
    const frame = buildShortsPreviewFrame(1920, 1080, 'center_9_16')
    expect(frame.cropped).toBe(true)
    expect(frame.aspectRatio).toBeCloseTo(9 / 16, 5)
    expect(frame.videoWidthPct).toBeCloseTo((1920 / plan.cropWidth) * 100, 5)
    expect(frame.videoLeftPct).toBeCloseTo(-(plan.cropX / plan.cropWidth) * 100, 5)
    expect(frame.videoHeightPct).toBeCloseTo((1080 / plan.cropHeight) * 100, 5)
    expect(frame.videoTopPct).toBeCloseTo(-(plan.cropY / plan.cropHeight) * 100, 5)
    expect(frame.videoLeftPct).toBeLessThan(0)
    expect(frame.videoWidthPct).toBeGreaterThan(100)
  })

  it('preview original mantém a proporção da fonte', () => {
    const frame = buildShortsPreviewFrame(1920, 1080, 'original')
    expect(frame.cropped).toBe(false)
    expect(frame.aspectRatio).toBeCloseTo(16 / 9, 5)
    expect(frame.videoWidthPct).toBe(100)
    expect(frame.videoLeftPct).toBe(0)
  })

  it('foco automático na V1 gera o mesmo preview do centro', () => {
    expect(buildShortsPreviewFrame(1920, 1080, 'auto_focus_9_16')).toEqual(
      buildShortsPreviewFrame(1920, 1080, 'center_9_16'),
    )
  })

  it('empacota metadados editoriais com crop e formato para uso futuro', () => {
    const record = buildShortsEditorialRecord(
      {
        sourcePath: 'D:/videos/show.mp4',
        sourceName: 'show.mp4',
        aspectMode: 'center_9_16',
        probe: {
          name: 'show.mp4',
          path: 'D:/videos/show.mp4',
          duration: 180,
          width: 1920,
          height: 1080,
          fps: 30,
          aspectRatio: '16:9',
          format: 'mp4',
          hasAudio: true,
        },
      },
      {
        id: 'c1',
        index: 1,
        start: 40,
        end: 72,
        score: 91,
        reason: 'refrão',
        hook: 'a arena explode',
        title: 'O refrão que a arena já sabia',
        description: 'A plateia entra inteira no segundo refrão.',
        hashtags: ['JohannFalk'],
        accepted: false,
        exportedPath: null,
        focusStrategy: 'center',
      },
    )
    expect(record.sourceVideo).toBe('D:/videos/show.mp4')
    expect(record.format).toBe('center_9_16')
    expect(record.title).toBe('O refrão que a arena já sabia')
    expect(record.crop?.cropHeight).toBe(1080)
    expect(record.crop!.cropWidth / record.crop!.cropHeight).toBeCloseTo(9 / 16, 2)
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
