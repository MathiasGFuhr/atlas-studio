import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type {
  AtlasTask,
  TaskCategory,
  TaskPriority,
  TaskRelatedType,
  TaskStatus,
  TaskWriteInput,
} from '../../shared/types'
import {
  isTaskCategory,
  isTaskPriority,
  isTaskRelatedType,
  isTaskStatus,
} from '../../shared/tasks'
import { projectRepository } from './projectRepository'
import { channelRepository } from './channelRepository'

type TaskRow = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string
  due_date: string | null
  related_type: string | null
  related_id: string | null
  related_name?: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

const SELECT_WITH_RELATED = `
  SELECT t.*,
    CASE
      WHEN t.related_type = 'channel' THEN c.name
      WHEN t.related_type IN ('history', 'music') THEN p.name
      ELSE NULL
    END AS related_name
  FROM tasks t
  LEFT JOIN projects p
    ON p.id = t.related_id AND t.related_type IN ('history', 'music')
  LEFT JOIN channels c
    ON c.id = t.related_id AND t.related_type = 'channel'
`

function mapTask(row: TaskRow): AtlasTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    status: isTaskStatus(row.status) ? row.status : 'pending',
    priority: isTaskPriority(row.priority) ? row.priority : 'normal',
    category: isTaskCategory(row.category) ? row.category : 'general',
    dueDate: row.due_date?.trim() || null,
    relatedType: isTaskRelatedType(row.related_type) ? row.related_type : null,
    relatedId: row.related_id?.trim() || null,
    relatedName: row.related_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
  }
}

function normalizeDueDate(value?: string | null): string | null {
  const raw = value?.trim() || ''
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('O prazo deve ser uma data no formato AAAA-MM-DD.')
  }
  return raw
}

function resolveRelated(
  relatedType?: TaskRelatedType | null,
  relatedId?: string | null,
): { relatedType: TaskRelatedType | null; relatedId: string | null } {
  const type = relatedType ?? null
  const id = relatedId?.trim() || null
  if (!type || !id) return { relatedType: null, relatedId: null }

  if (type === 'channel') {
    const channel = channelRepository.get(id)
    if (!channel) throw new Error('Canal relacionado não encontrado.')
    return { relatedType: 'channel', relatedId: id }
  }

  const project = projectRepository.get(id)
  if (!project) throw new Error('Projeto relacionado não encontrado.')
  if (project.projectType !== type) {
    throw new Error('O projeto relacionado não pertence a este ambiente.')
  }
  return { relatedType: type, relatedId: id }
}

export const taskRepository = {
  list(): AtlasTask[] {
    return (getDb().prepare(`${SELECT_WITH_RELATED} ORDER BY t.created_at DESC`).all() as TaskRow[]).map(
      mapTask,
    )
  },

  get(id: string): AtlasTask | null {
    const row = getDb()
      .prepare(`${SELECT_WITH_RELATED} WHERE t.id = ?`)
      .get(id) as TaskRow | undefined
    return row ? mapTask(row) : null
  },

  pendingCount(): number {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM tasks WHERE status = 'pending'`)
      .get() as { c: number } | undefined
    return Number(row?.c ?? 0)
  },

  create(input: TaskWriteInput): AtlasTask {
    const title = input.title?.trim()
    if (!title) throw new Error('O título da tarefa é obrigatório.')

    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const related = resolveRelated(input.relatedType, input.relatedId)
    const priority: TaskPriority = isTaskPriority(input.priority) ? input.priority : 'normal'
    const category: TaskCategory = isTaskCategory(input.category) ? input.category : 'general'

    getDb()
      .prepare(
        `INSERT INTO tasks (
          id, title, description, status, priority, category, due_date,
          related_type, related_id, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        title,
        input.description?.trim() ?? '',
        priority,
        category,
        normalizeDueDate(input.dueDate),
        related.relatedType,
        related.relatedId,
        timestamp,
        timestamp,
      )

    return this.get(id)!
  },

  update(id: string, patch: Partial<TaskWriteInput>): AtlasTask | null {
    const current = this.get(id)
    if (!current) return null

    const title = patch.title !== undefined ? patch.title.trim() : current.title
    if (!title) throw new Error('O título da tarefa é obrigatório.')

    const related = resolveRelated(
      patch.relatedType !== undefined ? patch.relatedType : current.relatedType,
      patch.relatedId !== undefined ? patch.relatedId : current.relatedId,
    )

    getDb()
      .prepare(
        `UPDATE tasks SET
          title = ?,
          description = ?,
          priority = ?,
          category = ?,
          due_date = ?,
          related_type = ?,
          related_id = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        title,
        patch.description !== undefined ? patch.description.trim() : current.description,
        isTaskPriority(patch.priority) ? patch.priority : current.priority,
        isTaskCategory(patch.category) ? patch.category : current.category,
        patch.dueDate !== undefined ? normalizeDueDate(patch.dueDate) : current.dueDate,
        related.relatedType,
        related.relatedId,
        new Date().toISOString(),
        id,
      )

    return this.get(id)
  },

  setStatus(id: string, status: TaskStatus): AtlasTask | null {
    if (!isTaskStatus(status)) throw new Error('Status de tarefa inválido.')
    const current = this.get(id)
    if (!current) return null

    const timestamp = new Date().toISOString()
    const completedAt = status === 'completed' ? timestamp : null
    getDb()
      .prepare(
        `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, completedAt, timestamp, id)

    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
    return true
  },
}
