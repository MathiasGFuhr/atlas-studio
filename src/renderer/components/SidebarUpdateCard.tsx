import { Check, RefreshCw } from 'lucide-react'
import {
  UPDATE_ERROR_DOWNLOAD_SHORT,
  isSidebarUpdateRelevant,
  sidebarDownloadProgressLabel,
  sidebarUpdateStatusLabel,
} from '@shared/updates'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { cn } from '../lib/utils'

export function SidebarUpdateCard({ compact = false }: { compact?: boolean }) {
  const {
    status,
    busy,
    userDownloadError,
    sidebarMinimized,
    download,
    install,
    minimizeSidebarCard,
    expandSidebarCard,
  } = useAppUpdate()

  const visible = isSidebarUpdateRelevant(status, { userDownloadError })
  if (!visible || !status) return null

  const version = status.availableVersion?.trim() ?? ''
  const state = status.state
  const percent = status.downloadPercent
  const minimized = sidebarMinimized && state !== 'downloading' && state !== 'error'
  const title = sidebarUpdateStatusLabel(state)
  const subtitle = version ? `Atlas Studio ${version}` : 'Nova versão do Atlas Studio'

  function handlePrimary() {
    if (state === 'ready') {
      void install()
      return
    }
    if (state === 'available' || state === 'error') {
      void download()
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={busy && state !== 'downloading'}
        onClick={handlePrimary}
        className={cn(
          'relative flex h-11 w-full items-center justify-center rounded-xl border border-border-soft bg-card-2 text-accent transition-colors',
          'hover:border-[#334049]',
          state === 'ready' && 'border-accent/35',
        )}
      >
        {state === 'ready' ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(53,229,139,0.8)]" />
      </button>
    )
  }

  if (minimized) {
    return (
      <button
        type="button"
        title={title}
        onClick={expandSidebarCard}
        className="flex w-full items-center gap-2 rounded-xl border border-border-soft bg-card-2 px-3 py-3 text-left transition-colors hover:border-[#334049]"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgba(53,229,139,0.8)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-accent">{title}</span>
      </button>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border-soft bg-card-2 px-3 py-3',
        state === 'ready' && 'border-accent/30',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            state === 'error' ? 'bg-danger' : 'bg-accent shadow-[0_0_8px_rgba(53,229,139,0.8)]',
            state === 'downloading' && 'animate-pulse',
          )}
        />
        <span
          className={cn(
            'truncate text-sm font-medium',
            state === 'error' ? 'text-danger' : 'text-accent',
          )}
        >
          {title}
        </span>
      </div>
      <p className="mt-1 truncate pl-4 text-xs text-muted">
        {state === 'error' ? UPDATE_ERROR_DOWNLOAD_SHORT : subtitle}
      </p>

      {state === 'downloading' ? (
        <>
          <p className="mt-2 pl-4 text-xs text-muted">{sidebarDownloadProgressLabel(percent)}</p>
          <div className="mt-1.5 ml-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full bg-accent transition-[width] duration-200',
                percent == null && 'w-full animate-pulse opacity-50',
              )}
              style={percent == null ? undefined : { width: `${percent}%` }}
            />
          </div>
        </>
      ) : null}

      {state === 'available' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void download()}
          className="mt-2.5 w-full rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Baixar
        </button>
      ) : null}

      {state === 'ready' ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void install()}
            className="w-full rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reiniciar e atualizar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={minimizeSidebarCard}
            className="w-full rounded-lg px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-white/5 hover:text-text disabled:opacity-50"
          >
            Depois
          </button>
        </div>
      ) : null}

      {state === 'error' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void download()}
          className="mt-2.5 w-full rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  )
}
