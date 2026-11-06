import { useEffect, useState } from 'react'
import { Check, RefreshCw, Sparkles } from 'lucide-react'
import {
  UPDATE_ERROR_DOWNLOAD_SHORT,
  UPDATE_NOTES_FALLBACK,
  atlasV2UpdateCopy,
  isAtlasV2Release,
  isSidebarUpdateRelevant,
  normalizeReleaseNotes,
  sidebarDownloadProgressLabel,
  sidebarUpdateStatusLabel,
} from '@shared/updates'
import { useAppUpdate } from '../hooks/useAppUpdate'
import { getAtlasApi } from '../lib/api'
import { cn } from '../lib/utils'

const SIDEBAR_NOTE_ITEMS = 5

export function SidebarUpdateCard({
  compact = false,
  accountName = '',
}: {
  compact?: boolean
  accountName?: string
}) {
  const api = getAtlasApi()
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
  const [resolvedName, setResolvedName] = useState(accountName)

  useEffect(() => {
    if (accountName.trim()) {
      setResolvedName(accountName)
      return
    }
    let cancelled = false
    void api.settings
      .get()
      .then((settings) => {
        if (!cancelled) setResolvedName(settings.accountName?.trim() || '')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [accountName, api])

  const visible = isSidebarUpdateRelevant(status, { userDownloadError })
  if (!visible || !status) return null

  const version = status.availableVersion?.trim() ?? ''
  const state = status.state
  const percent = status.downloadPercent
  const minimized = sidebarMinimized && state !== 'downloading' && state !== 'error'
  const premiere = isAtlasV2Release(version)
  const copy = premiere ? atlasV2UpdateCopy(resolvedName) : null
  const title = copy
    ? state === 'ready'
      ? copy.statusReady
      : state === 'downloading'
        ? copy.statusDownloading
        : copy.statusAvailable
    : sidebarUpdateStatusLabel(state)
  const subtitle = copy
    ? copy.line
    : version
      ? `Atlas Studio ${version}`
      : 'Nova versão do Atlas Studio'
  const notes =
    version && (state === 'available' || state === 'ready' || state === 'downloading') && !premiere
      ? normalizeReleaseNotes(status.releaseNotes, { displayedVersion: version })
      : { items: [] as string[] }
  const noteItems = notes.items.slice(0, SIDEBAR_NOTE_ITEMS)
  const hasNotes = noteItems.length > 0 || Boolean(notes.text)
  const showWhatsNew = !premiere && (state === 'available' || state === 'ready')

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
          'relative flex h-11 w-full items-center justify-center rounded-xl border bg-elevated text-accent transition-colors',
          premiere ? 'border-accent/40 bg-accent/10' : 'border-border-soft hover:border-border-strong',
          state === 'ready' && 'border-accent/35',
        )}
      >
        {premiere ? (
          <Sparkles className="h-4 w-4" />
        ) : state === 'ready' ? (
          <Check className="h-4 w-4" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
      </button>
    )
  }

  if (minimized) {
    return (
      <button
        type="button"
        title={title}
        onClick={expandSidebarCard}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left transition-colors',
          premiere
            ? 'border-accent/35 bg-accent/10 hover:bg-accent/15'
            : 'border-border-soft bg-elevated hover:border-border-strong',
        )}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-accent">{title}</span>
      </button>
    )
  }

  if (premiere && copy) {
    return (
      <div className="atlas-update-premiere relative overflow-hidden rounded-xl border border-accent/35 px-3 py-3">
        <div className="atlas-update-premiere__glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
              {copy.eyebrow}
            </span>
          </div>
          <p className="home-greeting mt-2 text-[1.15rem] leading-tight text-text">{copy.headline}</p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">{subtitle}</p>

          {state === 'downloading' ? (
            <>
              <p className="mt-2.5 text-xs text-accent">{sidebarDownloadProgressLabel(percent)}</p>
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
              className="mt-3 w-full rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.ctaDownload}
            </button>
          ) : null}

          {state === 'ready' ? (
            <div className="mt-3 flex flex-col gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void install()}
                className="w-full rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copy.ctaInstall}
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
              className="mt-3 w-full rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tentar novamente
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border-soft bg-elevated px-3 py-3',
        state === 'ready' && 'border-accent/30',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            state === 'error' ? 'bg-danger' : 'bg-accent',
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

      {showWhatsNew ? (
        <div className="mt-2.5 rounded-lg border border-border-soft/80 bg-bg/40 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-2">
            Novidades
          </p>
          {notes.title ? (
            <p className="mt-1 text-[11px] font-medium leading-snug text-text">{notes.title}</p>
          ) : null}
          {noteItems.length > 0 ? (
            <ul className="mt-1.5 space-y-1">
              {noteItems.map((item, index) => (
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
          {notes.text && noteItems.length === 0 ? (
            <p className="mt-1.5 text-[11px] leading-snug text-muted">{notes.text}</p>
          ) : null}
          {!hasNotes ? (
            <p className="mt-1.5 text-[11px] leading-snug text-muted">{UPDATE_NOTES_FALLBACK}</p>
          ) : null}
        </div>
      ) : null}

      {state === 'downloading' ? (
        <>
          <p className="mt-2 pl-4 text-xs text-muted">{sidebarDownloadProgressLabel(percent)}</p>
          <div className="mt-1.5 ml-4 h-1.5 overflow-hidden rounded-full bg-hover">
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
          Baixar
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
            Reiniciar e atualizar
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
