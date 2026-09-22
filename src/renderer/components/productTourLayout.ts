export type TourRect = {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

export function placeTourCard(
  rect: TourRect | null,
  cardWidth: number,
  cardHeight: number,
  viewport = { width: window.innerWidth, height: window.innerHeight },
): { top: number; left: number } {
  const margin = 20
  const gap = 18
  const { width: vw, height: vh } = viewport
  const maxLeft = Math.max(margin, vw - cardWidth - margin)
  const maxTop = Math.max(margin, vh - cardHeight - margin)

  function clamp(top: number, left: number) {
    return {
      top: Math.round(Math.min(Math.max(margin, top), maxTop)),
      left: Math.round(Math.min(Math.max(margin, left), maxLeft)),
    }
  }

  if (!rect || vw < 760) {
    return clamp((vh - cardHeight) / 2, (vw - cardWidth) / 2)
  }

  const target = rect

  if (target.width > vw * 0.5 && target.height < 160) {
    return clamp(target.bottom + gap, target.left + (target.width - cardWidth) / 2)
  }

  if (target.height > vh * 0.65 && target.right + gap + cardWidth <= vw - margin) {
    return clamp((vh - cardHeight) / 2, target.right + gap)
  }

  const candidates = [
    { top: target.top, left: target.right + gap },
    { top: target.top + target.height / 2 - cardHeight / 2, left: target.right + gap },
    { top: target.top + target.height / 2 - cardHeight / 2, left: target.left - gap - cardWidth },
    { top: target.top - gap - cardHeight, left: target.right - cardWidth },
    { top: target.bottom + gap, left: target.left },
    { top: target.top - gap - cardHeight, left: target.left },
  ]

  function overlaps(point: { top: number; left: number }) {
    const pad = 8
    const card = {
      left: point.left,
      top: point.top,
      right: point.left + cardWidth,
      bottom: point.top + cardHeight,
    }
    return !(
      card.right < target.left - pad ||
      card.left > target.right + pad ||
      card.bottom < target.top - pad ||
      card.top > target.bottom + pad
    )
  }

  for (const point of candidates) {
    const placed = clamp(point.top, point.left)
    if (!overlaps(placed)) return placed
  }

  return clamp(target.top - gap - cardHeight, target.left)
}
