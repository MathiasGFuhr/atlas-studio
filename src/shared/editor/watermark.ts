import type { EditorWatermark, EditorWatermarkCorner } from './types'

export function watermarkMarginPx(
  frame: { width: number; height: number },
  watermark: Pick<EditorWatermark, 'margin'>,
): number {
  return Math.round(Math.min(frame.width, frame.height) * watermark.margin)
}

export function watermarkWidthPx(
  frame: { width: number },
  watermark: Pick<EditorWatermark, 'scale'>,
): number {
  return Math.max(8, Math.round(frame.width * watermark.scale))
}

/** Expressões FFmpeg overlay para o canto escolhido. */
export function watermarkOverlayXy(
  corner: EditorWatermarkCorner,
  marginExpr: string,
): { x: string; y: string } {
  switch (corner) {
    case 'top-left':
      return { x: marginExpr, y: marginExpr }
    case 'top-right':
      return { x: `main_w-overlay_w-${marginExpr}`, y: marginExpr }
    case 'bottom-left':
      return { x: marginExpr, y: `main_h-overlay_h-${marginExpr}` }
    case 'bottom-right':
      return { x: `main_w-overlay_w-${marginExpr}`, y: `main_h-overlay_h-${marginExpr}` }
  }
}

export function watermarkCssPosition(
  corner: EditorWatermarkCorner,
  marginPercent: number,
): { top?: string; right?: string; bottom?: string; left?: string } {
  const edge = `${marginPercent}%`
  switch (corner) {
    case 'top-left':
      return { top: edge, left: edge }
    case 'top-right':
      return { top: edge, right: edge }
    case 'bottom-left':
      return { bottom: edge, left: edge }
    case 'bottom-right':
      return { bottom: edge, right: edge }
  }
}
