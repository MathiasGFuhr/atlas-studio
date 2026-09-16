import { describe, expect, it } from 'vitest'
import { sanitizeWindowsFolderName } from './projectFolders'

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
