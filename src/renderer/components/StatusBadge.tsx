import { cn } from '../lib/utils'
import { statusLabel } from '../lib/utils'

const tones: Record<string, string> = {
  pronto: 'text-accent bg-accent-subtle border-accent/15',
  em_revisao: 'text-warning bg-warning-subtle border-warning/15',
  rascunho: 'text-muted bg-elevated border-border-soft',
  erro: 'text-danger bg-danger-subtle border-danger/15',
  ativo: 'text-accent bg-accent-subtle border-accent/15',
  colocando: 'text-muted bg-elevated border-border-soft',
  editando: 'text-warning bg-warning-subtle border-warning/15',
  agendando: 'text-info bg-info-subtle border-info/15',
  publicado: 'text-success bg-accent-subtle border-success/15',
}

const dots: Record<string, string> = {
  pronto: 'bg-accent',
  em_revisao: 'bg-warning',
  rascunho: 'bg-muted-2',
  erro: 'bg-danger',
  ativo: 'bg-accent',
  colocando: 'bg-muted-2',
  editando: 'bg-warning',
  agendando: 'bg-info',
  publicado: 'bg-success',
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium',
        tones[status] ?? tones.rascunho,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[status] ?? dots.rascunho)} />
      {label ?? statusLabel(status)}
    </span>
  )
}
