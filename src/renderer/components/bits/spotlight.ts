import type { PointerEvent } from 'react'

/**
 * React Bits · SpotlightCard (versão leve).
 * Apenas grava a posição do cursor em CSS vars — nenhum setState, nenhum re-render.
 * Use junto com a classe `atlas-spotlight` (globals.css).
 */
export function spotlightMove(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse') return
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
  el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
}
