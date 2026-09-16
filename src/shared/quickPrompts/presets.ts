import type {
  ActionId,
  ActionPreset,
  CameraId,
  CameraPreset,
  FramingId,
  FramingPreset,
  PerformanceId,
  PerformancePreset,
} from './types'

/**
 * Biblioteca global de presets dos Prompts rápidos.
 *
 * Este arquivo é a ÚNICA fonte de verdade dos blocos de texto e das regras de
 * compatibilidade. Para adicionar um preset novo, acrescente a entrada aqui:
 * a interface e a composição se adaptam sozinhas.
 */

/** Regra-base: o prompt nunca pode reinventar pessoa, roupa, instrumento ou cenário. */
export const REFERENCE_PRESERVATION =
  'Preserve exactly the performer, face, hair, clothing, body proportions, microphone, ' +
  'instruments, environment and lighting from the reference image. Do not change the ' +
  'identity of the person, do not add or remove people, do not alter the wardrobe, the ' +
  'instruments or the location.'

/** Estilo de câmera exigido em todos os prompts. */
export const CAMERA_STYLE =
  'Professional cinematic camera work: natural, controlled, smooth, stable and physically ' +
  'plausible, as if operated by a real camera crew.'

/**
 * Movimentos proibidos. Entram em todo prompt gerado, qualquer que seja a câmera
 * escolhida — é o que impede orbit, giro 360 e câmera circulando o cantor.
 */
export const FORBIDDEN_CAMERA_MOVES = [
  'no 360-degree camera movement',
  'no orbit or orbiting camera',
  'no camera circling around the performer',
  'no spinning or rotating camera',
  'no circular camera paths',
  'no aggressive whip pans',
  'no aggressive or snap zooms',
  'no very fast camera movement',
  'no abrupt changes of direction',
  'no impossible floating camera',
  'no physically unrealistic camera motion',
  'no exaggerated handheld shake',
]

/** Defeitos visuais recusados em qualquer geração. */
export const QUALITY_CONSTRAINTS = [
  'no duplicated people',
  'no extra limbs or extra fingers',
  'no warped or melting anatomy',
  'no face deformation',
  'no identity change',
  'no flickering or morphing clothing',
  'no text or watermark overlays',
]

/** Bloco de sincronização labial, aplicado somente quando o lipsync está ligado. */
export const LIP_SYNC_BLOCK =
  'Precise natural lip sync to the provided audio, with accurate mouth articulation, ' +
  'realistic jaw movement, natural breathing, blinking and subtle restrained facial ' +
  'expressions. Keep the face clearly visible throughout the shot, with natural head ' +
  'movement. Do not exaggerate the expressions, do not deform the mouth, do not deform ' +
  'the face and preserve the identity of the performer at all times.'

export const PERFORMANCES: PerformancePreset[] = [
  {
    id: 'singer-solo',
    category: 'performance',
    label: 'Cantor sozinho',
    text: 'The singer performs alone in the frame, as the single clear subject of the shot, with confident and natural stage presence.',
    compatibleActions: ['standing', 'seated', 'walking', 'driving', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-mic',
    category: 'performance',
    label: 'Cantor no microfone',
    text: 'The singer performs into the microphone from the reference image, holding it naturally, with a steady and believable grip and relaxed shoulders.',
    compatibleActions: ['standing', 'seated', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-acoustic',
    category: 'performance',
    label: 'Cantor + violão',
    text: 'The singer performs while playing the acoustic guitar from the reference image, with correct hand placement on the fretboard and a natural strumming motion synchronised with the performance.',
    compatibleActions: ['standing', 'seated', 'acoustic-guitar', 'band', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-electric',
    category: 'performance',
    label: 'Cantor + guitarra',
    text: 'The singer performs while playing the electric guitar from the reference image, with credible fretting and picking motion and a grounded, confident stance.',
    compatibleActions: ['standing', 'electric-guitar', 'band', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-band',
    category: 'performance',
    label: 'Cantor + banda',
    text: 'The singer performs in front of the band from the reference image. The singer remains the main subject and stays in focus, while the musicians play naturally behind and around him.',
    compatibleActions: ['standing', 'band', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'guitarist',
    category: 'performance',
    label: 'Guitarrista sozinho',
    text:
      'The guitarist performs naturally with believable instrument-playing motion: subtle body movement, ' +
      'realistic arm and hand motion, natural posture and authentic stage presence.',
    compatibleActions: ['electric-guitar', 'natural'],
    supportsLipSync: false,
  },
  {
    id: 'drummer',
    category: 'performance',
    label: 'Baterista',
    text:
      'The drummer performs naturally with believable drumming motion: realistic arm movement, natural stick ' +
      'motion, subtle upper-body movement and authentic live-performance behaviour.',
    compatibleActions: ['natural'],
    supportsLipSync: false,
  },
  {
    id: 'band-no-singer',
    category: 'performance',
    label: 'Banda sem cantor',
    text:
      'The musicians perform naturally with believable independent movement appropriate to a live band performance. ' +
      'Each musician moves subtly and naturally according to their instrument. Do not add a singer or front performer.',
    compatibleActions: ['band', 'natural'],
    supportsLipSync: false,
  },
  {
    id: 'audience',
    category: 'performance',
    label: 'Plateia',
    text:
      'The shot stays on the concert audience as the subject. People in the crowd react with believable individual ' +
      'behaviour, independent timing, natural head motion, breathing, blinking and small body shifts typical of a live audience.',
    compatibleActions: [
      'audience-reaction',
      'audience-clapping',
      'audience-singing-along',
      'audience-arms-raised',
      'audience-emotional',
      'audience-high-energy',
      'audience-watching',
    ],
    supportsLipSync: false,
  },
]

export const ACTIONS: ActionPreset[] = [
  {
    id: 'standing',
    category: 'action',
    label: 'Cantando parado',
    text: 'The performer stays in place while singing, with subtle weight shifts, natural micro-movements of the head and shoulders and relaxed, believable body language.',
  },
  {
    id: 'seated',
    category: 'action',
    label: 'Sentado cantando',
    text: 'The performer sings while seated, with a stable and comfortable posture, natural upper-body movement and grounded contact with the seat.',
  },
  {
    id: 'walking',
    category: 'action',
    label: 'Caminhando e cantando',
    text: 'The performer walks forward while singing, at a natural and steady walking speed. Realistic footsteps with correct ground contact, natural arm swing, believable body balance and natural breathing between phrases. The walk never speeds up or slows down abruptly.',
  },
  {
    id: 'driving',
    category: 'action',
    label: 'Dirigindo e cantando',
    text: 'The performer drives the vehicle while singing, behaving realistically at the wheel. The main attention stays on the road, with occasional natural glances toward the camera or the side window. The hands behave naturally on the steering wheel, with small realistic corrections. The vehicle interior and the motion outside the windows stay consistent.',
  },
  {
    id: 'acoustic-guitar',
    category: 'action',
    label: 'Tocando violão',
    text: 'The performer plays the acoustic guitar with a natural strumming pattern, correct left-hand chord shapes and a relaxed posture around the instrument.',
  },
  {
    id: 'electric-guitar',
    category: 'action',
    label: 'Tocando guitarra',
    text: 'The performer plays the electric guitar with credible picking and fretting motion, a grounded stance and natural body movement following the rhythm.',
  },
  {
    id: 'band',
    category: 'action',
    label: 'Cantando com banda',
    text: 'The performance happens with the full band playing together, with coherent ensemble timing and each musician staying consistent with their instrument.',
  },
  {
    id: 'natural',
    category: 'action',
    label: 'Performance natural',
    text: 'A natural, unforced performance with subtle spontaneous movement and authentic presence, without theatrical or exaggerated gestures.',
  },
  {
    id: 'audience-reaction',
    category: 'action',
    label: 'Reação natural',
    text:
      'The crowd reacts naturally to the show, each person moving independently with small spontaneous shifts rather than a single choreographed gesture.',
  },
  {
    id: 'audience-clapping',
    category: 'action',
    label: 'Aplaudindo',
    text:
      'Audience members clap with believable, unsynchronized timing and natural arm motion, as a live crowd rather than a staged choir of identical claps.',
  },
  {
    id: 'audience-singing-along',
    category: 'action',
    label: 'Cantando junto',
    text:
      'Some audience members sing along at varied intensity, remaining part of the crowd rather than featured vocalists, with independent mouth movement and relaxed body language.',
  },
  {
    id: 'audience-arms-raised',
    category: 'action',
    label: 'Braços erguidos',
    text:
      'Several audience members raise their arms with unsynchronized live-concert energy, some higher than others, never as a uniform choreography.',
  },
  {
    id: 'audience-emotional',
    category: 'action',
    label: 'Emocionada',
    text:
      'The audience watches with restrained emotion: absorbed faces, quiet body language and individual reactions rather than theatrical weeping or identical expressions.',
  },
  {
    id: 'audience-high-energy',
    category: 'action',
    label: 'Energia alta',
    text:
      'High-energy crowd reaction with lively but physically plausible motion, cheers and body bounce that stay independent from person to person.',
  },
  {
    id: 'audience-watching',
    category: 'action',
    label: 'Observando o show',
    text:
      'The audience watches the show attentively, mostly still, with natural head turns, blinking and small shifts of weight while remaining clearly in the public area.',
  },
]

export const FRAMINGS: FramingPreset[] = [
  {
    id: 'close-up',
    category: 'framing',
    label: 'Close-up',
    text: 'Close-up framing on the face, filling most of the frame, with shallow depth of field and the eyes in sharp focus.',
    lipSyncFriendly: true,
  },
  {
    id: 'medium-close-up',
    category: 'framing',
    label: 'Medium close-up',
    text: 'Medium close-up framing from the chest up, keeping the whole face clearly readable.',
    lipSyncFriendly: true,
  },
  {
    id: 'medium-shot',
    category: 'framing',
    label: 'Medium shot',
    text: 'Medium shot framing from the waist up, showing the performance gestures while keeping the face clearly visible.',
    lipSyncFriendly: true,
  },
  {
    id: 'three-quarter-front',
    category: 'framing',
    label: '3/4 frontal',
    text: 'Three-quarter frontal angle, slightly off-axis from the performer, with the face fully visible.',
    lipSyncFriendly: true,
  },
  {
    id: 'three-quarter-left',
    category: 'framing',
    label: '3/4 esquerdo',
    text: 'Three-quarter angle from the left side of the performer, keeping both eyes and the mouth visible.',
    lipSyncFriendly: true,
  },
  {
    id: 'three-quarter-right',
    category: 'framing',
    label: '3/4 direito',
    text: 'Three-quarter angle from the right side of the performer, keeping both eyes and the mouth visible.',
    lipSyncFriendly: true,
  },
  {
    id: 'profile-left',
    category: 'framing',
    label: 'Perfil esquerdo',
    text: 'Left profile angle, with the side of the face and the jawline clearly readable against the background.',
    lipSyncFriendly: false,
  },
  {
    id: 'profile-right',
    category: 'framing',
    label: 'Perfil direito',
    text: 'Right profile angle, with the side of the face and the jawline clearly readable against the background.',
    lipSyncFriendly: false,
  },
  {
    id: 'eye-level',
    category: 'framing',
    label: 'Eye level',
    text: 'Eye-level camera height, aligned with the performer gaze for a neutral and natural perspective.',
    lipSyncFriendly: true,
  },
  {
    id: 'low-angle-slight',
    category: 'framing',
    label: 'Low angle leve',
    text: 'Slightly low camera angle, just below eye level, giving a subtle sense of presence without distorting the face.',
    lipSyncFriendly: true,
  },
]

/** Todas as ações que acontecem fora de um veículo. */
const ON_FOOT_ACTIONS: ActionId[] = [
  'standing',
  'seated',
  'acoustic-guitar',
  'electric-guitar',
  'band',
  'natural',
]

export const CAMERAS: CameraPreset[] = [
  {
    id: 'slow-push-in',
    category: 'camera',
    label: 'Slow push-in',
    text: 'The camera performs a slow, steady push-in toward the performer, gaining intimacy gradually without ever rushing.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'very-slow-push-in',
    category: 'camera',
    label: 'Very slow push-in',
    text: 'The camera performs an almost imperceptible push-in, barely closing the distance across the shot, holding a calm and controlled pace.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'gentle-pull-back',
    category: 'camera',
    label: 'Gentle pull-back',
    text: 'The camera pulls back gently and steadily, slowly revealing more of the scene around the performer.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'lateral-tracking-left',
    category: 'camera',
    label: 'Lateral tracking esquerdo',
    text: 'The camera slides laterally to the left on a smooth dolly or slider, keeping the performer centred and the distance constant.',
    compatibleActions: [...ON_FOOT_ACTIONS, 'walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'lateral-tracking-right',
    category: 'camera',
    label: 'Lateral tracking direito',
    text: 'The camera slides laterally to the right on a smooth dolly or slider, keeping the performer centred and the distance constant.',
    compatibleActions: [...ON_FOOT_ACTIONS, 'walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'smooth-backward-tracking',
    category: 'camera',
    label: 'Smooth backward tracking',
    text: 'A smooth stabilized tracking shot moving backward in front of the performer, matching his walking speed exactly and holding a constant distance and framing.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'smooth-forward-tracking',
    category: 'camera',
    label: 'Smooth forward tracking',
    text: 'A smooth stabilized tracking shot moving forward behind the performer, following the walk at a steady matched pace.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'parallel-tracking',
    category: 'camera',
    label: 'Parallel tracking',
    text: 'The camera tracks parallel to the subject, travelling alongside at the same speed on a straight and stable path.',
    compatibleActions: ['walking', 'driving'],
  },
  {
    id: 'controlled-follow',
    category: 'camera',
    label: 'Controlled follow shot',
    text: 'A controlled stabilized follow shot that accompanies the performer at a consistent distance, with gentle reframing and no sudden corrections.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'three-quarter-tracking',
    category: 'camera',
    label: 'Three-quarter tracking',
    text: 'The camera tracks the performer from a three-quarter position, slightly ahead and to the side, matching the walking speed without drifting.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'locked-cinematic',
    category: 'camera',
    label: 'Locked cinematic',
    text: 'A locked-off cinematic frame on a tripod, completely stable, letting the performance carry the shot.',
    compatibleActions: [...ON_FOOT_ACTIONS, 'driving'],
  },
  {
    id: 'subtle-diagonal-dolly',
    category: 'camera',
    label: 'Subtle diagonal dolly',
    text: 'The camera moves on a subtle diagonal dolly, combining a slight forward and lateral drift in one continuous, controlled motion.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'passenger-side-fixed',
    category: 'camera',
    label: 'Passageiro frontal (fixo)',
    text: 'A fixed camera mounted at the passenger seat, facing the driver from a realistic in-car position, completely stable except for the natural vibration of the moving vehicle.',
    compatibleActions: ['driving'],
  },
  {
    id: 'dashboard-mounted',
    category: 'camera',
    label: 'Dashboard mounted',
    text: 'A dashboard-mounted camera framing the driver from a fixed, physically plausible position inside the vehicle, rigidly attached and moving only with the car.',
    compatibleActions: ['driving'],
  },
  {
    id: 'passenger-three-quarter',
    category: 'camera',
    label: 'Passageiro 3/4',
    text: 'A camera at the passenger side capturing the driver from a three-quarter angle, mounted in a realistic in-car position and staying fixed relative to the interior.',
    compatibleActions: ['driving'],
  },
  {
    id: 'exterior-vehicle-tracking',
    category: 'camera',
    label: 'Exterior acompanhando o veículo',
    text: 'An exterior camera tracking parallel to the vehicle from a chase car or car rig, matching the speed of the vehicle on a straight and stable path.',
    compatibleActions: ['driving'],
  },
]

/**
 * Enquadramento "Automático profissional": ordem de preferência por ação.
 * A primeira opção compatível vence — em cenas com lipsync os perfis são
 * descartados antes, então a escolha sempre mantém o rosto legível.
 */
export const AUTO_FRAMING_BY_ACTION: Record<ActionId, Array<Exclude<FramingId, 'auto'>>> = {
  // Parado: o rosto carrega a cena.
  standing: ['medium-close-up', 'close-up', 'three-quarter-front', 'medium-shot'],
  seated: ['medium-close-up', 'close-up', 'three-quarter-front'],
  // Caminhando: precisa de corpo em quadro para a caminhada ficar legível.
  walking: ['medium-shot', 'three-quarter-front', 'medium-close-up'],
  // Dirigindo: espaço apertado, ângulo lateral é o natural dentro do carro.
  driving: ['medium-close-up', 'three-quarter-right', 'close-up'],
  // Instrumento: o quadro precisa mostrar as mãos tocando.
  'acoustic-guitar': ['medium-shot', 'three-quarter-front', 'medium-close-up'],
  'electric-guitar': ['medium-shot', 'three-quarter-front', 'medium-close-up'],
  // Banda: quadro mais aberto para caber o conjunto.
  band: ['medium-shot', 'three-quarter-front', 'medium-close-up'],
  natural: ['medium-close-up', 'three-quarter-front', 'medium-shot'],
  'audience-reaction': ['crowd-medium-shot', 'crowd-medium-wide', 'front-row-reaction'],
  'audience-clapping': ['crowd-medium-shot', 'crowd-medium-wide', 'audience-section'],
  'audience-singing-along': ['crowd-medium-shot', 'front-row-reaction', 'close-reaction-group'],
  'audience-arms-raised': ['crowd-medium-wide', 'audience-section', 'diagonal-crowd'],
  'audience-emotional': ['front-row-reaction', 'close-reaction-group', 'crowd-medium-shot'],
  'audience-high-energy': ['crowd-medium-wide', 'audience-section', 'diagonal-crowd'],
  'audience-watching': ['crowd-medium-shot', 'audience-section', 'side-crowd-view'],
}

/**
 * "Automático profissional": regras fixas por ação, sem IA e sem aleatoriedade.
 * A primeira entrada de cada lista é a escolha principal; as seguintes alimentam
 * as variações de câmera. A ordem define o resultado, que é sempre previsível.
 */
export const AUTO_CAMERA_BY_ACTION: Record<ActionId, Array<Exclude<CameraId, 'auto'>>> = {
  standing: [
    'slow-push-in',
    'gentle-pull-back',
    'lateral-tracking-left',
    'locked-cinematic',
    'subtle-diagonal-dolly',
  ],
  seated: ['slow-push-in', 'lateral-tracking-left', 'locked-cinematic', 'gentle-pull-back'],
  walking: [
    'smooth-backward-tracking',
    'parallel-tracking',
    'controlled-follow',
    'three-quarter-tracking',
  ],
  driving: [
    'passenger-side-fixed',
    'dashboard-mounted',
    'passenger-three-quarter',
    'exterior-vehicle-tracking',
  ],
  'acoustic-guitar': [
    'slow-push-in',
    'subtle-diagonal-dolly',
    'lateral-tracking-right',
    'locked-cinematic',
  ],
  'electric-guitar': [
    'slow-push-in',
    'subtle-diagonal-dolly',
    'lateral-tracking-left',
    'locked-cinematic',
  ],
  band: [
    'slow-push-in',
    'lateral-tracking-left',
    'subtle-diagonal-dolly',
    'locked-cinematic',
  ],
  natural: ['slow-push-in', 'gentle-pull-back', 'lateral-tracking-right', 'locked-cinematic'],
  'audience-reaction': [
    'locked-cinematic-crowd',
    'very-slow-push-in-crowd',
    'gentle-lateral-crowd',
    'stable-crowd',
  ],
  'audience-clapping': [
    'locked-cinematic-crowd',
    'gentle-lateral-crowd',
    'stable-crowd',
    'subtle-handheld-crowd',
  ],
  'audience-singing-along': [
    'very-slow-push-in-crowd',
    'locked-cinematic-crowd',
    'subtle-handheld-crowd',
    'stable-crowd',
  ],
  'audience-arms-raised': [
    'slow-controlled-pull-back-crowd',
    'locked-cinematic-crowd',
    'gentle-lateral-crowd',
    'stable-crowd',
  ],
  'audience-emotional': [
    'very-slow-push-in-crowd',
    'locked-cinematic-crowd',
    'subtle-handheld-crowd',
    'stable-crowd',
  ],
  'audience-high-energy': [
    'gentle-lateral-crowd',
    'locked-cinematic-crowd',
    'subtle-handheld-crowd',
    'slow-controlled-pull-back-crowd',
  ],
  'audience-watching': [
    'locked-cinematic-crowd',
    'stable-crowd',
    'very-slow-push-in-crowd',
    'slow-controlled-pull-back-crowd',
  ],
}

/** Bloco-base por destino. Comfy/LTX recebe uma instrução mais objetiva. */
export const TARGET_INTRO: Record<'generic' | 'comfy-ltx', string> = {
  generic:
    'Cinematic music video shot, photorealistic, consistent with the reference image.',
  'comfy-ltx':
    'Image-to-video. Animate the reference image without changing it. Keep the source frame as the single visual truth: same person, same face, same clothing, same instruments, same set, same lighting.',
}

export const PERFORMANCE_BY_ID = new Map<PerformanceId, PerformancePreset>(
  PERFORMANCES.map((item) => [item.id, item]),
)
export const ACTION_BY_ID = new Map<ActionId, ActionPreset>(ACTIONS.map((item) => [item.id, item]))
export const FRAMING_BY_ID = new Map<Exclude<FramingId, 'auto'>, FramingPreset>(
  FRAMINGS.map((item) => [item.id, item]),
)
export const CAMERA_BY_ID = new Map<Exclude<CameraId, 'auto'>, CameraPreset>(
  CAMERAS.map((item) => [item.id, item]),
)
