import { useEffect, useRef, useState } from 'react'
import { BookOpen, MoreHorizontal, Music2 } from 'lucide-react'
import type { ChannelVideo } from '@shared/types'
import { PROJECT_TYPE_LABEL } from '@shared/types'
import { formatScheduledDateLabel } from '@shared/channelVideos'
import { StatusBadge } from '../StatusBadge'
import { cn } from '../../lib/utils'

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
        'flex min-w-0 cursor-pointer gap-3 rounded-2xl border border-border-soft bg-card p-3',
        'shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-colors hover:border-[#334049]',
      )}
    >
      <div
        className="h-[72px] w-[128px] shrink-0 overflow-hidden rounded-xl border border-border-soft bg-card-2"
        style={
          !video.thumbnailDataUrl && video.channelColor
            ? { background: `${video.channelColor}22` }
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
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-2">
              {formatScheduledDateLabel(video.scheduledDate)}
            </p>
            <h3 className="mt-0.5 truncate text-sm font-semibold text-text">{video.title}</h3>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className="rounded-md p-1 text-muted hover:bg-white/5 hover:text-text"
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
                className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-xl border border-border-soft bg-card-2 py-1 shadow-lg"
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
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="truncate font-medium text-text">{video.channelName ?? 'Canal'}</span>
          {channelType ? (
            <>
              <span aria-hidden className="text-muted-2">
                ·
              </span>
              <span>{PROJECT_TYPE_LABEL[channelType]}</span>
            </>
          ) : null}
          <StatusBadge status={video.status} className="px-2 py-0.5 text-[10px]" />
        </div>
      </div>
    </article>
  )
}
