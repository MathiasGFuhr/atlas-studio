import { ChevronRight, Sparkles } from 'lucide-react'
import type { AtlasAiStatusView } from '@shared/atlasAiStatus'
import { cn } from '../lib/utils'

const kindDot: Record<AtlasAiStatusView['kind'], string> = {
  connected: 'bg-accent shadow-[0_0_8px_rgba(53,229,139,0.8)]',
  connecting: 'bg-accent/80 animate-pulse',
  attention: 'bg-warning',
  disconnected: 'border border-muted bg-transparent',
}

const kindText: Record<AtlasAiStatusView['kind'], string> = {
  connected: 'text-muted',
  connecting: 'text-muted',
  attention: 'text-warning',
  disconnected: 'text-muted',
}

export function AtlasAiStatusCard({
  view,
  onClick,
  compact = false,
}: {
  view: AtlasAiStatusView
  onClick?: () => void
  compact?: boolean
}) {
  if (compact) {
    return (
      <button
        type="button"
        data-tour="ai"
        title={view.compactLabel}
        aria-label={view.compactLabel}
        onClick={onClick}
        className={cn(
          'relative flex h-11 w-full items-center justify-center rounded-xl border border-border-soft bg-card-2 text-muted transition-colors',
          'hover:border-[#334049] hover:text-text',
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span
          className={cn(
            'absolute right-2 top-2 h-2 w-2 rounded-full',
            kindDot[view.kind],
          )}
        />
      </button>
    )
  }

  return (
    <button
      type="button"
      data-tour="ai"
      title={view.tooltip}
      aria-label={view.compactLabel}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-xl border border-border-soft bg-card-2 px-3 py-2.5 text-left transition-colors',
        'hover:border-[#334049]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-text">{view.title}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', kindDot[view.kind])} />
          <span className={cn('truncate text-xs', kindText[view.kind])}>{view.statusLabel}</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </button>
  )
}
