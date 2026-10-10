import { ChevronRight, RefreshCw, Zap } from 'lucide-react'
import type { AtlasAiStatusView } from '@shared/atlasAiStatus'
import { updateStateLabel, type AppUpdateStatus } from '@shared/updates'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { cn } from '../lib/utils'
import logoAi from '../assets/brand/logo-ai.png'

const kindDot: Record<AtlasAiStatusView['kind'], string> = {
  connected: 'bg-accent shadow-[0_0_10px_rgba(53,229,139,0.9)]',
  connecting: 'bg-accent/80 animate-pulse shadow-[0_0_8px_rgba(53,229,139,0.55)]',
  attention: 'bg-warning shadow-[0_0_8px_rgba(251,191,36,0.55)]',
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
  switch (status.state) {
    case 'up-to-date':
      return {
        label: `Atualizado · v${status.currentVersion}`,
        tone: 'ok',
      }
    case 'available':
      return {
        label: status.availableVersion
          ? `Nova versão · v${status.availableVersion}`
          : 'Nova versão disponível',
        tone: 'warn',
      }
    case 'ready':
      return {
        label: status.availableVersion
          ? `Pronta · v${status.availableVersion}`
          : 'Atualização pronta',
        tone: 'warn',
      }
    case 'downloading':
      return {
        label:
          status.downloadPercent != null
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
        label: status.currentVersion ? `v${status.currentVersion}` : 'Aguardando verificação',
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
              ? 'border-accent/30 bg-black/40 shadow-[0_0_18px_rgba(53,229,139,0.14)]'
              : 'border-white/[0.08] bg-[#12181d] hover:border-white/[0.14]',
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
          className={cn(
            'relative flex h-10 w-full items-center justify-center rounded-xl border border-white/[0.08] bg-[#12181d] text-muted transition-colors',
            'hover:border-white/[0.14] hover:text-text disabled:opacity-60',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
          {updateLine.tone === 'warn' ? (
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(53,229,139,0.8)]" />
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-[#0c1216] shadow-[0_0_28px_rgba(53,229,139,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden
        style={{
          background:
            'radial-gradient(120% 80% at 0% 0%, rgba(53,229,139,0.16), transparent 55%), radial-gradient(90% 70% at 100% 100%, rgba(53,229,139,0.08), transparent 50%)',
        }}
      />
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-accent/10 blur-2xl"
        aria-hidden
      />

      <button
        type="button"
        data-tour="ai"
        title={view.tooltip}
        aria-label={view.compactLabel}
        onClick={onClick}
        className="relative flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span
          className={cn(
            'relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border',
            live
              ? 'border-accent/40 bg-black/35 shadow-[0_0_18px_rgba(53,229,139,0.22)]'
              : 'border-white/[0.1] bg-black/30',
          )}
        >
          <img
            src={logoAi}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
          {live ? (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(53,229,139,0.9)]" />
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

      <div className="relative flex items-center gap-2 border-t border-white/[0.06] bg-black/20 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
            Atualização
          </p>
          <p
            className={cn(
              'mt-0.5 truncate text-xs',
              updateLine.tone === 'ok' && 'text-accent',
              updateLine.tone === 'warn' && 'text-warning',
              updateLine.tone === 'busy' && 'text-muted',
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
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-colors',
            'hover:border-accent/40 hover:bg-accent/16 disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <RefreshCw className={cn('h-3 w-3', checking && 'animate-spin')} />
          Verificar
        </button>
      </div>
    </div>
  )
}
