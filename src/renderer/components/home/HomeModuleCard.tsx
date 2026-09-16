import type { ReactNode } from 'react'
import { Card } from '../Card'
import { Button } from '../Button'
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
        'relative flex cursor-pointer flex-col gap-5 overflow-hidden transition-colors',
        'hover:border-[#334049]',
      )}
      style={{
        backgroundImage: `linear-gradient(155deg, ${color}16 0%, transparent 46%)`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 ${color}22`,
      }}
      onClick={onOpen}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-3xl"
        style={{ backgroundColor: `${color}18` }}
        aria-hidden
      />

      <div className="relative flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border"
          style={{
            backgroundColor: `${color}1f`,
            color,
            borderColor: `${color}33`,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight" style={{ color }}>
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      <dl className="relative grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border-soft bg-black/20 px-3 py-2.5"
          >
            <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-2">
              {stat.label}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-text">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative mt-auto flex flex-wrap items-center gap-2">
        <Button
          style={{ backgroundColor: color }}
          onClick={(event) => {
            event.stopPropagation()
            onPrimary()
          }}
        >
          {primaryLabel}
        </Button>
        {secondaryLabel && onSecondary ? (
          <Button
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation()
              onSecondary()
            }}
          >
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
