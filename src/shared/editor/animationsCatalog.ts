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
    label: 'Fade-in',
    description: 'Aparece suavemente',
    previewAnimation: 'atlas-anim-fade-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => ({ opacity: easeOutCubic(p), transform: 'none' }),
  }),
  a({
    id: 'in-zoom',
    kind: 'in',
    label: 'Zoom In',
    description: 'Aproxima rápido do centro (estilo CapCut)',
    source: 'gsap',
    previewAnimation: 'atlas-anim-zoom-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.5), transform: `scale(${0.6 + 0.4 * t})` }
    },
  }),
  a({
    id: 'in-zoom-out',
    kind: 'in',
    label: 'Zoom Out Entrada',
    description: 'Começa ampliado e encaixa no quadro',
    source: 'gsap',
    previewAnimation: 'atlas-anim-zoom-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.5), transform: `scale(${1.35 - 0.35 * t})` }
    },
  }),
  a({
    id: 'in-shake',
    kind: 'in',
    label: 'Shake Entrada',
    description: 'Entra com tremor rápido de câmera',
    source: 'anime',
    previewAnimation: 'atlas-anim-wobble 0.6s ease-in-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const decay = 1 - easeOutCubic(p)
      const x = Math.sin(p * Math.PI * 10) * 5 * decay
      const y = Math.cos(p * Math.PI * 8) * 3 * decay
      const r = Math.sin(p * Math.PI * 10) * 2.5 * decay
      return {
        opacity: Math.min(1, p * 3),
        transform: `translate(${x}%, ${y}%) rotate(${r}deg) scale(${1 + 0.08 * decay})`,
      }
    },
  }),
  a({
    id: 'in-bounce',
    kind: 'in',
    label: 'Bounce',
    description: 'Quica com gravidade real ao entrar',
    source: 'anime',
    previewAnimation: 'atlas-anim-pop-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = easeOutBounce(p)
      return { opacity: Math.min(1, p * 3), transform: `translateY(${(1 - t) * -32}%)` }
    },
  }),
  a({
    id: 'in-pop',
    kind: 'in',
    label: 'Pop Elástico',
    description: 'Salto com overshoot estilo Motion/Spring',
    source: 'motion',
    previewAnimation: 'atlas-anim-pop-in 1.2s ease-out infinite',
    ffmpegHint: 'zoom-in',
    css: (p) => {
      const t = spring(p)
      return { opacity: Math.min(1, p * 2.8), transform: `scale(${0.5 + 0.5 * t})` }
    },
  }),
  a({
    id: 'in-swing-top',
    kind: 'in',
    label: 'Pêndulo Topo',
    description: 'Balança a partir do topo até estabilizar',
    source: 'anime',
    previewAnimation: 'atlas-anim-sway 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const decay = 1 - easeOutCubic(p)
      const deg = Math.sin(p * Math.PI * 3.5) * 14 * decay
      return { opacity: Math.min(1, p * 2.5), transform: `rotate(${deg}deg)` }
    },
  }),
  a({
    id: 'in-slide-left',
    kind: 'in',
    label: 'Deslizar ←',
    description: 'Entra deslizando pela direita',
    previewAnimation: 'atlas-anim-slide-left 1.2s ease-out infinite',
    ffmpegHint: 'slide-left',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateX(${(1 - t) * 45}%)` }
    },
  }),
  a({
    id: 'in-slide-right',
    kind: 'in',
    label: 'Deslizar →',
    description: 'Entra deslizando pela esquerda',
    previewAnimation: 'atlas-anim-slide-right 1.2s ease-out infinite',
    ffmpegHint: 'slide-right',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateX(${(1 - t) * -45}%)` }
    },
  }),
  a({
    id: 'in-slide-up',
    kind: 'in',
    label: 'Deslizar ↑',
    description: 'Sobe por baixo com desaceleração',
    previewAnimation: 'atlas-anim-slide-up 1.2s ease-out infinite',
    ffmpegHint: 'slide-up',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateY(${(1 - t) * 38}%)` }
    },
  }),
  a({
    id: 'in-slide-down',
    kind: 'in',
    label: 'Deslizar ↓',
    description: 'Desce por cima com desaceleração',
    previewAnimation: 'atlas-anim-slide-down 1.2s ease-out infinite',
    ffmpegHint: 'slide-down',
    css: (p) => {
      const t = easeOutExpo(p)
      return { opacity: Math.min(1, p * 2.2), transform: `translateY(${(1 - t) * -38}%)` }
    },
  }),
  a({
    id: 'in-spin',
    kind: 'in',
    label: 'Girar Entrada',
    description: 'Rotaciona e amplia ao entrar',
    previewAnimation: 'atlas-anim-spin-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutBack(p)
      return { opacity: Math.min(1, p * 2), transform: `rotate(${(1 - t) * -25}deg) scale(${0.78 + 0.22 * t})` }
    },
  }),
  a({
    id: 'in-blur',
    kind: 'in',
    label: 'Desfoque Entrada',
    description: 'Entra desfocado e ganha nitidez',
    source: 'react-bits',
    previewAnimation: 'atlas-anim-fade-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutCubic(p)
      return {
        opacity: t,
        transform: `scale(${1.08 - 0.08 * t})`,
        filter: `blur(${((1 - t) * 10).toFixed(1)}px)`,
      }
    },
  }),
  a({
    id: 'in-glitch',
    kind: 'in',
    label: 'Glitch Entrada',
    description: 'Corte digital RGB ao entrar',
    source: 'react-bits',
    previewAnimation: 'atlas-anim-wobble 0.8s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const jitter = p < 0.7 ? Math.sin(p * 42) * (1 - p) * 14 : 0
      const sat = p < 0.7 ? 1.8 : 1
      return {
        opacity: Math.min(1, p * 2.5),
        transform: `translateX(${jitter.toFixed(1)}px) skewX(${(jitter * 0.4).toFixed(1)}deg)`,
        filter: `saturate(${sat}) contrast(${p < 0.7 ? 1.3 : 1})`,
      }
    },
  }),
  a({
    id: 'in-flip',
    kind: 'in',
    label: 'Flip 3D Entrada',
    description: 'Gira em perspectiva 3D para aparecer',
    source: 'three',
    previewAnimation: 'atlas-anim-spin-in 1.2s ease-out infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeOutCubic(p)
      return { opacity: t, transform: `perspective(800px) rotateY(${(1 - t) * 85}deg)` }
    },
  }),

  // ======================== SAÍDA (OUT) ========================
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
    id: 'out-zoom',
    kind: 'out',
    label: 'Zoom Out',
    description: 'Amplia e desaparece',
    previewAnimation: 'atlas-anim-zoom-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${1 + 0.3 * t})` }
    },
  }),
  a({
    id: 'out-pop',
    kind: 'out',
    label: 'Encolher',
    description: 'Encolhe para o centro e some',
    previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${1 - 0.55 * t})` }
    },
  }),
  a({
    id: 'out-slide-left',
    kind: 'out',
    label: 'Deslizar ←',
    description: 'Sai deslizando para a esquerda',
    previewAnimation: 'atlas-anim-slide-out-left 1.2s ease-in infinite',
    ffmpegHint: 'slide-left',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateX(${t * -45}%)` }
    },
  }),
  a({
    id: 'out-slide-right',
    kind: 'out',
    label: 'Deslizar →',
    description: 'Sai deslizando para a direita',
    previewAnimation: 'atlas-anim-slide-out-right 1.2s ease-in infinite',
    ffmpegHint: 'slide-right',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `translateX(${t * 45}%)` }
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
      return { opacity: 1 - t, transform: `translateY(${t * -38}%)` }
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
      return { opacity: 1 - t, transform: `translateY(${t * 38}%)` }
    },
  }),
  a({
    id: 'out-blur',
    kind: 'out',
    label: 'Desfoque Saída',
    description: 'Desfoca e dissolve ao sair',
    source: 'remotion-bits',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `scale(${1 + 0.08 * t})`, filter: `blur(${(t * 10).toFixed(1)}px)` }
    },
  }),
  a({
    id: 'out-flip',
    kind: 'out',
    label: 'Flip 3D Saída',
    description: 'Gira em 3D e desaparece',
    source: 'gsap',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `perspective(800px) rotateX(${t * 85}deg)` }
    },
  }),
  a({
    id: 'out-spin',
    kind: 'out',
    label: 'Girar Saída',
    description: 'Gira e encolhe ao sair',
    previewAnimation: 'atlas-anim-pop-out 1.2s ease-in infinite',
    ffmpegHint: 'zoom-out',
    css: (p) => {
      const t = easeInCubic(p)
      return { opacity: 1 - t, transform: `rotate(${t * 25}deg) scale(${1 - 0.3 * t})` }
    },
  }),
  a({
    id: 'out-glitch',
    kind: 'out',
    label: 'Glitch Saída',
    description: 'Quebra digital ao sair',
    source: 'gl-transitions',
    previewAnimation: 'atlas-anim-fade-out 1.2s ease-in infinite',
    ffmpegHint: 'fade',
    css: (p) => {
      const jitter = Math.sin(p * 42) * p * 14
      return {
        opacity: 1 - easeInCubic(p),
        transform: `translateX(${jitter.toFixed(1)}px) skewX(${(jitter * 0.4).toFixed(1)}deg)`,
        filter: `saturate(${1 + p})`,
      }
    },
  }),

  // ======================== COMBINAÇÃO (COMBO) ========================
  a({
    id: 'combo-pendulum-1',
    kind: 'combo',
    label: 'Pêndulo 1',
    description: 'Balanço suave contínuo (clássico CapCut)',
    source: 'motion',
    previewAnimation: 'atlas-anim-sway 1.6s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `rotate(${wave * 4.5}deg) scale(1.06)` }
    },
  }),
  a({
    id: 'combo-pendulum-2',
    kind: 'combo',
    label: 'Pêndulo 2',
    description: 'Balanço amplo com deslocamento lateral',
    source: 'gsap',
    previewAnimation: 'atlas-anim-sway 1.2s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `translateX(${wave * 3}%) rotate(${wave * 7}deg) scale(1.1)` }
    },
  }),
  a({
    id: 'combo-shake',
    kind: 'combo',
    label: 'Camera Shake',
    description: 'Vibração contínua de câmera no ritmo',
    source: 'anime',
    previewAnimation: 'atlas-anim-wobble 0.45s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const x = Math.sin(p * Math.PI * 8) * 2.2
      const y = Math.cos(p * Math.PI * 6) * 1.8
      const r = Math.sin(p * Math.PI * 8) * 1.4
      return { opacity: 1, transform: `translate(${x}%, ${y}%) rotate(${r}deg) scale(1.06)` }
    },
  }),
  a({
    id: 'combo-wobble',
    kind: 'combo',
    label: 'Wobble / Gelatina',
    description: 'Distorção elástica e divertida',
    source: 'anime',
    previewAnimation: 'atlas-anim-wobble 1.2s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const w = Math.sin(p * Math.PI * 4)
      return { opacity: 1, transform: `rotate(${w * 3.5}deg) skewX(${w * 2.5}deg) scale(${1 + Math.abs(w) * 0.04})` }
    },
  }),
  a({
    id: 'combo-yoyo',
    kind: 'combo',
    label: 'Yo-yo',
    description: 'Vai e volta vertical com energia',
    source: 'motion',
    previewAnimation: 'atlas-anim-float 1.2s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `translateY(${wave * 5}%) scale(${1.04 + Math.abs(wave) * 0.04})` }
    },
  }),
  a({
    id: 'combo-zoom-bounce',
    kind: 'combo',
    label: 'Zoom & Bounce',
    description: 'Pulso forte no beat da música',
    source: 'gsap',
    previewAnimation: 'atlas-anim-pulse 1.0s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const beat = Math.abs(Math.sin(p * Math.PI * 2)) ** 2
      return { opacity: 1, transform: `scale(${1 + beat * 0.12})` }
    },
  }),
  a({
    id: 'combo-pulse',
    kind: 'combo',
    label: 'Pulso Suave',
    description: 'Respiração contínua para fotos e takes',
    previewAnimation: 'atlas-anim-pulse 1.6s ease-in-out infinite',
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
    description: 'Sobe e desce leve sem perder o foco',
    previewAnimation: 'atlas-anim-float 1.8s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const wave = Math.sin(p * Math.PI * 2)
      return { opacity: 1, transform: `translateY(${wave * -4}%)` }
    },
  }),
  a({
    id: 'combo-glow',
    kind: 'combo',
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
        filter: `brightness(${1 + wave * 0.2}) drop-shadow(0 0 ${Math.round(8 + wave * 12)}px rgba(255,255,255,0.45))`,
      }
    },
  }),
  a({
    id: 'combo-glitch',
    kind: 'combo',
    label: 'Glitch Loop',
    description: 'Interferência digital em ciclo',
    source: 'gl-transitions',
    previewAnimation: 'atlas-anim-wobble 0.9s steps(4) infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const burst = p > 0.75 ? Math.sin(p * 60) * 6 : 0
      return {
        opacity: 1,
        transform: `translateX(${burst}px)`,
        filter: p > 0.75 ? 'saturate(1.7) contrast(1.25)' : 'none',
      }
    },
  }),
  a({
    id: 'combo-spin-3d',
    kind: 'combo',
    label: 'Rotação 3D',
    description: 'Inclinação 3D suave em ciclo',
    source: 'three',
    previewAnimation: 'atlas-anim-sway 1.6s ease-in-out infinite',
    ffmpegHint: 'none',
    css: (p) => {
      const deg = Math.sin(p * Math.PI * 2) * 14
      return { opacity: 1, transform: `perspective(800px) rotateY(${deg}deg)` }
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
  'rb-out-blur': 'out-blur',
  'rb-combo-typewriter': 'combo-pulse',
  'rt-in-wipe': 'in-slide-right',
  'rt-in-clock': 'in-spin',
  'rt-out-pixel': 'out-blur',
  'rt-combo-crosszoom': 'combo-zoom-bounce',
  'gl-in-ripple': 'in-zoom',
  'gl-in-dreamy': 'in-blur',
  'gl-out-melt': 'out-slide-down',
  'gl-combo-glitch': 'combo-glitch',
  'pixi-in-glow': 'in-fade',
  'pixi-in-rgb': 'in-glitch',
  'pixi-combo-crt': 'combo-glitch',
  'pixi-out-zoomblur': 'out-blur',
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
    const midLocal = Math.max(0, local - midStart)
    const progress = (midLocal % 1.5) / 1.5
    style = compose(style, comboDef.css(progress))
  }
  return style
}
