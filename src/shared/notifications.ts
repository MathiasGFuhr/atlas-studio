import type { AtlasTask } from './types'
import { daysBetweenYmd, dueDateState, todayYmd } from './tasks'
import { UPDATE_SETTINGS_HREF, updateNotificationId, type AppUpdateState } from './updates'

export type AtlasNotificationKind = 'task-overdue' | 'task-today' | 'app-update' | 'user-online'

export interface AtlasNotification {
  id: string
  kind: AtlasNotificationKind
  title: string
  body: string
  hint: string
  href: string
  taskId?: string
  sortAt: string
  createdAt: string
}

export function taskNotificationId(
  kind: 'overdue' | 'today',
  taskId: string,
  dueDate: string,
): string {
  return kind === 'overdue' ? `task-overdue:${taskId}:${dueDate}` : `task-today:${taskId}:${dueDate}`
}

export function normalizeNotificationReadKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
}

export function notificationDueHint(dueDate: string, today = todayYmd()): string {
  const state = dueDateState(dueDate, today)
  if (state === 'today') return 'Hoje'
  if (state === 'overdue') {
    const days = daysBetweenYmd(dueDate, today)
    if (days <= 1) return 'Venceu ontem'
    return `Venceu há ${days} dias`
  }
  return dueDate
}

export function deriveTaskNotifications(
  tasks: AtlasTask[],
  today = todayYmd(),
): AtlasNotification[] {
  const items = new Map<string, AtlasNotification>()

  for (const task of tasks) {
    if (task.status !== 'pending' || !task.dueDate) continue
    const state = dueDateState(task.dueDate, today)
    if (state !== 'overdue' && state !== 'today') continue
    const kind = state === 'overdue' ? 'overdue' : 'today'
    const id = taskNotificationId(kind, task.id, task.dueDate)
    items.set(id, {
      id,
      kind: state === 'overdue' ? 'task-overdue' : 'task-today',
      title: state === 'overdue' ? 'Tarefa atrasada' : 'Para hoje',
      body: task.title,
      hint: notificationDueHint(task.dueDate, today),
      href: `/tarefas?task=${encodeURIComponent(task.id)}`,
      taskId: task.id,
      sortAt: state === 'overdue' ? task.dueDate : task.createdAt,
      createdAt: task.createdAt,
    })
  }

  return sortNotifications([...items.values()])
}

export function deriveUpdateNotification(status: {
  state: AppUpdateState | string
  availableVersion: string | null
}): AtlasNotification | null {
  const version = status.availableVersion?.trim()
  if (!version) return null
  if (status.state !== 'available' && status.state !== 'downloading' && status.state !== 'ready') {
    return null
  }
  const id = updateNotificationId(version)
  return {
    id,
    kind: 'app-update',
    title: 'Atualização',
    body: 'Nova versão do Atlas Studio disponível.',
    hint: `Atlas Studio ${version}`,
    href: UPDATE_SETTINGS_HREF,
    sortAt: version,
    createdAt: version,
  }
}

export function onlineNotificationId(userId: string, joinedAt: string): string {
  return `user-online:${userId}:${joinedAt}`
}

export function deriveOnlineNotification(
  peer: { id: string; name: string },
  joinedAt = new Date().toISOString(),
): AtlasNotification {
  const name = peer.name.trim() || 'Alguém'
  return {
    id: onlineNotificationId(peer.id, joinedAt),
    kind: 'user-online',
    title: 'Online',
    body: `${name} entrou e está online`,
    hint: 'Está no Atlas agora',
    href: '/equipe',
    sortAt: joinedAt,
    createdAt: joinedAt,
  }
}

function kindRank(kind: AtlasNotificationKind): number {
  if (kind === 'app-update') return 0
  if (kind === 'user-online') return 1
  if (kind === 'task-overdue') return 2
  if (kind === 'task-today') return 3
  return 4
}

export function sortNotifications(items: AtlasNotification[]): AtlasNotification[] {
  return [...items].sort((a, b) => {
    const rank = kindRank(a.kind) - kindRank(b.kind)
    if (rank !== 0) return rank
    if (a.sortAt !== b.sortAt) return b.sortAt.localeCompare(a.sortAt)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function unreadNotifications(
  items: AtlasNotification[],
  readKeys: string[],
): AtlasNotification[] {
  const read = new Set(readKeys)
  return items.filter((item) => !read.has(item.id))
}

export function mergeReadKeys(current: string[], keys: string[]): string[] {
  return [...new Set([...current, ...keys])]
}
