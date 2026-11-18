import {
  type EditorAnimationSource,
  EDITOR_ANIMATION_SOURCE_LABEL,
  EDITOR_ANIMATION_SOURCE_ORDER,
} from './animationSources'

export type EditorAnimationKind = 'in' | 'out' | 'combo'

export type EditorAnimationCategory = 'trending' | 'basic' | 'zoom-shake' | 'light-glitch' | '3d-mask'

export const EDITOR_ANIMATION_CATEGORY_LABEL: Record<EditorAnimationCategory, string> = {
  trending: 'Em alta',
  basic: 'Básico',
  'zoom-shake': 'Zoom & Shake',
  'light-glitch': 'Luz & Glitch',
  '3d-mask': '3D & Máscara',
}

export const EDITOR_ANIMATION_CATEGORY_ORDER: EditorAnimationCategory[] = [
  'trending',
  'basic',
  'zoom-shake',
  'light-glitch',
  '3d-mask',
]

export type EditorAnimationCssState = {
  opacity: number
  /** CSS transform (sem scale do clipe). */
  transform: string
  filter?: string
  clipPath?: string
}

export type EditorAnimationDef = {
  id: string
  kind: EditorAnimationKind
  category: EditorAnimationCategory
  label: string
  description: string
  source: EditorAnimationSource
  /** Preview da biblioteca (keyframes CSS fallback). */
  previewAnimation: string
  /**
   * Estado visual no progresso 0–1.
   * Entrada: 0 = fora, 1 = normal. Saída: 0 = normal, 1 = fora. Combo: ciclo 0–1.
   */
  css: (progress: number) => EditorAnimationCssState
  /**
   * Dica FFmpeg: fade | slide-left | slide-right | slide-up | slide-down | zoom-in | zoom-out | none
   */
  ffmpegHint: 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'none'
}

export { EDITOR_ANIMATION_SOURCE_LABEL, EDITOR_ANIMATION_SOURCE_ORDER }
export type { EditorAnimationSource }

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function easeOutCubic(t: number): number {
  const p = clamp01(t)
  return 1 - (1 - p) ** 3
}

function easeInCubic(t: number): number {
  const p = clamp01(t)
  return p ** 3
}

function easeOutExpo(t: number): number {
  const p = clamp01(t)
  return p === 1 ? 1 : 1 - 2 ** (-10 * p)
}

function easeOutBack(t: number): number {
  const p = clamp01(t)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
}

function easeOutBounce(t: number): number {
  const p = clamp01(t)
  const n1 = 7.5625
  const d1 = 2.75
  if (p < 1 / d1) return n1 * p * p
  if (p < 2 / d1) return n1 * (p - 1.5 / d1) ** 2 + 0.75
  if (p < 2.5 / d1) return n1 * (p - 2.25 / d1) ** 2 + 0.9375
  return n1 * (p - 2.625 / d1) ** 2 + 0.984375
}

function spring(t: number): number {
  const p = clamp01(t)
  return 1 - Math.exp(-6 * p) * Math.cos(p * Math.PI * 3.2)
}

export const EDITOR_DEFAULT_ANIM_IN_DURATION = 0.6
export const EDITOR_DEFAULT_ANIM_OUT_DURATION = 0.6

function a(
  partial: Omit<EditorAnimationDef, 'source'> & { source?: EditorAnimationSource },
): EditorAnimationDef {
  return { source: 'atlas', ...partial }
}

export const EDITOR_ANIMATIONS: EditorAnimationDef[] = [
  // ======================== ENTRADA (IN) ========================
  a({
    id: 'in-fade',
    kind: 'in',
    category: 'basic',
    label: 'Fade-in',
    description: 'Aparece suavemente',
    previewAnimation: 'atlas-anim-fade-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => ({ opacity: easeOutCubic(p), transform: 'none' }),
  }),
  a({
    id: 'in-zoom',
    kind: 'in',
    category: 'trending',
    label: 'Zoom In',
    description: 'Aproxima rápido do centro',
    source: 'gsap',
    previewAnimation: 'atlas-anim-zoom-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.5), transform: `scale(${0.55 + 0.45 * t})` }
    },
  }),
  a({
    id: 'in-zoom-out',
    kind: 'in',
    category: 'trending',
    label: 'Zoom Out',
    description: 'Começa ampliado e encaixa no quadro',
    source: 'gsap',
    previewAnimation: 'atlas-anim-zoom-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.5), transform: `scale(${1.45 - 0.45 * t})` }
    },
  }),
  a({
    id: 'in-rock-vertically',
    kind: 'in',
    category: 'trending',
    label: 'Rock Vertically',
    description: 'Balanço vertical intenso com impacto',
    source: 'gsap',
    previewAnimation: 'atlas-anim-float 0.8s ease-out infinite',
    ffmpegHint: 'slide-up',
    css: (p) => {
      const decay = 1 - easeOutCubic(p)
      const y = Math.sin(p * Math.PI * 5) * 14 * decay
      return {
        opacity: Math.min(1, p * 2.8),
        transform: `translateY(${y.toFixed(1)}%) scale(${1 + 0.08 * decay})`,
      }
    },
  }),
  a({
    id: 'in-rock-horizontally',
    kind: 'in',
    category: 'zoom-shake',
    label: 'Rock Horizontally',
    description: 'Balanço lateral rápido estilo batida',
    source: 'gsap',
    previewAnimation: 'atlas-anim-wobble 0.8s ease-out infinite',
    ffmpegHint: 'slide-left',
    css: (p) => {
      const decay = 1 - easeOutCubic(p)
      const x = Math.sin(p * Math.PI * 5) * 14 * decay
      return {
        opacity: Math.min(1, p * 2.8),
        transform: `translateX(${x.toFixed(1)}%) scale(${1 + 0.08 * decay})`,
      }
    },
  }),
  a({
    id: 'in-shake',
    kind: 'in',
    category: 'trending',
    label: 'Shake Vertical',
    description: 'Entra com tremor rápido de câmera',
    source: 'anime',
    previewAnimation: 'atlas-anim-wobble 0.6s ease-in-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const decay = 1 - easeOutCubic(p)
      const x = Math.sin(p * Math.PI * 10) * 5 * decay
      const y = Math.cos(p * Math.PI * 8) * 4 * decay
      const r = Math.sin(p * Math.PI * 10) * 2.8 * decay
      return {
        opacity: Math.min(1, p * 3),
        transform: `translate(${x.toFixed(1)}%, ${y.toFixed(1)}%) rotate(${r.toFixed(1)}deg) scale(${1 + 0.08 * decay})`,
      }
    },
  }),
  a({
    id: 'in-swing-top',
    kind: 'in',
    category: 'trending',
    label: 'Pêndulo Topo',
    description: 'Balança a partir do topo até estabilizar',
    source: 'anime',
    previewAnimation: 'atlas-anim-sway 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const decay = 1 - easeOutCubic(p)
      const deg = Math.sin(p * Math.PI * 3.5) * 16 * decay
      return { opacity: Math.min(1, p * 2.5), transform: `rotate(${deg.toFixed(1)}deg)` }
    },
  }),
  a({
    id: 'in-bounce',
    kind: 'in',
    category: 'zoom-shake',
    label: 'Bounce',
    description: 'Quica com gravidade ao entrar',
    source: 'anime',
    previewAnimation: 'atlas-anim-pop-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = easeOutBounce(p)
      return { opacity: Math.min(1, p * 3), transform: `translateY(${((1 - t) * -35).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'in-pop',
    kind: 'in',
    category: 'zoom-shake',
    label: 'Pop Elástico',
    description: 'Salto elástico com mola',
    source: 'motion',
    previewAnimation: 'atlas-anim-pop-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = spring(p)
      return { opacity: Math.min(1, p * 2.8), transform: `scale(${(0.45 + 0.55 * t).toFixed(3)})` }
    },
  }),
  a({
    id: 'in-slide-left',
    kind: 'in',
    category: 'basic',
    label: 'Deslizar ←',
    description: 'Entra deslizando pela direita',
    previewAnimation: 'atlas-anim-slide-left 1.2s ease-out infinite',
    ffmpegHint: 'slide-left',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateX(${((1 - t) * 50).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'in-slide-right',
    kind: 'in',
    category: 'basic',
    label: 'Deslizar →',
    description: 'Entra deslizando pela esquerda',
    previewAnimation: 'atlas-anim-slide-right 1.2s ease-out infinite',
    ffmpegHint: 'slide-right',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateX(${((1 - t) * -50).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'in-slide-up',
    kind: 'in',
    category: 'basic',
    label: 'Deslizar ↑',
    description: 'Sobe por baixo com desaceleração',
    previewAnimation: 'atlas-anim-slide-up 1.2s ease-out infinite',
    ffmpegHint: 'slide-up',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateY(${((1 - t) * 42).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'in-slide-down',
    kind: 'in',
    category: 'basic',
    label: 'Deslizar ↓',
    description: 'Desce por cima com desaceleração',
    previewAnimation: 'atlas-anim-slide-down 1.2s ease-out infinite',
    ffmpegHint: 'slide-down',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateY(${((1 - t) * -42).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'in-flash-white',
    kind: 'in',
    category: 'light-glitch',
    label: 'Flash Branco',
    description: 'Clarão intenso que revela a imagem',
    source: 'pixi',
    previewAnimation: 'atlas-anim-fade-in 1.0s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutCubic(p)
      const bright = 1 + (1 - t) * 2.2
      return { opacity: Math.min(1, p * 3), transform: 'none', filter: `brightness(${bright.toFixed(2)})` }
    },
  }),
  a({
    id: 'in-blur',
    kind: 'in',
    category: 'light-glitch',
    label: 'Fade Desfocado',
    description: 'Entra desfocado e ganha nitidez',
    source: 'react-bits',
    previewAnimation: 'atlas-anim-fade-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutCubic(p)
      return {
        opacity: t,
        transform: `scale(${(1.08 - 0.08 * t).toFixed(3)})`,
        filter: `blur(${((1 - t) * 12).toFixed(1)}px)`,
      }
    },
  }),
  a({
    id: 'in-glitch',
    kind: 'in',
    category: 'light-glitch',
    label: 'Glitch',
    description: 'Corte digital RGB ao entrar',
    source: 'react-bits',
    previewAnimation: 'atlas-anim-wobble 0.8s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const jitter = p < 0.75 ? Math.sin(p * 42) * (1 - p) * 14 : 0
      const sat = p < 0.75 ? 1.85 : 1
      return {
        opacity: Math.min(1, p * 2.8),
        transform: `translateX(${jitter.toFixed(1)}px) skewX(${(jitter * 0.45).toFixed(1)}deg)`,
        filter: `saturate(${sat}) contrast(${p < 0.75 ? 1.35 : 1})`,
      }
    },
  }),
  a({
    id: 'in-tv-on',
    kind: 'in',
    category: '3d-mask',
    label: 'TV Ligando',
    description: 'Abre a partir de uma linha central CRT',
    source: 'pixi',
    previewAnimation: 'atlas-anim-fade-in 1.0s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutExpo(p)
      const insetY = ((1 - t) * 48).toFixed(1)
      return {
        opacity: Math.min(1, p * 4),
        transform: `scaleX(${(0.85 + 0.15 * t).toFixed(3)})`,
        clipPath: `inset(${insetY}% 0% ${insetY}% 0%)`,
        filter: `brightness(${(1 + (1 - t) * 0.9).toFixed(2)})`,
      }
    },
  }),
  a({
    id: 'in-circle-open',
    kind: 'in',
    category: '3d-mask',
    label: 'Íris Abrindo',
    description: 'Revelação circular a partir do centro',
    previewAnimation: 'atlas-anim-zoom-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = easeOutCubic(p)
      return {
        opacity: Math.min(1, p * 3),
        transform: 'none',
        clipPath: `circle(${(t * 75).toFixed(1)}% at 50% 50%)`,
      }
    },
  }),
  a({
    id: 'in-wipe-right',
    kind: 'in',
    category: '3d-mask',
    label: 'Cortina →',
    description: 'Revela da esquerda para a direita',
    previewAnimation: 'atlas-anim-slide-right 1.2s ease-out infinite',
    ffmpegHint: 'slide-right',
    css: (p) => {
      const t = easeOutExpo(p)
      return {
        opacity: 1,
        transform: 'none',
        clipPath: `inset(0% ${((1 - t) * 100).toFixed(1)}% 0% 0%)`,
      }
    },
  }),
  a({
    id: 'in-flip',
    kind: 'in',
    category: '3d-mask',
    label: 'Flip 3D',
    description: 'Gira em perspectiva 3D para aparecer',
    source: 'three',
    previewAnimation: 'atlas-anim-spin-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `perspective(800px) rotateY(${((1 - t) * 85).toFixed(1)}deg)` }
    },
  }),
  a({
    id: 'in-spin',
    kind: 'in',
    category: '3d-mask',
    label: 'Girar Entrada',
    description: 'Rotaciona e amplia ao entrar',
    previewAnimation: 'atlas-anim-spin-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutBack(p)
      return {
        opacity: Math.min(1, p * 2),
        transform: `rotate(${((1 - t) * -28).toFixed(1)}deg) scale(${(0.75 + 0.25 * t).toFixed(3)})`,
      }
    },
  }),

  // ======================== SAÍDA (OUT) ========================
  a({
    id: 'out-fade',
    kind: 'out',
    category: 'trending',
    label: 'Fade-out',
    description: 'Desaparece suavemente',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => ({ opacity: 1 - easeInCubic(p), transform: 'none' }),
  }),
  a({
    id: 'out-black-hole',
    kind: 'out',
    category: 'trending',
    label: 'Buraco negro',
    description: 'Gira e é sugado para o centro',
    source: 'gsap',
    previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return {
        opacity: 1 - t,
        transform: `scale(${(1 - 0.92 * t).toFixed(3)}) rotate(${(t * 160).toFixed(1)}deg)`,
        clipPath: `circle(${(75 - t * 72).toFixed(1)}% at 50% 50%)`,
      }
    },
  }),
  a({
    id: 'out-tv-off',
    kind: 'out',
    category: 'trending',
    label: 'TV desligada',
    description: 'Fecha em faixa luminosa como TV antiga',
    source: 'pixi',
    previewAnimation: 'atlas-anim-pop-out 1.0s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeInCubic(p)
      const insetY = (t * 49).toFixed(1)
      return {
        opacity: 1 - t * 0.85,
        transform: `scaleX(${(1 - t * 0.35).toFixed(3)})`,
        clipPath: `inset(${insetY}% 0% ${insetY}% 0%)`,
        filter: `brightness(${(1 + t * 1.4).toFixed(2)})`,
      }
    },
  }),
  a({
    id: 'out-flash-color',
    kind: 'out',
    category: 'trending',
    label: 'Flash e cor',
    description: 'Clarão branco com saturação na saída',
    source: 'pixi',
    previewAnimation: 'atlas-anim-fade-out 1.0s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeInCubic(p)
      return {
        opacity: 1 - t,
        transform: `scale(${(1 + t * 0.08).toFixed(3)})`,
        filter: `brightness(${(1 + p * 1.8).toFixed(2)}) saturate(${(1 + p * 0.9).toFixed(2)})`,
      }
    },
  }),
  a({
    id: 'out-fade-blurred',
    kind: 'out',
    category: 'trending',
    label: 'Fade desfocado',
    description: 'Desfoca e dissolve ao sair',
    source: 'remotion-bits',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${(1 + 0.08 * t).toFixed(3)})`, filter: `blur(${(t * 12).toFixed(1)}px)` }
    },
  }),
  a({
    id: 'out-smoke',
    kind: 'out',
    category: 'light-glitch',
    label: 'Fumaça',
    description: 'Evapora com brilho e desfoque suave',
    source: 'react-bits',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeInCubic(p)
      return {
        opacity: 1 - t,
        transform: `translateY(${(t * -12).toFixed(1)}%) scale(${(1 + t * 0.14).toFixed(3)})`,
        filter: `blur(${(t * 14).toFixed(1)}px) contrast(${(1 - t * 0.3).toFixed(2)})`,
      }
    },
  }),
  a({
    id: 'out-zoom',
    kind: 'out',
    category: 'zoom-shake',
    label: 'Zoom Out',
    description: 'Amplia e desaparece',
    previewAnimation: 'atlas-anim-zoom-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${(1 + 0.38 * t).toFixed(3)})` }
    },
  }),
  a({
    id: 'out-pop',
    kind: 'out',
    category: 'zoom-shake',
    label: 'Encolher',
    description: 'Encolhe para o centro e some',
    previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${(1 - 0.6 * t).toFixed(3)})` }
    },
  }),
  a({
    id: 'out-slide-left',
    kind: 'out',
    category: 'basic',
    label: 'Deslizar ←',
    description: 'Sai deslizando para a esquerda',
    previewAnimation: 'atlas-anim-slide-out-left 1.2s ease-in infinite',
    ffmpegHint: 'slide-left',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateX(${(t * -50).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'out-slide-right',
    kind: 'out',
    category: 'basic',
    label: 'Deslizar →',
    description: 'Sai deslizando para a direita',
    previewAnimation: 'atlas-anim-slide-out-right 1.2s ease-in infinite',
    ffmpegHint: 'slide-right',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateX(${(t * 50).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'out-slide-up',
    kind: 'out',
    category: 'basic',
    label: 'Deslizar ↑',
    description: 'Sai para cima',
    previewAnimation: 'atlas-anim-slide-out-up 1.2s ease-in infinite',
    ffmpegHint: 'slide-up',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateY(${(t * -42).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'out-slide-down',
    kind: 'out',
    category: 'basic',
    label: 'Deslizar ↓',
    description: 'Sai para baixo',
    previewAnimation: 'atlas-anim-slide-out-down 1.2s ease-in infinite',
    ffmpegHint: 'slide-down',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateY(${(t * 42).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'out-glitch',
    kind: 'out',
    category: 'light-glitch',
    label: 'Glitch',
    description: 'Quebra digital ao sair',
    source: 'gl-transitions',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const jitter = Math.sin(p * 42) * p * 14
      return {
        opacity: 1 - easeInCubic(p),
        transform: `translateX(${jitter.toFixed(1)}px) skewX(${(jitter * 0.45).toFixed(1)}deg)`,
        filter: `saturate(${(1 + p).toFixed(2)})`,
      }
    },
  }),
  a({
    id: 'out-circle-close',
    kind: 'out',
    category: '3d-mask',
    label: 'Íris Fechando',
    description: 'Fecha em círculo até desaparecer',
    previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return {
        opacity: 1 - t * 0.4,
        transform: 'none',
        clipPath: `circle(${((1 - t) * 75).toFixed(1)}% at 50% 50%)`,
      }
    },
  }),
  a({
    id: 'out-flip',
    kind: 'out',
    category: '3d-mask',
    label: 'Flip 3D',
    description: 'Gira em 3D e desaparece',
    source: 'gsap',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `perspective(800px) rotateX(${(t * 85).toFixed(1)}deg)` }
    },
  }),
  a({
    id: 'out-spin',
    kind: 'out',
    category: '3d-mask',
    label: 'Girar Saída',
    description: 'Gira e encolhe ao sair',
    previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `rotate(${(t * 28).toFixed(1)}deg) scale(${(1 - 0.35 * t).toFixed(3)})` }
    },
  }),

  // ======================== COMBINAÇÃO (COMBO) ========================
  a({
    id: 'combo-pendulum-1',
    kind: 'combo',
    category: 'trending',
    label: 'Pêndulo 1',
    description: 'Balanço suave contínuo (clássico CapCut)',
    source: 'motion',
    previewAnimation: 'atlas-anim-sway 1.6s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `rotate(${(wave * 5).toFixed(2)}deg) scale(1.07)` }
    },
  }),
  a({
    id: 'combo-pendulum-2',
    kind: 'combo',
    category: 'trending',
    label: 'Pêndulo 2',
    description: 'Balanço amplo com deslocamento lateral',
    source: 'gsap',
    previewAnimation: 'atlas-anim-sway 1.2s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `translateX(${(wave * 3.5).toFixed(2)}%) rotate(${(wave * 7.5).toFixed(2)}deg) scale(1.12)` }
    },
  }),
  a({
    id: 'combo-shake',
    kind: 'combo',
    category: 'trending',
    label: 'Camera Shake',
    description: 'Vibração contínua de câmera no ritmo',
    source: 'anime',
    previewAnimation: 'atlas-anim-wobble 0.45s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const x = Math.sin(p * Math.PI * 8) * 2.5
      const y = Math.cos(p * Math.PI * 6) * 2
      const r = Math.sin(p * Math.PI * 8) * 1.6
      return { opacity: 1, transform: `translate(${x.toFixed(1)}%, ${y.toFixed(1)}%) rotate(${r.toFixed(1)}deg) scale(1.07)` }
    },
  }),
  a({
    id: 'combo-zoom-bounce',
    kind: 'combo',
    category: 'trending',
    label: 'Zoom & Bounce',
    description: 'Pulso forte no beat da música',
    source: 'gsap',
    previewAnimation: 'atlas-anim-pulse 1.0s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const beat = Math.abs(Math.sin(p * Math.PI * 2)) ** 2
      return { opacity: 1, transform: `scale(${(1 + beat * 0.14).toFixed(3)})` }
    },
  }),
  a({
    id: 'combo-wobble',
    kind: 'combo',
    category: 'zoom-shake',
    label: 'Wobble / Gelatina',
    description: 'Distorção elástica e divertida',
    source: 'anime',
    previewAnimation: 'atlas-anim-wobble 1.2s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const w = Math.sin(p * Math.PI * 4)
      return {
        opacity: 1,
        transform: `rotate(${(w * 3.8).toFixed(2)}deg) skewX(${(w * 2.8).toFixed(2)}deg) scale(${(1 + Math.abs(w) * 0.05).toFixed(3)})`,
      }
    },
  }),
  a({
    id: 'combo-yoyo',
    kind: 'combo',
    category: 'zoom-shake',
    label: 'Yo-yo',
    description: 'Vai e volta vertical com energia',
    source: 'motion',
    previewAnimation: 'atlas-anim-float 1.2s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `translateY(${(wave * 6).toFixed(1)}%) scale(${(1.04 + Math.abs(wave) * 0.04).toFixed(3)})` }
    },
  }),
  a({
    id: 'combo-pulse',
    kind: 'combo',
    category: 'basic',
    label: 'Pulso Suave',
    description: 'Respiração contínua para fotos e takes',
    previewAnimation: 'atlas-anim-pulse 1.6s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5
      return { opacity: 1, transform: `scale(${(1 + wave * 0.07).toFixed(3)})` }
    },
  }),
  a({
    id: 'combo-float',
    kind: 'combo',
    category: 'basic',
    label: 'Flutuar',
    description: 'Sobe e desce leve sem perder o foco',
    previewAnimation: 'atlas-anim-float 1.8s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `translateY(${(wave * -5).toFixed(1)}%)` }
    },
  }),
  a({
    id: 'combo-glow',
    kind: 'combo',
    category: 'light-glitch',
    label: 'Aura Pulsante',
    description: 'Brilho respirando no tempo do clipe',
    source: 'pixi',
    previewAnimation: 'atlas-anim-glow 1.5s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5
      return {
        opacity: 1,
        transform: 'none',
        filter: `brightness(${(1 + wave * 0.25).toFixed(2)}) drop-shadow(0 0 ${Math.round(8 + wave * 12)}px rgba(255,255,255,0.45))`,
      }
    },
  }),
  a({
    id: 'combo-glitch',
    kind: 'combo',
    category: 'light-glitch',
    label: 'Glitch Loop',
    description: 'Interferência digital em ciclo',
    source: 'gl-transitions',
    previewAnimation: 'atlas-anim-wobble 0.9s steps(4) infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const burst = p > 0.72 ? Math.sin(p * 60) * 6 : 0
      return {
        opacity: 1,
        transform: `translateX(${burst.toFixed(1)}px)`,
        filter: p > 0.72 ? 'saturate(1.75) contrast(1.25)' : 'none',
      }
    },
  }),
  a({
    id: 'combo-spin-3d',
    kind: 'combo',
    category: '3d-mask',
    label: 'Rotação 3D',
    description: 'Inclinação 3D suave em ciclo',
    source: 'three',
    previewAnimation: 'atlas-anim-sway 1.6s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const deg = Math.sin(p * Math.PI * 2) * 16
      return { opacity: 1, transform: `perspective(800px) rotateY(${deg.toFixed(1)}deg)` }
    },
  }),
]

/** Aliases para manter compatibilidade com projetos e templates de texto existentes. */
const LEGACY_ANIMATION_ALIASES: Record<string, string> = {
  'anime-in-elastic': 'in-pop',
  'anime-in-bounce': 'in-bounce',
  'anime-in-stagger-skew': 'in-slide-left',
  'anime-out-shrink': 'out-pop',
  'anime-combo-wobble': 'combo-wobble',
  'gsap-in-back': 'in-pop',
  'gsap-in-power4': 'in-slide-up',
  'gsap-in-expo': 'in-zoom',
  'gsap-out-flip': 'out-flip',
  'gsap-combo-stagger-pulse': 'combo-zoom-bounce',
  'motion-in-spring': 'in-pop',
  'motion-in-layout': 'in-slide-up',
  'motion-out-soft': 'out-fade',
  'motion-combo-breathe': 'combo-pulse',
  'bits-in-blur': 'in-blur',
  'bits-in-glitch': 'in-glitch',
  'bits-in-decrypt': 'in-glitch',
  'bits-combo-shiny': 'combo-glow',
  'rb-in-word': 'in-slide-up',
  'rb-in-char-scale': 'in-zoom',
  'rb-out-blur': 'out-fade-blurred',
  'rb-combo-typewriter': 'combo-pulse',
  'rt-in-wipe': 'in-wipe-right',
  'rt-in-clock': 'in-spin',
  'rt-out-pixel': 'out-fade-blurred',
  'rt-combo-crosszoom': 'combo-zoom-bounce',
  'gl-in-ripple': 'in-zoom',
  'gl-in-dreamy': 'in-blur',
  'gl-out-melt': 'out-slide-down',
  'gl-combo-glitch': 'combo-glitch',
  'pixi-in-glow': 'in-flash-white',
  'pixi-in-rgb': 'in-glitch',
  'pixi-combo-crt': 'combo-glitch',
  'pixi-out-zoomblur': 'out-fade-blurred',
  'lottie-in-morph': 'in-pop',
  'lottie-in-draw': 'in-fade',
  'lottie-combo-loop': 'combo-float',
  'lottie-out-fold': 'out-flip',
  'tsp-in-burst': 'in-zoom',
  'tsp-combo-sparkle': 'combo-glow',
  'tsp-out-scatter': 'out-zoom',
  'tsp-in-emit': 'in-slide-up',
  'theatre-in-ease': 'in-fade',
  'theatre-in-hold': 'in-slide-up',
  'theatre-combo-sequence': 'combo-pulse',
  'theatre-out-fade-hold': 'out-fade',
  'three-in-orbit': 'in-flip',
  'three-in-flip': 'in-flip',
  'three-combo-spin': 'combo-spin-3d',
  'three-out-dive': 'out-zoom',
  'combo-sway': 'combo-pendulum-1',
  'out-blur': 'out-fade-blurred',
}

export function editorAnimationById(id: string | null | undefined): EditorAnimationDef | undefined {
  if (!id) return undefined
  const canonical = LEGACY_ANIMATION_ALIASES[id] ?? id
  return EDITOR_ANIMATIONS.find((item) => item.id === canonical)
}

export function editorAnimationsByKind(kind: EditorAnimationKind): EditorAnimationDef[] {
  return EDITOR_ANIMATIONS.filter((item) => item.kind === kind)
}

export function editorAnimationsBySource(source: EditorAnimationSource): EditorAnimationDef[] {
  return EDITOR_ANIMATIONS.filter((item) => item.source === source)
}

export type EditorResolvedAnimStyle = {
  opacity: number
  transform: string
  filter: string
  clipPath: string
}

const IDENTITY: EditorResolvedAnimStyle = { opacity: 1, transform: '', filter: '', clipPath: '' }

function compose(
  base: EditorResolvedAnimStyle,
  next: EditorAnimationCssState,
): EditorResolvedAnimStyle {
  const transforms = [base.transform, next.transform === 'none' ? '' : next.transform].filter(Boolean)
  const filters = [base.filter, next.filter || ''].filter(Boolean)
  return {
    opacity: base.opacity * next.opacity,
    transform: transforms.join(' '),
    filter: filters.join(' '),
    clipPath: next.clipPath || base.clipPath,
  }
}

/**
 * Resolve estilo CSS da animação no tempo local do clipe (ou do projeto para watermark).
 * `local` = segundos desde o início; `duration` = duração total do bloco.
 */
export function resolveAnimationStyle(
  animation: {
    inId: string | null
    outId: string | null
    comboId: string | null
    inDuration: number
    outDuration: number
  } | null | undefined,
  local: number,
  duration: number,
): EditorResolvedAnimStyle {
  if (!animation || !(duration > 0)) return IDENTITY
  let style = { ...IDENTITY }
  const inDur = Math.max(0, Math.min(animation.inDuration || 0, duration))
  const outDur = Math.max(0, Math.min(animation.outDuration || 0, duration - inDur))
  const inDef = editorAnimationById(animation.inId)
  const outDef = editorAnimationById(animation.outId)
  const comboDef = editorAnimationById(animation.comboId)

  if (inDef && inDur > 0 && local < inDur) {
    style = compose(style, inDef.css(local / inDur))
  } else if (outDef && outDur > 0 && local > duration - outDur) {
    style = compose(style, outDef.css((local - (duration - outDur)) / outDur))
  } else if (comboDef) {
    const midStart = inDur
    const midLocal = Math.max(0, local - midStart)
    const progress = (midLocal % 1.5) / 1.5
    style = compose(style, comboDef.css(progress))
  }
  return style
}
