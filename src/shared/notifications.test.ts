import { describe, expect, it } from 'vitest'
import type { AtlasTask } from './types'
import {
  deriveTaskNotifications,
  mergeReadKeys,
  normalizeNotificationReadKeys,
  notificationDueHint,
  taskNotificationId,
  unreadNotifications,
} from './notifications'

function task(partial: Partial<AtlasTask> & Pick<AtlasTask, 'id' | 'title'>): AtlasTask {
  return {
    description: '',
    status: 'pending',
    priority: 'normal',
    category: 'general',
    dueDate: null,
    relatedType: null,
    relatedId: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T10:00:00.000Z',
    completedAt: null,
    ...partial,
  }
}

const today = '2026-09-15'

describe('notificações de tarefas', () => {
  it('gera chave estável e não duplica a mesma tarefa/prazo', () => {
    const items = [
      task({ id: 'a', title: 'Atrasada', dueDate: '2026-09-14' }),
      task({ id: 'a', title: 'Atrasada', dueDate: '2026-09-14' }),
    ]
    const derived = deriveTaskNotifications(items, today)
    expect(derived).toHaveLength(1)
    expect(derived[0].id).toBe(taskNotificationId('overdue', 'a', '2026-09-14'))
  })

  it('ignora concluídas, sem prazo e prazos futuros', () => {
    const items = [
      task({ id: 'done', title: 'Feita', dueDate: '2026-09-14', status: 'completed' }),
      task({ id: 'none', title: 'Sem prazo' }),
      task({ id: 'later', title: 'Depois', dueDate: '2026-09-20' }),
    ]
    expect(deriveTaskNotifications(items, today)).toEqual([])
  })

  it('ordena atrasadas antes de hoje e usa texto relativo', () => {
    const items = [
      task({
        id: 'today',
        title: 'Finalizar música Johann Falk',
        dueDate: '2026-09-15',
        createdAt: '2026-09-14T08:00:00.000Z',
      }),
      task({
        id: 'old',
        title: 'Mais antiga',
        dueDate: '2026-09-10',
        createdAt: '2026-09-01T08:00:00.000Z',
      }),
      task({
        id: 'late',
        title: 'Criar Canal Cantor Alemão',
        dueDate: '2026-09-14',
        createdAt: '2026-09-13T08:00:00.000Z',
      }),
    ]
    const derived = deriveTaskNotifications(items, today)
    expect(derived.map((item) => item.id)).toEqual([
      taskNotificationId('overdue', 'late', '2026-09-14'),
      taskNotificationId('overdue', 'old', '2026-09-10'),
      taskNotificationId('today', 'today', '2026-09-15'),
    ])
    expect(derived[0]).toMatchObject({
      title: 'Tarefa atrasada',
      body: 'Criar Canal Cantor Alemão',
      hint: 'Venceu ontem',
      href: '/tarefas?task=late',
    })
    expect(derived[2]).toMatchObject({
      title: 'Para hoje',
      body: 'Finalizar música Johann Falk',
      hint: 'Hoje',
    })
    expect(notificationDueHint('2026-09-10', today)).toBe('Venceu há 5 dias')
  })

  it('não reaparece como pendente depois de concluída', () => {
    const pending = task({ id: 'x', title: 'X', dueDate: '2026-09-14' })
    const done = { ...pending, status: 'completed' as const, completedAt: '2026-09-15T12:00:00.000Z' }
    expect(deriveTaskNotifications([pending], today)).toHaveLength(1)
    expect(deriveTaskNotifications([done], today)).toHaveLength(0)
  })

  it('normaliza chaves lidas e calcula não lidas', () => {
    const items = deriveTaskNotifications(
      [task({ id: 'a', title: 'A', dueDate: '2026-09-14' })],
      today,
    )
    const keys = normalizeNotificationReadKeys(['', items[0].id, items[0].id, 1] as unknown[])
    expect(keys).toEqual([items[0].id])
    expect(unreadNotifications(items, keys)).toHaveLength(0)
    expect(mergeReadKeys([], [items[0].id, items[0].id])).toEqual([items[0].id])
  })
})
