export const LAST_SIDEBAR_CHANNEL_KEY = 'atlas.sidebar.lastChannelId'

const RESERVED_CHANNEL_SLUGS = new Set(['agenda', 'publicados'])

/** Extrai o id do canal da rota atual. Ignora páginas compartilhadas de Canais. */
export function channelIdFromPath(pathname: string): string | null {
  const match = /^\/canais\/([^/]+)/.exec(pathname)
  if (!match) return null
  let id = match[1]
  try {
    id = decodeURIComponent(id)
  } catch {
    /* mantém o segmento cru */
  }
  if (!id || RESERVED_CHANNEL_SLUGS.has(id)) return null
  return id
}

export function pickSidebarChannel<T extends { id: string; active: boolean }>(
  channels: T[],
  options: { routeChannelId?: string | null; lastChannelId?: string | null } = {},
): T | null {
  if (channels.length === 0) return null
  const fromRoute = options.routeChannelId
    ? channels.find((channel) => channel.id === options.routeChannelId)
    : undefined
  if (fromRoute) return fromRoute
  const fromLast = options.lastChannelId
    ? channels.find((channel) => channel.id === options.lastChannelId)
    : undefined
  if (fromLast) return fromLast
  return channels.find((channel) => channel.active) ?? channels[0]
}

export function readLastSidebarChannelId(storage: Pick<Storage, 'getItem'> | null | undefined): string | null {
  if (!storage) return null
  try {
    const value = storage.getItem(LAST_SIDEBAR_CHANNEL_KEY)?.trim()
    return value || null
  } catch {
    return null
  }
}

export function writeLastSidebarChannelId(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  channelId: string,
): void {
  if (!storage) return
  try {
    storage.setItem(LAST_SIDEBAR_CHANNEL_KEY, channelId)
  } catch {
    /* ignore quota / private mode */
  }
}
