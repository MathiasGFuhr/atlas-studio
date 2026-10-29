import { describe, expect, it } from 'vitest'
import {
  comfyDurationSeconds,
  joinPromptTexts,
  lastLipSyncFolderSceneNumber,
  matchNumberedFiles,
  matchNumberedImages,
  sceneNumberFromFileName,
} from './lipSyncRefs'

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

describe('matchNumberedFiles', () => {
  it('aplica a mesma regra aos áudios e preserva campos extras', () => {
    const { matches, ignored } = matchNumberedFiles(
      files('2.MP3', '1.wav', '1.mp3', 'faixa.mp3').map((file) => ({ ...file, duration: null })),
    )
    expect(matches.map((entry) => [entry.number, entry.fileName])).toEqual([
      [1, '1.mp3'],
      [2, '2.MP3'],
    ])
    expect(matches[0]).toHaveProperty('duration', null)
    expect(ignored).toEqual(['1.wav', 'faixa.mp3'])
  })
})

describe('lastLipSyncFolderSceneNumber', () => {
  it('só os áudios numerados já abrem as cenas', () => {
    expect(
      lastLipSyncFolderSceneNumber({
        matches: [],
        audios: [
          { number: 1, fileName: '1.mp3', path: 'C:/1.mp3', duration: 12 },
          { number: 15, fileName: '15.mp3', path: 'C:/15.mp3', duration: 8 },
        ],
      }),
    ).toBe(15)
  })

  it('usa o maior número entre imagens e áudios', () => {
    expect(
      lastLipSyncFolderSceneNumber({
        matches: [{ number: 3, fileName: '3.png', path: 'C:/3.png' }],
        audios: [{ number: 1, fileName: '1.mp3', path: 'C:/1.mp3', duration: 4 }],
      }),
    ).toBe(3)
  })
})

describe('comfyDurationSeconds', () => {
  it('usa a parte inteira do áudio mais 1 segundo', () => {
    expect(comfyDurationSeconds(21)).toBe(22)
    expect(comfyDurationSeconds(21.4)).toBe(22)
    expect(comfyDurationSeconds(21.99)).toBe(22)
    expect(comfyDurationSeconds(0.6)).toBe(1)
  })

  it('aceita outra folga', () => {
    expect(comfyDurationSeconds(14.3, 0)).toBe(14)
    expect(comfyDurationSeconds(14.3, 2)).toBe(16)
  })

  it('sem duração válida não há envio', () => {
    expect(comfyDurationSeconds(null)).toBeNull()
    expect(comfyDurationSeconds(0)).toBeNull()
    expect(comfyDurationSeconds(Number.NaN)).toBeNull()
  })
})

describe('joinPromptTexts', () => {
  it('junta na ordem e ignora vazios', () => {
    expect(joinPromptTexts(['  canto  ', '', 'luz quente'])).toBe('canto\n\nluz quente')
  })

  it('sem texto útil fica vazio', () => {
    expect(joinPromptTexts(['  ', ''])).toBe('')
  })
})
