import { useEffect, useRef, useState } from 'react'
import { BookOpen, MoreHorizontal, Music2 } from 'lucide-react'
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
  onCopyTitle,
  onCopyDescription,
}: {
  video: ChannelVideo
  onOpen: () => void
  onCopyTitle: () => void
  onCopyDescription: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const channelType = video.channelType === 'music' ? 'music' : video.channelType === 'history' ? 'history' : null
  const TypeIcon = channelType === 'music' ? Music2 : BookOpen
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
        'group flex min-w-0 cursor-pointer gap-4 rounded-2xl border border-border-soft bg-card p-3.5',
        'transition-[border-color,background-color] duration-200 hover:border-[#334049] hover:bg-card-2/40',
      )}
    >
      <div
        className="relative h-[84px] w-[148px] shrink-0 overflow-hidden rounded-xl bg-card-2"
        style={
          !video.thumbnailDataUrl && video.channelColor
            ? { background: `linear-gradient(145deg, ${video.channelColor}28, #151c21)` }
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
        {date ? (
          <div className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-1 text-center backdrop-blur-sm">
            <p className="text-[11px] font-semibold leading-none tabular-nums text-text">{date.day}</p>
            <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted">{date.month}</p>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-2">
              {formatScheduledDateLabel(video.scheduledDate)}
            </p>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-text">
              {video.title}
            </h3>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className="rounded-md p-1 text-muted-2 opacity-0 transition-opacity hover:bg-white/5 hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
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
                className="absolute right-0 z-20 mt-1 min-w-[168px] rounded-xl border border-border-soft bg-card-2 py-1 shadow-lg"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-xs text-text hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpen()
                  }}
                >
                  Abrir
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-xs text-text hover:bg-white/5"
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
                  className="block w-full px-3 py-1.5 text-left text-xs text-text hover:bg-white/5"
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
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
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
