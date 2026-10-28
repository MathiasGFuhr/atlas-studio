import { describe, expect, it } from 'vitest'
import { matchNumberedImages, sceneNumberFromFileName } from './lipSyncRefs'

function files(...names: string[]) {
  return names.map((fileName) => ({ fileName, path: `C:/musica/${fileName}` }))
}

describe('sceneNumberFromFileName', () => {
  it('aceita nomes que são só o número', () => {
    expect(sceneNumberFromFileName('1.png')).toBe(1)
    expect(sceneNumberFromFileName('2.jpg')).toBe(2)
    expect(sceneNumberFromFileName('12.webp')).toBe(12)
  })

  it('rejeita nomes com qualquer outro texto', () => {
    expect(sceneNumberFromFileName('cena_2.jpg')).toBeNull()
    expect(sceneNumberFromFileName('3_v2.png')).toBeNull()
    expect(sceneNumberFromFileName('Cena 12 - final.webp')).toBeNull()
    expect(sceneNumberFromFileName('capa.png')).toBeNull()
  })

  it('rejeita zero e números grandes demais', () => {
    expect(sceneNumberFromFileName('0.png')).toBeNull()
    expect(sceneNumberFromFileName('2026.png')).toBeNull()
  })
})

describe('matchNumberedImages', () => {
  it('ordena pelo número da cena', () => {
    const { matches, ignored } = matchNumberedImages(files('10.png', '2.png', '1.png'))
    expect(matches.map((entry) => entry.number)).toEqual([1, 2, 10])
    expect(matches[0]?.path).toBe('C:/musica/1.png')
    expect(ignored).toEqual([])
  })

  it('com número repetido mantém o nome mais curto e ignora o resto', () => {
    const { matches, ignored } = matchNumberedImages(files('01.jpg', '1.png', 'cena_1.png'))
    expect(matches).toHaveLength(1)
    expect(matches[0]?.fileName).toBe('1.png')
    expect(ignored).toEqual(['01.jpg', 'cena_1.png'])
  })
})
