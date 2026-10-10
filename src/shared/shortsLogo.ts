export type ShortsLogoPosition =
  | 'center'
  | 'top_left'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right'
  | 'custom'

export interface ShortsLogoSettings {
  enabled: boolean
  /** Caminho absoluto da logo copiada para o cache do projeto. */
  imagePath: string | null
  position: ShortsLogoPosition
  /** Centro da logo no quadro (0–1). Usado em custom e derivados dos presets. */
  x: number
  y: number
  /** Opacidade 0–1. */
  opacity: number
  /** Largura da logo como fração da largura do quadro. */
  scale: number
}

export const DEFAULT_LOGO_SETTINGS: ShortsLogoSettings = {
  enabled: false,
  imagePath: null,
  position: 'center',
  x: 0.5,
  y: 0.5,
  opacity: 0.42,
  scale: 0.34,
}

export const SHORTS_LOGO_POSITIONS: Array<{ id: ShortsLogoPosition; label: string }> = [
  { id: 'center', label: 'Centro' },
  { id: 'top_left', label: 'Canto superior esquerdo' },
  { id: 'top_right', label: 'Canto superior direito' },
  { id: 'bottom_left', label: 'Canto inferior esquerdo' },
  { id: 'bottom_right', label: 'Canto inferior direito' },
  { id: 'custom', label: 'Personalizado' },
]

const PRESET_ANCHORS: Record<Exclude<ShortsLogoPosition, 'custom'>, { x: number; y: number }> = {
  center: { x: 0.5, y: 0.5 },
  top_left: { x: 0.18, y: 0.12 },
  top_right: { x: 0.82, y: 0.12 },
  bottom_left: { x: 0.18, y: 0.88 },
  bottom_right: { x: 0.82, y: 0.88 },
}

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LOGO_SETTINGS.scale
  return Math.max(0.08, Math.min(0.7, value))
}

export function isShortsLogoPosition(value: unknown): value is ShortsLogoPosition {
  return (
    value === 'center' ||
    value === 'top_left' ||
    value === 'top_right' ||
    value === 'bottom_left' ||
    value === 'bottom_right' ||
    value === 'custom'
  )
}

export function logoAnchorForPosition(
  position: ShortsLogoPosition,
  x = DEFAULT_LOGO_SETTINGS.x,
  y = DEFAULT_LOGO_SETTINGS.y,
): { x: number; y: number } {
  if (position === 'custom') return { x: clamp01(x, 0.5), y: clamp01(y, 0.5) }
  return PRESET_ANCHORS[position]
}

export function normalizeLogoSettings(value: unknown): ShortsLogoSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const position = isShortsLogoPosition(record.position) ? record.position : DEFAULT_LOGO_SETTINGS.position
  const imagePath =
    typeof record.imagePath === 'string' && record.imagePath.trim() ? record.imagePath.trim() : null
  const custom = logoAnchorForPosition(
    position === 'custom' ? 'custom' : position,
    Number(record.x),
    Number(record.y),
  )
  const anchor = position === 'custom' ? custom : PRESET_ANCHORS[position]
  return {
    enabled: Boolean(record.enabled) && Boolean(imagePath),
    imagePath,
    position,
    x: anchor.x,
    y: anchor.y,
    opacity: clamp01(Number(record.opacity), DEFAULT_LOGO_SETTINGS.opacity),
    scale: clampScale(Number(record.scale)),
  }
}

export function applyLogoPosition(
  settings: ShortsLogoSettings,
  position: ShortsLogoPosition,
): ShortsLogoSettings {
  if (position === 'custom') {
    return { ...settings, position: 'custom' }
  }
  const anchor = PRESET_ANCHORS[position]
  return { ...settings, position, x: anchor.x, y: anchor.y }
}

export function logoPreviewStyle(settings: Pick<ShortsLogoSettings, 'x' | 'y' | 'opacity' | 'scale'>): {
  left: string
  top: string
  width: string
  opacity: number
  transform: string
} {
  return {
    left: `${clamp01(settings.x, 0.5) * 100}%`,
    top: `${clamp01(settings.y, 0.5) * 100}%`,
    width: `${clampScale(settings.scale) * 100}%`,
    opacity: clamp01(settings.opacity, DEFAULT_LOGO_SETTINGS.opacity),
    transform: 'translate(-50%, -50%)',
  }
}

/** Escapa caminho Windows/Unix para uso em filtros do FFmpeg. */
export function escapeFfmpegPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export function buildLogoOverlayFilter(input: {
  baseLabel: string
  logoInputIndex: number
  outputLabel: string
  opacity: number
  x: number
  y: number
  scale: number
  outputWidth: number
}): string {
  const opacity = clamp01(input.opacity, DEFAULT_LOGO_SETTINGS.opacity)
  const x = clamp01(input.x, 0.5)
  const y = clamp01(input.y, 0.5)
  const width = Math.max(32, Math.round(input.outputWidth * clampScale(input.scale)))
  const logo = `[${input.logoInputIndex}:v]`
  return (
    `${logo}format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)},scale=${width}:-1[logo];` +
    `[${input.baseLabel}][logo]overlay=` +
    `x=main_w*${x.toFixed(4)}-overlay_w/2:` +
    `y=main_h*${y.toFixed(4)}-overlay_h/2:` +
    `format=auto[${input.outputLabel}]`
  )
}

export function activeLogoSettings(settings: ShortsLogoSettings | null | undefined): ShortsLogoSettings | null {
  const next = normalizeLogoSettings(settings)
  if (!next.enabled || !next.imagePath) return null
  return next
}
