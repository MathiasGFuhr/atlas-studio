import { describe, expect, it } from 'vitest'
import {
  applyInstrumentalChoices,
  comfyDurationSeconds,
  joinPromptTexts,
  lastLipSyncFolderSceneNumber,
  matchNumberedFiles,
  matchNumberedImages,
  mergeRootAndFolderClips,
  resolveInstrumentalChoice,
  reuseOpenProjectForFolder,
  sameLipSyncFolder,
  sceneNumberFromFileName,
  takeSceneFolderClip,
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

  it('aceita o prefixo Trecho em arquivos e pastas', () => {
    expect(sceneNumberFromFileName('Trecho 1.png')).toBe(1)
    expect(sceneNumberFromFileName('trecho 02.MP3')).toBe(2)
    expect(sceneNumberFromFileName('TRECHO 15')).toBe(15)
  })

  it('aceita o formato exportado "01 - Trecho 1"', () => {
    expect(sceneNumberFromFileName('01 - Trecho 1.mp3')).toBe(1)
    expect(sceneNumberFromFileName('02 – trecho 2.wav')).toBe(2)
    expect(sceneNumberFromFileName('15 — TRECHO 15.txt')).toBe(15)
  })

  it('rejeita outros prefixos e sufixos', () => {
    expect(sceneNumberFromFileName('cena_2.jpg')).toBeNull()
    expect(sceneNumberFromFileName('3_v2.png')).toBeNull()
    expect(sceneNumberFromFileName('Cena 12 - final.webp')).toBeNull()
    expect(sceneNumberFromFileName('Trecho 3 final.png')).toBeNull()
    expect(sceneNumberFromFileName('03 - Trecho 4.mp3')).toBeNull()
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

  it('ordena numericamente imagens com nome Trecho', () => {
    const { matches, ignored } = matchNumberedImages(
      files('Trecho 10.png', 'Trecho 2.webp', 'Trecho 01.jpg'),
    )
    expect(matches.map((entry) => [entry.number, entry.fileName])).toEqual([
      [1, 'Trecho 01.jpg'],
      [2, 'Trecho 2.webp'],
      [10, 'Trecho 10.png'],
    ])
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

describe('takeSceneFolderClip', () => {
  it('prefere o áudio com o mesmo nome do txt', () => {
    const clip = takeSceneFolderClip({
      audios: [
        { fileName: 'outro.mp3', path: 'C:/01/outro.mp3' },
        { fileName: 'What Am I Saving It.wav', path: 'C:/01/What Am I Saving It.wav' },
      ],
      texts: [
        { fileName: 'What Am I Saving It.txt', path: 'C:/01/What Am I Saving It.txt', text: '  verso  ' },
      ],
    })
    expect(clip.audio?.fileName).toBe('What Am I Saving It.wav')
    expect(clip.excerpt?.text).toBe('  verso  ')
    expect(clip.ignored).toEqual(['outro.mp3'])
  })
})

describe('mergeRootAndFolderClips', () => {
  it('áudio da raiz sem txt entra como instrumental', () => {
    const merged = mergeRootAndFolderClips({
      rootAudios: [{ number: 4, fileName: '4.mp3', path: 'C:/4.mp3' }],
      folders: [],
    })
    expect(merged.audios[0]?.excerpt).toBeNull()
    expect(merged.excerpts).toEqual([])
  })

  it('txt numerado na raiz acompanha o áudio da mesma cena', () => {
    const merged = mergeRootAndFolderClips({
      rootAudios: [{ number: 4, fileName: '4.mp3', path: 'C:/4.mp3' }],
      rootTexts: [{ number: 4, fileName: '4.txt', path: 'C:/4.txt', text: 'verso' }],
      folders: [],
    })
    expect(merged.audios[0]?.excerpt).toBe('verso')
  })
})

describe('resolveInstrumentalChoice', () => {
  it('grava o nome do instrumento e marca banda quando a opção é de banda', () => {
    expect(resolveInstrumentalChoice('violao', '')).toEqual({ lyrics: 'Violão', subject: null })
    expect(resolveInstrumentalChoice({ presetIds: ['banda-cantor'], custom: '' })).toEqual({
      lyrics: 'Banda + cantor sem cantar',
      subject: 'band',
    })
  })

  it('aceita vários instrumentos e texto livre', () => {
    expect(
      resolveInstrumentalChoice({ presetIds: ['violao', 'guitarra'], custom: 'percussão' }),
    ).toEqual({ lyrics: 'Violão, Guitarra, percussão', subject: null })
    expect(resolveInstrumentalChoice({ presetIds: [], custom: '  ' })).toBeNull()
    expect(resolveInstrumentalChoice({ presetIds: [], custom: 'sanfona' })).toEqual({
      lyrics: 'sanfona',
      subject: null,
    })
  })
})

describe('applyInstrumentalChoices', () => {
  it('troca o instrumental pelo texto escolhido', () => {
    const scan = {
      folder: 'C:/musica',
      matches: [],
      ignored: [],
      ignoredAudios: [],
      excerpts: [],
      prompts: [],
      directionDoc: null,
      audios: [
        { number: 2, fileName: 'solo.wav', path: 'C:/02/solo.wav', duration: null, excerpt: null },
      ],
    }
    const applied = applyInstrumentalChoices(scan, {
      2: { presetIds: ['banda'], custom: '' },
    })
    expect(applied.scan.audios[0]?.excerpt).toBe('Banda')
    expect(applied.subjects).toEqual({ 2: 'band' })
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

describe('sameLipSyncFolder', () => {
  it('trata barra invertida, caixa e barra final como a mesma pasta', () => {
    expect(sameLipSyncFolder('D:\\Musicas\\Nova faixa\\', 'd:/musicas/nova faixa')).toBe(true)
  })

  it('pastas diferentes não batem', () => {
    expect(sameLipSyncFolder('D:\\Musicas\\A', 'D:\\Musicas\\B')).toBe(false)
  })
})

describe('reuseOpenProjectForFolder', () => {
  it('reaproveita só quando a pasta já é a do projeto aberto', () => {
    expect(
      reuseOpenProjectForFolder({
        currentFolderPath: 'D:\\Musicas\\Nova faixa',
        selectedFolder: 'D:\\Musicas\\Nova faixa',
        currentSceneCount: 8,
      }),
    ).toBe(true)
  })

  it('reaproveita projeto vazio ainda sem pasta', () => {
    expect(
      reuseOpenProjectForFolder({
        currentFolderPath: null,
        selectedFolder: 'D:\\Musicas\\Nova faixa',
        currentSceneCount: 0,
      }),
    ).toBe(true)
  })

  it('não puxa pasta nova para um projeto que já foi feito', () => {
    expect(
      reuseOpenProjectForFolder({
        currentFolderPath: 'D:\\Musicas\\Who Says Desire Has an Age Limit',
        selectedFolder: 'D:\\Musicas\\Nova faixa',
        currentSceneCount: 18,
      }),
    ).toBe(false)
  })
})
