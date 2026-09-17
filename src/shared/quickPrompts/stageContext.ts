/**
 * Contexto de palco — dimensão compartilhada entre "Criar imagem" e
 * "Animar / Lipsync". Textos curtos: uma frase, não um parágrafo de negativas.
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

export const STAGE_CONTEXTS: StageContextPreset[] = [
  {
    id: 'on-stage',
    category: 'stage-context',
    label: 'No palco',
    text: 'The performer remains on the stage platform.',
    constraints: [],
  },
  {
    id: 'off-stage',
    category: 'stage-context',
    label: 'Fora do palco',
    text: 'The performer is outside the stage structure.',
    constraints: [],
  },
  {
    id: 'no-stage',
    category: 'stage-context',
    label: 'Sem palco / locação livre',
    text: 'No concert stage structure.',
    constraints: [],
  },
]

export const AUDIENCE_CONTEXTS: StageContextPreset[] = [
  {
    id: 'audience-area',
    category: 'stage-context',
    label: 'Na área do público',
    text: 'Stay with the audience in the public area of the venue.',
    constraints: [],
  },
  {
    id: 'near-stage',
    category: 'stage-context',
    label: 'Perto do palco',
    text: 'The crowd stands in the public area close to the stage edge.',
    constraints: [],
  },
  {
    id: 'front-row',
    category: 'stage-context',
    label: 'Plateia frontal',
    text: 'Front-row audience, facing the show, remaining crowd rather than stage talent.',
    constraints: [],
  },
  {
    id: 'side-crowd',
    category: 'stage-context',
    label: 'Plateia lateral',
    text: 'Side-audience from a lateral public area, crowd as the subject.',
    constraints: [],
  },
  {
    id: 'crowd-with-stage-background',
    category: 'stage-context',
    label: 'Plateia com palco ao fundo',
    text: 'Audience in the foreground with the stage visible behind them as venue context.',
    constraints: [],
  },
  {
    id: 'crowd-no-visible-stage',
    category: 'stage-context',
    label: 'Plateia sem palco visível',
    text: 'Keep the audience as the only subject, with no concert stage required in shot.',
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
  ensemble?: boolean
  keepLeadSinger?: boolean
  animation?: boolean
  sceneKind?: 'singer' | 'guitarist' | 'drummer' | 'band-no-singer' | 'audience'
}

export function composeStageContextText(options: ComposeStageContextOptions): string {
  const kind = options.sceneKind ?? 'singer'
  if (kind === 'audience') {
    const resolvedId = resolveAudienceContextId(options.stageContextId)
    return STAGE_CONTEXT_BY_ID.get(resolvedId)?.text ?? ''
  }

  if (options.stageContextId === 'on-stage') {
    return ''
  }

  if (options.stageContextId === 'off-stage') {
    if (kind === 'guitarist') return 'Keep the guitarist outside the stage structure.'
    if (kind === 'drummer') return 'Keep the drummer and kit outside the stage structure.'
    if (kind === 'band-no-singer') return 'Keep the musicians outside the stage structure.'
    return 'Keep the singer outside the stage structure.'
  }

  if (options.stageContextId === 'no-stage') {
    return 'No concert stage structure.'
  }

  return STAGE_CONTEXT_BY_ID.get(options.stageContextId)?.text ?? ''
}

function resolveAudienceContextId(id: StageContextId): AudienceContextId {
  if (isAudienceContextId(id)) return id as AudienceContextId
  if (id === 'no-stage' || id === 'off-stage') return 'crowd-no-visible-stage'
  return DEFAULT_AUDIENCE_CONTEXT_ID
}

/** Só inclui restrição extra quando o contexto realmente precisa. */
export function stageContextConstraints(_options: ComposeStageContextOptions): string[] {
  return []
}
