import { describe, expect, it } from 'vitest'
import { excerptFromTextarea, removeExcerptFallback, removeSelectedRange } from './songLyrics'

describe('excerptFromTextarea', () => {
  const lyrics = 'verso um\nrefrão\nverso dois'

  it('devolve o trecho selecionado, sem espaços nas pontas', () => {
    expect(
      excerptFromTextarea({
        value: lyrics,
        selectionStart: 9,
        selectionEnd: 15,
      }),
    ).toBe('refrão')
  })

  it('aceita seleção de trás para frente', () => {
    expect(
      excerptFromTextarea({
        value: lyrics,
        selectionStart: 15,
        selectionEnd: 9,
      }),
    ).toBe('refrão')
  })

  it('não devolve nada sem seleção', () => {
    expect(
      excerptFromTextarea({
        value: lyrics,
        selectionStart: 4,
        selectionEnd: 4,
      }),
    ).toBe('')
  })
})

describe('removeSelectedRange', () => {
  const lyrics = 'verso um\nrefrão\nverso dois'

  it('tira só o trecho selecionado e junta o que sobrou', () => {
    expect(removeSelectedRange(lyrics, 9, 15)).toBe('verso um\nverso dois')
  })

  it('aceita seleção de trás para frente', () => {
    expect(removeSelectedRange(lyrics, 15, 9)).toBe('verso um\nverso dois')
  })
})

describe('removeExcerptFallback', () => {
  it('tira a primeira ocorrência quando a seleção se perdeu', () => {
    expect(removeExcerptFallback('verso um\nrefrão\nverso dois\nrefrão', 'refrão')).toBe(
      'verso um\nverso dois\nrefrão',
    )
  })
})
