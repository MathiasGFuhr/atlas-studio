export const MUSIC_COVER_SIZE = 1400
export const MUSIC_COVER_MIN_ZOOM = 1
export const MUSIC_COVER_MAX_ZOOM = 3
export const MUSIC_COVER_JPEG_QUALITY = 0.95

export interface CoverLayoutInput {
  naturalWidth: number
  naturalHeight: number
  frameSize?: number
  zoom: number
  offsetX: number
  offsetY: number
}

export interface CoverDrawLayout {
  drawX: number
  drawY: number
  drawWidth: number
  drawHeight: number
  clampedOffsetX: number
  clampedOffsetY: number
  maxOffsetX: number
  maxOffsetY: number
  scale: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampCoverZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MUSIC_COVER_MIN_ZOOM
  return clamp(zoom, MUSIC_COVER_MIN_ZOOM, MUSIC_COVER_MAX_ZOOM)
}

/**
 * Calcula posição e tamanho exatos para preencher o quadrado 1400×1400 (estilo cover)
 * sem deixar faixas vazias nas bordas ao arrastar ou aplicar zoom.
 */
export function computeCoverDrawLayout(input: CoverLayoutInput): CoverDrawLayout {
  const frameSize = Math.max(1, input.frameSize ?? MUSIC_COVER_SIZE)
  const nw = Math.max(1, input.naturalWidth)
  const nh = Math.max(1, input.naturalHeight)
  const zoom = clampCoverZoom(input.zoom)

  const coverScale = Math.max(frameSize / nw, frameSize / nh)
  const scale = coverScale * zoom
  const drawWidth = nw * scale
  const drawHeight = nh * scale

  const maxOffsetX = Math.max(0, (drawWidth - frameSize) / 2)
  const maxOffsetY = Math.max(0, (drawHeight - frameSize) / 2)
  const clampedOffsetX = clamp(Number.isFinite(input.offsetX) ? input.offsetX : 0, -maxOffsetX, maxOffsetX)
  const clampedOffsetY = clamp(Number.isFinite(input.offsetY) ? input.offsetY : 0, -maxOffsetY, maxOffsetY)

  return {
    drawX: (frameSize - drawWidth) / 2 + clampedOffsetX,
    drawY: (frameSize - drawHeight) / 2 + clampedOffsetY,
    drawWidth,
    drawHeight,
    clampedOffsetX,
    clampedOffsetY,
    maxOffsetX,
    maxOffsetY,
    scale,
  }
}

export function isLowResolutionCover(naturalWidth: number, naturalHeight: number): boolean {
  return naturalWidth < MUSIC_COVER_SIZE || naturalHeight < MUSIC_COVER_SIZE
}

export function buildCoverOutputFilename(sourceName?: string | null): string {
  const withoutExt = String(sourceName ?? '').replace(/\.[^.]+$/, '')
  const safeChars = Array.from(withoutExt)
    .map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch))
    .join('')
  const stem = safeChars
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const base = stem || 'capa-musica'
  return `${base}-1400x1400.jpg`
}
