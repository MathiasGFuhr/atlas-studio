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
        'transition-[border-color,transform,box-shadow] duration-200',
        'hover:-translate-y-0.5 hover:border-border-strong',
      )}
      onClick={onOpen}
    >
      <span
        className="absolute inset-y-3 left-0 w-[2px] rounded-full"
        style={{ background: color }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-4 pl-1">
        <div className="flex min-w-0 items-start gap-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border-soft"
            style={{
              background: `${color}1f`,
              color,
            }}
          >
            {icon}
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[19px] font-semibold tracking-tight text-text">{title}</h2>
            <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted">{description}</p>
          </div>
        </div>
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-soft bg-elevated text-muted-2 opacity-0 transition-all duration-200 group-hover:opacity-100">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </div>
      </div>

      <dl
        className={cn(
          'grid gap-4 border-y border-border-soft py-5 pl-1',
          stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-input px-4 py-3"
          >
            <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
              {stat.label}
            </dt>
            <dd className="mt-1.5 text-[24px] font-semibold tabular-nums tracking-tight text-text">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2.5 pl-1">
        <button
          type="button"
          className="inline-flex items-center rounded-xl bg-elevated px-3.5 py-2 text-xs font-semibold text-text transition-colors hover:bg-hover"
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
            className="inline-flex items-center rounded-xl px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text"
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
