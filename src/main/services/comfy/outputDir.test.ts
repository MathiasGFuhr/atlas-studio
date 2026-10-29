import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { COMFY_DOWNLOAD_SUBDIR } from '../../../shared/comfy'
import { coerceComfyDownloadDir, ensureComfyDownloadDir, resolveComfyDownloadDir } from './outputDir'

describe('resolveComfyDownloadDir', () => {
  it('aponta para a subpasta lipsync da pasta vinculada', () => {
    const linked = 'D:/Canais Youtube/Livia Serafim/A Aliança que não vai se'
    expect(resolveComfyDownloadDir(linked)).toBe(path.join(path.resolve(linked), COMFY_DOWNLOAD_SUBDIR))
  })

  it('recusa pasta vazia', () => {
    expect(resolveComfyDownloadDir(null)).toBeNull()
    expect(resolveComfyDownloadDir('   ')).toBeNull()
  })
})

describe('ensureComfyDownloadDir', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  it('cria a pasta lipsync dentro da pasta vinculada', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-comfy-out-'))
    dirs.push(root)
    const dest = ensureComfyDownloadDir(root)
    expect(dest).toBe(path.join(root, 'lipsync'))
    expect(fs.statSync(dest!).isDirectory()).toBe(true)
  })

  it('não cria lipsync se a pasta vinculada não existe', () => {
    expect(ensureComfyDownloadDir(path.join(os.tmpdir(), 'atlas-nao-existe-xyz'))).toBeNull()
  })
})

describe('coerceComfyDownloadDir', () => {
  it('ignora o destino antigo e grava em pasta/lipsync', () => {
    const linked = 'D:/Canais Youtube/Livia Serafim/A Aliança que não vai se'
    expect(coerceComfyDownloadDir('C:/Users/Me/Documents/Atlas/Musica/Outra pasta', linked)).toBe(
      path.join(path.resolve(linked), 'lipsync'),
    )
  })

  it('lotes antigos na raiz da música passam para lipsync', () => {
    const linked = 'D:/musica/A Aliança que não vai se'
    expect(coerceComfyDownloadDir(linked, linked)).toBe(path.join(path.resolve(linked), 'lipsync'))
  })

  it('lotes antigos em pasta/Comfy passam para pasta/lipsync', () => {
    const linked = 'D:/musica/A Aliança que não vai se'
    expect(coerceComfyDownloadDir(path.join(linked, 'Comfy'), linked)).toBe(
      path.join(path.resolve(linked), 'lipsync'),
    )
  })

  it('sem pasta vinculada, troca Comfy por lipsync no mesmo pai', () => {
    const music = path.resolve('D:/musica/A Aliança que não vai se')
    expect(coerceComfyDownloadDir(path.join(music, 'Comfy'), null)).toBe(path.join(music, 'lipsync'))
  })
})
