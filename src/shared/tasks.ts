import type {
  AtlasTask,
  TaskCategory,
  TaskFilter,
  TaskPriority,
  TaskRelatedType,
  TaskStatus,
} from './types'

export const TASK_STATUSES: TaskStatus[] = ['pending', 'completed']
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent']
export const TASK_CATEGORIES: TaskCategory[] = [
  'general',
  'channel',
  'history',
  'music',
  'script',
  'audio',
  'publishing',
]
export const TASK_RELATED_TYPES: TaskRelatedType[] = ['history', 'music', 'channel']

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pendente',
  completed: 'Concluída',
}

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Prioridade baixa',
  normal: 'Prioridade normal',
  high: 'Prioridade alta',
  urgent: 'Urgente',
}

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  general: 'Geral',
  channel: 'Canal',
  history: 'História',
  music: 'Música',
  script: 'Roteiro',
  audio: 'Áudio',
  publishing: 'Publicação',
}

export const TASK_RELATED_LABEL: Record<TaskRelatedType, string> = {
  history: 'Projeto de História',
  music: 'Projeto de Música',
  channel: 'Canal',
}

export const TASK_FILTER_LABEL: Record<TaskFilter, string> = {
  all: 'Todas',
  today: 'Hoje',
  pending: 'Pendentes',
  completed: 'Concluídas',
}

export const TASKS_CHANGED_EVENT = 'atlas-tasks-changed'

export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus)
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority)
}

export function isTaskCategory(value: unknown): value is TaskCategory {
  return TASK_CATEGORIES.includes(value as TaskCategory)
}

export function isTaskRelatedType(value: unknown): value is TaskRelatedType {
  return TASK_RELATED_TYPES.includes(value as TaskRelatedType)
}

/** Data local no formato YYYY-MM-DD. */
export function todayYmd(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return todayYmd(date)
}

/** Diferença em dias de calendário: positivo se `to` é depois de `from`. */
export function daysBetweenYmd(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  const start = new Date(y1, m1 - 1, d1).getTime()
  const end = new Date(y2, m2 - 1, d2).getTime()
  return Math.round((end - start) / 86400000)
}

export function formatDueDateShort(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number)
  if (!year || !month || !day) return ymd
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}

export type DueDateState = 'overdue' | 'today' | 'tomorrow' | 'upcoming'

export function dueDateState(dueDate: string | null, today = todayYmd()): DueDateState | null {
  if (!dueDate) return null
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  if (dueDate === addDaysYmd(today, 1)) return 'tomorrow'
  return 'upcoming'
}

export function dueDateLabel(dueDate: string | null, today = todayYmd()): string | null {
  const state = dueDateState(dueDate, today)
  if (!state || !dueDate) return null
  if (state === 'overdue') return 'Atrasada'
  if (state === 'today') return 'Hoje'
  if (state === 'tomorrow') return 'Amanhã'
  return formatDueDateShort(dueDate)
}

function matchesQuery(task: AtlasTask, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q)
}

export function filterTasks(
  tasks: AtlasTask[],
  options: { filter: TaskFilter; query?: string; today?: string },
): AtlasTask[] {
  const today = options.today ?? todayYmd()
  return tasks.filter((task) => {
    if (!matchesQuery(task, options.query ?? '')) return false
    if (options.filter === 'pending') return task.status === 'pending'
    if (options.filter === 'completed') return task.status === 'completed'
    if (options.filter === 'today') return task.dueDate === today
    return true
  })
}

function pendingRank(task: AtlasTask, today: string): number {
  const state = dueDateState(task.dueDate, today)
  if (state === 'overdue') return 0
  if (task.priority === 'urgent') return 1
  if (state === 'today') return 2
  if (task.priority === 'high') return 3
  return 4
}

export function sortTasks(tasks: AtlasTask[], today = todayYmd()): AtlasTask[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
    if (a.status === 'completed') {
      return (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt)
    }
    const rank = pendingRank(a, today) - pendingRank(b, today)
    if (rank !== 0) return rank
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.dueDate && !b.dueDate) return -1
    if (!a.dueDate && b.dueDate) return 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function pendingTasksForHome(tasks: AtlasTask[], limit = 4, today = todayYmd()): AtlasTask[] {
  return sortTasks(
    tasks.filter((task) => task.status === 'pending'),
    today,
  ).slice(0, limit)
}

export function pendingDueTodayCount(tasks: AtlasTask[], today = todayYmd()): number {
  return tasks.filter((task) => task.status === 'pending' && task.dueDate === today).length
}

export function relatedOpenPath(task: AtlasTask): string | null {
  if (!task.relatedType || !task.relatedId) return null
  if (task.relatedType === 'history') return `/historia/projetos/${task.relatedId}`
  if (task.relatedType === 'music') return `/musica/projetos/${task.relatedId}`
  return `/canais/${task.relatedId}`
}
