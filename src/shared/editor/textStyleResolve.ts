import type { EditorTextAlign, EditorTextContent, EditorTextStyleOverride } from './types'
import {
  editorTextTemplateById,
  type EditorTextTemplateDef,
} from './textTemplatesCatalog'

export const EDITOR_TEXT_FONTS: Array<{ id: string; label: string; family: string }> = [
  { id: 'segoe', label: 'Segoe UI', family: '"Segoe UI", sans-serif' },
  { id: 'arial', label: 'Arial', family: 'Arial, sans-serif' },
  { id: 'arial-black', label: 'Arial Black', family: '"Arial Black", "Segoe UI", sans-serif' },
  { id: 'impact', label: 'Impact', family: 'Impact, "Arial Black", sans-serif' },
  { id: 'georgia', label: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
  { id: 'times', label: 'Times New Roman', family: '"Times New Roman", Times, serif' },
  { id: 'courier', label: 'Courier New', family: '"Courier New", monospace' },
  { id: 'verdana', label: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', family: 'Tahoma, Geneva, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', family: '"Trebuchet MS", sans-serif' },
  { id: 'comic', label: 'Comic Sans', family: '"Comic Sans MS", cursive' },
  { id: 'consolas', label: 'Consolas', family: 'Consolas, monospace' },
]

export type ResolvedTextLayerStyle = {
  fontFamily: string
  fontSizePercent: number
  fontWeight: number | string
  color: string
  letterSpacing?: string
  textTransform?: 'none' | 'uppercase' | 'lowercase'
  textShadow?: string
  lineHeight?: number | string
}

export type ResolvedTextPresentation = {
  template: EditorTextTemplateDef
  title: string
  subtitle: string
  align: EditorTextAlign
  xPercent: number
  yPercent: number
  titleStyle: ResolvedTextLayerStyle
  subtitleStyle: ResolvedTextLayerStyle | null
  showPlate: boolean
  plate: EditorTextTemplateDef['plate']
}

function parseSizePercent(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  if (raw.endsWith('%')) {
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) ? n : fallback
  }
  if (raw.endsWith('px')) {
    const n = Number.parseFloat(raw)
    // approx % assuming 1080p height
    return Number.isFinite(n) ? (n / 1080) * 100 : fallback
  }
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function mergeLayer(
  base: NonNullable<EditorTextTemplateDef['titleStyle']>,
  override: EditorTextStyleOverride | null | undefined,
  fallbackSize: number,
): ResolvedTextLayerStyle {
  const size =
    override?.fontSizePercent != null && Number.isFinite(override.fontSizePercent)
      ? Math.max(1, Math.min(40, override.fontSizePercent))
      : parseSizePercent(base.fontSize, fallbackSize)
  return {
    fontFamily: override?.fontFamily?.trim() || base.fontFamily,
    fontSizePercent: size,
    fontWeight: override?.fontWeight ?? base.fontWeight,
    color: override?.color?.trim() || base.color,
    letterSpacing: override?.letterSpacing ?? base.letterSpacing,
    textTransform: override?.textTransform ?? base.textTransform,
    textShadow: override?.textShadow === null ? undefined : (override?.textShadow ?? base.textShadow),
    lineHeight: base.lineHeight,
  }
}

export function resolveTextPresentation(text: EditorTextContent): ResolvedTextPresentation | null {
  const template = editorTextTemplateById(text.templateId)
  if (!template) return null
  const align = text.align ?? template.align
  const xPercent =
    text.xPercent != null && Number.isFinite(text.xPercent)
      ? Math.max(0, Math.min(100, text.xPercent))
      : template.xPercent
  const yPercent =
    text.yPercent != null && Number.isFinite(text.yPercent)
      ? Math.max(0, Math.min(100, text.yPercent))
      : template.yPercent
  const showPlate = text.showPlate == null ? Boolean(template.plate) : text.showPlate
  return {
    template,
    title: text.title,
    subtitle: text.subtitle,
    align,
    xPercent,
    yPercent,
    titleStyle: mergeLayer(template.titleStyle, text.titleStyle, 6),
    subtitleStyle: template.subtitleStyle
      ? mergeLayer(template.subtitleStyle, text.subtitleStyle, 3.5)
      : text.subtitleStyle
        ? mergeLayer(
            {
              fontFamily: template.titleStyle.fontFamily,
              fontSize: '3.5%',
              fontWeight: 600,
              color: '#cbd5e1',
            },
            text.subtitleStyle,
            3.5,
          )
        : null,
    showPlate,
    plate: showPlate ? template.plate : undefined,
  }
}

export function fontSizePercentToCss(percent: number, frameHeight: number): string {
  return `${Math.max(8, Math.round((percent / 100) * frameHeight))}px`
}
