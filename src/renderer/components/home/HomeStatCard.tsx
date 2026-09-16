import type { ReactNode } from 'react'
import { Card } from '../Card'
import { cn } from '../../lib/utils'

export function HomeStatCard({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: string | number
  hint?: string
  onClick?: () => void
}) {
  const interactive = Boolean(onClick)

  return (
    <Card
      padding="sm"
      className={cn(
        'flex min-h-[88px] items-center gap-3 transition-colors',
        interactive && 'cursor-pointer hover:border-[#334049]',
      )}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-card-2 text-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-2">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-text">{value}</p>
        {hint ? <p className="truncate text-xs text-muted-2">{hint}</p> : null}
      </div>
    </Card>
  )
}
