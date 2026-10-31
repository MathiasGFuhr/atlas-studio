import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { COMFY_DOWNLOAD_SUBDIR } from '../../../shared/comfy'
import {
  coerceComfyDownloadDir,
  ensureComfyDownloadDir,
  resolveComfyDownloadDir,
  uniqueExistingVideoPath,
  uniqueLipsyncVideoPath,
} from './outputDir'

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

describe('uniqueLipsyncVideoPath', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  it('usa 1.mp4 quando a pasta está vazia', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-comfy-unique-'))
    dirs.push(dir)
    expect(uniqueLipsyncVideoPath(dir, 1)).toBe(path.join(dir, '1.mp4'))
  })

  it('coloca 1, 2, 3 no final e não reaproveita o arquivo existente', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-comfy-unique-'))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, '1.mp4'), 'a')
    expect(uniqueLipsyncVideoPath(dir, 1)).toBe(path.join(dir, '1 1.mp4'))
    fs.writeFileSync(path.join(dir, '1 1.mp4'), 'b')
    expect(uniqueLipsyncVideoPath(dir, 1)).toBe(path.join(dir, '1 2.mp4'))
    fs.writeFileSync(path.join(dir, '1 2.mp4'), 'c')
    expect(uniqueLipsyncVideoPath(dir, 1)).toBe(path.join(dir, '1 3.mp4'))
    expect(fs.readFileSync(path.join(dir, '1.mp4'), 'utf8')).toBe('a')
  })

  it('uniqueExistingVideoPath não sobrescreve o destino ocupado', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-comfy-unique-'))
    dirs.push(dir)
    const dest = path.join(dir, '1.mp4')
    fs.writeFileSync(dest, 'keep')
    expect(uniqueExistingVideoPath(dest)).toBe(path.join(dir, '1 1.mp4'))
    expect(fs.readFileSync(dest, 'utf8')).toBe('keep')
  })
})
