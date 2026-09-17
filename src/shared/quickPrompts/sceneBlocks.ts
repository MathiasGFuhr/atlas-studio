import type {
  CameraId,
  CameraPreset,
  FramingId,
  FramingPreset,
  PerformanceId,
  PromptTarget,
  SceneKind,
} from './types'

/**
 * Blocos específicos das performances sem cantor na aba Animar / Lipsync.
 *
 * Guitarrista, baterista, banda sem cantor e plateia NÃO reutilizam intro,
 * preservação, lipsync, enquadramento nem câmera pensados para cantor.
 */

export const NO_LIP_SYNC_REQUIREMENT = 'No lip-sync requirement.'

const NON_SINGER_IDS: PerformanceId[] = ['guitarist', 'drummer', 'band-no-singer', 'audience']

export function sceneKindFor(performanceId?: PerformanceId): SceneKind {
  if (performanceId === 'guitarist') return 'guitarist'
  if (performanceId === 'drummer') return 'drummer'
  if (performanceId === 'band-no-singer') return 'band-no-singer'
  if (performanceId === 'audience') return 'audience'
  return 'singer'
}

export function isNonSingerScene(performanceId?: PerformanceId): boolean {
  return Boolean(performanceId && NON_SINGER_IDS.includes(performanceId))
}

export interface SceneBlockSet {
  intro: Record<PromptTarget, string>
  preservation: string
  framingIds: Array<Exclude<FramingId, 'auto'>>
  framingTexts: Partial<Record<Exclude<FramingId, 'auto'>, string>>
  cameraIds: Array<Exclude<CameraId, 'auto'>>
  cameraTexts: Partial<Record<Exclude<CameraId, 'auto'>, string>>
  autoFraming: Array<Exclude<FramingId, 'auto'>>
  autoCamera: Array<Exclude<CameraId, 'auto'>>
  constraints: string[]
  forbiddenCameraMoves: string[]
}

const SHARED_FORBIDDEN_CAMERA = [
  'no 360-degree camera movement',
  'no orbit or orbiting camera',
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

const GUITARIST_FRAMING: SceneBlockSet['framingTexts'] = {
  'medium-close-up':
    'Medium close-up instrument shot from the chest up, keeping the guitarist and the guitar clearly in frame.',
  'medium-shot':
    'Medium shot from the waist up, with the guitar fully visible.',
  'three-quarter-front':
    'Three-quarter frontal instrument shot of the guitarist, with the guitar fully visible.',
  'three-quarter-left':
    'Three-quarter angle from the left side of the guitarist, keeping the musician and the guitar in frame.',
  'three-quarter-right':
    'Three-quarter angle from the right side of the guitarist, keeping the musician and the guitar in frame.',
  'low-angle-slight':
    'Slightly low camera angle on the guitarist, emphasizing the musician and the guitar without distorting the body.',
}

const DRUMMER_FRAMING: SceneBlockSet['framingTexts'] = {
  'three-quarter-front':
    'Frontal drummer shot showing the drummer together with the drum kit from the reference image.',
  'three-quarter-left':
    'Three-quarter angle from the left side of the drummer, keeping the kit, sticks and playing motion visible.',
  'three-quarter-right':
    'Three-quarter angle from the right side of the drummer, keeping the kit, sticks and playing motion visible.',
  'medium-shot':
    'Medium shot of the drummer that keeps the kit, arms and stick motion clearly visible.',
  'medium-wide':
    'Controlled medium-wide drummer shot that includes the drummer and the kit without opening into a crowd or singer frame.',
  'low-angle-slight':
    'Slightly low camera angle on the drummer and the kit, giving presence without distorting the drums or the body.',
}

const BAND_FRAMING: SceneBlockSet['framingTexts'] = {
  'medium-shot':
    'Stable band shot from a medium distance, keeping the visible musicians and instruments in a coherent ensemble frame.',
  'medium-wide':
    'Controlled medium-wide band shot that holds the group together as a coherent ensemble.',
  'three-quarter-front':
    'Three-quarter band shot covering the ensemble layout from the reference image.',
  'three-quarter-left':
    'Three-quarter angle from the left side of the band, keeping the group composition intact.',
  'three-quarter-right':
    'Three-quarter angle from the right side of the band, keeping the group composition intact.',
}

export const SCENE_FRAMINGS: FramingPreset[] = [
  {
    id: 'medium-wide',
    category: 'framing',
    label: 'Medium-wide',
    text: 'Controlled medium-wide framing that holds the group or kit in a coherent composition.',
    lipSyncFriendly: false,
  },
  {
    id: 'crowd-medium-shot',
    category: 'framing',
    label: 'Crowd medium shot',
    text: 'Crowd medium shot of a coherent group of audience members, with the public area as the subject.',
    lipSyncFriendly: false,
  },
  {
    id: 'crowd-medium-wide',
    category: 'framing',
    label: 'Crowd medium-wide',
    text: 'Crowd medium-wide shot covering a larger audience section while keeping the crowd as the subject.',
    lipSyncFriendly: false,
  },
  {
    id: 'front-row-reaction',
    category: 'framing',
    label: 'Front-row reaction',
    text: 'Front-row reaction shot on nearby audience faces and upper bodies in the public area closest to the show.',
    lipSyncFriendly: false,
  },
  {
    id: 'audience-section',
    category: 'framing',
    label: 'Audience section',
    text: 'Audience section shot covering a coherent block of the crowd rather than a single featured person.',
    lipSyncFriendly: false,
  },
  {
    id: 'side-crowd-view',
    category: 'framing',
    label: 'Side crowd view',
    text: 'Side crowd view from a lateral public angle, keeping the audience arrangement readable.',
    lipSyncFriendly: false,
  },
  {
    id: 'close-reaction-group',
    category: 'framing',
    label: 'Close reaction group',
    text: 'Close reaction group of a few audience members, still clearly a crowd fragment rather than a solo performer portrait.',
    lipSyncFriendly: false,
  },
  {
    id: 'diagonal-crowd',
    category: 'framing',
    label: 'Diagonal crowd composition',
    text: 'Diagonal crowd composition with depth through rows of audience members in the public area.',
    lipSyncFriendly: false,
  },
  {
    id: 'crowd-stage-background',
    category: 'framing',
    label: 'Plateia com palco ao fundo',
    text: 'Audience in the foreground with the stage visible behind them as venue context. The crowd remains the subject of the frame.',
    lipSyncFriendly: false,
  },
]

const AUDIENCE_ACTION_IDS = [
  'audience-reaction',
  'audience-clapping',
  'audience-singing-along',
  'audience-arms-raised',
  'audience-emotional',
  'audience-high-energy',
  'audience-watching',
] as const

export const SCENE_CAMERAS: CameraPreset[] = [
  {
    id: 'subtle-handheld',
    category: 'camera',
    label: 'Handheld documental sutil',
    text: 'Subtle documentary-style handheld: tiny natural micro-movement only.',
    compatibleActions: ['natural'],
  },
  {
    id: 'locked-cinematic-crowd',
    category: 'camera',
    label: 'Locked cinematic crowd shot',
    text: 'Use a locked cinematic crowd shot.',
    compatibleActions: [...AUDIENCE_ACTION_IDS],
  },
  {
    id: 'very-slow-push-in-crowd',
    category: 'camera',
    label: 'Very slow push-in on crowd',
    text: 'Use a very slow push-in on the crowd.',
    compatibleActions: [...AUDIENCE_ACTION_IDS],
  },
  {
    id: 'gentle-lateral-crowd',
    category: 'camera',
    label: 'Gentle lateral crowd movement',
    text: 'Use a gentle lateral crowd movement, keeping a consistent distance.',
    compatibleActions: [...AUDIENCE_ACTION_IDS],
  },
  {
    id: 'stable-crowd',
    category: 'camera',
    label: 'Stable crowd shot',
    text: 'Use a stable professional crowd shot.',
    compatibleActions: [...AUDIENCE_ACTION_IDS],
  },
  {
    id: 'subtle-handheld-crowd',
    category: 'camera',
    label: 'Subtle documentary-style handheld',
    text: 'Subtle documentary-style handheld on the crowd.',
    compatibleActions: [...AUDIENCE_ACTION_IDS],
  },
  {
    id: 'slow-controlled-pull-back-crowd',
    category: 'camera',
    label: 'Slow controlled pull-back',
    text: 'Use a slow controlled pull-back on the crowd.',
    compatibleActions: [...AUDIENCE_ACTION_IDS],
  },
]

export const SCENE_BLOCKS: Record<Exclude<SceneKind, 'singer'>, SceneBlockSet> = {
  guitarist: {
    intro: {
      generic:
        'Cinematic music video shot of a guitarist, photorealistic, consistent with the reference image.',
      'comfy-ltx':
        'Image-to-video. Animate the reference image without changing it. Keep the source frame as the single visual truth: same guitarist, same face, same clothing, same guitar, same set and same lighting.',
    },
    preservation:
      'Preserve exactly the guitarist, face, hair, clothing, body proportions, guitar, environment and lighting from the reference image. Do not change the identity of the guitarist, do not add or remove people, do not turn the guitarist into a singer and do not alter the guitar or the location.',
    framingIds: [
      'medium-close-up',
      'medium-shot',
      'three-quarter-front',
      'three-quarter-left',
      'three-quarter-right',
      'low-angle-slight',
    ],
    framingTexts: GUITARIST_FRAMING,
    cameraIds: [
      'slow-push-in',
      'very-slow-push-in',
      'subtle-diagonal-dolly',
      'lateral-tracking-left',
      'lateral-tracking-right',
      'locked-cinematic',
    ],
    cameraTexts: {
      'slow-push-in': 'Use a slow professional push-in on the guitarist and the guitar.',
      'very-slow-push-in': 'Use a very slow cinematic push-in on the guitarist.',
      'subtle-diagonal-dolly': 'Use a subtle diagonal dolly on the guitarist.',
      'lateral-tracking-left': 'Use a slow lateral movement to the left, keeping the guitarist and guitar stable in frame.',
      'lateral-tracking-right': 'Use a slow lateral movement to the right, keeping the guitarist and guitar stable in frame.',
      'locked-cinematic': 'Use a locked cinematic instrument shot.',
    },
    autoFraming: ['medium-shot', 'three-quarter-front', 'medium-close-up', 'low-angle-slight'],
    autoCamera: [
      'lateral-tracking-left',
      'locked-cinematic',
      'slow-push-in',
      'subtle-diagonal-dolly',
    ],
    constraints: [
      'no lip-sync',
      'no singer transformation',
      'no duplicated guitar',
      'no extra fingers',
      'no warped guitar',
      'no identity changes',
    ],
    forbiddenCameraMoves: [
      ...SHARED_FORBIDDEN_CAMERA,
      'no camera circling around the guitarist',
    ],
  },
  drummer: {
    intro: {
      generic:
        'Cinematic music video shot of a drummer, photorealistic, consistent with the reference image.',
      'comfy-ltx':
        'Image-to-video. Animate the reference image without changing it. Keep the source frame as the single visual truth: same drummer, same face, same clothing, same drum kit, same set and same lighting.',
    },
    preservation:
      'Preserve exactly the drummer, face, hair, clothing, body proportions, drum kit, sticks, environment and lighting from the reference image. Do not change the identity of the drummer, do not add or remove people, do not turn the drummer into a singer and do not alter the kit or the location.',
    framingIds: [
      'three-quarter-front',
      'three-quarter-left',
      'three-quarter-right',
      'medium-shot',
      'medium-wide',
      'low-angle-slight',
    ],
    framingTexts: DRUMMER_FRAMING,
    cameraIds: [
      'locked-cinematic',
      'slow-push-in',
      'very-slow-push-in',
      'lateral-tracking-left',
      'lateral-tracking-right',
      'subtle-diagonal-dolly',
    ],
    cameraTexts: {
      'locked-cinematic': 'Use a locked cinematic drummer shot.',
      'slow-push-in': 'Use a slow professional push-in toward the drummer and the kit.',
      'very-slow-push-in': 'Use a very slow cinematic push-in on the drummer.',
      'lateral-tracking-left': 'Use a slow lateral movement to the left, keeping the drummer and kit stable in frame.',
      'lateral-tracking-right': 'Use a slow lateral movement to the right, keeping the drummer and kit stable in frame.',
      'subtle-diagonal-dolly': 'Use a subtle diagonal dolly across the drummer shot.',
    },
    autoFraming: [
      'medium-shot',
      'three-quarter-front',
      'three-quarter-left',
      'medium-wide',
      'low-angle-slight',
    ],
    autoCamera: [
      'locked-cinematic',
      'slow-push-in',
      'lateral-tracking-left',
      'subtle-diagonal-dolly',
    ],
    constraints: [
      'no lip-sync',
      'no singer transformation',
      'no duplicated drum pieces',
      'no extra limbs',
      'no broken stick anatomy',
      'no identity changes',
    ],
    forbiddenCameraMoves: [
      ...SHARED_FORBIDDEN_CAMERA,
      'no camera circling around the drummer',
    ],
  },
  'band-no-singer': {
    intro: {
      generic:
        'Cinematic music video shot of an instrumental band, photorealistic, consistent with the reference image.',
      'comfy-ltx':
        'Image-to-video. Animate the reference image without changing it. Keep the source frame as the single visual truth: preserve the same musicians, clothing, instruments, stage layout, environment and lighting.',
    },
    preservation:
      'Preserve the visible band members, their approximate positions, body proportions, instruments and the overall scene from the reference image. Do not add a singer or front performer, do not turn any musician into a singer, do not add or remove people and do not change identities.',
    framingIds: [
      'medium-shot',
      'medium-wide',
      'three-quarter-front',
      'three-quarter-left',
      'three-quarter-right',
    ],
    framingTexts: BAND_FRAMING,
    cameraIds: [
      'locked-cinematic',
      'lateral-tracking-left',
      'lateral-tracking-right',
      'slow-push-in',
      'subtle-diagonal-dolly',
    ],
    cameraTexts: {
      'locked-cinematic': 'Use a locked cinematic band shot.',
      'lateral-tracking-left': 'Use a slow controlled camera movement across the band to the left.',
      'lateral-tracking-right': 'Use a slow controlled camera movement across the band to the right.',
      'slow-push-in': 'Use a slow controlled push-in on the band as a group.',
      'subtle-diagonal-dolly': 'Use a subtle diagonal across the band.',
    },
    autoFraming: ['medium-wide', 'medium-shot', 'three-quarter-front'],
    autoCamera: [
      'lateral-tracking-left',
      'locked-cinematic',
      'slow-push-in',
      'subtle-diagonal-dolly',
    ],
    constraints: [
      'no singer creation',
      'no vocal microphone focus unless already in the reference and justified',
      'no duplicated musicians',
      'no synchronized robotic movement',
      'no identity changes',
      'no lip-sync',
    ],
    forbiddenCameraMoves: [
      ...SHARED_FORBIDDEN_CAMERA,
      'no camera circling around the band',
      'no camera push-in toward a singer',
    ],
  },
  audience: {
    intro: {
      generic:
        'Cinematic music video shot of a concert audience, photorealistic, consistent with the reference image.',
      'comfy-ltx':
        'Image-to-video. Animate the reference image without changing it. Keep the source frame as the single visual truth: preserve the same audience members, clothing, venue, crowd arrangement, environment and lighting.',
    },
    preservation:
      'Preserve the visible audience members, their approximate positions, clothing, crowd arrangement, venue and lighting from the reference image.',
    framingIds: [
      'crowd-medium-shot',
      'crowd-medium-wide',
      'front-row-reaction',
      'audience-section',
      'side-crowd-view',
      'close-reaction-group',
      'diagonal-crowd',
      'crowd-stage-background',
    ],
    framingTexts: {},
    cameraIds: [
      'locked-cinematic-crowd',
      'very-slow-push-in-crowd',
      'gentle-lateral-crowd',
      'stable-crowd',
      'subtle-handheld-crowd',
      'slow-controlled-pull-back-crowd',
    ],
    cameraTexts: {},
    autoFraming: ['crowd-medium-shot', 'crowd-medium-wide', 'front-row-reaction', 'audience-section'],
    autoCamera: [
      'locked-cinematic-crowd',
      'very-slow-push-in-crowd',
      'gentle-lateral-crowd',
      'stable-crowd',
      'subtle-handheld-crowd',
      'slow-controlled-pull-back-crowd',
    ],
    constraints: ['independent crowd timing rather than choreography'],
    forbiddenCameraMoves: [...SHARED_FORBIDDEN_CAMERA],
  },
}

export function sceneBlocksFor(performanceId?: PerformanceId): SceneBlockSet | null {
  const kind = sceneKindFor(performanceId)
  if (kind === 'singer') return null
  return SCENE_BLOCKS[kind]
}
