import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Music2 } from 'lucide-react'
import type { ChannelVideo } from '@shared/types'
import { PROJECT_TYPE_LABEL } from '@shared/types'
import { formatScheduledDateLabel, parseDateKey } from '@shared/channelVideos'
import { StatusBadge } from '../StatusBadge'
import { cn } from '../../lib/utils'

function dateParts(dateKey: string): { day: string; month: string } | null {
  const date = parseDateKey(dateKey)
  if (!date) return null
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
  }
}

export function HomeScheduledVideoCard({
  video,
  onOpen,
  onOpenProject,
  onCopyTitle,
  onCopyDescription,
}: {
  video: ChannelVideo
  onOpen: () => void
  onOpenProject?: () => void
  onCopyTitle: () => void
  onCopyDescription: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const channelType = video.channelType === 'music' ? 'music' : null
  const TypeIcon = Music2
  const date = dateParts(video.scheduledDate)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group flex min-w-0 cursor-pointer gap-4 rounded-2xl border border-border-soft/90 bg-card p-3.5',
        'shadow-card',
        'transition-[border-color,transform,box-shadow] duration-200',
        'hover:-translate-y-px hover:border-border-strong',
      )}
    >
      <div
        className="relative h-[88px] w-[152px] shrink-0 overflow-hidden rounded-xl border border-border-soft bg-elevated"
        style={
          !video.thumbnailDataUrl && video.channelColor
            ? { background: `linear-gradient(145deg, ${video.channelColor}28, var(--color-elevated))` }
            : undefined
        }
      >
        {video.thumbnailDataUrl ? (
          <img src={video.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-2">
            <TypeIcon className="h-5 w-5" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-overlay/35 via-transparent to-transparent" />
        {date ? (
          <div className="absolute left-2 top-2 rounded-lg border border-border bg-overlay/60 px-1.5 py-1 text-center backdrop-blur-md">
            <p className="text-[11px] font-semibold leading-none tabular-nums text-text">{date.day}</p>
            <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted">
              {date.month}
            </p>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
              {formatScheduledDateLabel(video.scheduledDate)}
            </p>
            <h3 className="mt-1.5 line-clamp-2 text-[14px] font-semibold leading-snug tracking-tight text-text">
              {video.title}
            </h3>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted-2 opacity-0 transition-all hover:bg-hover hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Ações rápidas"
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen((open) => !open)
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[168px] overflow-hidden rounded-xl border border-border-soft/90 bg-elevated py-1 shadow-popover"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-xs text-text hover:bg-hover"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpen()
                  }}
                >
                  Abrir
                </button>
                {onOpenProject && video.projectId && channelType === 'music' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-xs text-text hover:bg-hover"
                    onClick={() => {
                      setMenuOpen(false)
                      onOpenProject()
                    }}
                  >
                    Abrir projeto
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-xs text-text hover:bg-hover"
                  onClick={() => {
                    setMenuOpen(false)
                    onCopyTitle()
                  }}
                >
                  Copiar título
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-xs text-text hover:bg-hover"
                  onClick={() => {
                    setMenuOpen(false)
                    onCopyDescription()
                  }}
                >
                  Copiar descrição
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
          <span className="truncate font-medium text-muted">{video.channelName ?? 'Canal'}</span>
          {channelType ? (
            <span className="text-muted-2">{PROJECT_TYPE_LABEL[channelType]}</span>
          ) : null}
          <StatusBadge status={video.status} className="px-2 py-0.5 text-[10px]" />
        </div>
      </div>
    </article>
  )
}
