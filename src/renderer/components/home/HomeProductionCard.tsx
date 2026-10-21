import { Clapperboard, Mic2, Music2, Tv } from 'lucide-react'
import { Card } from '../Card'
import { cn } from '../../lib/utils'

export type ProductionModule = {
  id: string
  label: string
  done: number
  total: number
  onOpen: () => void
}

const ICONS = {
  music: Music2,
  lipsync: Mic2,
  shorts: Clapperboard,
  agenda: Tv,
} as const

function ringOffset(percent: number, radius = 54) {
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percent))
  return circumference - (clamped / 100) * circumference
}

export function HomeProductionCard({
  percent,
  modules,
}: {
  percent: number
  modules: ProductionModule[]
}) {
  const circumference = 2 * Math.PI * 54
  const display = Math.round(Math.max(0, Math.min(100, percent)))

  return (
    <Card padding="lg" className="flex h-full min-h-[280px] flex-col">
      <div className="mb-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
          Produção
        </p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">
          Em andamento
        </h2>
      </div>

      <div className="grid flex-1 grid-cols-1 items-center gap-5 sm:grid-cols-[140px_1fr]">
        <div className="relative mx-auto h-[132px] w-[132px]">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="var(--color-hover)"
              strokeWidth="10"
            />
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={ringOffset(display)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[28px] font-semibold tabular-nums tracking-tight text-text">
              {display}%
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-2">concluído</span>
          </div>
        </div>

        <ul className="space-y-3">
          {modules.map((module) => {
            const Icon = ICONS[module.id as keyof typeof ICONS] ?? Music2
            const total = Math.max(module.total, 0)
            const done = Math.min(module.done, total || module.done)
            const ratio = total > 0 ? done / total : 0
            return (
              <li key={module.id}>
                <button
                  type="button"
                  onClick={module.onOpen}
                  className="group w-full rounded-xl px-1 py-0.5 text-left transition-colors hover:bg-hover/60"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted group-hover:text-text">
                      <Icon className="h-3.5 w-3.5 text-accent" />
                      {module.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-2">
                      {done}/{total || 0}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                    <div
                      className={cn('h-full rounded-full bg-accent transition-[width]')}
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
