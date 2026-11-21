import { describe, expect, it } from 'vitest'
import {
  MUSIC_COVER_SIZE,
  buildCoverOutputFilename,
  clampCoverZoom,
  computeCoverDrawLayout,
  isLowResolutionCover,
} from './musicCover'

describe('musicCover', () => {
  it('preenche 1400x1400 sem bordas vazias e limita o arraste ao tamanho excedente', () => {
    // Imagem 16:9 (1920x1080): em zoom 100%, altura vira 1400 e largura excede para pan horizontal
    const layout = computeCoverDrawLayout({
      naturalWidth: 1920,
      naturalHeight: 1080,
      zoom: 1,
      offsetX: 9999,
      offsetY: 9999,
    })
    expect(Math.round(layout.drawHeight)).toBe(MUSIC_COVER_SIZE)
    expect(layout.drawWidth).toBeGreaterThan(MUSIC_COVER_SIZE)
    expect(layout.maxOffsetY).toBe(0)
    expect(layout.clampedOffsetY).toBe(0)
    expect(layout.clampedOffsetX).toBeCloseTo(layout.maxOffsetX, 4)
    expect(layout.drawX).toBeCloseTo(0, 4)
  })

  it('amplia proporcionalmente ao aumentar o zoom e permite pan nos dois eixos', () => {
    const layout = computeCoverDrawLayout({
      naturalWidth: 1400,
      naturalHeight: 1400,
      zoom: 2,
      offsetX: -300,
      offsetY: 250,
    })
    expect(layout.drawWidth).toBe(2800)
    expect(layout.drawHeight).toBe(2800)
    expect(layout.maxOffsetX).toBe(700)
    expect(layout.maxOffsetY).toBe(700)
    expect(layout.clampedOffsetX).toBe(-300)
    expect(layout.clampedOffsetY).toBe(250)
  })

  it('limita o zoom mínimo/máximo e detecta resolução baixa', () => {
    expect(clampCoverZoom(0.2)).toBe(1)
    expect(clampCoverZoom(10)).toBe(3)
    expect(isLowResolutionCover(1024, 1024)).toBe(true)
    expect(isLowResolutionCover(1400, 1399)).toBe(true)
    expect(isLowResolutionCover(1400, 1400)).toBe(false)
    expect(isLowResolutionCover(2048, 2048)).toBe(false)
  })

  it('gera nome limpo de saída em JPG 1400x1400', () => {
    expect(buildCoverOutputFilename('Teu Nome é a Minha Vitória.png')).toBe(
      'Teu Nome é a Minha Vitória-1400x1400.jpg',
    )
    expect(buildCoverOutputFilename('')).toBe('capa-musica-1400x1400.jpg')
  })
})
