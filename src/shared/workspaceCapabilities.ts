import type { ProjectType } from './types'
import type { CreateMenuId } from './createMenu'
import { TASK_RELATED_LABEL } from './tasks'

export type ContentArea = ProjectType

export interface ContentAreaPresence {
  musicPresent: boolean
}

export interface ContentAreaPreference {
  musicEnabled: boolean
}

export interface WorkspaceCapabilities {
  musicEnabled: boolean
  musicPresent: boolean
}

export const DEFAULT_CONTENT_AREA_PREFERENCE: ContentAreaPreference = {
  musicEnabled: true,
}

export const BOTH_AREAS_ENABLED: WorkspaceCapabilities = {
  musicEnabled: true,
  musicPresent: false,
}

const MUSIC_CHAT_ACTIONS = new Set([
  'list_quick_prompts',
  'get_quick_prompt',
  'save_quick_prompt',
  'create_quick_prompt',
  'update_quick_prompt',
  'delete_quick_prompt',
  'favorite_quick_prompt',
])

export function detectContentAreaPresence(input: {
  channelTypes?: Array<unknown>
  projectTypes?: Array<unknown>
}): ContentAreaPresence {
  let musicPresent = false

  for (const value of input.channelTypes ?? []) {
    if (value === 'music' || value === 'history') musicPresent = true
  }

  for (const value of input.projectTypes ?? []) {
    if (value === 'music' || value === 'history') musicPresent = true
  }

  return { musicPresent }
}

export function resolveWorkspaceCapabilities(
  presence: ContentAreaPresence,
  _preference: ContentAreaPreference = DEFAULT_CONTENT_AREA_PREFERENCE,
): WorkspaceCapabilities {
  return {
    musicEnabled: true,
    musicPresent: presence.musicPresent,
  }
}

export function preferenceFromSettings(_settings: {
  contentAreasAutoDetect?: boolean
  contentAreasHistoryEnabled?: boolean
  contentAreasMusicEnabled?: boolean
}): ContentAreaPreference {
  return { musicEnabled: true }
}

export function preferenceToSettings(_preference: ContentAreaPreference): {
  contentAreasAutoDetect: boolean
  contentAreasHistoryEnabled: boolean
  contentAreasMusicEnabled: boolean
} {
  return {
    contentAreasAutoDetect: false,
    contentAreasHistoryEnabled: false,
    contentAreasMusicEnabled: true,
  }
}

/** Liga uma área em modo manual — no Atlas só existe Música. */
export function preferenceEnablingArea(
  _current: Pick<WorkspaceCapabilities, 'musicEnabled'>,
  _area: ContentArea,
): ContentAreaPreference {
  return { musicEnabled: true }
}

export function isContentAreaEnabled(
  _capabilities: Pick<WorkspaceCapabilities, 'musicEnabled'>,
  area: ContentArea,
): boolean {
  return area === 'music'
}

/** Biblioteca global de Prompts — pertence ao ambiente Música. */
export const MUSIC_PROMPTS_PATH = '/musica/prompts'
/** Meus prompts (chat ou cadastro manual). */
export const MUSIC_PROMPTS_CUSTOM_PATH = MUSIC_PROMPTS_PATH

export function contentAreaFromPath(pathname: string): ContentArea | null {
  if (pathname === '/prompts' || pathname.startsWith('/prompts/')) return 'music'
  if (pathname.startsWith('/musica') || pathname.startsWith('/musicas')) return 'music'
  return null
}

/** Rotas de um item existente (projeto, faixa) — o acesso aos dados deve permanecer. */
export function isContentAreaEntityPath(pathname: string): boolean {
  return /\/(projetos|faixas|musicas)\/[^/]+/.test(pathname)
}

export function filterCreateMenuItems(
  items: CreateMenuId[],
  _capabilities: Pick<WorkspaceCapabilities, 'musicEnabled'>,
): CreateMenuId[] {
  return items.filter((id) => id === 'music' || id === 'channel' || id === 'task')
}

export function filterChatActions<T extends { name: string }>(
  actions: T[],
  _capabilities: Pick<WorkspaceCapabilities, 'musicEnabled'>,
): T[] {
  return actions.filter((action) => {
    if (
      action.name === 'list_scripts' ||
      action.name === 'get_script' ||
      action.name === 'open_script' ||
      action.name === 'create_script' ||
      action.name === 'adjust_script' ||
      action.name === 'list_niches'
    ) {
      return false
    }
    return true
  })
}

export function chatAreasPromptNote(
  _capabilities: Pick<WorkspaceCapabilities, 'musicEnabled'>,
): string {
  return 'Este workspace é só Música: projetos, faixas, cortes e prompts. Não ofereça roteiros, nichos nem fluxo de História.'
}

export function enabledContentAreas(
  _capabilities: Pick<WorkspaceCapabilities, 'musicEnabled'>,
): ContentArea[] {
  return ['music']
}

export function taskRelatedTypeOptions(
  _capabilities: Pick<WorkspaceCapabilities, 'musicEnabled'>,
): Array<{ value: string; label: string }> {
  return [
    { value: '', label: 'Nada — tarefa geral' },
    { value: 'music', label: TASK_RELATED_LABEL.music },
    { value: 'channel', label: TASK_RELATED_LABEL.channel },
  ]
}

export { MUSIC_CHAT_ACTIONS }
