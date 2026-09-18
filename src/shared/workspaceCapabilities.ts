import type { ProjectType } from './types'
import type { CreateMenuId } from './createMenu'
import { TASK_RELATED_LABEL } from './tasks'

export type ContentArea = ProjectType

export interface ContentAreaPresence {
  historyPresent: boolean
  musicPresent: boolean
}

export interface ContentAreaPreference {
  autoDetect: boolean
  historyEnabled: boolean
  musicEnabled: boolean
}

export interface WorkspaceCapabilities {
  autoDetect: boolean
  historyEnabled: boolean
  musicEnabled: boolean
  historyPresent: boolean
  musicPresent: boolean
}

export const DEFAULT_CONTENT_AREA_PREFERENCE: ContentAreaPreference = {
  autoDetect: true,
  historyEnabled: true,
  musicEnabled: true,
}

export const BOTH_AREAS_ENABLED: WorkspaceCapabilities = {
  autoDetect: true,
  historyEnabled: true,
  musicEnabled: true,
  historyPresent: false,
  musicPresent: false,
}

const HISTORY_CHAT_ACTIONS = new Set([
  'list_scripts',
  'get_script',
  'open_script',
  'create_script',
  'adjust_script',
  'list_niches',
])

const MUSIC_CHAT_ACTIONS = new Set([
  'list_quick_prompts',
  'get_quick_prompt',
  'save_quick_prompt',
  'create_quick_prompt',
  'update_quick_prompt',
  'delete_quick_prompt',
  'favorite_quick_prompt',
])

function asArea(value: unknown): ContentArea | null {
  return value === 'history' || value === 'music' ? value : null
}

export function detectContentAreaPresence(input: {
  channelTypes?: Array<unknown>
  projectTypes?: Array<unknown>
}): ContentAreaPresence {
  let historyPresent = false
  let musicPresent = false

  for (const value of input.channelTypes ?? []) {
    const area = asArea(value) ?? 'history'
    if (area === 'music') musicPresent = true
    else historyPresent = true
  }

  for (const value of input.projectTypes ?? []) {
    const area = asArea(value)
    if (area === 'music') musicPresent = true
    if (area === 'history') historyPresent = true
  }

  return { historyPresent, musicPresent }
}

export function resolveWorkspaceCapabilities(
  presence: ContentAreaPresence,
  preference: ContentAreaPreference = DEFAULT_CONTENT_AREA_PREFERENCE,
): WorkspaceCapabilities {
  if (!preference.autoDetect) {
    return {
      autoDetect: false,
      historyEnabled: preference.historyEnabled,
      musicEnabled: preference.musicEnabled,
      historyPresent: presence.historyPresent,
      musicPresent: presence.musicPresent,
    }
  }

  const emptyWorkspace = !presence.historyPresent && !presence.musicPresent
  return {
    autoDetect: true,
    historyEnabled: emptyWorkspace || presence.historyPresent,
    musicEnabled: emptyWorkspace || presence.musicPresent,
    historyPresent: presence.historyPresent,
    musicPresent: presence.musicPresent,
  }
}

export function preferenceFromSettings(settings: {
  contentAreasAutoDetect?: boolean
  contentAreasHistoryEnabled?: boolean
  contentAreasMusicEnabled?: boolean
}): ContentAreaPreference {
  return {
    autoDetect: settings.contentAreasAutoDetect !== false,
    historyEnabled: settings.contentAreasHistoryEnabled !== false,
    musicEnabled: settings.contentAreasMusicEnabled !== false,
  }
}

export function preferenceToSettings(preference: ContentAreaPreference): {
  contentAreasAutoDetect: boolean
  contentAreasHistoryEnabled: boolean
  contentAreasMusicEnabled: boolean
} {
  return {
    contentAreasAutoDetect: preference.autoDetect,
    contentAreasHistoryEnabled: preference.historyEnabled,
    contentAreasMusicEnabled: preference.musicEnabled,
  }
}

/** Liga uma área em modo manual, preservando a visibilidade atual da outra. */
export function preferenceEnablingArea(
  current: Pick<WorkspaceCapabilities, 'historyEnabled' | 'musicEnabled'>,
  area: ContentArea,
): ContentAreaPreference {
  return {
    autoDetect: false,
    historyEnabled: area === 'history' ? true : current.historyEnabled,
    musicEnabled: area === 'music' ? true : current.musicEnabled,
  }
}

export function isContentAreaEnabled(
  capabilities: Pick<WorkspaceCapabilities, 'historyEnabled' | 'musicEnabled'>,
  area: ContentArea,
): boolean {
  return area === 'history' ? capabilities.historyEnabled : capabilities.musicEnabled
}

/** Biblioteca global de Prompts rápidos — pertence ao ambiente Música. */
export const MUSIC_PROMPTS_PATH = '/musica/prompts'
/** Aba dos prompts criados pelo usuário (chat ou cadastro manual). */
export const MUSIC_PROMPTS_CUSTOM_PATH = `${MUSIC_PROMPTS_PATH}?tab=custom`

export function contentAreaFromPath(pathname: string): ContentArea | null {
  if (pathname === '/prompts' || pathname.startsWith('/prompts/')) return 'music'
  if (pathname.startsWith('/musica') || pathname.startsWith('/musicas')) return 'music'
  if (
    pathname.startsWith('/historia') ||
    pathname.startsWith('/create') ||
    pathname.startsWith('/nichos') ||
    pathname.startsWith('/niches') ||
    pathname.startsWith('/roteiros') ||
    pathname.startsWith('/scripts')
  ) {
    return 'history'
  }
  return null
}

/** Rotas de um item existente (projeto, roteiro, faixa) — o acesso aos dados deve permanecer. */
export function isContentAreaEntityPath(pathname: string): boolean {
  return /\/(projetos|roteiros|faixas|scripts|musicas)\/[^/]+/.test(pathname)
}

export function filterCreateMenuItems(
  items: CreateMenuId[],
  capabilities: Pick<WorkspaceCapabilities, 'historyEnabled' | 'musicEnabled'>,
): CreateMenuId[] {
  return items.filter((id) => {
    if (id === 'history') return capabilities.historyEnabled
    if (id === 'music') return capabilities.musicEnabled
    return true
  })
}

export function filterChatActions<T extends { name: string }>(
  actions: T[],
  capabilities: Pick<WorkspaceCapabilities, 'historyEnabled' | 'musicEnabled'>,
): T[] {
  return actions.filter((action) => {
    if (!capabilities.historyEnabled && HISTORY_CHAT_ACTIONS.has(action.name)) return false
    if (!capabilities.musicEnabled && MUSIC_CHAT_ACTIONS.has(action.name)) return false
    return true
  })
}

export function chatAreasPromptNote(
  capabilities: Pick<WorkspaceCapabilities, 'historyEnabled' | 'musicEnabled'>,
): string {
  const enabled: string[] = []
  if (capabilities.historyEnabled) enabled.push('História')
  if (capabilities.musicEnabled) enabled.push('Música')
  const lines = [`Áreas visíveis neste workspace: ${enabled.join(' e ') || 'nenhuma (apenas áreas globais)'}.`]
  if (!capabilities.historyEnabled) {
    lines.push(
      'Não ofereça roteiros, nichos nem fluxo de História, salvo se o usuário pedir explicitamente para ativar ou criar História.',
    )
  }
  if (!capabilities.musicEnabled) {
    lines.push(
      'Não ofereça o cortador, prompts rápidos nem fluxo de Música, salvo se o usuário pedir explicitamente para ativar ou criar Música.',
    )
  }
  return lines.join(' ')
}

export function enabledContentAreas(
  capabilities: Pick<WorkspaceCapabilities, 'historyEnabled' | 'musicEnabled'>,
): ContentArea[] {
  const areas: ContentArea[] = []
  if (capabilities.historyEnabled) areas.push('history')
  if (capabilities.musicEnabled) areas.push('music')
  return areas
}

export function taskRelatedTypeOptions(
  capabilities: Pick<WorkspaceCapabilities, 'historyEnabled' | 'musicEnabled'>,
): Array<{ value: string; label: string }> {
  const options = [{ value: '', label: 'Nada — tarefa geral' }]
  if (capabilities.historyEnabled) {
    options.push({ value: 'history', label: TASK_RELATED_LABEL.history })
  }
  if (capabilities.musicEnabled) {
    options.push({ value: 'music', label: TASK_RELATED_LABEL.music })
  }
  options.push({ value: 'channel', label: TASK_RELATED_LABEL.channel })
  return options
}
