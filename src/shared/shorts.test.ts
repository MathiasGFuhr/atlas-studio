import { describe, expect, it } from 'vitest'
import {
  clipPosterSeekSeconds,
  formatHashtags,
  formatShortsCopy,
  normalizeHashtags,
  normalizeShortsClip,
  shortsClipPreviewKey,
  shortsClipPreviewSrc,
  shortsExportWindow,
} from './shorts'

describe('shorts metadata helpers', () => {
  it('normaliza hashtags sem muralha e sem duplicata', () => {
    expect(normalizeHashtags(['#Solo', 'solo', '  JohannFalk  ', '#viral', '#fyp', 'extra'])).toEqual([
      'Solo',
      'JohannFalk',
      'viral',
      'fyp',
      'extra',
    ])
    expect(formatHashtags(['solo', 'JohannFalk'])).toBe('#solo #JohannFalk')
  })

  it('preenche clips antigos sem título', () => {
    const clip = normalizeShortsClip(
      { id: 'a', index: 2, start: 3, end: 10, score: 88, reason: 'refrão', hook: 'canta' },
      1,
    )
    expect(clip?.title).toBe('')
    expect(clip?.description).toBe('')
    expect(clip?.hashtags).toEqual([])
    expect(clip?.index).toBe(2)
  })

  it('monta o texto de copiar tudo', () => {
    const text = formatShortsCopy(
      {
        title: 'O refrão que a arena já sabia',
        description: 'A plateia entra inteira no segundo refrão.',
        hashtags: ['JohannFalk', 'live'],
      },
      'all',
    )
    expect(text).toBe(
      'O refrão que a arena já sabia\n\nA plateia entra inteira no segundo refrão.\n\n#JohannFalk #live',
    )
  })

  it('preview e export usam o intervalo do próprio clipId', () => {
    const a = normalizeShortsClip({ id: 'clip-a', index: 1, start: 20, end: 52, score: 90 }, 1)!
    const b = normalizeShortsClip({ id: 'clip-b', index: 2, start: 80, end: 112, score: 88 }, 2)!
    expect(shortsClipPreviewKey(a)).not.toBe(shortsClipPreviewKey(b))
    expect(shortsExportWindow(a)).toEqual({ clipId: 'clip-a', start: 20, end: 52, duration: 32 })
    expect(shortsExportWindow(b).clipId).toBe('clip-b')
    expect(shortsExportWindow(b).start).toBe(80)
  })

  it('cada Short recebe uma URL de preview distinta sem perder o arquivo', () => {
    const base = `atlas-media://local/?p=${encodeURIComponent('D:\\videos\\show.mp4')}`
    const a = shortsClipPreviewSrc(base, { id: 'clip-a', start: 13, end: 43 })!
    const b = shortsClipPreviewSrc(base, { id: 'clip-b', start: 55, end: 85 })!
    expect(a).not.toBe(b)
    expect(new URL(a).searchParams.get('p')).toBe('D:\\videos\\show.mp4')
    expect(new URL(b).searchParams.get('clip')).toBe('clip-b')
    expect(a).toContain('#t=13.000,43.000')
    expect(b).toContain('#t=55.000,85.000')
    expect(clipPosterSeekSeconds({ start: 13, end: 43 })).not.toBe(clipPosterSeekSeconds({ start: 55, end: 85 }))
    expect(clipPosterSeekSeconds({ start: 13, end: 43 })).toBeGreaterThan(13)
    expect(clipPosterSeekSeconds({ start: 13, end: 43 })).toBeLessThan(43)
  })
})
