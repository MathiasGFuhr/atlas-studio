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

import { readImageDataUrl } from './profilePhoto'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

describe('readImageDataUrl', () => {
  it('converte uma imagem local em data URL para o preview', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-thumb-'))
    const file = path.join(dir, 'thumb.png')
    try {
      fs.writeFileSync(file, TINY_PNG)
      const url = readImageDataUrl(file)
      expect(url).toMatch(/^data:image\/png;base64,/)
      expect(url).toContain(TINY_PNG.toString('base64'))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('retorna null quando o arquivo não existe', () => {
    expect(readImageDataUrl(path.join(os.tmpdir(), 'atlas-missing-thumb.png'))).toBeNull()
  })
})
