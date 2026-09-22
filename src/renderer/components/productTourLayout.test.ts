import { describe, expect, it } from 'vitest'
import { placeTourCard, type TourRect } from './productTourLayout'

const viewport = { width: 1440, height: 900 }
const card = { width: 420, height: 320 }

function rect(partial: Pick<TourRect, 'top' | 'left' | 'width' | 'height'>): TourRect {
  return {
    ...partial,
    right: partial.left + partial.width,
    bottom: partial.top + partial.height,
  }
}

describe('placeTourCard', () => {
  it('centraliza o cartão quando não há alvo', () => {
    const pos = placeTourCard(null, card.width, card.height, viewport)
    expect(pos.left).toBe(Math.round((viewport.width - card.width) / 2))
    expect(pos.top).toBe(Math.round((viewport.height - card.height) / 2))
  })

  it('coloca o cartão à direita de um menu alto', () => {
    const pos = placeTourCard(rect({ top: 0, left: 0, width: 248, height: 900 }), card.width, card.height, viewport)
    expect(pos.left).toBeGreaterThan(248)
    expect(pos.top).toBeGreaterThan(20)
    expect(pos.top + card.height).toBeLessThan(viewport.height)
  })

  it('coloca o cartão abaixo de uma barra superior larga', () => {
    const pos = placeTourCard(rect({ top: 0, left: 248, width: 1192, height: 68 }), card.width, card.height, viewport)
    expect(pos.top).toBeGreaterThan(68)
    expect(pos.left).toBeGreaterThan(0)
    expect(pos.left + card.width).toBeLessThanOrEqual(viewport.width)
  })

  it('aproxima o cartão de um alvo no canto inferior esquerdo', () => {
    const target = rect({ top: 820, left: 16, width: 220, height: 52 })
    const pos = placeTourCard(target, card.width, card.height, viewport)
    const overlaps =
      pos.left < target.right &&
      pos.left + card.width > target.left &&
      pos.top < target.bottom &&
      pos.top + card.height > target.top
    expect(overlaps).toBe(false)
    expect(pos.left).toBeGreaterThan(target.right)
    expect(pos.left).toBeLessThan(target.right + 48)
  })

  it('não cobre o botão de chat no canto', () => {
    const target = rect({ top: 820, left: 1368, width: 48, height: 48 })
    const pos = placeTourCard(target, card.width, card.height, viewport)
    const overlaps =
      pos.left < target.right &&
      pos.left + card.width > target.left &&
      pos.top < target.bottom &&
      pos.top + card.height > target.top
    expect(overlaps).toBe(false)
    expect(pos.top).toBeGreaterThanOrEqual(20)
    expect(pos.left).toBeGreaterThanOrEqual(20)
  })
})
