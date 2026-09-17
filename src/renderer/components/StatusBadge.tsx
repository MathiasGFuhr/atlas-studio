import { cn } from '../lib/utils'
import { statusLabel } from '../lib/utils'

const tones: Record<string, string> = {
  pronto: 'text-accent bg-accent-dark/40 border-accent/20',
  em_revisao: 'text-warning bg-warning/10 border-warning/20',
  rascunho: 'text-muted bg-white/5 border-border',
  erro: 'text-danger bg-danger/10 border-danger/20',
  ativo: 'text-accent bg-accent-dark/40 border-accent/20',
  colocando: 'text-muted bg-white/5 border-border',
  editando: 'text-warning bg-warning/10 border-warning/20',
  agendando: 'text-warning bg-warning/10 border-warning/20',
  publicado: 'text-accent bg-accent-dark/40 border-accent/20',
}

const dots: Record<string, string> = {
  pronto: 'bg-accent',
  em_revisao: 'bg-warning',
  rascunho: 'bg-muted-2',
  erro: 'bg-danger',
  ativo: 'bg-accent',
  colocando: 'bg-muted-2',
  editando: 'bg-warning',
  agendando: 'bg-warning',
  publicado: 'bg-accent',
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
