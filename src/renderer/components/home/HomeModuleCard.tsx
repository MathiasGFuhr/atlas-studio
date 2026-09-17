import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Card } from '../Card'
import { cn } from '../../lib/utils'

export function HomeModuleCard({
  color,
  icon,
  title,
  description,
  stats,
  primaryLabel,
  secondaryLabel,
  onOpen,
  onPrimary,
  onSecondary,
}: {
  color: string
  icon: ReactNode
  title: string
  description: string
  stats: Array<{ label: string; value: number }>
  primaryLabel: string
  secondaryLabel?: string
  onOpen: () => void
  onPrimary: () => void
  onSecondary?: () => void
}) {
  return (
    <Card
      padding="lg"
      className={cn(
        'group relative flex cursor-pointer flex-col gap-6 overflow-hidden',
        'transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[#334049]',
      )}
      style={{
        backgroundImage: `linear-gradient(180deg, ${color}0f 0%, transparent 42%)`,
      }}
      onClick={onOpen}
    >
      <span
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: color }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}18`, color }}
          >
            {icon}
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[18px] font-semibold tracking-tight text-text">{title}</h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{description}</p>
          </div>
        </div>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <dl className="grid grid-cols-3 gap-6 border-y border-border-soft/80 py-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-2">
              {stat.label}
            </dt>
            <dd className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-text">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-white/[0.1]"
          onClick={(event) => {
            event.stopPropagation()
            onPrimary()
          }}
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
            onClick={(event) => {
              event.stopPropagation()
              onSecondary()
            }}
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </Card>
  )
}
