export type AgentModality = 'text' | 'image' | 'audio' | 'video'

export type AgentMediaDelivery = 'workspace-files' | 'image-flag' | 'none'

export interface AgentCapabilities {
  supportsText: boolean
  supportsImages: boolean
  supportsAudio: boolean
  supportsVideo: boolean
  mediaDelivery: AgentMediaDelivery
  evidence: string[]
}

export interface CliCapabilityFlags {
  addDir: boolean
  imageFlag: boolean
}

export const TEXT_ONLY_CAPABILITIES: AgentCapabilities = {
  supportsText: true,
  supportsImages: false,
  supportsAudio: false,
  supportsVideo: false,
  mediaDelivery: 'none',
  evidence: ['Nenhuma evidência de mídia nativa no CLI ou no catálogo do modelo.'],
}

const MODALITY_ALIASES: Record<string, AgentModality> = {
  text: 'text',
  image: 'image',
  images: 'image',
  vision: 'image',
  audio: 'audio',
  sound: 'audio',
  video: 'video',
  videos: 'video',
}

export function parseCliCapabilityFlags(help: string): CliCapabilityFlags {
  const text = String(help || '')
  return {
    addDir: /--add-dir\b/i.test(text),
    imageFlag: /--image\b/i.test(text),
  }
}

export function parseInputModalities(value: unknown): AgentModality[] | null {
  const raw = collectModalityTokens(value)
  if (raw == null) return null
  const seen = new Set<AgentModality>()
  for (const token of raw) {
    const mapped = MODALITY_ALIASES[token]
    if (mapped) seen.add(mapped)
  }
  if (seen.size === 0) return null
  return [...seen]
}

function collectModalityTokens(value: unknown): string[] | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const parts = value
      .split(/[,\s|/]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    return parts.length > 0 ? parts : null
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => String(item ?? '').trim().toLowerCase())
      .filter(Boolean)
    return parts.length > 0 ? parts : null
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['input_modalities', 'inputModalities', 'modalities', 'supported_modalities', 'supportedModalities']) {
      if (record[key] != null) return collectModalityTokens(record[key])
    }
  }
  return null
}

export function extractModelModalities(entry: Record<string, unknown>): AgentModality[] | null {
  return (
    parseInputModalities(entry.input_modalities) ??
    parseInputModalities(entry.inputModalities) ??
    parseInputModalities(entry.modalities) ??
    parseInputModalities(entry.supported_modalities) ??
    parseInputModalities(entry.supportedModalities) ??
    parseInputModalities(entry.supported_input_modalities)
  )
}

/**
 * Capacidades reais, sem fingir visão de vídeo.
 *
 * Antigravity/agy: docs oficiais aceitam imagem e vídeo no prompt interativo;
 * no modo headless a entrega é `--add-dir` + caminho no prompt — não há `--video`.
 * Codex: `--image` é documentado; vídeo só conta se o catálogo listar a modalidade.
 */
export function resolveAgentCapabilities(input: {
  provider: 'codex' | 'antigravity'
  modelId?: string | null
  modalities?: AgentModality[] | null
  cli: CliCapabilityFlags
}): AgentCapabilities {
  const evidence: string[] = []
  const modalities = input.modalities?.length ? [...new Set(input.modalities)] : null
  const has = (modality: AgentModality) => Boolean(modalities?.includes(modality))
  const known = modalities != null

  let supportsImages = false
  let supportsAudio = false
  let supportsVideo = false
  let mediaDelivery: AgentMediaDelivery = 'none'

  if (known) {
    supportsImages = has('image')
    supportsAudio = has('audio')
    supportsVideo = has('video')
    evidence.push(`Catálogo do modelo declara modalidades: ${modalities.join(', ')}.`)
  }

  if (input.cli.imageFlag) {
    mediaDelivery = 'image-flag'
    if (!known) supportsImages = true
    evidence.push('O CLI expõe a flag `--image` para anexar imagens.')
  }

  if (input.cli.addDir) {
    mediaDelivery = 'workspace-files'
    evidence.push('O CLI expõe `--add-dir`, então o agente pode ler arquivos locais do workspace.')
  }

  if (input.provider === 'antigravity') {
    if (input.cli.addDir && !known) {
      // Stack Gemini do Antigravity: mídia entra como arquivo no workspace, não como flag nativa.
      supportsImages = true
      supportsAudio = true
      supportsVideo = true
      evidence.push(
        'Antigravity documenta anexos de imagem (PNG/JPEG/WebP/…) e vídeo (MP4/MOV/WebM/AVI). No modo print, o arquivo é referenciado no prompt com `--add-dir`.',
      )
    } else if (!input.cli.addDir && !known) {
      evidence.push(
        'Help do `agy` não listou `--add-dir`; sem evidência de como entregar o arquivo de vídeo em modo headless.',
      )
    }
    if (known && !supportsVideo && input.cli.addDir) {
      evidence.push('O modelo atual não lista vídeo nas modalidades. Fallback: frames + áudio + transcrição.')
    }
  }

  if (input.provider === 'codex') {
    if (!known) {
      supportsVideo = false
      supportsAudio = false
      if (!input.cli.imageFlag) supportsImages = false
      evidence.push(
        'Codex CLI documenta `--image`. Não há evidência oficial de ingestão nativa de vídeo neste app; não assumir que o modelo “assiste” ao MP4.',
      )
    }
  }

  if (!supportsImages && !supportsAudio && !supportsVideo && evidence.length === 0) {
    evidence.push('Nenhuma evidência de mídia nativa.')
  }

  return {
    supportsText: true,
    supportsImages,
    supportsAudio,
    supportsVideo,
    mediaDelivery,
    evidence,
  }
}

export function capabilitiesEqual(a: AgentCapabilities, b: AgentCapabilities): boolean {
  return (
    a.supportsText === b.supportsText &&
    a.supportsImages === b.supportsImages &&
    a.supportsAudio === b.supportsAudio &&
    a.supportsVideo === b.supportsVideo &&
    a.mediaDelivery === b.mediaDelivery
  )
}
