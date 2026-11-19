import { Check, RefreshCw } from 'lucide-react'
import {
  UPDATE_ERROR_DOWNLOAD_SHORT,
  UPDATE_NOTES_FALLBACK,
  formatVersionTag,
  isSidebarUpdateRelevant,
  normalizeReleaseNotes,
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
  const versionTag = formatVersionTag(version)
  const currentTag = formatVersionTag(status.currentVersion)
  const state = status.state
  const percent = status.downloadPercent
  const minimized = sidebarMinimized && state !== 'downloading' && state !== 'error'
  const title = sidebarUpdateStatusLabel(state)
  const subtitle = versionTag
    ? currentTag && currentTag !== versionTag
      ? `Versão ${currentTag} → ${versionTag}`
      : `Atlas Studio ${versionTag}`
    : 'Nova versão do Atlas Studio'
  const compactTitle = versionTag ? `${title} · ${versionTag}` : title

  const showWhatsNew =
    Boolean(version) && (state === 'available' || state === 'downloading' || state === 'ready')
  const notes = showWhatsNew
    ? normalizeReleaseNotes(status.releaseNotes, { displayedVersion: version })
    : { items: [] as string[] }
  const hasNotes = notes.items.length > 0 || Boolean(notes.text) || Boolean(notes.title)

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
        title={compactTitle}
        aria-label={compactTitle}
        disabled={busy && state !== 'downloading'}
        onClick={handlePrimary}
        className={cn(
          'relative flex h-11 w-full items-center justify-center rounded-xl border border-border-soft bg-elevated text-accent transition-colors hover:border-border-strong',
          state === 'ready' && 'border-accent/35',
        )}
      >
        {state === 'ready' ? <Check className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
      </button>
    )
  }

  if (minimized) {
    return (
      <button
        type="button"
        title={compactTitle}
        onClick={expandSidebarCard}
        className="flex w-full items-center gap-2 rounded-xl border border-border-soft bg-elevated px-3 py-3 text-left transition-colors hover:border-border-strong"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-accent">{title}</span>
        {versionTag ? (
          <span className="shrink-0 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
            {versionTag}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border-soft bg-elevated px-3 py-3',
        (state === 'ready' || state === 'downloading') && 'border-accent/30',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              state === 'error' ? 'bg-danger' : 'bg-accent',
              state === 'downloading' && 'animate-pulse',
            )}
          />
          <span
            className={cn(
              'truncate text-xs font-semibold',
              state === 'error' ? 'text-danger' : 'text-accent',
            )}
          >
            {title}
          </span>
        </div>
        {versionTag ? (
          <span className="shrink-0 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
            {versionTag}
          </span>
        ) : null}
      </div>

      <p className="mt-1 truncate pl-4 text-xs text-muted tabular-nums">
        {state === 'error' ? UPDATE_ERROR_DOWNLOAD_SHORT : subtitle}
      </p>

      {showWhatsNew ? (
        <div className="mt-2.5 rounded-lg border border-border-soft/80 bg-bg/40 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-2">
            Novidades da atualização
          </p>
          <div className="mt-1.5 max-h-32 space-y-1.5 overflow-y-auto pr-0.5">
            {notes.title ? (
              <p className="text-[11px] font-medium leading-snug text-text">{notes.title}</p>
            ) : null}
            {notes.items.length > 0 ? (
              <ul className="space-y-1">
                {notes.items.map((item, index) => (
                  <li
                    key={`${index}-${item.slice(0, 24)}`}
                    className="flex gap-1.5 text-[11px] leading-snug text-muted"
                  >
                    <span
                      className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-accent/70"
                      aria-hidden
                    />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {notes.text ? (
              <p className="text-[11px] leading-snug text-muted">{notes.text}</p>
            ) : null}
            {!hasNotes ? (
              <p className="text-[11px] leading-snug text-muted">{UPDATE_NOTES_FALLBACK}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {state === 'downloading' ? (
        <>
          <p className="mt-2.5 text-xs text-accent tabular-nums">
            {sidebarDownloadProgressLabel(percent)}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hover">
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
          className="mt-2.5 w-full rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {versionTag ? `Baixar ${versionTag}` : 'Baixar'}
        </button>
      ) : null}

      {state === 'ready' ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void install()}
            className="w-full rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {versionTag ? `Reiniciar e instalar ${versionTag}` : 'Reiniciar e atualizar'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={minimizeSidebarCard}
            className="w-full rounded-lg px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-50"
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
          className="mt-2.5 w-full rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  )
}
