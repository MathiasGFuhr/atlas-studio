/**
 * Fontes de animação integradas no Atlas (presets scrubbable + libs instaladas).
 * Theatre/Three/Remotion não rodam o runtime completo no player — presets equivalentes.
 */

export type EditorAnimationSource =
  | 'anime'
  | 'gsap'
  | 'react-bits'
  | 'theatre'
  | 'three'
  | 'tsparticles'
  | 'lottie'
  | 'gl-transitions'
  | 'pixi'
  | 'motion'
  | 'remotion-bits'
  | 'remotion-transitions'
  | 'atlas'

export const EDITOR_ANIMATION_SOURCE_LABEL: Record<EditorAnimationSource, string> = {
  anime: 'Anime.js',
  gsap: 'GSAP',
  'react-bits': 'React Bits',
  theatre: 'Theatre.js',
  three: 'Three.js',
  tsparticles: 'tsParticles',
  lottie: 'Lottie',
  'gl-transitions': 'GL Transitions',
  pixi: 'PixiJS Filters',
  motion: 'Motion',
  'remotion-bits': 'Remotion Bits',
  'remotion-transitions': 'Remotion Transitions',
  atlas: 'Atlas',
}

export const EDITOR_ANIMATION_SOURCE_ORDER: EditorAnimationSource[] = [
  'anime',
  'gsap',
  'motion',
  'react-bits',
  'remotion-bits',
  'remotion-transitions',
  'gl-transitions',
  'pixi',
  'lottie',
  'tsparticles',
  'theatre',
  'three',
  'atlas',
]

export const EDITOR_ANIMATION_SOURCE_HINT: Record<EditorAnimationSource, string> = {
  anime: 'Timeline leve estilo Anime.js',
  gsap: 'Easings e staggers GSAP',
  'react-bits': 'Revelações e micro-moções React Bits',
  theatre: 'Curvas de cena Theatre.js',
  three: 'Transforms 3D / órbita Three.js',
  tsparticles: 'Partículas e emitters',
  lottie: 'Revelações estilo Lottie',
  'gl-transitions': 'Looks de transição GLSL em clipe',
  pixi: 'Looks de filtro Pixi em animação',
  motion: 'Spring / layout Motion (Framer)',
  'remotion-bits': 'Bits tipográficos Remotion',
  'remotion-transitions': 'Transições Remotion em clipe',
  atlas: 'Presets nativos Atlas',
}
