/**
 * Contexto de palco — dimensão compartilhada entre "Criar imagem" e
 * "Animar / Lipsync". Controla se os performers estão sobre a estrutura,
 * fora dela, ou se a cena não deve inventar palco.
 */

export type PerformerStageContextId = 'on-stage' | 'off-stage' | 'no-stage'

export type AudienceContextId =
  | 'audience-area'
  | 'near-stage'
  | 'front-row'
  | 'side-crowd'
  | 'crowd-with-stage-background'
  | 'crowd-no-visible-stage'

export type StageContextId = PerformerStageContextId | AudienceContextId

export interface StageContextPreset {
  id: StageContextId
  category: 'stage-context'
  label: string
  text: string
  constraints: string[]
}

/** Palco visível e performer fisicamente sobre a plataforma. */
const ON_STAGE_TEXT =
  'The performer must be physically positioned on the stage platform. ' +
  'The performer is on the stage itself, not in front of the stage, not in the audience area, ' +
  'not backstage, and not standing on the ground, beach or floor below the stage. ' +
  'Keep visible stage context such as stage floor, microphone stand, monitors, truss structure, ' +
  'stage lighting, backline or LED backdrop when appropriate.'

const ON_STAGE_ENSEMBLE_TEXT =
  'All performers must be positioned on the stage platform in a coherent live-performance arrangement.'

const ON_STAGE_LEAD_SINGER_TEXT =
  'The singer remains the main subject, with the other musicians distributed naturally across the stage. ' +
  'Nobody stands off the stage structure.'

/** Em vídeo: movimento permanece na plataforma. */
const ON_STAGE_MOTION_TEXT =
  'Keep all performance movement on the stage platform. Do not walk, step or reposition onto the ground, ' +
  'sand, audience area or any space in front of or below the stage.'

const OFF_STAGE_TEXT =
  'The performer is outside the stage structure, performing in the surrounding environment. ' +
  'Do not place the performer on the stage platform.'

const NO_STAGE_TEXT =
  'No concert stage structure should appear in the scene. Do not include stage platform, truss, ' +
  'large concert lighting rig, backstage elements or live-stage setup unless explicitly requested.'

const ON_STAGE_GUITARIST_TEXT =
  'The guitarist must be physically positioned on the stage platform. ' +
  'The guitarist is on the stage itself, not in front of the stage, not in the audience area, ' +
  'not backstage, and not standing on the ground, beach or floor below the stage. ' +
  'Keep visible stage context such as stage floor, monitors, truss structure, ' +
  'stage lighting, backline or LED backdrop when appropriate.'

const ON_STAGE_DRUMMER_TEXT =
  'The drummer and the drum kit must stay physically positioned on the stage platform. ' +
  'Keep the kit on the stage itself, not in front of the stage, not in the audience area, ' +
  'and not on the ground below the stage. Keep visible stage context such as stage floor, ' +
  'monitors, truss structure, stage lighting, backline or LED backdrop when appropriate.'

const ON_STAGE_BAND_TEXT =
  'The musicians must be physically positioned on the stage platform in a coherent live-band arrangement. ' +
  'Nobody stands off the stage structure. Do not place a singer or front performer in the shot.'

const OFF_STAGE_GUITARIST_TEXT =
  'The guitarist is outside the stage structure, performing in the surrounding environment. ' +
  'Do not place the guitarist on the stage platform.'

const OFF_STAGE_DRUMMER_TEXT =
  'The drummer is outside the stage structure, performing in the surrounding environment. ' +
  'Do not place the drummer or the kit on the stage platform.'

const OFF_STAGE_BAND_TEXT =
  'The musicians are outside the stage structure, performing in the surrounding environment. ' +
  'Do not place the band on the stage platform and do not add a singer.'

const ON_STAGE_MOTION_GUITARIST_TEXT =
  'Keep the guitarist movement on the stage platform. Do not walk, step or reposition onto the ground, ' +
  'sand, audience area or any space in front of or below the stage.'

const ON_STAGE_MOTION_DRUMMER_TEXT =
  'Keep the drummer and the kit on the stage platform. Do not reposition onto the ground, ' +
  'sand, audience area or any space in front of or below the stage.'

const ON_STAGE_MOTION_BAND_TEXT =
  'Keep all band movement on the stage platform. Do not walk, step or reposition onto the ground, ' +
  'sand, audience area or any space in front of or below the stage.'

export const STAGE_CONTEXTS: StageContextPreset[] = [
  {
    id: 'on-stage',
    category: 'stage-context',
    label: 'No palco',
    text: ON_STAGE_TEXT,
    constraints: [
      'no performer in front of the stage',
      'no performer below the stage',
      'no performer in the audience area',
      'no performer backstage',
      'no performer off to the side of the stage',
      'no performer on the sand or ground in front of the stage',
    ],
  },
  {
    id: 'off-stage',
    category: 'stage-context',
    label: 'Fora do palco',
    text: OFF_STAGE_TEXT,
    constraints: ['no performer on the stage platform'],
  },
  {
    id: 'no-stage',
    category: 'stage-context',
    label: 'Sem palco / locação livre',
    text: NO_STAGE_TEXT,
    constraints: [
      'no concert stage structure',
      'no stage platform',
      'no lighting truss',
      'no large concert lighting rig',
      'no backstage elements',
      'no live-stage setup',
    ],
  },
]

export const AUDIENCE_CONTEXTS: StageContextPreset[] = [
  {
    id: 'audience-area',
    category: 'stage-context',
    label: 'Na área do público',
    text:
      'The camera stays with the audience in the public area of the venue. Crowd members occupy the audience space ' +
      'and remain spectators throughout the shot.',
    constraints: [],
  },
  {
    id: 'near-stage',
    category: 'stage-context',
    label: 'Perto do palco',
    text:
      'The crowd stands in the public area close to the stage edge, still clearly audience, with the show happening on stage beyond them.',
    constraints: [],
  },
  {
    id: 'front-row',
    category: 'stage-context',
    label: 'Plateia frontal',
    text:
      'Front-row audience composition: people in the closest public rows, facing the show, remaining crowd rather than stage talent.',
    constraints: [],
  },
  {
    id: 'side-crowd',
    category: 'stage-context',
    label: 'Plateia lateral',
    text:
      'Side-audience composition from a lateral public area, with the crowd remaining the subject of the frame.',
    constraints: [],
  },
  {
    id: 'crowd-with-stage-background',
    category: 'stage-context',
    label: 'Plateia com palco ao fundo',
    text:
      'Audience in the foreground with the stage visible behind them as venue context. The crowd stays the subject; the stage is background scenery.',
    constraints: [],
  },
  {
    id: 'crowd-no-visible-stage',
    category: 'stage-context',
    label: 'Plateia sem palco visível',
    text:
      'Audience-only frame in the public area, with no concert stage required in shot. The crowd remains the subject.',
    constraints: [],
  },
]

export const STAGE_CONTEXT_BY_ID = new Map<StageContextId, StageContextPreset>(
  [...STAGE_CONTEXTS, ...AUDIENCE_CONTEXTS].map((item) => [item.id, item]),
)

export const DEFAULT_STAGE_CONTEXT_ID: StageContextId = 'on-stage'
export const DEFAULT_AUDIENCE_CONTEXT_ID: AudienceContextId = 'audience-area'

const AUDIENCE_CONTEXT_IDS = new Set<StageContextId>(AUDIENCE_CONTEXTS.map((item) => item.id))

export function isAudienceContextId(id: StageContextId): boolean {
  return AUDIENCE_CONTEXT_IDS.has(id)
}

export function stageContextsFor(sceneKind?: ComposeStageContextOptions['sceneKind']): StageContextPreset[] {
  return sceneKind === 'audience' ? AUDIENCE_CONTEXTS : STAGE_CONTEXTS
}

export function defaultStageContextFor(
  sceneKind?: ComposeStageContextOptions['sceneKind'],
): StageContextId {
  return sceneKind === 'audience' ? DEFAULT_AUDIENCE_CONTEXT_ID : DEFAULT_STAGE_CONTEXT_ID
}

export interface ComposeStageContextOptions {
  stageContextId: StageContextId
  /** Vários músicos no quadro. */
  ensemble?: boolean
  /** Com cantor em cena, o cantor continua o assunto principal. */
  keepLeadSinger?: boolean
  /** Animação: reforça que o movimento não sai do palco. */
  animation?: boolean
  /**
   * Sujeito da cena de vídeo. Omitido ou `singer` preserva o texto padrão
   * (cantor / performer). As outras famílias evitam linguagem de vocalista.
   */
  sceneKind?: 'singer' | 'guitarist' | 'drummer' | 'band-no-singer' | 'audience'
}

/** Texto do bloco STAGE CONTEXT, com reforços de banda e de movimento. */
export function composeStageContextText(options: ComposeStageContextOptions): string {
  const preset = STAGE_CONTEXT_BY_ID.get(options.stageContextId)
  if (!preset) return ''

  const kind = options.sceneKind ?? 'singer'
  if (kind !== 'singer') {
    return composeNonSingerStageText(options, kind)
  }

  const parts = [preset.text]
  if (options.stageContextId === 'on-stage' && options.ensemble) {
    parts.push(ON_STAGE_ENSEMBLE_TEXT)
    if (options.keepLeadSinger) parts.push(ON_STAGE_LEAD_SINGER_TEXT)
    else parts.push('Nobody stands off the stage structure.')
  }
  if (options.stageContextId === 'on-stage' && options.animation) {
    parts.push(ON_STAGE_MOTION_TEXT)
  }
  return parts.join(' ')
}

function composeNonSingerStageText(
  options: ComposeStageContextOptions,
  kind: 'guitarist' | 'drummer' | 'band-no-singer' | 'audience',
): string {
  if (kind === 'audience') {
    return composeAudienceContextText(options)
  }

  const parts: string[] = []
  if (options.stageContextId === 'on-stage') {
    if (kind === 'guitarist') parts.push(ON_STAGE_GUITARIST_TEXT)
    else if (kind === 'drummer') parts.push(ON_STAGE_DRUMMER_TEXT)
    else parts.push(ON_STAGE_BAND_TEXT)
    if (options.animation) {
      if (kind === 'guitarist') parts.push(ON_STAGE_MOTION_GUITARIST_TEXT)
      else if (kind === 'drummer') parts.push(ON_STAGE_MOTION_DRUMMER_TEXT)
      else parts.push(ON_STAGE_MOTION_BAND_TEXT)
    }
    return parts.join(' ')
  }
  if (options.stageContextId === 'off-stage') {
    if (kind === 'guitarist') return OFF_STAGE_GUITARIST_TEXT
    if (kind === 'drummer') return OFF_STAGE_DRUMMER_TEXT
    return OFF_STAGE_BAND_TEXT
  }
  const fallback = STAGE_CONTEXT_BY_ID.get(options.stageContextId)
  return fallback?.text ?? ''
}

/** Plateia usa contextos próprios; ids antigos de palco caem no equivalente de público. */
function composeAudienceContextText(options: ComposeStageContextOptions): string {
  const resolvedId = resolveAudienceContextId(options.stageContextId)
  const preset = STAGE_CONTEXT_BY_ID.get(resolvedId)
  return preset?.text ?? ''
}

function resolveAudienceContextId(id: StageContextId): AudienceContextId {
  if (isAudienceContextId(id)) return id as AudienceContextId
  if (id === 'no-stage' || id === 'off-stage') return 'crowd-no-visible-stage'
  return DEFAULT_AUDIENCE_CONTEXT_ID
}

/** Restrições negativas correspondentes ao contexto escolhido. */
export function stageContextConstraints(options: ComposeStageContextOptions): string[] {
  if (options.sceneKind === 'audience') return []

  const preset = STAGE_CONTEXT_BY_ID.get(options.stageContextId)
  if (!preset) return []

  if (options.stageContextId === 'on-stage' && options.animation) {
    return [
      ...preset.constraints,
      'no walking off the stage',
      'no movement onto the ground in front of the stage',
    ]
  }
  return [...preset.constraints]
}
