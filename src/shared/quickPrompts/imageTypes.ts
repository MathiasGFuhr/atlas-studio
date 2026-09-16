/**
 * Prompts rápidos — categoria "Criar imagem".
 *
 * Imagem estática: nada aqui descreve movimento de câmera, tracking ou
 * comportamento temporal. Isso pertence à categoria "Animar / Lipsync",
 * que vive em `types.ts` / `presets.ts` e não é tocada por este módulo.
 */

import type { StageContextId } from './stageContext'

/** Quem aparece na imagem. */
export type ImageSubjectId =
  | 'singer-solo'
  | 'singer-acoustic'
  | 'singer-electric'
  | 'singer-full-band'
  | 'singer-guitarist'
  | 'singer-drummer'
  | 'singer-guitarist-drummer'
  | 'guitarist-solo'
  | 'drummer-solo'
  | 'guitarist-drummer'
  | 'band-no-singer'
  | 'band-with-singer'

export type ImagePerformanceId =
  | 'singing-mic'
  | 'singing-no-mic'
  | 'acoustic-singing'
  | 'electric-singing'
  | 'natural-with-band'
  | 'seated-singing'
  | 'standing-singing'
  | 'guitar-playing'
  | 'intense-controlled'
  | 'drums-playing'
  | 'impact-moment'
  | 'band-playing'
  | 'chorus-moment'
  | 'natural'

export type ImageFramingId =
  | 'auto'
  | 'tight-cu-front'
  | 'close-up-front'
  | 'mcu-front'
  | 'medium-front'
  | 'tight-cu-tq-left'
  | 'tight-cu-tq-right'
  | 'close-up-tq-left'
  | 'close-up-tq-right'
  | 'mcu-tq-left'
  | 'mcu-tq-right'
  | 'tq-left'
  | 'tq-right'
  | 'eye-level-front'
  | 'low-angle-slight'
  | 'low-tq-left'
  | 'low-tq-right'
  | 'high-front'
  | 'centered-portrait'
  | 'off-center-cinematic'
  | 'over-mic-front'
  | 'over-mic-tq'
  | 'mcu-instrument'
  | 'face-instrument-edge'
  | 'tq-left-neck'
  | 'tq-right-picking'
  | 'chest-up-mic-instrument'
  | 'low-instrument'
  | 'off-center-guitar'
  | 'medium-full-instrument'
  | 'portrait-fretboard'
  | 'front-full-guitar'
  | 'close-player-instrument'
  | 'guitar-low-hero'
  | 'guitar-upper-body'
  | 'guitar-fretboard'
  | 'guitar-picking'
  | 'guitar-body'
  | 'guitar-neck-full'
  | 'guitar-diagonal'
  | 'guitar-slight-wide'
  | 'guitar-off-center'
  | 'guitar-stage-mcu'
  | 'guitar-face-headstock'
  | 'drums-front'
  | 'drums-tq-left'
  | 'drums-tq-right'
  | 'medium-wide'
  | 'drums-chest-up'
  | 'drums-low'
  | 'drums-eye-portrait'
  | 'drums-over-tom'
  | 'drums-cymbal'
  | 'drums-kick-snare'
  | 'drums-sticks'
  | 'drums-impact'
  | 'drums-off-center'
  | 'drums-stage-medium'
  | 'drums-portrait-depth'
  | 'singer-foreground'
  | 'band-behind'
  | 'stage-diagonal'
  | 'mcu-front-band-soft'
  | 'tq-singer-band'
  | 'centered-portrait-band'
  | 'low-hero-band'
  | 'medium-context-band'
  | 'off-center-band-depth'
  | 'band-centered'
  | 'band-guitar-fg'
  | 'band-layered'
  | 'band-off-center'
  | 'band-instrumental-portrait'
  | 'band-live-stage'

/** Finalidade da imagem. Lipsync aperta as regras de rosto e distância. */
export type ImagePurpose = 'lipsync' | 'scene'

/**
 * Grupo de enquadramentos. Cada "quem aparece" puxa o grupo adequado, para
 * que um baterista nunca receba um ângulo pensado para close de cantor.
 */
export type ImageFramingGroup = 'singer' | 'guitarist' | 'drummer' | 'band'

/** Distância do enquadramento — eixo principal de variedade visual. */
export type ImageDistance = 'tight-close' | 'close-up' | 'mcu' | 'medium' | 'medium-wide'

/** Direção da câmera em relação ao sujeito. */
export type ImageDirection = 'front' | 'tq-left' | 'tq-right'

/** Altura da câmera. */
export type ImageHeight = 'low' | 'eye' | 'high'

/** Papel da composição no quadro. */
export type ImageComposition =
  | 'centered'
  | 'off-center'
  | 'portrait'
  | 'over-mic'
  | 'instrument'
  | 'band-context'
  | 'diagonal'
  | 'layered'
  | 'kit'
  | 'hero'

export interface ImageSubjectPreset {
  id: ImageSubjectId
  category: 'image-subject'
  label: string
  text: string
  /** Sem vocalista em cena não existe preparação para lipsync. */
  hasSinger: boolean
  framingGroup: ImageFramingGroup
  compatiblePerformances: ImagePerformanceId[]
}

export interface ImagePerformancePreset {
  id: ImagePerformanceId
  category: 'image-performance'
  label: string
  text: string
}

export interface ImageFramingPreset {
  id: Exclude<ImageFramingId, 'auto'>
  category: 'image-framing'
  label: string
  text: string
  /** Quem pode usar este ângulo. */
  groups: ImageFramingGroup[]
  /** Mantém rosto grande e legível o bastante para animar depois. */
  lipSyncSafe: boolean
  distance: ImageDistance
  direction: ImageDirection
  height: ImageHeight
  composition: ImageComposition
  /** Maior = mais adequado como escolha principal. */
  priority: number
  /** Se omitido, vale para qualquer performance. */
  compatiblePerformances?: ImagePerformanceId[]
  /** Se omitido, vale para Lipsync e Cena geral. */
  purposes?: ImagePurpose[]
}

export interface ComposeImagePromptInput {
  subjectId: ImageSubjectId
  performanceId: ImagePerformanceId
  framingId: ImageFramingId
  purpose: ImagePurpose
  stageContextId: StageContextId
}

export interface ImageAngleVariation {
  id: string
  framingId: Exclude<ImageFramingId, 'auto'>
  label: string
  prompt: string
}
