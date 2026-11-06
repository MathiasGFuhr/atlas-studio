import type { ComponentType } from 'react'
import {
  Clapperboard,
  FolderPlus,
  MessageSquareText,
  MessagesSquare,
  Mic2,
  Tv,
} from 'lucide-react'
import { Card } from '../Card'
import quickActionsBg from '../../assets/quick-actions-bg.jpg'
import { cn } from '../../lib/utils'

type QuickAction = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  onClick: () => void
}

export function HomeQuickActions({
  actions,
  secondary,
}: {
  actions: QuickAction[]
  secondary?: Array<{ id: string; label: string; onClick: () => void }>
}) {
  return (
    <Card padding="lg" className="home-v2-panel relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
        <img
          src={quickActionsBg}
          alt=""
          className="h-full w-full scale-105 object-cover object-center opacity-80"
        />
        <div className="absolute inset-0 bg-bg/78" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg/92" />
      </div>

      <div className="relative mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-2">Atalhos</p>
        <h2 className="home-greeting mt-1.5 text-[1.35rem] leading-none text-text">Ações rápidas</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Entre direto no fluxo de produção.
        </p>
      </div>

      <div className="relative grid flex-1 grid-cols-2 content-start gap-2.5">
        {actions.map((action, index) => {
          const Icon = action.icon
          const featured = index === 0
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={cn(
                'group flex min-h-[92px] flex-col items-start justify-between gap-3 rounded-2xl border px-3.5 py-3.5 text-left transition-all duration-200',
                featured
                  ? 'border-accent/35 bg-accent/12 hover:border-accent/55 hover:bg-accent/18'
                  : 'border-border-soft/90 bg-bg/40 backdrop-blur-sm hover:border-accent/30 hover:bg-accent/10',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                  featured
                    ? 'bg-accent text-on-accent'
                    : 'bg-accent/15 text-accent group-hover:bg-accent/20',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-semibold leading-snug text-text">{action.label}</span>
            </button>
          )
        })}
      </div>

      {secondary && secondary.length > 0 ? (
        <div className="relative mt-3 flex flex-col gap-1 border-t border-border-soft pt-3">
          {secondary.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

export const HOME_QUICK_ICONS = {
  FolderPlus,
  Mic2,
  Clapperboard,
  Tv,
  MessageSquareText,
  MessagesSquare,
}
