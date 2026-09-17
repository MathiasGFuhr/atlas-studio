import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function HomeStatCard({
  icon,
  label,
  value,
  hint,
  onClick,
  className,
}: {
  icon: ReactNode
  label: string
  value: string | number
  hint?: string
  onClick?: () => void
  className?: string
}) {
  const interactive = Boolean(onClick)
  const classes = cn(
    'flex min-h-[92px] min-w-0 items-center gap-3.5 px-5 py-4 text-left transition-colors',
    interactive && 'cursor-pointer hover:bg-white/[0.02]',
    className,
  )

  const content = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-2">{label}</p>
        <p className="mt-1 truncate text-[20px] font-semibold tabular-nums tracking-tight text-text">
          {value}
        </p>
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-2">{hint}</p> : null}
      </div>
    </>
  )

  if (!interactive) {
    return <div className={classes}>{content}</div>
  }

  return (
    <button type="button" className={classes} onClick={onClick}>
      {content}
    </button>
  )
}
