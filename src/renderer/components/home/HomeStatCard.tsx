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
    'group/stat relative flex min-h-[100px] min-w-0 items-center gap-4 px-5 py-5 text-left',
    'transition-colors duration-200',
    interactive && 'cursor-pointer hover:bg-hover/60',
    className,
  )

  const content = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-elevated text-muted transition-colors group-hover/stat:border-border-strong group-hover/stat:text-text">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">{label}</p>
        <p className="mt-1.5 truncate text-[22px] font-semibold tabular-nums tracking-tight text-text">
          {value}
        </p>
        {hint ? <p className="mt-1 truncate text-xs leading-snug text-muted-2">{hint}</p> : null}
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
