export type CreateMenuId = 'history' | 'music' | 'channel' | 'task'
export type CreateMenuArea = 'history' | 'music' | 'home'

export function createMenuAreaFromPath(pathname: string): CreateMenuArea {
  if (pathname.startsWith('/musica')) return 'music'
  if (pathname.startsWith('/historia')) return 'history'
  return 'home'
}

/** Prioriza a área atual sem esconder opções. */
export function createMenuOrder(area: CreateMenuArea): CreateMenuId[] {
  if (area === 'music') return ['music', 'task', 'channel', 'history']
  if (area === 'history') return ['history', 'task', 'channel', 'music']
  return ['history', 'music', 'channel', 'task']
}
