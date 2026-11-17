import { useLayoutEffect, useRef } from 'react'

const formatter = new Intl.NumberFormat('pt-BR')

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * React Bits · CountUp.
 * Anima direto no nó de texto via rAF (sem re-render por frame) e parte do valor
 * anterior quando o número muda — a contagem nunca "pula" para zero.
 * O span não tem filhos React: o texto é sempre escrito pelo efeito.
 */
export function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const fromRef = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = fromRef.current
    const to = value
    const write = (n: number) => {
      fromRef.current = n
      el.textContent = formatter.format(n)
    }
    if (from === to || prefersReducedMotion() || !Number.isFinite(to)) {
      write(to)
      return
    }
    write(from)
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t) // easeOutExpo
      write(t === 1 ? to : Math.round(from + (to - from) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span ref={ref} className={className} title={formatter.format(value)} />
}
