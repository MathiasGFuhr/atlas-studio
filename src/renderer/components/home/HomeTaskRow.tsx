import type { AtlasTask, TaskPriority } from '@shared/types'
import { TASK_CATEGORY_LABEL, dueDateLabel, dueDateState, relatedOpenPath } from '@shared/tasks'
import { cn } from '../../lib/utils'

const PRIORITY_BADGE: Record<TaskPriority, { label: string; className: string }> = {
  urgent: { label: 'Urgente', className: 'border-danger/30 bg-danger/10 text-danger' },
  high: { label: 'Alta', className: 'border-warning/30 bg-warning/10 text-warning' },
  normal: { label: 'Normal', className: 'border-border bg-white/5 text-muted' },
  low: { label: 'Baixa', className: 'border-border bg-white/5 text-muted-2' },
}

export function HomeTaskRow({
  task,
  onToggle,
  onOpenRelated,
}: {
  task: AtlasTask
  onToggle: () => void
  onOpenRelated: (path: string) => void
}) {
  const due = dueDateLabel(task.dueDate)
  const dueState = dueDateState(task.dueDate)
  const related = relatedOpenPath(task)
  const priority = PRIORITY_BADGE[task.priority]

  return (
    <li className="flex items-start gap-3 rounded-xl border border-transparent px-2 py-2.5 transition-colors hover:border-border-soft hover:bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-card-2 hover:border-accent/60"
        aria-label="Marcar como concluída"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-text">{task.title}</p>
          <span
            className={cn(
              'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              priority.className,
            )}
          >
            {priority.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-2">
          <span>{TASK_CATEGORY_LABEL[task.category]}</span>
          {due ? (
            <>
              <span aria-hidden>•</span>
              <span
                className={cn(
                  dueState === 'overdue' && 'font-medium text-danger',
                  dueState === 'today' && 'font-medium text-warning',
                )}
              >
                {due}
              </span>
            </>
          ) : null}
          {task.relatedName ? (
            <>
              <span aria-hidden>•</span>
              {related ? (
                <button
                  type="button"
                  className="truncate text-left font-medium text-accent hover:underline"
                  onClick={() => onOpenRelated(related)}
                >
                  {task.relatedName}
                </button>
              ) : (
                <span className="truncate">{task.relatedName}</span>
              )}
            </>
          ) : null}
        </div>
      </div>
    </li>
  )
}
