import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockUserData = ''

vi.mock('../../paths', () => ({
  getUserDataPath: () => mockUserData,
}))

import { importChannelImage, removeChannelMedia, removeVideoThumbnailFile } from './channelMedia'

describe('channelMedia — proteção contra path traversal e deleção arbitrária', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-channel-media-'))
    mockUserData = path.join(tmpRoot, 'userData')
    fs.mkdirSync(mockUserData, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('bloqueia channelId com path traversal em importChannelImage e removeChannelMedia', () => {
    const img = path.join(tmpRoot, 'sample.png')
    fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    expect(() => importChannelImage(img, '../escape', 'avatar')).toThrow(/inválido/i)
    expect(() => importChannelImage(img, 'a/b', 'avatar')).toThrow(/inválido/i)
    expect(() => removeChannelMedia('..')).toThrow(/inválido/i)
  })

  it('removeVideoThumbnailFile nunca remove arquivos fora de userData/channels', () => {
    const outsideFile = path.join(tmpRoot, 'important.txt')
    fs.writeFileSync(outsideFile, 'nao apagar')

    removeVideoThumbnailFile(outsideFile)
    expect(fs.existsSync(outsideFile)).toBe(true)

    const insideFile = path.join(mockUserData, 'channels', 'ch-1', 'thumb.png')
    fs.mkdirSync(path.dirname(insideFile), { recursive: true })
    fs.writeFileSync(insideFile, 'ok')

    removeVideoThumbnailFile(insideFile)
    expect(fs.existsSync(insideFile)).toBe(false)
  })
})
