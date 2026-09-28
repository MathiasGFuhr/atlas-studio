import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProjectFolder, sanitizeWindowsFolderName } from './projectFolders'

describe('sanitizeWindowsFolderName', () => {
  it('remove os caracteres que o Windows não aceita em nomes de pasta', () => {
    expect(sanitizeWindowsFolderName('Roma: a queda? <final>')).toBe('Roma a queda final')
    expect(sanitizeWindowsFolderName('trilha/sonora\\v2')).toBe('trilha sonora v2')
    expect(sanitizeWindowsFolderName('canal | "oficial"')).toBe('canal oficial')
  })

  it('preserva acentos e espaços internos', () => {
    expect(sanitizeWindowsFolderName('Impérios Esquecidos')).toBe('Impérios Esquecidos')
  })

  it('descarta pontos e espaços no fim, que o Explorer recusa', () => {
    expect(sanitizeWindowsFolderName('Projeto final...')).toBe('Projeto final')
    expect(sanitizeWindowsFolderName('  Projeto   ')).toBe('Projeto')
  })

  it('desvia dos nomes reservados de dispositivo', () => {
    expect(sanitizeWindowsFolderName('CON')).toBe('CON_')
    expect(sanitizeWindowsFolderName('com1')).toBe('com1_')
  })

  it('cai no nome padrão quando sobra uma string vazia', () => {
    expect(sanitizeWindowsFolderName('???')).toBe('Projeto')
    expect(sanitizeWindowsFolderName('   ')).toBe('Projeto')
  })

  it('limita o tamanho para caber no limite de caminho do Windows', () => {
    expect(sanitizeWindowsFolderName('a'.repeat(200))).toHaveLength(80)
  })
})

describe('createProjectFolder', () => {
  it('cria o projeto dentro da pasta do artista quando ela existe', () => {
    const artist = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-artist-'))
    try {
      const created = createProjectFolder({
        name: 'Heilige Luegen',
        projectType: 'music',
        parentFolder: artist,
      })
      expect(created).toBe(path.join(artist, 'Heilige Luegen'))
      expect(fs.statSync(created).isDirectory()).toBe(true)
    } finally {
      fs.rmSync(artist, { recursive: true, force: true })
    }
  })
})
