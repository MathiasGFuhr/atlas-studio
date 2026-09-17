import type { PerformanceId } from '../types'

/**
 * Corpo único de cada preset de Animar / Lipsync.
 * Assume imagem pronta: não recria cenário, roupa ou personagem.
 */
export interface AnimationSceneBody {
  withLipSync?: string
  withoutLipSync: string
  negatives: string[]
}

export const ANIMATION_SCENE_BODIES: Record<PerformanceId, AnimationSceneBody> = {
  'singer-solo': {
    withLipSync:
      'Animate the singer naturally on the existing stage. Precise lip sync to the provided audio, with subtle breathing, blinking and restrained head motion. Do not alter identity or wardrobe.',
    withoutLipSync:
      'Animate the singer naturally on the existing stage. Subtle breathing, blinking and restrained head motion. Do not alter identity or wardrobe. No lip sync.',
    negatives: ['orbit', '360 movement', 'exaggerated gestures', 'identity changes', 'facial deformation'],
  },
  'singer-mic': {
    withLipSync:
      'Animate the singer at the existing microphone on stage. Natural grip, precise lip sync to the audio, subtle breathing and restrained motion. Do not restage.',
    withoutLipSync:
      'Animate the singer at the existing microphone on stage. Natural grip, subtle breathing and restrained motion. Do not restage. No lip sync.',
    negatives: ['orbit', '360 movement', 'exaggerated motion', 'facial deformation'],
  },
  'singer-acoustic': {
    withLipSync:
      'Animate the singer on the existing stage, still playing the acoustic guitar. Precise lip sync, realistic fretting and picking, subtle breathing. Do not restage.',
    withoutLipSync:
      'Animate the singer on the existing stage, still playing the acoustic guitar. Realistic fretting and picking, subtle breathing. Do not restage. No lip sync.',
    negatives: ['orbit', '360 rotation', 'exaggerated body movement', 'facial deformation', 'warped guitar'],
  },
  'singer-electric': {
    withLipSync:
      'Animate the singer on the existing stage, still playing the electric guitar. Precise lip sync, natural fretboard and picking-hand motion, restrained body movement. Do not restage.',
    withoutLipSync:
      'Animate the singer on the existing stage, still playing the electric guitar. Natural fretboard and picking-hand motion, restrained body movement. Do not restage. No lip sync.',
    negatives: ['orbit', '360 movement', 'exaggerated motion', 'facial deformation'],
  },
  'singer-band': {
    withLipSync:
      'Animate the existing band shot. Keep the singer dominant in the foreground, with independent musician movement in depth. Precise lip sync, restrained body motion, no one blocking the face. Do not restage.',
    withoutLipSync:
      'Animate the existing band shot. Keep the singer dominant in the foreground, with independent musician movement in depth. Restrained body motion, no one blocking the face. Do not restage. No lip sync.',
    negatives: ['orbit', 'synchronized robotic motion', 'duplicated musicians', 'facial deformation'],
  },
  guitarist: {
    withoutLipSync:
      'Animate the guitarist on the existing stage. Natural fretboard and picking-hand motion, slight upper-body sway, stable guitar angle. No vocal performance.',
    negatives: ['lip sync', 'orbit', 'exaggerated motion', 'instrument deformation'],
  },
  drummer: {
    withoutLipSync:
      'Animate the drummer at the existing kit. Natural stick work on snare and cymbals, coordinated arms and upper body.',
    negatives: ['lip sync', 'singer', 'extra limbs', 'duplicated drum parts', 'exaggerated motion'],
  },
  'band-no-singer': {
    withoutLipSync:
      'Animate the instrumental band in place. Independent movement per musician, instruments clearly visible, natural depth. Keep the full instrumental group as the visual focus. Do not restage.',
    negatives: ['singer', 'lip sync', 'synchronized robotic motion', 'duplicated musicians'],
  },
  audience: {
    withoutLipSync:
      'Animate only the crowd from the reference. Keep clothing, positions and venue lighting. Keep the audience as the only subject.',
    negatives: ['singer', 'featured performer', 'lip sync', 'synchronized crowd motion', 'duplicated people'],
  },
}
