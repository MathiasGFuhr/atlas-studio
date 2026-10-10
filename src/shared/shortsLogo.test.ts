import { describe, expect, it } from 'vitest'
import {
  applyLogoPosition,
  buildLogoOverlayFilter,
  DEFAULT_LOGO_SETTINGS,
  logoPreviewStyle,
  normalizeLogoSettings,
} from './shortsLogo'

describe('shortsLogo', () => {
  it('normaliza settings e exige imagem para enabled', () => {
    expect(normalizeLogoSettings(null)).toEqual(DEFAULT_LOGO_SETTINGS)
    expect(
      normalizeLogoSettings({
        enabled: true,
        imagePath: 'C:\\\\cache\\\\logo.png',
        position: 'top_right',
        opacity: 0.7,
        scale: 0.4,
      }),
    ).toMatchObject({
      enabled: true,
      position: 'top_right',
      x: 0.82,
      y: 0.12,
      opacity: 0.7,
      scale: 0.4,
    })
    expect(normalizeLogoSettings({ enabled: true, imagePath: '' }).enabled).toBe(false)
  })

  it('aplica presets e mantém custom', () => {
    const custom = applyLogoPosition(
      { ...DEFAULT_LOGO_SETTINGS, enabled: true, imagePath: 'a.png', x: 0.3, y: 0.7 },
      'custom',
    )
    expect(custom.position).toBe('custom')
    expect(custom.x).toBe(0.3)
    expect(applyLogoPosition(custom, 'center')).toMatchObject({ position: 'center', x: 0.5, y: 0.5 })
  })

  it('monta estilo de preview e filtro de overlay', () => {
    const style = logoPreviewStyle({ x: 0.5, y: 0.5, opacity: 0.4, scale: 0.3 })
    expect(style.left).toBe('50%')
    expect(style.width).toBe('30%')
    expect(style.opacity).toBe(0.4)

    const filter = buildLogoOverlayFilter({
      baseLabel: 'vout',
      logoInputIndex: 1,
      outputLabel: 'vlogo',
      opacity: 0.5,
      x: 0.5,
      y: 0.5,
      scale: 0.3,
      outputWidth: 1080,
    })
    expect(filter).toContain('[1:v]format=rgba')
    expect(filter).toContain('colorchannelmixer=aa=0.500')
    expect(filter).toContain('scale=324:-1')
    expect(filter).toContain('[vout][logo]overlay=')
    expect(filter).toContain('[vlogo]')
  })
})
