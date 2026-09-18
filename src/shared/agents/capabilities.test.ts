import { describe, expect, it } from 'vitest'
import {
  parseCliCapabilityFlags,
  parseInputModalities,
  resolveAgentCapabilities,
  TEXT_ONLY_CAPABILITIES,
} from './capabilities'

describe('capacidades do agente', () => {
  it('lê flags reais do help, sem inventar', () => {
    expect(
      parseCliCapabilityFlags(
        'Usage: agy [options]\n  --add-dir  Add a directory to the workspace\n  --json-schema  schema\n',
      ),
    ).toEqual({ addDir: true, imageFlag: false })
    expect(parseCliCapabilityFlags('codex exec --image path.png')).toEqual({ addDir: false, imageFlag: true })
    expect(parseCliCapabilityFlags('agy -p prompt --output-format json')).toEqual({ addDir: false, imageFlag: false })
  })

  it('parseia modalidades do catálogo quando existirem', () => {
    expect(parseInputModalities(['text', 'image', 'video'])).toEqual(['text', 'image', 'video'])
    expect(parseInputModalities({ input_modalities: 'text,vision' })).toEqual(['text', 'image'])
    expect(parseInputModalities(undefined)).toBeNull()
    expect(parseInputModalities([])).toBeNull()
  })

  it('Antigravity com --add-dir e sem modalidades: pode receber vídeo via arquivo, não via flag nativa', () => {
    const caps = resolveAgentCapabilities({
      provider: 'antigravity',
      modelId: 'gemini-3-flash',
      modalities: null,
      cli: { addDir: true, imageFlag: false },
    })
    expect(caps.supportsText).toBe(true)
    expect(caps.supportsImages).toBe(true)
    expect(caps.supportsAudio).toBe(true)
    expect(caps.supportsVideo).toBe(true)
    expect(caps.mediaDelivery).toBe('workspace-files')
    expect(caps.evidence.some((item) => item.includes('--add-dir'))).toBe(true)
    expect(caps.evidence.some((item) => /MP4|vídeo/i.test(item))).toBe(true)
  })

  it('Antigravity sem --add-dir e sem modalidades não finge suporte a vídeo', () => {
    const caps = resolveAgentCapabilities({
      provider: 'antigravity',
      modalities: null,
      cli: { addDir: false, imageFlag: false },
    })
    expect(caps.supportsVideo).toBe(false)
    expect(caps.supportsImages).toBe(false)
    expect(caps.mediaDelivery).toBe('none')
  })

  it('respeita modalidades explícitas mesmo no Antigravity', () => {
    const caps = resolveAgentCapabilities({
      provider: 'antigravity',
      modalities: ['text', 'image'],
      cli: { addDir: true, imageFlag: false },
    })
    expect(caps.supportsImages).toBe(true)
    expect(caps.supportsVideo).toBe(false)
    expect(caps.supportsAudio).toBe(false)
    expect(caps.evidence.some((item) => /não lista vídeo/i.test(item))).toBe(true)
  })

  it('Codex só ganha vídeo se o catálogo declarar', () => {
    const images = resolveAgentCapabilities({
      provider: 'codex',
      modalities: null,
      cli: { addDir: true, imageFlag: true },
    })
    expect(images.supportsImages).toBe(true)
    expect(images.supportsVideo).toBe(false)
    expect(images.mediaDelivery).toBe('workspace-files')

    const video = resolveAgentCapabilities({
      provider: 'codex',
      modalities: ['text', 'image', 'video'],
      cli: { addDir: false, imageFlag: true },
    })
    expect(video.supportsVideo).toBe(true)
    expect(video.supportsImages).toBe(true)
  })

  it('mantém fallback textual honesto', () => {
    expect(TEXT_ONLY_CAPABILITIES.supportsVideo).toBe(false)
    expect(TEXT_ONLY_CAPABILITIES.supportsImages).toBe(false)
  })
})
