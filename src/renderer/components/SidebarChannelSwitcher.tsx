import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Plus, Tv } from 'lucide-react'
import type { Channel } from '@shared/types'
import { channelCalendarPath } from '@shared/channelVideos'
import {
  channelIdFromPath,
  pickSidebarChannel,
  readLastSidebarChannelId,
} from '@shared/sidebarChannel'
import { getAtlasApi } from '../lib/api'
import { onChannelsChanged } from '../lib/channelEvents'
import { notifySidebarChannelChanged } from '../lib/sidebarChannelEvents'
import { cn } from '../lib/utils'

function ChannelAvatar({
  channel,
  sizeClass,
}: {
  channel: Channel | null
  sizeClass: string
}) {
  const color = channel?.color || '#35bf9b'
  return (
    <div
      className={cn('shrink-0 overflow-hidden rounded-full', sizeClass)}
      style={{ background: `linear-gradient(145deg, ${color}40, var(--color-elevated))` }}
    >
      {channel?.avatarDataUrl ? (
        <img src={channel.avatarDataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Tv className="h-3.5 w-3.5 text-muted-2" style={channel ? { color } : undefined} />
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
  const musicChannels = useMemo(
    () => channels.filter((channel) => channel.channelType === 'music'),
    [channels],
  )
  const selected = useMemo(
    () => pickSidebarChannel(musicChannels, { routeChannelId, lastChannelId }),
    [musicChannels, routeChannelId, lastChannelId],
  )

  const load = useCallback(async () => {
    const list = await api.channels.list({ channelType: 'music' })
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
    notifySidebarChannelChanged(selected.id)
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
    const index = selected ? musicChannels.findIndex((channel) => channel.id === selected.id) : 0
    setActiveIndex(index >= 0 ? index : 0)
  }, [open, musicChannels, selected])

  function setPrincipalChannel(channel: Channel, openCalendar: boolean) {
    notifySidebarChannelChanged(channel.id)
    setLastChannelId(channel.id)
    close()
    if (openCalendar) navigate(channelCalendarPath(channel.id))
  }

  function rememberAndOpen(channel: Channel) {
    // No Início, só define o canal principal (a agenda da home atualiza).
    // Nas demais telas, abre o calendário do canal.
    setPrincipalChannel(channel, pathname !== '/')
  }

  function openSelected() {
    if (selected) {
      setPrincipalChannel(selected, true)
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
      setActiveIndex((index) =>
        musicChannels.length === 0 ? 0 : (index + 1) % musicChannels.length,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) =>
        musicChannels.length === 0
          ? 0
          : (index - 1 + musicChannels.length) % musicChannels.length,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const channel = musicChannels[activeIndex]
      if (channel) rememberAndOpen(channel)
      else openManage()
    }
  }

  const triggerLabel = selected
    ? compact
      ? `Canal ${selected.name}. Abrir lista de canais.`
      : `Abrir ${selected.name}`
    : 'Nenhum canal. Abrir canais.'

  return (
    <div ref={rootRef} className={cn('relative', compact ? 'px-2' : 'px-3')}>
      <div
        className={cn(
          'flex w-full items-center rounded-lg transition-colors',
          open ? 'bg-elevated' : 'hover:bg-hover/60',
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
            compact ? 'justify-center px-0 py-2' : 'flex-1 gap-2.5 px-1.5 py-1.5',
          )}
        >
          <ChannelAvatar channel={selected} sizeClass="h-8 w-8" />
          {compact ? null : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium tracking-[-0.01em] text-text">
                {selected?.name ?? 'Escolher canal'}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-2">
                {selected
                  ? selected.active
                    ? 'Canal principal'
                    : 'Canal principal · inativo'
                  : 'Sem canal'}
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
            className="mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-hover hover:text-text"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {open ? (
        <div
          role="menu"
          aria-label="Canais"
          className={cn(
            'z-50 overflow-hidden rounded-xl border border-border/80 bg-elevated shadow-popover',
            compact
              ? 'absolute left-[calc(100%+10px)] top-0 w-[248px]'
              : 'absolute left-3 right-3 top-[calc(100%+8px)]',
          )}
        >
          <div className="border-b border-border-soft px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-2">
              Canal principal
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Define qual agenda aparece no Início.
            </p>
          </div>

          {musicChannels.length === 0 ? (
            <p className="px-3 py-3 text-xs leading-relaxed text-muted">
              Crie um canal para abrir o calendário daqui.
            </p>
          ) : (
            <div className="sidebar-channel-menu max-h-[min(16rem,46vh)] overflow-y-auto px-1.5 py-1.5">
              {musicChannels.map((channel, index) => {
                const active = index === activeIndex
                const current = selected?.id === channel.id
                return (
                  <button
                    key={channel.id}
                    type="button"
                    role="menuitem"
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                      current
                        ? 'bg-hover'
                        : active
                          ? 'bg-elevated'
                          : 'hover:bg-hover/60',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => rememberAndOpen(channel)}
                  >
                    <ChannelAvatar channel={channel} sizeClass="h-7 w-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium tracking-[-0.01em] text-text">
                        {channel.name}
                      </span>
                      {!channel.active ? (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-2">
                          Inativo
                        </span>
                      ) : null}
                    </span>
                    {current ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.5} />
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}

          <div className="border-t border-border-soft p-1.5">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] font-medium text-muted-2 transition-colors hover:bg-hover/60 hover:text-text"
              onClick={openManage}
            >
              <Plus className="h-3.5 w-3.5" />
              {musicChannels.length === 0 ? 'Criar canal' : 'Gerenciar canais'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
