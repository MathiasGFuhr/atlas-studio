import { describe, expect, it } from 'vitest'
import {
  excerptFromTextarea,
  formatNumberedSceneTexts,
  parseNumberedSceneTexts,
  removeExcerptFallback,
  removeSelectedRange,
} from './songLyrics'

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

describe('formatNumberedSceneTexts', () => {
  it('numera cada texto na ordem da cena e ignora cenas vazias', () => {
    expect(formatNumberedSceneTexts(['primeiro verso', '', '  refrão\nfinal  '])).toBe(
      '1- primeiro verso\n\n3- refrão\nfinal',
    )
  })

  it('não devolve nada se nenhuma cena tem texto', () => {
    expect(formatNumberedSceneTexts(['', '  ', '\n'])).toBe('')
  })

  it('mantém o número das cenas vazias quando pedido', () => {
    expect(formatNumberedSceneTexts(['primeiro', '', 'terceiro'], { includeEmpty: true })).toBe(
      '1- primeiro\n\n2-\n\n3- terceiro',
    )
  })
})

describe('parseNumberedSceneTexts', () => {
  it('lê a lista numerada e junta linhas do mesmo trecho', () => {
    expect(parseNumberedSceneTexts('1- primeiro verso\n\n3- refrão\nfinal')).toEqual([
      { number: 1, text: 'primeiro verso' },
      { number: 3, text: 'refrão\nfinal' },
    ])
  })

  it('aceita 1. e 2) e ignora números vazios', () => {
    expect(parseNumberedSceneTexts('1. um\n2) \n3- três')).toEqual([
      { number: 1, text: 'um' },
      { number: 3, text: 'três' },
    ])
  })

  it('não devolve nada sem números', () => {
    expect(parseNumberedSceneTexts('prompt solto\n\noutra linha')).toEqual([])
  })
})
