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
  })

  it('falha quando a pasta não existe', () => {
    expect(() => scanLipSyncFolder(path.join(root, 'nao-existe'))).toThrow('Pasta não encontrada.')
  })
})
