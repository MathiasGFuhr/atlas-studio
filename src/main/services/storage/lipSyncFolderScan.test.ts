import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanLipSyncFolder } from './lipSyncFolderScan'

describe('scanLipSyncFolder', () => {
  let root = ''

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lipsync-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function touch(...names: string[]) {
    for (const name of names) fs.writeFileSync(path.join(root, name), '')
  }

  it('pega só imagens com nome de número, na ordem da cena', () => {
    touch('3.PNG', '1.jpg', '2.webp', 'cena_4.png', 'capa.png', 'notas.txt', '5.mp3')
    fs.mkdirSync(path.join(root, 'Lipsync'))
    fs.writeFileSync(path.join(root, 'Lipsync', '6.png'), '')

    const scan = scanLipSyncFolder(root)

    expect(scan.matches.map((entry) => [entry.number, entry.fileName])).toEqual([
      [1, '1.jpg'],
      [2, '2.webp'],
      [3, '3.PNG'],
    ])
    expect(scan.matches[0]?.path).toBe(path.join(root, '1.jpg'))
    expect(scan.ignored).toEqual(['capa.png', 'cena_4.png'])
    expect(scan.audios.map((entry) => [entry.number, entry.fileName, entry.duration])).toEqual([
      [5, '5.mp3', null],
    ])
  })

  it('pega áudios numerados ao lado das imagens', () => {
    touch('1.png', '1.MP3', '2.wav', '3.flac', 'musica-inteira.mp3', 'notas.txt')

    const scan = scanLipSyncFolder(root)

    expect(scan.matches.map((entry) => entry.number)).toEqual([1])
    expect(scan.audios.map((entry) => [entry.number, entry.fileName])).toEqual([
      [1, '1.MP3'],
      [2, '2.wav'],
      [3, '3.flac'],
    ])
    expect(scan.ignoredAudios).toEqual(['musica-inteira.mp3'])
    expect(scan.excerpts).toEqual([])
  })

  it('puxa o áudio e o txt de dentro da pasta numerada', () => {
    touch('1.png')
    const scene = path.join(root, '01')
    fs.mkdirSync(scene)
    fs.writeFileSync(path.join(scene, 'What Am I Saving It.mp3'), '')
    fs.writeFileSync(path.join(scene, 'What Am I Saving It.txt'), '\uFEFFverso um\r\nverso dois\r\n')
    const instrumental = path.join(root, '02')
    fs.mkdirSync(instrumental)
    fs.writeFileSync(path.join(instrumental, 'solo.wav'), '')

    const scan = scanLipSyncFolder(root)

    expect(scan.matches.map((entry) => entry.fileName)).toEqual(['1.png'])
    expect(scan.audios.map((entry) => [entry.number, entry.fileName, entry.excerpt])).toEqual([
      [1, 'What Am I Saving It.mp3', 'verso um\nverso dois'],
      [2, 'solo.wav', null],
    ])
    expect(scan.audios[0]?.path).toBe(path.join(scene, 'What Am I Saving It.mp3'))
    expect(scan.excerpts).toEqual([])
  })

  it('o áudio da pasta vence o arquivo numerado da raiz', () => {
    touch('1.mp3')
    const scene = path.join(root, '01')
    fs.mkdirSync(scene)
    fs.writeFileSync(path.join(scene, 'dentro.wav'), '')
    fs.writeFileSync(path.join(scene, 'dentro.txt'), 'trecho')
    fs.writeFileSync(path.join(scene, 'extra.mp3'), '')

    const scan = scanLipSyncFolder(root)

    expect(scan.audios.map((entry) => [entry.fileName, entry.excerpt])).toEqual([['dentro.wav', 'trecho']])
    expect(scan.ignoredAudios).toEqual(['1.mp3', 'extra.mp3'])
  })

  it('encaixa o txt da pasta no áudio numerado da raiz', () => {
    touch('1.mp3')
    const scene = path.join(root, '1')
    fs.mkdirSync(scene)
    fs.writeFileSync(path.join(scene, 'letra.txt'), 'só a letra')

    const scan = scanLipSyncFolder(root)

    expect(scan.audios.map((entry) => [entry.fileName, entry.origin, entry.excerpt])).toEqual([
      ['1.mp3', 'root', 'só a letra'],
    ])
  })

  it('mp3 solto na raiz, sem txt, fica instrumental', () => {
    touch('4.MP3')
    const scene = path.join(root, '1')
    fs.mkdirSync(scene)
    fs.writeFileSync(path.join(scene, '1.MP3'), '')
    fs.writeFileSync(path.join(scene, '1.txt'), 'letra da um')

    const scan = scanLipSyncFolder(root)

    expect(scan.audios.map((entry) => [entry.number, entry.excerpt])).toEqual([
      [1, 'letra da um'],
      [4, null],
    ])
  })

  it('txt sem áudio ainda abre a cena', () => {
    const scene = path.join(root, '03')
    fs.mkdirSync(scene)
    fs.writeFileSync(path.join(scene, 'letra.txt'), 'fala')

    const scan = scanLipSyncFolder(root)

    expect(scan.audios).toEqual([])
    expect(scan.excerpts.map((entry) => [entry.number, entry.text])).toEqual([[3, 'fala']])
  })

  it('falha quando a pasta não existe', () => {
    expect(() => scanLipSyncFolder(path.join(root, 'nao-existe'))).toThrow('Pasta não encontrada.')
  })
})
