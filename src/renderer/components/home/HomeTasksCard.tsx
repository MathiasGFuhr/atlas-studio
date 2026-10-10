import type { AtlasTask } from '@shared/types'
import { ListTodo, Plus } from 'lucide-react'
import { Card } from '../Card'
import { HomeTaskRow } from './HomeTaskRow'

export function HomeTasksCard({
  tasks,
  hint,
  onToggle,
  onOpenRelated,
  onOpenAll,
  onCreate,
}: {
  tasks: AtlasTask[]
  hint: string
  onToggle: (task: AtlasTask) => void
  onOpenRelated: (path: string) => void
  onOpenAll: () => void
  onCreate: () => void
}) {
  return (
    <Card padding="lg" className="flex min-h-[240px] flex-col">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Operação
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Tarefas</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenAll}
            className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
          >
            Ver todas
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-8 items-center gap-1 rounded-xl bg-accent px-2.5 text-xs font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova
          </button>
        </div>
      </div>

      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-2">
        {hint}
      </p>

      {tasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <ListTodo className="mb-2 h-5 w-5 text-muted-2" />
          <p className="text-sm text-muted-2">Nenhuma tarefa pendente.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-white/[0.04] overflow-y-auto">
          {tasks.map((task) => (
            <HomeTaskRow
              key={task.id}
              task={task}
              onToggle={() => onToggle(task)}
              onOpenRelated={onOpenRelated}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
