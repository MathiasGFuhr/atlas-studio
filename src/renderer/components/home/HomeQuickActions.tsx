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
    <Card padding="lg" className="relative flex h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
        <img
          src={quickActionsBg}
          alt=""
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[#070b0e]/72" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b0e]/50 via-[#070b0e]/62 to-[#070b0e]/88" />
      </div>

      <div className="relative mb-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">Atalhos</p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Ações rápidas</h2>
      </div>

      <div className="relative grid flex-1 grid-cols-2 gap-2.5 content-start">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-black/35 px-2 py-3 text-center backdrop-blur-sm transition-colors hover:border-accent/35 hover:bg-accent/12"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-medium leading-snug text-text">{action.label}</span>
            </button>
          )
        })}
      </div>

      {secondary && secondary.length > 0 ? (
        <div className="relative mt-3 flex flex-col gap-1 border-t border-white/[0.05] pt-3">
          {secondary.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
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
