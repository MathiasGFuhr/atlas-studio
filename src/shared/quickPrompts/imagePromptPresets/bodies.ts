import type { ImageSubjectId } from '../imageTypes'

/**
 * Corpo único de cada preset de Criar imagem.
 * Não descreve animação, câmera temporal nem lipsync de vídeo.
 */
export interface ImageSceneBody {
  text: string
  negatives: string[]
  /** Só entra quando a finalidade é Lipsync e há cantor. */
  lipsyncLine?: string
}

export const IMAGE_SCENE_BODIES: Record<ImageSubjectId, ImageSceneBody> = {
  'singer-solo': {
    text:
      'Professional concert photograph of the lone singer from the reference, on the existing stage. Face and mouth clearly visible, natural singing posture, microphone positioned without obscuring the mouth. Match the singer, wardrobe and lighting. Clean live-concert framing, realistic anatomy.',
    negatives: ['duplicated people', 'extra musicians', 'facial distortion'],
    lipsyncLine: 'Keep the mouth clear for later lip-sync.',
  },
  'singer-acoustic': {
    text:
      'Three-quarter concert photograph of the reference singer with an acoustic guitar on the existing stage. Face, mouth and microphone stay clear; guitar body in view with natural fretting and picking posture. Match the singer, clothing, guitar and lighting.',
    negatives: ['duplicated people or instruments', 'warped guitar', 'facial distortion'],
    lipsyncLine: 'Keep the mouth unobstructed for later lip-sync.',
  },
  'singer-electric': {
    text:
      'Concert photograph of the reference singer with an electric guitar on the existing stage. Face clearly visible, grounded stance, natural fretboard and picking hands, microphone positioned without obscuring the mouth. Match the singer, clothing, guitar and lighting.',
    negatives: ['duplicated people or instruments', 'warped guitar', 'facial distortion'],
    lipsyncLine: 'Keep the mouth unobstructed for later lip-sync.',
  },
  'singer-full-band': {
    text:
      'Concert photograph with the reference singer large in the foreground and the band supporting the frame in depth. Clear visual separation between the singer and the band; nobody blocking the face. Match the people, instruments, stage layout and lighting.',
    negatives: ['face obstruction', 'duplicated people', 'extra musicians'],
    lipsyncLine: "Keep the singer's face sharp in the foreground for later lip-sync.",
  },
  'singer-guitarist': {
    text:
      'Concert photograph of the reference singer with a guitarist beside or slightly behind, with depth between them. The singer holds the frame; the guitarist plays without blocking the face. Match both musicians, guitar, clothing and lighting on the existing stage.',
    negatives: ['guitarist covering the face', 'extra musicians', 'duplicated people'],
    lipsyncLine: "Keep the singer's mouth clear for later lip-sync.",
  },
  'singer-drummer': {
    text:
      'Concert photograph of the reference singer in the foreground, with the drummer and kit farther back. Face unobstructed; sticks and cymbals visible without competing. Match both musicians, kit, clothing and lighting on the existing stage.',
    negatives: ['kit covering the face', 'extra musicians', 'duplicated drum parts'],
    lipsyncLine: "Keep the singer's mouth clear for later lip-sync.",
  },
  'singer-guitarist-drummer': {
    text:
      'Concert photograph of three musicians from the reference: singer forward, guitarist to the side, drummer farther back at the kit. Nobody blocking the face. Match identities, clothing, instruments and lighting on the existing stage.',
    negatives: ['extra musicians', 'duplicated people', 'face obstruction'],
    lipsyncLine: "Keep the singer's mouth clear for later lip-sync.",
  },
  'guitarist-solo': {
    text:
      'Concert photograph of the reference guitarist alone on the existing stage. Natural grip, fretboard and picking hand clearly shown, believable guitar angle and stage posture, face balanced with the instrument. Match the musician, guitar and lighting.',
    negatives: ['singer', 'duplicated guitar', 'extra fingers'],
  },
  'drummer-solo': {
    text:
      'Three-quarter concert photograph of the reference drummer at the kit on the existing stage. Sticks, snare and cymbals clearly shown, natural upper-body posture. Match the drummer, kit and lighting.',
    negatives: ['singer', 'extra limbs', 'duplicated drum parts'],
  },
  'guitarist-drummer': {
    text:
      'Concert photograph of the guitarist and drummer from the reference: guitarist forward, drummer farther back at the kit. Instruments clearly shown, no lead vocalist. Match both musicians, stage and lighting.',
    negatives: ['extra musicians', 'duplicated instruments'],
  },
  'band-no-singer': {
    text:
      'Instrumental band photograph from the reference: musicians arranged naturally in depth, instruments clearly shown, no lead vocalist. Match the lineup, positions, stage and lighting.',
    negatives: ['duplicated musicians', 'extra people'],
  },
  'band-with-singer': {
    text:
      'Full-band concert photograph from the reference, singer clearly visible within the ensemble, with depth across the stage. Nobody blocking the face. Match the musicians, instruments and lighting.',
    negatives: ['face obstruction', 'duplicated musicians', 'extra people'],
    lipsyncLine: "Keep the singer's mouth clear for later lip-sync.",
  },
  audience: {
    text:
      'Concert crowd photograph. Keep the audience as the only subject. Match the venue and lighting from the reference.',
    negatives: ['singer', 'featured musician', 'duplicated people'],
  },
}
