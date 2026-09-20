import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Plus, Tv } from 'lucide-react'
import type { Channel } from '@shared/types'
import { PROJECT_TYPE_LABEL } from '@shared/types'
import { channelCalendarPath } from '@shared/channelVideos'
import {
  channelIdFromPath,
  pickSidebarChannel,
  readLastSidebarChannelId,
  writeLastSidebarChannelId,
} from '@shared/sidebarChannel'
import { ENVIRONMENTS } from '../lib/environments'
import { getAtlasApi } from '../lib/api'
import { onChannelsChanged } from '../lib/channelEvents'
import { cn } from '../lib/utils'

function ChannelAvatar({
  channel,
  sizeClass,
}: {
  channel: Channel | null
  sizeClass: string
}) {
  const color = channel?.color || '#35e58b'
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-full border border-border-soft',
        sizeClass,
      )}
      style={{ background: `linear-gradient(145deg, ${color}55, #10161a)` }}
    >
      {channel?.avatarDataUrl ? (
        <img src={channel.avatarDataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Tv className="h-3.5 w-3.5 text-muted" style={channel ? { color } : undefined} />
        </div>
      )}
    </div>
  )
}

export function SidebarChannelSwitcher({ compact = false }: { compact?: boolean }) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [channels, setChannels] = useState<Channel[]>([])
  const [lastChannelId, setLastChannelId] = useState<string | null>(() =>
    readLastSidebarChannelId(typeof localStorage === 'undefined' ? null : localStorage),
  )
  const [activeIndex, setActiveIndex] = useState(0)

  const routeChannelId = channelIdFromPath(pathname)
  const selected = useMemo(
    () => pickSidebarChannel(channels, { routeChannelId, lastChannelId }),
    [channels, routeChannelId, lastChannelId],
  )

  const load = useCallback(async () => {
    const list = await api.channels.list()
    setChannels(list)
  }, [api])

  useEffect(() => {
    void load()
    return onChannelsChanged(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    if (!selected) return
    if (lastChannelId === selected.id) return
    writeLastSidebarChannelId(typeof localStorage === 'undefined' ? null : localStorage, selected.id)
    setLastChannelId(selected.id)
  }, [selected, lastChannelId])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    close()
  }, [pathname, compact, close])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const index = selected ? channels.findIndex((channel) => channel.id === selected.id) : 0
    setActiveIndex(index >= 0 ? index : 0)
  }, [open, channels, selected])

  function rememberAndOpen(channel: Channel) {
    writeLastSidebarChannelId(typeof localStorage === 'undefined' ? null : localStorage, channel.id)
    setLastChannelId(channel.id)
    close()
    navigate(channelCalendarPath(channel.id))
  }

  function openSelected() {
    if (selected) {
      rememberAndOpen(selected)
      return
    }
    openManage()
  }

  function openManage() {
    close()
    navigate('/canais')
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (channels.length === 0 ? 0 : (index + 1) % channels.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) =>
        channels.length === 0 ? 0 : (index - 1 + channels.length) % channels.length,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const channel = channels[activeIndex]
      if (channel) rememberAndOpen(channel)
      else openManage()
    }
  }

  const typeLabel = selected
    ? PROJECT_TYPE_LABEL[selected.channelType ?? 'history']
    : 'Nenhum canal'
  const typeColor = selected
    ? ENVIRONMENTS[selected.channelType ?? 'history'].color
    : undefined
  const triggerLabel = selected
    ? compact
      ? `Canal ${selected.name}. Abrir lista de canais.`
      : `Abrir ${selected.name}`
    : 'Nenhum canal. Abrir canais.'

  return (
    <div ref={rootRef} className={cn('relative', compact ? 'px-2' : 'px-3')}>
      <div
        className={cn(
          'flex w-full items-center rounded-xl border border-transparent transition-colors',
          'hover:border-border-soft hover:bg-white/[0.04]',
          open && 'border-border-soft bg-white/[0.04]',
          compact ? 'justify-center' : '',
        )}
      >
        <button
          type="button"
          title={selected ? selected.name : 'Escolher canal'}
          aria-label={triggerLabel}
          aria-haspopup={compact ? 'menu' : undefined}
          aria-expanded={compact ? open : undefined}
          onClick={compact ? () => setOpen((value) => !value) : openSelected}
          onKeyDown={compact ? onTriggerKeyDown : undefined}
          className={cn(
            'flex min-w-0 items-center text-left',
            compact ? 'justify-center px-0 py-2' : 'flex-1 gap-2.5 px-2 py-2',
          )}
        >
          <ChannelAvatar channel={selected} sizeClass="h-9 w-9" />
          {compact ? null : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-text">
                {selected?.name ?? 'Escolher canal'}
              </span>
              <span
                className="mt-0.5 block truncate text-[11px] leading-tight text-muted"
                style={typeColor ? { color: typeColor } : undefined}
              >
                {typeLabel}
              </span>
            </span>
          )}
        </button>
        {compact ? null : (
          <button
            type="button"
            title="Trocar canal"
            aria-label="Trocar canal"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            onKeyDown={onTriggerKeyDown}
            className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {open ? (
        <div
          role="menu"
          aria-label="Canais"
          className={cn(
            'z-50 overflow-hidden rounded-xl border border-border bg-card-2 shadow-[0_12px_28px_rgba(0,0,0,0.45)]',
            compact
              ? 'absolute left-[calc(100%+10px)] top-0 w-[240px]'
              : 'absolute left-3 right-3 top-[calc(100%+6px)]',
          )}
        >
          {channels.length === 0 ? (
            <p className="px-3 py-3 text-xs leading-relaxed text-muted">
              Crie um canal para abrir o calendário daqui.
            </p>
          ) : (
            <div className="max-h-[min(18rem,50vh)] overflow-y-auto p-1.5">
              {channels.map((channel, index) => {
                const active = index === activeIndex
                const current = selected?.id === channel.id
                const label = PROJECT_TYPE_LABEL[channel.channelType ?? 'history']
                return (
                  <button
                    key={channel.id}
                    type="button"
                    role="menuitem"
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
                      active ? 'bg-accent-dark/55' : 'hover:bg-white/[0.04]',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => rememberAndOpen(channel)}
                  >
                    <ChannelAvatar channel={channel} sizeClass="h-8 w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text">
                        {channel.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted">
                        {label}
                        {channel.active ? '' : ' · Inativo'}
                      </span>
                    </span>
                    {current ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                  </button>
                )
              })}
            </div>
          )}
          <div className="border-t border-border-soft p-1.5">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
              onClick={openManage}
            >
              <Plus className="h-3.5 w-3.5" />
              {channels.length === 0 ? 'Criar canal' : 'Gerenciar canais'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
