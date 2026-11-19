import { ChevronRight, RefreshCw, Zap } from 'lucide-react'
import type { AtlasAiStatusView } from '@shared/atlasAiStatus'
import {
  formatVersionTag,
  updateStateLabel,
  type AppUpdateStatus,
} from '@shared/updates'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { cn } from '../lib/utils'
import logoAi from '../assets/brand/logo-ai.png'

const kindDot: Record<AtlasAiStatusView['kind'], string> = {
  connected: 'bg-accent',
  connecting: 'bg-accent/80 animate-pulse',
  attention: 'bg-warning',
  disconnected: 'border border-muted-2 bg-transparent',
}

const kindText: Record<AtlasAiStatusView['kind'], string> = {
  connected: 'text-muted',
  connecting: 'text-muted',
  attention: 'text-warning',
  disconnected: 'text-muted',
}

function updateStatusLine(status: AppUpdateStatus | null): {
  label: string
  tone: 'ok' | 'warn' | 'muted' | 'busy'
} {
  if (!status) return { label: '—', tone: 'muted' }
  const currentTag = formatVersionTag(status.currentVersion)
  const availableTag = formatVersionTag(status.availableVersion)

  switch (status.state) {
    case 'up-to-date':
      return {
        label: currentTag ? `Atualizado · ${currentTag}` : 'Atualizado',
        tone: 'ok',
      }
    case 'available':
      return {
        label: availableTag ? `Nova versão · ${availableTag}` : 'Nova versão disponível',
        tone: 'warn',
      }
    case 'ready':
      return {
        label: availableTag ? `Pronta · ${availableTag}` : 'Atualização pronta',
        tone: 'ok',
      }
    case 'downloading':
      return {
        label: availableTag
          ? status.downloadPercent != null
            ? `Baixando ${availableTag} · ${Math.round(status.downloadPercent)}%`
            : `Baixando ${availableTag}…`
          : status.downloadPercent != null
            ? `Baixando · ${Math.round(status.downloadPercent)}%`
            : 'Baixando…',
        tone: 'busy',
      }
    case 'checking':
      return { label: 'Verificando…', tone: 'busy' }
    case 'error':
      return { label: 'Falha ao verificar', tone: 'warn' }
    case 'dev':
      return { label: 'Modo desenvolvimento', tone: 'muted' }
    case 'unsupported':
      return { label: 'Atualizador indisponível', tone: 'muted' }
    case 'idle':
      return {
        label: currentTag || 'Aguardando verificação',
        tone: 'muted',
      }
    default:
      return {
        label: updateStateLabel(status.state),
        tone: 'muted',
      }
  }
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
  const { status, busy, check } = useAppUpdate()
  const updateLine = updateStatusLine(status)
  const checking = status?.state === 'checking' || busy
  const live = view.kind === 'connected' || view.kind === 'connecting'

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          data-tour="ai"
          title={view.compactLabel}
          aria-label={view.compactLabel}
          onClick={onClick}
          className={cn(
            'relative flex h-12 w-full items-center justify-center overflow-hidden rounded-xl border transition-colors',
            live
              ? 'border-accent/25 bg-elevated hover:bg-hover'
              : 'border-border-soft bg-elevated hover:bg-hover',
          )}
        >
          <img src={logoAi} alt="" className="h-8 w-8 object-contain" draggable={false} />
          <span
            className={cn('absolute right-2 top-2 h-2 w-2 rounded-full', kindDot[view.kind])}
          />
        </button>
        <button
          type="button"
          title={updateLine.label}
          aria-label={`Verificar atualização. ${updateLine.label}`}
          disabled={checking}
          onClick={() => void check()}
          className="relative flex h-10 w-full items-center justify-center rounded-xl border border-border-soft bg-elevated text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
          {updateLine.tone === 'warn' || status?.state === 'ready' ? (
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-soft bg-card">
      <button
        type="button"
        data-tour="ai"
        title={view.tooltip}
        aria-label={view.compactLabel}
        onClick={onClick}
        className="relative flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-hover/60"
      >
        <span
          className={cn(
            'relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border',
            live
              ? 'border-accent/30 bg-elevated'
              : 'border-border-soft bg-elevated',
          )}
        >
          <img
            src={logoAi}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
          {live ? (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold tracking-tight text-text">
              {view.title}
            </span>
            {live ? <Zap className="h-3 w-3 shrink-0 text-accent" fill="currentColor" /> : null}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', kindDot[view.kind])} />
            <span className={cn('truncate text-[11px]', kindText[view.kind])}>{view.statusLabel}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-2" />
      </button>

      <div className="relative flex items-center gap-2 border-t border-border-soft bg-input/60 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
            Atualização
          </p>
          <p
            className={cn(
              'mt-0.5 text-xs leading-snug tabular-nums',
              updateLine.tone === 'ok' && 'text-accent',
              updateLine.tone === 'warn' && 'text-warning',
              updateLine.tone === 'busy' && 'text-accent',
              updateLine.tone === 'muted' && 'text-muted',
            )}
            title={updateLine.label}
          >
            {updateLine.label}
          </p>
        </div>
        <button
          type="button"
          disabled={checking}
          onClick={() => void check()}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-elevated px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors',
            'hover:bg-hover hover:text-text disabled:cursor-not-allowed disabled:text-disabled',
          )}
        >
          <RefreshCw className={cn('h-3 w-3', checking && 'animate-spin')} />
          Verificar
        </button>
      </div>
    </div>
  )
}
