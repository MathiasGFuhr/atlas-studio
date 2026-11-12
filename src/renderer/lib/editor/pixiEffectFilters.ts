import type { Filter } from 'pixi.js'
import {
  AdjustmentFilter,
  AdvancedBloomFilter,
  AsciiFilter,
  BevelFilter,
  BulgePinchFilter,
  CRTFilter,
  ColorOverlayFilter,
  CrossHatchFilter,
  DotFilter,
  DropShadowFilter,
  EmbossFilter,
  GlitchFilter,
  GlowFilter,
  GodrayFilter,
  GrayscaleFilter,
  HslAdjustmentFilter,
  KawaseBlurFilter,
  MotionBlurFilter,
  OldFilmFilter,
  OutlineFilter,
  PixelateFilter,
  RGBSplitFilter,
  RadialBlurFilter,
  ReflectionFilter,
  ShockwaveFilter,
  SimplexNoiseFilter,
  TiltShiftFilter,
  TwistFilter,
  ZoomBlurFilter,
} from 'pixi-filters'
import type { EditorEffectId } from '@shared/editor/effectsCatalog'

/** Cria o filtro Pixi correspondente ao efeito do catálogo (preview GPU). */
export function createPixiEffectFilter(id: EditorEffectId, intensity = 1): Filter | null {
  const t = Math.max(0, Math.min(2, intensity))
  switch (id) {
    case 'adjustment':
    case 'pixi-adjustment':
      return new AdjustmentFilter({
        brightness: 1 + 0.08 * t,
        contrast: 1 + 0.12 * t,
        saturation: 1 + 0.18 * t,
      })
    case 'hsl':
    case 'pixi-hsl':
      return new HslAdjustmentFilter({
        hue: 8 * t,
        saturation: 0.2 * t,
        lightness: 0,
        colorize: false,
        alpha: 1,
      })
    case 'grayscale':
    case 'pixi-grayscale':
    case 'bw-soft':
    case 'bw-hard':
      return new GrayscaleFilter()
    case 'blur':
    case 'blur-soft':
    case 'pixi-kawase':
      return new KawaseBlurFilter({ strength: (id === 'blur-soft' ? 2 : 4) * t })
    case 'blur-heavy':
      return new KawaseBlurFilter({ strength: 10 * t })
    case 'bloom':
    case 'pixi-bloom-adv':
    case 'soft-glow':
      return new AdvancedBloomFilter({ bloomScale: 0.8 * t, brightness: 1 + 0.1 * t })
    case 'glow':
    case 'pixi-glow':
      return new GlowFilter({ distance: 12 * t, outerStrength: 2 * t, color: 0xffffff })
    case 'old-film':
    case 'pixi-old-film':
    case 'super8':
      return new OldFilmFilter({ sepia: 0.3 * t, noise: 0.2 * t, vignetting: 0.25 * t })
    case 'crt':
    case 'pixi-crt':
    case 'bits-crt-warp':
      return new CRTFilter({ curvature: 1.2 * t, lineWidth: 1.2, vignetting: 0.3 * t })
    case 'glitch':
    case 'pixi-glitch':
    case 'glitch-hard':
      return new GlitchFilter({ offset: (id === 'glitch-hard' ? 18 : 12) * t, fillMode: 2 })
    case 'pixelate':
    case 'pixi-pixelate':
      return new PixelateFilter(Math.max(1, 6 * t))
    case 'rgb-split':
    case 'pixi-rgb':
      return new RGBSplitFilter({
        red: { x: 4 * t, y: 0 },
        green: { x: 0, y: 0 },
        blue: { x: -4 * t, y: 0 },
      })
    case 'tilt-shift':
    case 'pixi-tilt':
      return new TiltShiftFilter({ blur: 8 * t })
    case 'godray':
    case 'pixi-godray':
    case 'bits-light-rays':
      return new GodrayFilter({ gain: 0.4 * t, lacunarity: 2.2 })
    case 'shockwave':
    case 'pixi-shockwave':
      return new ShockwaveFilter({ amplitude: 30 * t, wavelength: 160, speed: 200 })
    case 'zoom-blur':
    case 'pixi-zoom-blur':
      return new ZoomBlurFilter({ strength: 0.2 * t })
    case 'twist':
    case 'pixi-twist':
      return new TwistFilter({ angle: 4 * t, radius: 200 })
    case 'pixi-ascii':
      return new AsciiFilter({ size: Math.max(4, 8 * t) })
    case 'pixi-dot':
    case 'halftone':
      return new DotFilter({ scale: 1, angle: 5 })
    case 'pixi-emboss':
    case 'emboss':
      return new EmbossFilter(Math.max(1, 4 * t))
    case 'pixi-outline':
      return new OutlineFilter(Math.max(1, 2 * t), 0xffffff, 0.2)
    case 'pixi-bevel':
      return new BevelFilter({
        lightColor: 0xffffff,
        lightAlpha: 0.7 * t,
        shadowColor: 0x000000,
        shadowAlpha: 0.6 * t,
        thickness: Math.max(1, 3 * t),
      })
    case 'pixi-motion-blur':
      return new MotionBlurFilter({ velocity: { x: 12 * t, y: 0 }, kernelSize: 9 })
    case 'pixi-radial-blur':
      return new RadialBlurFilter({ angle: Math.max(1, 8 * t), center: { x: 0.5, y: 0.5 }, kernelSize: 9 })
    case 'pixi-bulge':
      return new BulgePinchFilter({ radius: 180, strength: 0.55 * t })
    case 'pixi-reflection':
    case 'mirror-feel':
      return new ReflectionFilter({ mirror: true, boundary: 0.55, amplitude: [0, 8 * t] })
    case 'pixi-crosshatch':
    case 'sketch':
      return new CrossHatchFilter()
    case 'pixi-noise':
    case 'noise-grain':
      return new SimplexNoiseFilter({ strength: 0.25 * t })
    case 'pixi-color-overlay':
      return new ColorOverlayFilter({ color: 0xe11d48, alpha: 0.28 * t })
    case 'pixi-drop-shadow':
      return new DropShadowFilter({
        offset: { x: 4 * t, y: 6 * t },
        blur: 3 * t,
        alpha: 0.55,
        color: 0x000000,
      })
    default:
      return null
  }
}

/** Lista de IDs com implementação Pixi GPU. */
export function hasPixiEffectFilter(id: string): boolean {
  return createPixiEffectFilter(id, 1) != null
}
