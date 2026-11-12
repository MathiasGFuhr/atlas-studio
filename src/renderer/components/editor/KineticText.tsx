import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import gsap from 'gsap'
import {
  editorTextMotionById,
  type EditorTextMotionId,
} from '@shared/editor/textMotionsCatalog'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*<>'

function splitUnits(text: string, mode: 'char' | 'word' | 'line'): string[] {
  if (mode === 'word') return text.split(/(\s+)/).filter((part) => part.length > 0)
  if (mode === 'line') return text.split('\n')
  return Array.from(text)
}

function scrambleChar(seed: number): string {
  return GLYPHS[Math.abs(seed) % GLYPHS.length] ?? '#'
}

/**
 * Texto cinético time-based (scrub-safe) com GSAP + split manual.
 * Inspirado em React Bits, Remotion Bits AnimatedText e GSAP SplitText.
 */
export function KineticText({
  text,
  motionId,
  localTime,
  style,
  className,
}: {
  text: string
  motionId: EditorTextMotionId | null | undefined
  localTime: number
  style?: CSSProperties
  className?: string
}) {
  const rootRef = useRef<HTMLParagraphElement>(null)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const motion = editorTextMotionById(motionId) ?? editorTextMotionById('none')!
  const effectiveId = motion.id === 'none' || !text ? 'none' : motion.id

  const units = useMemo(() => {
    if (effectiveId === 'none' || effectiveId === 'typewriter' || effectiveId === 'glitch-in') {
      return [text]
    }
    return splitUnits(text, motion.split === 'none' ? 'char' : motion.split)
  }, [effectiveId, motion.split, text])

  useLayoutEffect(() => {
    const root = rootRef.current
    timelineRef.current?.kill()
    timelineRef.current = null
    if (!root || effectiveId === 'none') return

    const parts = root.querySelectorAll<HTMLElement>('[data-kt]')
    if (parts.length === 0 && effectiveId !== 'typewriter' && effectiveId !== 'glitch-in') return

    const tl = gsap.timeline({ paused: true })
    const dur = Math.max(0.35, motion.duration)

    if (effectiveId === 'typewriter') {
      const full = text
      const proxy = { n: 0 }
      root.textContent = ''
      tl.to(proxy, {
        n: full.length,
        duration: dur,
        ease: 'none',
        onUpdate: () => {
          const count = Math.floor(proxy.n)
          const shown = full.slice(0, count)
          const caret = count < full.length && Math.floor(proxy.n * 8) % 2 === 0 ? '|' : ''
          root.textContent = shown + caret
        },
      })
    } else if (effectiveId === 'glitch-in') {
      gsap.set(root, { opacity: 0, x: -6 })
      tl.to(root, { opacity: 1, x: 0, duration: dur * 0.35, ease: 'power2.out' })
      tl.to(
        root,
        {
          keyframes: [
            { x: 4, textShadow: '-2px 0 #f0f, 2px 0 #0ff', duration: dur * 0.12 },
            { x: -3, textShadow: '2px 0 #f0f, -2px 0 #0ff', duration: dur * 0.12 },
            { x: 2, textShadow: '-1px 0 #f0f, 1px 0 #0ff', duration: dur * 0.12 },
            { x: 0, textShadow: 'none', duration: dur * 0.2 },
          ],
        },
        0.05,
      )
    } else if (effectiveId === 'decrypt' || effectiveId === 'shuffle' || effectiveId === 'matrix-reveal') {
      const originals = units.map((unit) => unit)
      parts.forEach((el, index) => {
        const original = originals[index] ?? ''
        if (/^\s+$/.test(original)) {
          el.textContent = original
          return
        }
        const proxy = { t: 0 }
        el.textContent = original
          .split('')
          .map((_, i) => scrambleChar(index * 17 + i))
          .join('')
        tl.to(
          proxy,
          {
            t: 1,
            duration: dur * 0.7,
            delay: index * (dur / Math.max(parts.length, 1)) * 0.55,
            ease: 'none',
            onUpdate: () => {
              if (proxy.t < 0.85) {
                el.textContent = original
                  .split('')
                  .map((ch, i) => (/\s/.test(ch) ? ch : scrambleChar(index * 31 + i + Math.floor(proxy.t * 40))))
                  .join('')
              } else {
                el.textContent = original
              }
            },
          },
          0,
        )
        tl.fromTo(
          el,
          { opacity: 0.25, y: effectiveId === 'matrix-reveal' ? -10 : 0 },
          { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' },
          index * 0.03,
        )
      })
    } else if (effectiveId === 'blur-in' || effectiveId === 'word-by-word') {
      gsap.set(parts, { opacity: 0, y: 18, filter: 'blur(10px)' })
      tl.to(parts, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.45,
        stagger: dur / Math.max(parts.length, 1),
        ease: 'power3.out',
      })
    } else if (effectiveId === 'slide-left-words') {
      gsap.set(parts, { opacity: 0, x: -28 })
      tl.to(parts, {
        opacity: 1,
        x: 0,
        duration: 0.4,
        stagger: dur / Math.max(parts.length, 1),
        ease: 'power3.out',
      })
    } else if (effectiveId === 'stagger-scale') {
      gsap.set(parts, { opacity: 0, scale: 0 })
      tl.to(parts, {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        stagger: dur / Math.max(parts.length, 1),
        ease: 'back.out(1.7)',
      })
    } else if (effectiveId === 'elastic-chars') {
      gsap.set(parts, { opacity: 0, y: 36 })
      tl.to(parts, {
        opacity: 1,
        y: 0,
        duration: 0.55,
        stagger: dur / Math.max(parts.length, 1),
        ease: 'elastic.out(1, 0.55)',
      })
    } else if (effectiveId === 'fade-lines') {
      gsap.set(parts, { opacity: 0, y: 12 })
      tl.to(parts, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: dur / Math.max(parts.length, 1),
        ease: 'power2.out',
      })
    } else if (effectiveId === 'stagger-up' || effectiveId === 'split-chars' || effectiveId === 'split-words') {
      gsap.set(parts, { opacity: 0, y: 24 })
      tl.to(parts, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: dur / Math.max(parts.length, 1),
        ease: 'power3.out',
      })
    }

    timelineRef.current = tl
    return () => {
      tl.kill()
      if (timelineRef.current === tl) timelineRef.current = null
    }
  }, [effectiveId, motion.duration, text, units])

  useLayoutEffect(() => {
    const tl = timelineRef.current
    if (!tl) return
    const end = Math.max(tl.duration(), 0.001)
    tl.seek(Math.max(0, Math.min(localTime, end)))
  }, [localTime, effectiveId, text])

  if (!text) return null

  if (effectiveId === 'none') {
    return (
      <p className={className} style={style}>
        {text}
      </p>
    )
  }

  if (effectiveId === 'typewriter' || effectiveId === 'glitch-in') {
    return <p ref={rootRef} className={className} style={{ ...style, display: 'inline-block' }} />
  }

  return (
    <p
      ref={rootRef}
      className={className}
      style={{ ...style, display: 'inline-block' }}
      aria-label={text}
    >
      {units.map((unit, index) => (
        <span
          key={`${index}-${unit}`}
          data-kt=""
          style={{
            display: motion.split === 'line' ? 'block' : 'inline-block',
            whiteSpace: /^\s+$/.test(unit) ? 'pre' : undefined,
          }}
        >
          {unit === ' ' ? '\u00A0' : unit}
        </span>
      ))}
    </p>
  )
}
