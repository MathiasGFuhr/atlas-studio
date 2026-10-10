import type { AtlasTask, TaskPriority } from '@shared/types'
import { TASK_CATEGORY_LABEL, dueDateLabel, dueDateState, relatedOpenPath } from '@shared/tasks'
import { cn } from '../../lib/utils'

const PRIORITY_BADGE: Record<TaskPriority, { label: string; className: string }> = {
  urgent: { label: 'Urgente', className: 'border-danger/30 bg-danger/10 text-danger' },
  high: { label: 'Alta', className: 'border-warning/30 bg-warning/10 text-warning' },
  normal: { label: 'Normal', className: 'border-white/[0.08] bg-white/[0.04] text-muted' },
  low: { label: 'Baixa', className: 'border-white/[0.06] bg-white/[0.02] text-muted-2' },
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
    <li className="flex items-start gap-3 rounded-xl px-2 py-3.5 transition-colors hover:bg-white/[0.03]">
      <button
        type="button"
        onClick={onToggle}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.03] transition-colors hover:border-accent/60 hover:bg-accent/10"
        aria-label="Marcar como concluída"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-text">{task.title}</p>
          <span
            className={cn(
              'inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              priority.className,
            )}
          >
            {priority.label}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-2">
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
