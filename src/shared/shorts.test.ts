import { describe, expect, it } from 'vitest'
import { formatHashtags, formatShortsCopy, normalizeHashtags, normalizeShortsClip } from './shorts'

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
})
