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
 * Biblioteca global de presets dos Prompts rápidos (IDs, labels, compatibilidade).
 * O corpo de cada cena de vídeo vive em `animationPromptPresets/bodies.ts`.
 */

export const LIP_SYNC_PHRASE =
  'Natural precise lip sync to the provided audio, subtle breathing, blinking and restrained head and body movement.'

export const PERFORMANCES: PerformancePreset[] = [
  {
    id: 'singer-solo',
    category: 'performance',
    label: 'Cantor sozinho',
    text: 'The singer performs alone as the single subject.',
    compatibleActions: ['standing', 'seated', 'walking', 'driving', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-mic',
    category: 'performance',
    label: 'Cantor no microfone',
    text: 'The singer performs into the microphone from the reference image.',
    compatibleActions: ['standing', 'seated', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-acoustic',
    category: 'performance',
    label: 'Cantor + violão',
    text: 'The singer performs while playing the acoustic guitar from the reference image.',
    compatibleActions: ['standing', 'seated', 'acoustic-guitar', 'band', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-electric',
    category: 'performance',
    label: 'Cantor + guitarra',
    text: 'The singer performs while playing the electric guitar from the reference image.',
    compatibleActions: ['standing', 'electric-guitar', 'band', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'singer-band',
    category: 'performance',
    label: 'Cantor + banda',
    text: 'The singer performs in front of the band from the reference image.',
    compatibleActions: ['standing', 'band', 'natural'],
    supportsLipSync: true,
  },
  {
    id: 'guitarist',
    category: 'performance',
    label: 'Guitarrista sozinho',
    text: 'The guitarist performs naturally with realistic instrument-playing motion.',
    compatibleActions: ['electric-guitar', 'natural'],
    supportsLipSync: false,
  },
  {
    id: 'drummer',
    category: 'performance',
    label: 'Baterista',
    text: 'The drummer performs naturally with realistic stick and arm movement.',
    compatibleActions: ['natural'],
    supportsLipSync: false,
  },
  {
    id: 'band-no-singer',
    category: 'performance',
    label: 'Banda sem cantor',
    text: 'The musicians perform naturally. Do not add a singer or front performer.',
    compatibleActions: ['band', 'natural'],
    supportsLipSync: false,
  },
  {
    id: 'audience',
    category: 'performance',
    label: 'Plateia',
    text: 'The shot stays on the concert audience as the subject.',
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
    text: 'The performer stays in place while singing, with subtle weight shifts.',
  },
  {
    id: 'seated',
    category: 'action',
    label: 'Sentado cantando',
    text: 'The performer sings while seated, with a stable upper-body posture.',
  },
  {
    id: 'walking',
    category: 'action',
    label: 'Caminhando e cantando',
    text: 'The performer walks forward while singing, at a natural steady pace with realistic footsteps.',
  },
  {
    id: 'driving',
    category: 'action',
    label: 'Dirigindo e cantando',
    text: 'The performer drives while singing, attention mainly on the road, hands natural on the wheel.',
  },
  {
    id: 'acoustic-guitar',
    category: 'action',
    label: 'Tocando violão',
    text: 'The performer plays the acoustic guitar with a natural strumming pattern.',
  },
  {
    id: 'electric-guitar',
    category: 'action',
    label: 'Tocando guitarra',
    text: 'The performer plays the electric guitar with credible picking and fretting.',
  },
  {
    id: 'band',
    category: 'action',
    label: 'Cantando com banda',
    text: 'The full band plays together with coherent ensemble timing.',
  },
  {
    id: 'natural',
    category: 'action',
    label: 'Performance natural',
    text: 'A natural unforced performance, without theatrical gestures.',
  },
  {
    id: 'audience-reaction',
    category: 'action',
    label: 'Reação natural',
    text: 'Subtle varied reactions, independent from person to person.',
  },
  {
    id: 'audience-clapping',
    category: 'action',
    label: 'Aplaudindo',
    text: 'Irregular natural clapping, not a single shared rhythm.',
  },
  {
    id: 'audience-singing-along',
    category: 'action',
    label: 'Cantando junto',
    text: 'Believable group singing along, varied timing and intensity, still clearly crowd.',
  },
  {
    id: 'audience-arms-raised',
    category: 'action',
    label: 'Braços erguidos',
    text: 'Scattered raised arms, not everyone identical.',
  },
  {
    id: 'audience-emotional',
    category: 'action',
    label: 'Emocionada',
    text: 'Restrained facial emotion and attentive body language.',
  },
  {
    id: 'audience-high-energy',
    category: 'action',
    label: 'Energia alta',
    text: 'Stronger movement and energy, still physically believable.',
  },
  {
    id: 'audience-watching',
    category: 'action',
    label: 'Observando o show',
    text: 'Focused attention on the show, only subtle movement.',
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
    text: 'Use a slow professional push-in, stable and controlled.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'very-slow-push-in',
    category: 'camera',
    label: 'Very slow push-in',
    text: 'Use a very slow cinematic push-in.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'gentle-pull-back',
    category: 'camera',
    label: 'Gentle pull-back',
    text: 'Use a gentle, steady pull-back.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'lateral-tracking-left',
    category: 'camera',
    label: 'Lateral tracking esquerdo',
    text: 'Use a slow lateral movement to the left, keeping a consistent distance.',
    compatibleActions: [...ON_FOOT_ACTIONS, 'walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'lateral-tracking-right',
    category: 'camera',
    label: 'Lateral tracking direito',
    text: 'Use a slow lateral movement to the right, keeping a consistent distance.',
    compatibleActions: [...ON_FOOT_ACTIONS, 'walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'smooth-backward-tracking',
    category: 'camera',
    label: 'Smooth backward tracking',
    text: 'Use a smooth backward tracking shot matching the walk.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'smooth-forward-tracking',
    category: 'camera',
    label: 'Smooth forward tracking',
    text: 'Use a smooth forward tracking shot behind the walk.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'parallel-tracking',
    category: 'camera',
    label: 'Parallel tracking',
    text: 'Use a parallel tracking shot at the same speed.',
    compatibleActions: ['walking', 'driving'],
  },
  {
    id: 'controlled-follow',
    category: 'camera',
    label: 'Controlled follow shot',
    text: 'Use a controlled follow shot at a consistent distance.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'three-quarter-tracking',
    category: 'camera',
    label: 'Three-quarter tracking',
    text: 'Use a three-quarter tracking shot matching the walk.',
    compatibleActions: ['walking'],
    blockedActions: ['driving'],
  },
  {
    id: 'locked-cinematic',
    category: 'camera',
    label: 'Locked cinematic',
    text: 'Use a locked cinematic camera on a tripod.',
    compatibleActions: [...ON_FOOT_ACTIONS, 'driving'],
  },
  {
    id: 'subtle-diagonal-dolly',
    category: 'camera',
    label: 'Subtle diagonal dolly',
    text: 'Use a subtle diagonal dolly, one continuous controlled motion.',
    compatibleActions: ON_FOOT_ACTIONS,
    blockedActions: ['driving'],
  },
  {
    id: 'passenger-side-fixed',
    category: 'camera',
    label: 'Passageiro frontal (fixo)',
    text: 'Use a passenger-side stable camera inside the vehicle.',
    compatibleActions: ['driving'],
  },
  {
    id: 'dashboard-mounted',
    category: 'camera',
    label: 'Dashboard mounted',
    text: 'Use a dashboard-mounted camera fixed to the vehicle.',
    compatibleActions: ['driving'],
  },
  {
    id: 'passenger-three-quarter',
    category: 'camera',
    label: 'Passageiro 3/4',
    text: 'Use a passenger-side three-quarter camera, fixed to the interior.',
    compatibleActions: ['driving'],
  },
  {
    id: 'exterior-vehicle-tracking',
    category: 'camera',
    label: 'Exterior acompanhando o veículo',
    text: 'Use an exterior camera tracking parallel to the vehicle.',
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
    'very-slow-push-in',
    'slow-push-in',
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
    'lateral-tracking-left',
    'slow-push-in',
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

/** Prefixo mínimo por destino. O corpo da cena não é compartilhado. */
export const TARGET_INTRO: Record<'generic' | 'comfy-ltx', string> = {
  generic: '',
  'comfy-ltx': 'Image-to-video.',
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
