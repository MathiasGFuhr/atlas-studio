import {
  type EditorAnimationSource,
  EDITOR_ANIMATION_SOURCE_LABEL,
  EDITOR_ANIMATION_SOURCE_ORDER,
} from './animationSources'

export type EditorAnimationKind = 'in' | 'out' | 'combo'

export type EditorAnimationCssState = {
  opacity: number
  /** CSS transform (sem scale do clipe). */
  transform: string
  filter?: string
}

export type EditorAnimationDef = {
  id: string
  kind: EditorAnimationKind
  label: string
  description: string
  source: EditorAnimationSource
  /** Preview da biblioteca (keyframes CSS). */
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

function easeOutBack(t: number): number {
  const p = clamp01(t)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
}

function easeOutElastic(t: number): number {
  const p = clamp01(t)
  if (p === 0 || p === 1) return p
  return 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
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

const BASE_ANIMATIONS: EditorAnimationDef[] = [
  a({
    id: 'in-fade',
    kind: 'in',
    label: 'Fade-in',
    description: 'Aparece suavemente',
    previewAnimation: 'atlas-anim-fade-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => ({ opacity: easeOutCubic(p), transform: 'none' }),
  }),
  a({
    id: 'in-slide-left',
    kind: 'in',
    label: 'Deslizar ←',
    description: 'Entra pela direita',
    previewAnimation: 'atlas-anim-slide-left 1.2s ease-out infinite',
    ffmpegHint: 'slide-left',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `translateX(${(1 - t) * 40}%)` }
    },
  }),
  a({
    id: 'in-slide-right',
    kind: 'in',
    label: 'Deslizar →',
    description: 'Entra pela esquerda',
    previewAnimation: 'atlas-anim-slide-right 1.2s ease-out infinite',
    ffmpegHint: 'slide-right',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `translateX(${(1 - t) * -40}%)` }
    },
  }),
  a({
    id: 'in-slide-up',
    kind: 'in',
    label: 'Deslizar ↑',
    description: 'Entra por baixo',
    previewAnimation: 'atlas-anim-slide-up 1.2s ease-out infinite',
    ffmpegHint: 'slide-up',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `translateY(${(1 - t) * 35}%)` }
    },
  }),
  a({
    id: 'in-slide-down',
    kind: 'in',
    label: 'Deslizar ↓',
    description: 'Entra por cima',
    previewAnimation: 'atlas-anim-slide-down 1.2s ease-out infinite',
    ffmpegHint: 'slide-down',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `translateY(${(1 - t) * -35}%)` }
    },
  }),
  a({
    id: 'in-zoom',
    kind: 'in',
    label: 'Zoom in',
    description: 'Aproxima do centro',
    previewAnimation: 'atlas-anim-zoom-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `scale(${0.7 + 0.3 * t})` }
    },
  }),
  a({
    id: 'in-pop',
    kind: 'in',
    label: 'Pop',
    description: 'Salto elástico',
    previewAnimation: 'atlas-anim-pop-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = easeOutCubic(p)
      const scale = t < 0.7 ? 0.6 + (t / 0.7) * 0.55 : 1.15 - ((t - 0.7) / 0.3) * 0.15
      return { opacity: Math.min(1, t * 1.4), transform: `scale(${scale})` }
    },
  }),
  a({
    id: 'in-spin',
    kind: 'in',
    label: 'Girar entrada',
    description: 'Gira e aparece',
    previewAnimation: 'atlas-anim-spin-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `rotate(${(1 - t) * -18}deg) scale(${0.85 + 0.15 * t})` }
    },
  }),
  a({
    id: 'out-fade',
    kind: 'out',
    label: 'Fade-out',
    description: 'Desaparece suavemente',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => ({ opacity: 1 - easeInCubic(p), transform: 'none' }),
  }),
  a({
    id: 'out-slide-left',
    kind: 'out',
    label: 'Deslizar ←',
    description: 'Sai para a esquerda',
    previewAnimation: 'atlas-anim-slide-out-left 1.2s ease-in infinite',
    ffmpegHint: 'slide-left',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateX(${t * -40}%)` }
    },
  }),
  a({
    id: 'out-slide-right',
    kind: 'out',
    label: 'Deslizar →',
    description: 'Sai para a direita',
    previewAnimation: 'atlas-anim-slide-out-right 1.2s ease-in infinite',
    ffmpegHint: 'slide-right',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateX(${t * 40}%)` }
    },
  }),
  a({
    id: 'out-slide-up',
    kind: 'out',
    label: 'Deslizar ↑',
    description: 'Sai para cima',
    previewAnimation: 'atlas-anim-slide-out-up 1.2s ease-in infinite',
    ffmpegHint: 'slide-up',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateY(${t * -35}%)` }
    },
  }),
  a({
    id: 'out-slide-down',
    kind: 'out',
    label: 'Deslizar ↓',
    description: 'Sai para baixo',
    previewAnimation: 'atlas-anim-slide-out-down 1.2s ease-in infinite',
    ffmpegHint: 'slide-down',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateY(${t * 35}%)` }
    },
  }),
  a({
    id: 'out-zoom',
    kind: 'out',
    label: 'Zoom out',
    description: 'Afasta e some',
    previewAnimation: 'atlas-anim-zoom-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${1 + 0.25 * t})` }
    },
  }),
  a({
    id: 'out-pop',
    kind: 'out',
    label: 'Pop out',
    description: 'Encolhe e some',
    previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${1 - 0.45 * t})` }
    },
  }),
  a({
    id: 'combo-pulse',
    kind: 'combo',
    label: 'Pulso',
    description: 'Escala em ciclo',
    previewAnimation: 'atlas-anim-pulse 1.4s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5
      return { opacity: 1, transform: `scale(${1 + wave * 0.06})` }
    },
  }),
  a({
    id: 'combo-float',
    kind: 'combo',
    label: 'Flutuar',
    description: 'Sobe e desce leve',
    previewAnimation: 'atlas-anim-float 1.6s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `translateY(${wave * -4}%)` }
    },
  }),
  a({
    id: 'combo-sway',
    kind: 'combo',
    label: 'Balanço',
    description: 'Inclina suavemente',
    previewAnimation: 'atlas-anim-sway 1.6s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `rotate(${wave * 3}deg)` }
    },
  }),
  a({
    id: 'combo-glow',
    kind: 'combo',
    label: 'Brilho suave',
    description: 'Opacidade e brilho em ciclo',
    previewAnimation: 'atlas-anim-glow 1.5s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5
      return {
        opacity: 0.85 + wave * 0.15,
        transform: 'none',
        filter: `brightness(${1 + wave * 0.12})`,
      }
    },
  }),
]

function buildLibraryAnimationPack(): EditorAnimationDef[] {
  const pack: EditorAnimationDef[] = []

  // —— Anime.js ——
  pack.push(
    a({
      id: 'anime-in-elastic',
      kind: 'in',
      source: 'anime',
      label: 'Elastic',
      description: 'Entrada elástica Anime.js',
      previewAnimation: 'atlas-anim-pop-in 1.3s ease-out infinite',
      ffmpegHint: 'zoom-in',
      css: (p) => {
        const t = easeOutElastic(p)
        return { opacity: clamp01(p * 1.4), transform: `scale(${0.55 + 0.45 * t})` }
      },
    }),
    a({
      id: 'anime-in-bounce',
      kind: 'in',
      source: 'anime',
      label: 'Bounce',
      description: 'Quique Anime.js',
      previewAnimation: 'atlas-anim-pop-in 1.3s ease-out infinite',
      ffmpegHint: 'slide-up',
      css: (p) => {
        const t = easeOutBounce(p)
        return { opacity: clamp01(p * 1.5), transform: `translateY(${(1 - t) * 40}%)` }
      },
    }),
    a({
      id: 'anime-in-stagger-skew',
      kind: 'in',
      source: 'anime',
      label: 'Skew in',
      description: 'Inclina e entra',
      previewAnimation: 'atlas-anim-slide-up 1.2s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `skewX(${(1 - t) * -12}deg) translateY(${(1 - t) * 20}%)` }
      },
    }),
    a({
      id: 'anime-out-shrink',
      kind: 'out',
      source: 'anime',
      label: 'Shrink',
      description: 'Encolhe com fade',
      previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
      ffmpegHint: 'zoom-out',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `scale(${1 - 0.55 * t}) rotate(${t * -8}deg)` }
      },
    }),
    a({
      id: 'anime-combo-wobble',
      kind: 'combo',
      source: 'anime',
      label: 'Wobble',
      description: 'Oscilação Anime.js',
      previewAnimation: 'atlas-anim-sway 1.2s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const wave = Math.sin(p * Math.PI * 4)
        return { opacity: 1, transform: `rotate(${wave * 5}deg) translateX(${wave * 2}%)` }
      },
    }),
  )

  // —— GSAP ——
  pack.push(
    a({
      id: 'gsap-in-back',
      kind: 'in',
      source: 'gsap',
      label: 'Back out',
      description: 'Overshoot GSAP back.out',
      previewAnimation: 'atlas-anim-pop-in 1.2s ease-out infinite',
      ffmpegHint: 'zoom-in',
      css: (p) => {
        const t = easeOutBack(p)
        return { opacity: clamp01(p * 1.6), transform: `scale(${0.6 + 0.4 * t})` }
      },
    }),
    a({
      id: 'gsap-in-power4',
      kind: 'in',
      source: 'gsap',
      label: 'Power4',
      description: 'Entrada power4.out',
      previewAnimation: 'atlas-anim-slide-up 1.1s cubic-bezier(0.16,1,0.3,1) infinite',
      ffmpegHint: 'slide-up',
      css: (p) => {
        const t = 1 - (1 - clamp01(p)) ** 4
        return { opacity: t, transform: `translateY(${(1 - t) * 48}%)` }
      },
    }),
    a({
      id: 'gsap-in-expo',
      kind: 'in',
      source: 'gsap',
      label: 'Expo',
      description: 'Exponencial GSAP',
      previewAnimation: 'atlas-anim-fade-in 1.1s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = p === 0 ? 0 : 2 ** (-10 * (1 - clamp01(p)))
        const eased = 1 - t
        return { opacity: eased, transform: `translateY(${(1 - eased) * 24}%) scale(${0.92 + 0.08 * eased})` }
      },
    }),
    a({
      id: 'gsap-out-flip',
      kind: 'out',
      source: 'gsap',
      label: 'Flip out',
      description: 'Flip 3D de saída',
      previewAnimation: 'atlas-anim-spin-in 1.2s ease-in infinite reverse',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `rotateY(${t * 75}deg) scale(${1 - 0.15 * t})` }
      },
    }),
    a({
      id: 'gsap-combo-stagger-pulse',
      kind: 'combo',
      source: 'gsap',
      label: 'Stagger pulse',
      description: 'Pulso rítmico GSAP',
      previewAnimation: 'atlas-anim-pulse 1.1s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const wave = Math.sin(p * Math.PI * 2)
        return { opacity: 1, transform: `scale(${1 + wave * 0.08}) rotate(${wave * 1.5}deg)` }
      },
    }),
  )

  // —— Motion (Framer) ——
  pack.push(
    a({
      id: 'motion-in-spring',
      kind: 'in',
      source: 'motion',
      label: 'Spring',
      description: 'Spring Motion/Framer',
      previewAnimation: 'atlas-anim-pop-in 1.25s ease-out infinite',
      ffmpegHint: 'zoom-in',
      css: (p) => {
        const t = spring(p)
        return { opacity: clamp01(p * 1.8), transform: `scale(${0.7 + 0.3 * t}) translateY(${(1 - t) * 18}%)` }
      },
    }),
    a({
      id: 'motion-in-layout',
      kind: 'in',
      source: 'motion',
      label: 'Layout rise',
      description: 'Layout animation rise',
      previewAnimation: 'atlas-anim-slide-up 1.2s ease-out infinite',
      ffmpegHint: 'slide-up',
      css: (p) => {
        const t = spring(p)
        return { opacity: t, transform: `translateY(${(1 - t) * 30}%) scale(${0.96 + 0.04 * t})` }
      },
    }),
    a({
      id: 'motion-out-soft',
      kind: 'out',
      source: 'motion',
      label: 'Soft exit',
      description: 'Saída spring invertida',
      previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `translateY(${t * -12}%) scale(${1 - 0.08 * t})` }
      },
    }),
    a({
      id: 'motion-combo-breathe',
      kind: 'combo',
      source: 'motion',
      label: 'Breathe',
      description: 'Respiração suave',
      previewAnimation: 'atlas-anim-pulse 2s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5
        return { opacity: 0.92 + wave * 0.08, transform: `scale(${1 + wave * 0.035})` }
      },
    }),
  )

  // —— React Bits ——
  pack.push(
    a({
      id: 'bits-in-blur',
      kind: 'in',
      source: 'react-bits',
      label: 'BlurText',
      description: 'Desfoque → nítido',
      previewAnimation: 'atlas-anim-fade-in 1.2s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `translateY(${(1 - t) * 16}%)`, filter: `blur(${(1 - t) * 10}px)` }
      },
    }),
    a({
      id: 'bits-in-glitch',
      kind: 'in',
      source: 'react-bits',
      label: 'GlitchText',
      description: 'Glitch de entrada',
      previewAnimation: 'atlas-anim-sway 0.8s linear infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        const j = (1 - t) * Math.sin(p * 40) * 4
        return { opacity: t, transform: `translateX(${j}%)`, filter: t < 0.85 ? `hue-rotate(${(1 - t) * 40}deg)` : undefined }
      },
    }),
    a({
      id: 'bits-in-decrypt',
      kind: 'in',
      source: 'react-bits',
      label: 'Decrypt',
      description: 'Revelação decrypt',
      previewAnimation: 'atlas-anim-fade-in 1.3s steps(8) infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: 0.35 + 0.65 * t, transform: `scale(${0.98 + 0.02 * t})`, filter: `contrast(${1 + (1 - t) * 0.4})` }
      },
    }),
    a({
      id: 'bits-combo-shiny',
      kind: 'combo',
      source: 'react-bits',
      label: 'Shiny',
      description: 'Brilho varrendo',
      previewAnimation: 'atlas-anim-glow 1.4s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5
        return { opacity: 1, transform: 'none', filter: `brightness(${1 + wave * 0.25}) contrast(${1 + wave * 0.08})` }
      },
    }),
  )

  // —— Remotion Bits ——
  pack.push(
    a({
      id: 'rb-in-word',
      kind: 'in',
      source: 'remotion-bits',
      label: 'Word reveal',
      description: 'Revelação palavra a palavra',
      previewAnimation: 'atlas-anim-slide-up 1.2s ease-out infinite',
      ffmpegHint: 'slide-up',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `translateY(${(1 - t) * 22}%)`, filter: `blur(${(1 - t) * 6}px)` }
      },
    }),
    a({
      id: 'rb-in-char-scale',
      kind: 'in',
      source: 'remotion-bits',
      label: 'Char scale',
      description: 'Chars em escala',
      previewAnimation: 'atlas-anim-zoom-in 1.15s ease-out infinite',
      ffmpegHint: 'zoom-in',
      css: (p) => {
        const t = easeOutBack(p)
        return { opacity: clamp01(p * 1.5), transform: `scale(${0.2 + 0.8 * t})` }
      },
    }),
    a({
      id: 'rb-out-blur',
      kind: 'out',
      source: 'remotion-bits',
      label: 'Blur out',
      description: 'Saída com blur',
      previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `translateY(${t * -10}%)`, filter: `blur(${t * 8}px)` }
      },
    }),
    a({
      id: 'rb-combo-typewriter',
      kind: 'combo',
      source: 'remotion-bits',
      label: 'Type pulse',
      description: 'Pulso de digitação',
      previewAnimation: 'atlas-anim-pulse 0.9s steps(2) infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const on = Math.sin(p * Math.PI * 8) > 0
        return { opacity: on ? 1 : 0.75, transform: 'none' }
      },
    }),
  )

  // —— Remotion Transitions (as clip anims) ——
  pack.push(
    a({
      id: 'rt-in-wipe',
      kind: 'in',
      source: 'remotion-transitions',
      label: 'Wipe in',
      description: 'Wipe Remotion',
      previewAnimation: 'atlas-anim-slide-left 1.1s ease-out infinite',
      ffmpegHint: 'slide-left',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `translateX(${(1 - t) * 55}%)` }
      },
    }),
    a({
      id: 'rt-in-clock',
      kind: 'in',
      source: 'remotion-transitions',
      label: 'Clock in',
      description: 'Clock wipe feel',
      previewAnimation: 'atlas-anim-spin-in 1.2s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `rotate(${(1 - t) * -90}deg) scale(${0.85 + 0.15 * t})` }
      },
    }),
    a({
      id: 'rt-out-pixel',
      kind: 'out',
      source: 'remotion-transitions',
      label: 'Pixelize out',
      description: 'Pixelize de saída',
      previewAnimation: 'atlas-anim-zoom-out 1.2s ease-in infinite',
      ffmpegHint: 'zoom-out',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `scale(${1 + 0.12 * t})`, filter: `contrast(${1 + t * 0.4})` }
      },
    }),
    a({
      id: 'rt-combo-crosszoom',
      kind: 'combo',
      source: 'remotion-transitions',
      label: 'CrossZoom',
      description: 'Zoom cruzado em loop',
      previewAnimation: 'atlas-anim-pulse 1.3s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const wave = Math.sin(p * Math.PI * 2) * 0.5 + 0.5
        return { opacity: 1, transform: `scale(${1 + wave * 0.1})`, filter: `blur(${wave * 1.2}px)` }
      },
    }),
  )

  // —— GL Transitions ——
  pack.push(
    a({
      id: 'gl-in-ripple',
      kind: 'in',
      source: 'gl-transitions',
      label: 'Ripple',
      description: 'Ondulação GLSL',
      previewAnimation: 'atlas-anim-pulse 1.2s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        const w = Math.sin((1 - t) * Math.PI * 4) * (1 - t) * 3
        return { opacity: t, transform: `scale(${0.92 + 0.08 * t}) translateX(${w}%)` }
      },
    }),
    a({
      id: 'gl-in-dreamy',
      kind: 'in',
      source: 'gl-transitions',
      label: 'Dreamy',
      description: 'Sonho GLSL',
      previewAnimation: 'atlas-anim-fade-in 1.4s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `scale(${1.08 - 0.08 * t})`, filter: `blur(${(1 - t) * 6}px) brightness(${0.9 + 0.1 * t})` }
      },
    }),
    a({
      id: 'gl-out-melt',
      kind: 'out',
      source: 'gl-transitions',
      label: 'Melt',
      description: 'Derrete na saída',
      previewAnimation: 'atlas-anim-slide-out-down 1.3s ease-in infinite',
      ffmpegHint: 'slide-down',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `translateY(${t * 20}%) scaleY(${1 + t * 0.25})`, filter: `blur(${t * 4}px)` }
      },
    }),
    a({
      id: 'gl-combo-glitch',
      kind: 'combo',
      source: 'gl-transitions',
      label: 'Glitch loop',
      description: 'Glitch GLSL em ciclo',
      previewAnimation: 'atlas-anim-sway 0.7s linear infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const j = Math.sin(p * Math.PI * 16) * 1.5
        return { opacity: 1, transform: `translateX(${j}%)`, filter: `hue-rotate(${Math.sin(p * 20) * 15}deg)` }
      },
    }),
  )

  // —— PixiJS Filters (as motion looks) ——
  pack.push(
    a({
      id: 'pixi-in-glow',
      kind: 'in',
      source: 'pixi',
      label: 'Glow in',
      description: 'Entrada com glow Pixi',
      previewAnimation: 'atlas-anim-glow 1.2s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `scale(${0.9 + 0.1 * t})`, filter: `brightness(${1 + (1 - t) * 0.4}) drop-shadow(0 0 ${12 * (1 - t)}px white)` }
      },
    }),
    a({
      id: 'pixi-in-rgb',
      kind: 'in',
      source: 'pixi',
      label: 'RGB split in',
      description: 'Aberração cromática',
      previewAnimation: 'atlas-anim-fade-in 1.15s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `translateX(${(1 - t) * 2}%)`, filter: `contrast(${1.1 + (1 - t) * 0.3}) saturate(${1.2 + (1 - t) * 0.4})` }
      },
    }),
    a({
      id: 'pixi-combo-crt',
      kind: 'combo',
      source: 'pixi',
      label: 'CRT flicker',
      description: 'Flicker CRT Pixi',
      previewAnimation: 'atlas-anim-glow 0.9s steps(3) infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const wave = Math.sin(p * Math.PI * 10) * 0.5 + 0.5
        return { opacity: 0.9 + wave * 0.1, transform: 'none', filter: `contrast(${1.15 + wave * 0.1})` }
      },
    }),
    a({
      id: 'pixi-out-zoomblur',
      kind: 'out',
      source: 'pixi',
      label: 'Zoom blur out',
      description: 'Zoom blur de saída',
      previewAnimation: 'atlas-anim-zoom-out 1.2s ease-in infinite',
      ffmpegHint: 'zoom-out',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `scale(${1 + 0.35 * t})`, filter: `blur(${t * 5}px)` }
      },
    }),
  )

  // —— Lottie-like ——
  pack.push(
    a({
      id: 'lottie-in-morph',
      kind: 'in',
      source: 'lottie',
      label: 'Morph in',
      description: 'Morph vetorial Lottie',
      previewAnimation: 'atlas-anim-pop-in 1.25s ease-out infinite',
      ffmpegHint: 'zoom-in',
      css: (p) => {
        const t = easeOutBack(p)
        return { opacity: clamp01(p * 1.4), transform: `scale(${0.4 + 0.6 * t}) rotate(${(1 - t) * -25}deg)` }
      },
    }),
    a({
      id: 'lottie-in-draw',
      kind: 'in',
      source: 'lottie',
      label: 'Draw in',
      description: 'Traço revelando',
      previewAnimation: 'atlas-anim-fade-in 1.3s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `scaleX(${0.2 + 0.8 * t})`, filter: `contrast(${1 + (1 - t) * 0.25})` }
      },
    }),
    a({
      id: 'lottie-combo-loop',
      kind: 'combo',
      source: 'lottie',
      label: 'Lottie loop',
      description: 'Loop orgânico',
      previewAnimation: 'atlas-anim-float 1.8s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const wave = Math.sin(p * Math.PI * 2)
        return { opacity: 1, transform: `translateY(${wave * -5}%) rotate(${wave * 4}deg) scale(${1 + Math.abs(wave) * 0.03})` }
      },
    }),
    a({
      id: 'lottie-out-fold',
      kind: 'out',
      source: 'lottie',
      label: 'Fold out',
      description: 'Dobra e some',
      previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
      ffmpegHint: 'zoom-out',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `scaleY(${1 - 0.7 * t}) rotateX(${t * 40}deg)` }
      },
    }),
  )

  // —— tsParticles ——
  pack.push(
    a({
      id: 'tsp-in-burst',
      kind: 'in',
      source: 'tsparticles',
      label: 'Burst',
      description: 'Explosão de partículas',
      previewAnimation: 'atlas-anim-pop-in 1.15s ease-out infinite',
      ffmpegHint: 'zoom-in',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `scale(${0.3 + 0.7 * t})`, filter: `brightness(${1.3 - 0.3 * t})` }
      },
    }),
    a({
      id: 'tsp-combo-sparkle',
      kind: 'combo',
      source: 'tsparticles',
      label: 'Sparkle',
      description: 'Cintilação de partículas',
      previewAnimation: 'atlas-anim-glow 1s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const twinkle = Math.abs(Math.sin(p * Math.PI * 6))
        return { opacity: 0.85 + twinkle * 0.15, transform: `scale(${1 + twinkle * 0.04})`, filter: `brightness(${1 + twinkle * 0.2})` }
      },
    }),
    a({
      id: 'tsp-out-scatter',
      kind: 'out',
      source: 'tsparticles',
      label: 'Scatter',
      description: 'Espalha e some',
      previewAnimation: 'atlas-anim-zoom-out 1.2s ease-in infinite',
      ffmpegHint: 'zoom-out',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `scale(${1 + 0.4 * t}) rotate(${t * 12}deg)`, filter: `blur(${t * 3}px)` }
      },
    }),
    a({
      id: 'tsp-in-emit',
      kind: 'in',
      source: 'tsparticles',
      label: 'Emit up',
      description: 'Emissão de baixo pra cima',
      previewAnimation: 'atlas-anim-slide-up 1.2s ease-out infinite',
      ffmpegHint: 'slide-up',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `translateY(${(1 - t) * 45}%) scale(${0.85 + 0.15 * t})` }
      },
    }),
  )

  // —— Theatre.js ——
  pack.push(
    a({
      id: 'theatre-in-ease',
      kind: 'in',
      source: 'theatre',
      label: 'Studio ease',
      description: 'Curva de cena Theatre',
      previewAnimation: 'atlas-anim-slide-up 1.35s cubic-bezier(0.22,1,0.36,1) infinite',
      ffmpegHint: 'slide-up',
      css: (p) => {
        const t = 1 - (1 - clamp01(p)) ** 3
        return { opacity: t, transform: `translateY(${(1 - t) * 28}%) scale(${0.94 + 0.06 * t})` }
      },
    }),
    a({
      id: 'theatre-in-hold',
      kind: 'in',
      source: 'theatre',
      label: 'Hold reveal',
      description: 'Hold + reveal',
      previewAnimation: 'atlas-anim-fade-in 1.5s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = p < 0.25 ? 0 : easeOutCubic((p - 0.25) / 0.75)
        return { opacity: t, transform: `translateY(${(1 - t) * 14}%)` }
      },
    }),
    a({
      id: 'theatre-combo-sequence',
      kind: 'combo',
      source: 'theatre',
      label: 'Sequence',
      description: 'Sequência de chave',
      previewAnimation: 'atlas-anim-float 2s ease-in-out infinite',
      ffmpegHint: 'none',
      css: (p) => {
        const phase = Math.floor(p * 4) % 4
        const local = p * 4 - phase
        const bounce = Math.sin(local * Math.PI)
        const transforms = [
          `translateY(${-bounce * 4}%)`,
          `scale(${1 + bounce * 0.05})`,
          `rotate(${bounce * 3}deg)`,
          `translateX(${bounce * 3}%)`,
        ]
        return { opacity: 1, transform: transforms[phase] }
      },
    }),
    a({
      id: 'theatre-out-fade-hold',
      kind: 'out',
      source: 'theatre',
      label: 'Fade hold',
      description: 'Segura e some',
      previewAnimation: 'atlas-anim-fade-out 1.4s ease-in infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = p < 0.3 ? 0 : easeInCubic((p - 0.3) / 0.7)
        return { opacity: 1 - t, transform: 'none' }
      },
    }),
  )

  // —— Three.js ——
  pack.push(
    a({
      id: 'three-in-orbit',
      kind: 'in',
      source: 'three',
      label: 'Orbit in',
      description: 'Órbita 3D',
      previewAnimation: 'atlas-anim-spin-in 1.3s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return {
          opacity: t,
          transform: `perspective(800px) rotateY(${(1 - t) * -55}deg) translateZ(${(1 - t) * -80}px)`,
        }
      },
    }),
    a({
      id: 'three-in-flip',
      kind: 'in',
      source: 'three',
      label: 'Flip X',
      description: 'Flip no eixo X',
      previewAnimation: 'atlas-anim-spin-in 1.2s ease-out infinite',
      ffmpegHint: 'fade',
      css: (p) => {
        const t = easeOutCubic(p)
        return { opacity: t, transform: `perspective(700px) rotateX(${(1 - t) * 70}deg)` }
      },
    }),
    a({
      id: 'three-combo-spin',
      kind: 'combo',
      source: 'three',
      label: 'Y spin',
      description: 'Rotação contínua Y',
      previewAnimation: 'atlas-anim-sway 2s linear infinite',
      ffmpegHint: 'none',
      css: (p) => ({ opacity: 1, transform: `perspective(900px) rotateY(${p * 360}deg)` }),
    }),
    a({
      id: 'three-out-dive',
      kind: 'out',
      source: 'three',
      label: 'Dive out',
      description: 'Mergulha no Z',
      previewAnimation: 'atlas-anim-zoom-out 1.2s ease-in infinite',
      ffmpegHint: 'zoom-out',
      css: (p) => {
        const t = easeInCubic(p)
        return { opacity: 1 - t, transform: `perspective(800px) translateZ(${t * -160}px) scale(${1 - 0.2 * t})` }
      },
    }),
  )

  return pack
}

export const EDITOR_ANIMATIONS: EditorAnimationDef[] = [
  ...BASE_ANIMATIONS,
  ...buildLibraryAnimationPack(),
]

export function editorAnimationById(id: string | null | undefined): EditorAnimationDef | undefined {
  if (!id) return undefined
  return EDITOR_ANIMATIONS.find((item) => item.id === id)
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
}

const IDENTITY: EditorResolvedAnimStyle = { opacity: 1, transform: '', filter: '' }

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
    const midEnd = duration - outDur
    const midLen = Math.max(0.001, midEnd - midStart)
    const midLocal = Math.max(0, local - midStart)
    const progress = (midLocal % 1.5) / 1.5
    style = compose(style, comboDef.css(progress))
  }
  return style
}
