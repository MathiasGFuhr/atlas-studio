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
    interactive && 'cursor-pointer hover:bg-white/[0.028]',
    className,
  )

  const content = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.07] to-white/[0.02] text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors group-hover/stat:border-white/[0.1] group-hover/stat:text-text">
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
