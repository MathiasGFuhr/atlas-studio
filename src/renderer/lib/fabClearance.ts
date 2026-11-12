/** Espaço inferior reservado (ex.: timeline do editor) para FABs flutuantes. */
const CSS_VAR = '--atlas-fab-bottom'
const EVENT = 'atlas-fab-clearance'

export function setFabBottomClearance(px: number) {
  const value = Math.max(0, Math.round(px))
  document.documentElement.style.setProperty(CSS_VAR, `${value}px`)
  window.dispatchEvent(new Event(EVENT))
}

export function clearFabBottomClearance() {
  document.documentElement.style.removeProperty(CSS_VAR)
  window.dispatchEvent(new Event(EVENT))
}

export function getFabBottomClearance(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(CSS_VAR).trim()
  if (!raw) return 0
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function subscribeFabBottomClearance(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  window.addEventListener('resize', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('resize', listener)
  }
}
