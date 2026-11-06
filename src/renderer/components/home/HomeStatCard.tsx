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
    'home-v2-stat group/stat relative flex min-h-[108px] min-w-0 flex-col justify-between gap-4 px-5 py-5 text-left',
    'transition-[background-color,border-color] duration-200',
    interactive && 'cursor-pointer hover:bg-hover/45',
    className,
  )

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">{label}</p>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-soft/80 bg-elevated/80 text-accent transition-colors group-hover/stat:border-accent/30">
          {icon}
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[1.65rem] font-semibold tabular-nums tracking-tight text-text">
          {value}
        </p>
        {hint ? <p className="mt-1 truncate text-xs leading-snug text-muted">{hint}</p> : null}
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
