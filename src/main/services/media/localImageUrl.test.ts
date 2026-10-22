import { afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-userdata-'))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => userData,
    getAppPath: () => process.cwd(),
  },
}))

import { isAllowedImagePath, localImageThumbUrl, localImageUrl } from './localImageUrl'
import { parseThumbWidth } from './imageThumbnails'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function writeImage(...segments: string[]): string {
  const file = path.join(...segments)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, TINY_PNG)
  return file
}

afterAll(() => {
  fs.rmSync(userData, { recursive: true, force: true })
})

describe('localImageUrl', () => {
  it('serve imagens de lipsync-refs e channels via atlas-media com cache-bust', () => {
    const scene = writeImage(userData, 'lipsync-refs', 'p1', 'cena 1.png')
    const avatar = writeImage(userData, 'channels', 'c1', 'avatar.jpg')
    const sceneUrl = localImageUrl(scene)
    expect(sceneUrl).toMatch(/^atlas-media:\/\/local\/\?p=/)
    expect(sceneUrl).toContain(encodeURIComponent(path.resolve(scene)))
    expect(sceneUrl).toMatch(/&v=\d+-\d+$/)
    expect(localImageUrl(avatar)).toMatch(/^atlas-media:/)
  })

  it('mantém data URL para caminhos legados fora das pastas do userData', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-legacy-'))
    try {
      const legacy = writeImage(dir, 'thumb.png')
      expect(localImageUrl(legacy)).toMatch(/^data:image\/png;base64,/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('retorna null para caminho vazio, inexistente ou arquivo vazio', () => {
    expect(localImageUrl(null)).toBeNull()
    expect(localImageUrl('   ')).toBeNull()
    expect(localImageUrl(path.join(userData, 'lipsync-refs', 'nao-existe.png'))).toBeNull()
    const empty = path.join(userData, 'channels', 'vazio.png')
    fs.mkdirSync(path.dirname(empty), { recursive: true })
    fs.writeFileSync(empty, '')
    expect(localImageUrl(empty)).toBeNull()
  })

  it('gera URL de miniatura só para imagens do userData', () => {
    const scene = writeImage(userData, 'lipsync-refs', 'thumb', 'cena.jpg')
    const thumb = localImageThumbUrl(scene, 360)
    expect(thumb).toMatch(/^atlas-media:\/\/local\/\?p=.*&v=\d+-\d+&w=360$/)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-legacy-thumb-'))
    try {
      expect(localImageThumbUrl(writeImage(dir, 'thumb.png'), 360)).toBeNull()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    expect(localImageThumbUrl('', 360)).toBeNull()
  })

  it('aceita só os tamanhos de miniatura conhecidos', () => {
    expect(parseThumbWidth('360')).toBe(360)
    expect(parseThumbWidth('1080')).toBe(1080)
    expect(parseThumbWidth('5000')).toBeNull()
    expect(parseThumbWidth(null)).toBeNull()
    expect(parseThumbWidth('abc')).toBeNull()
  })

  it('não libera arquivos fora das pastas de imagem nem extensões não-imagem', () => {
    expect(isAllowedImagePath(path.join(userData, 'atlas-studio.db'))).toBe(false)
    expect(isAllowedImagePath(path.join(userData, 'channels', 'segredo.txt'))).toBe(false)
    expect(isAllowedImagePath(path.join(userData, 'channels', '..', 'x.png'))).toBe(false)
    expect(isAllowedImagePath(path.join(userData, 'channels'))).toBe(false)
    expect(isAllowedImagePath(path.join(userData, 'channels', 'a', 'b.webp'))).toBe(true)
  })
})
