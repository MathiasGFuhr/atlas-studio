import { describe, expect, it } from 'vitest'
import type { AtlasTask } from './types'
import {
  dueDateLabel,
  filterTasks,
  pendingDueTodayCount,
  pendingTasksForHome,
  relatedOpenPath,
  sortTasks,
} from './tasks'

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

describe('tarefas: prazo', () => {
  it('rotula hoje, amanhã, atrasada e data curta', () => {
    expect(dueDateLabel('2026-09-15', today)).toBe('Hoje')
    expect(dueDateLabel('2026-09-16', today)).toBe('Amanhã')
    expect(dueDateLabel('2026-09-14', today)).toBe('Atrasada')
    expect(dueDateLabel('2026-09-18', today)).toBe('18/09')
    expect(dueDateLabel(null, today)).toBeNull()
  })
})

describe('tarefas: filtros e ordenação', () => {
  const items: AtlasTask[] = [
    task({ id: 'late', title: 'Atrasada', dueDate: '2026-09-10', priority: 'normal' }),
    task({ id: 'urgent', title: 'Urgente', priority: 'urgent', dueDate: '2026-09-20' }),
    task({ id: 'today', title: 'Hoje', dueDate: '2026-09-15', priority: 'low' }),
    task({ id: 'high', title: 'Alta', priority: 'high', dueDate: null }),
    task({ id: 'other', title: 'Outra', priority: 'normal', dueDate: null }),
    task({
      id: 'done',
      title: 'Feita',
      status: 'completed',
      completedAt: '2026-09-15T12:00:00.000Z',
    }),
  ]

  it('ordena pendentes: atrasadas, urgentes, hoje, alta, outras; concluídas no fim', () => {
    expect(sortTasks(items, today).map((t) => t.id)).toEqual([
      'late',
      'urgent',
      'today',
      'high',
      'other',
      'done',
    ])
  })

  it('filtra todas / hoje / pendentes / concluídas e busca título/descrição', () => {
    expect(filterTasks(items, { filter: 'pending', today }).map((t) => t.id)).toEqual([
      'late',
      'urgent',
      'today',
      'high',
      'other',
    ])
    expect(filterTasks(items, { filter: 'completed', today }).map((t) => t.id)).toEqual(['done'])
    expect(filterTasks(items, { filter: 'today', today }).map((t) => t.id)).toEqual(['today'])
    expect(filterTasks(items, { filter: 'all', query: 'urgente', today }).map((t) => t.id)).toEqual([
      'urgent',
    ])
  })

  it('escolhe poucas pendentes importantes para a Home', () => {
    const home = pendingTasksForHome(items, 3, today)
    expect(home.map((t) => t.id)).toEqual(['late', 'urgent', 'today'])
    expect(pendingDueTodayCount(items, today)).toBe(1)
  })
})

describe('tarefas: relacionamento', () => {
  it('monta a rota do projeto ou canal relacionado', () => {
    expect(
      relatedOpenPath(
        task({ id: '1', title: 'a', relatedType: 'history', relatedId: 'p1' }),
      ),
    ).toBe('/historia/projetos/p1')
    expect(
      relatedOpenPath(task({ id: '2', title: 'a', relatedType: 'music', relatedId: 'p2' })),
    ).toBe('/musica/projetos/p2')
    expect(
      relatedOpenPath(task({ id: '3', title: 'a', relatedType: 'channel', relatedId: 'c1' })),
    ).toBe('/canais/c1')
    expect(relatedOpenPath(task({ id: '4', title: 'a' }))).toBeNull()
  })
})
