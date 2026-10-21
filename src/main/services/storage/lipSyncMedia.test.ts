import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => os.tmpdir(),
    getAppPath: () => process.cwd(),
  },
}))

import { archiveLipSyncRefToProjectFolder } from './lipSyncMedia'

describe('archiveLipSyncRefToProjectFolder', () => {
  it('grava o trecho e o prompt sem exigir imagem', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lipsync-'))
    try {
      const saved = archiveLipSyncRefToProjectFolder({
        sourceImagePath: '',
        projectFolder: dir,
        label: 'Refrão',
        prompt: 'Cantor olha para a câmera',
        lyrics: 'vem comigo',
        refId: 'abc12345-rest',
      })
      expect(saved.imagePath).toBe('')
      expect(fs.existsSync(saved.promptPath)).toBe(true)
      expect(fs.readFileSync(saved.promptPath, 'utf8')).toContain('vem comigo')
      expect(fs.readFileSync(saved.promptPath, 'utf8')).toContain('Cantor olha para a câmera')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('grava o texto mesmo se o arquivo de imagem sumiu', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lipsync-'))
    try {
      const saved = archiveLipSyncRefToProjectFolder({
        sourceImagePath: path.join(dir, 'nao-existe.png'),
        projectFolder: dir,
        label: 'Banda',
        prompt: 'Banda no palco',
        lyrics: 'refrão',
        refId: 'banda1234-rest',
      })
      expect(saved.imagePath).toBe('')
      expect(fs.existsSync(saved.promptPath)).toBe(true)
      expect(fs.readFileSync(saved.promptPath, 'utf8')).toContain('Banda no palco')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
