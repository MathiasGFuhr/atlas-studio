import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tempRoot = path.join(os.tmpdir(), `atlas-flow-refs-${process.pid}`)

vi.mock('../../paths', () => ({
  getUserDataPath: () => tempRoot,
}))

import {
  flowProjectRefsDir,
  importFlowReferenceImage,
  removeFlowProjectReferenceFiles,
  removeFlowReferenceImage,
} from './flowRefMedia'

describe('flowRefMedia', () => {
  beforeEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.mkdirSync(tempRoot, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('copia a imagem para flow-refs/{projectId}', () => {
    const source = path.join(tempRoot, 'origem.png')
    fs.writeFileSync(source, Buffer.from([137, 80, 78, 71, 0, 0, 0, 1]))
    const dest = importFlowReferenceImage(source, 'proj-1', 'ref-1')
    expect(dest).toBe(path.join(flowProjectRefsDir('proj-1'), 'ref-1.png'))
    expect(fs.existsSync(dest)).toBe(true)
  })

  it('rejeita extensão inválida', () => {
    const source = path.join(tempRoot, 'arquivo.txt')
    fs.writeFileSync(source, 'nao e imagem')
    expect(() => importFlowReferenceImage(source, 'proj-1', 'ref-1')).toThrow(/PNG|JPG|GIF|WEBP/i)
  })

  it('remove arquivo e pasta do projeto', () => {
    const source = path.join(tempRoot, 'origem.jpg')
    fs.writeFileSync(source, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    const dest = importFlowReferenceImage(source, 'proj-2', 'ref-2')
    removeFlowReferenceImage(dest)
    expect(fs.existsSync(dest)).toBe(false)
    removeFlowProjectReferenceFiles('proj-2')
    expect(fs.existsSync(flowProjectRefsDir('proj-2'))).toBe(false)
  })
})
