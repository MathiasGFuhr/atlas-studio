export type CreateMenuId = 'music' | 'channel' | 'task'
export type CreateMenuArea = 'music' | 'home'

export function createMenuAreaFromPath(pathname: string): CreateMenuArea {
  if (pathname.startsWith('/musica')) return 'music'
  return 'home'
}

/** Prioriza a área atual sem esconder opções. */
export function createMenuOrder(area: CreateMenuArea): CreateMenuId[] {
  if (area === 'music') return ['music', 'task', 'channel']
  return ['music', 'channel', 'task']
}
