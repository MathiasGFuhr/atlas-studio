import type { CSSProperties } from 'react'
import { resolveAnimationStyle } from '@shared/editor/animationsCatalog'
import { normalizeTextMotionId } from '@shared/editor/textMotionsCatalog'
import {
  fontSizePercentToCss,
  resolveTextPresentation,
  type ResolvedTextLayerStyle,
} from '@shared/editor/textStyleResolve'
import type { EditorClip } from '@shared/editor/types'
import { clipDuration } from '@shared/editor/timelineOps'
import { KineticText } from './KineticText'

function styleMap(style: ResolvedTextLayerStyle, frameHeight: number): CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: fontSizePercentToCss(style.fontSizePercent, frameHeight),
    fontWeight: style.fontWeight as CSSProperties['fontWeight'],
    color: style.color,
    letterSpacing: style.letterSpacing,
    textTransform: style.textTransform,
    textShadow: style.textShadow,
    lineHeight: style.lineHeight ?? 1.15,
    margin: 0,
    whiteSpace: 'pre-wrap',
  }
}

export function TextOverlay({
  clip,
  time,
  frameWidth,
  frameHeight,
}: {
  clip: EditorClip
  time: number
  frameWidth: number
  frameHeight: number
}) {
  const text = clip.text
  if (!text || frameWidth < 8 || frameHeight < 8) return null
  const presentation = resolveTextPresentation(text)
  if (!presentation) return null

  const duration = clipDuration(clip)
  const local = time - clip.start
  if (local < 0 || local >= duration) return null

  const anim = resolveAnimationStyle(clip.animation, local, duration)
  const x = `${presentation.xPercent}%`
  const y = `${presentation.yPercent}%`
  const translate =
    presentation.align === 'left'
      ? '0%, -50%'
      : presentation.align === 'right'
        ? '-100%, -50%'
        : '-50%, -50%'

  const plate = presentation.plate
  const platePadX =
    plate && plate.paddingX.endsWith('%')
      ? (Number.parseFloat(plate.paddingX) / 100) * frameWidth
      : 12
  const platePadY =
    plate && plate.paddingY.endsWith('%')
      ? (Number.parseFloat(plate.paddingY) / 100) * frameHeight
      : 8

  const motionId = normalizeTextMotionId(text.motionId ?? presentation.template.defaultMotionId ?? 'none')

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{
        left: x,
        top: y,
        transform: `translate(${translate}) ${anim.transform}`.trim(),
        opacity: clip.opacity * anim.opacity,
        filter: anim.filter || undefined,
        textAlign: presentation.align,
        maxWidth: '90%',
      }}
    >
      <div
        style={
          presentation.showPlate && plate
            ? {
                background: plate.background,
                padding: `${platePadY}px ${platePadX}px`,
                borderRadius: plate.borderRadius,
                border: plate.border,
                display: 'inline-block',
              }
            : undefined
        }
      >
        {presentation.title ? (
          <KineticText
            text={presentation.title}
            motionId={motionId}
            localTime={local}
            style={styleMap(presentation.titleStyle, frameHeight)}
          />
        ) : null}
        {presentation.subtitle && presentation.subtitleStyle ? (
          <KineticText
            text={presentation.subtitle}
            motionId={motionId}
            localTime={Math.max(0, local - 0.12)}
            style={{ ...styleMap(presentation.subtitleStyle, frameHeight), marginTop: 4 }}
          />
        ) : null}
      </div>
    </div>
  )
}
