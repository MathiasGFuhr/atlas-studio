import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Plus, Settings2, Tv } from 'lucide-react'
import type { Channel } from '@shared/types'
import { channelCalendarPath } from '@shared/channelVideos'
import { usePrimaryChannel } from '../hooks/usePrimaryChannel'
import { cn } from '../lib/utils'

function ChannelAvatar({
  channel,
  sizeClass,
  ring,
}: {
  channel: Channel | null
  sizeClass: string
  ring?: boolean
}) {
  const color = channel?.color || '#35bf9b'
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-full transition-[box-shadow,transform]',
        sizeClass,
        ring && 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--color-topbar,#0d1414)]',
      )}
      style={{ background: `linear-gradient(145deg, ${color}45, var(--color-elevated))` }}
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

export function HeaderChannelSwitcher() {
  const navigate = useNavigate()
  const { pathname, channels, selected, setPrimaryChannel } = usePrimaryChannel()
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [menuOpen])

  function selectChannel(channel: Channel) {
    setPrimaryChannel(channel)
    setMenuOpen(false)
    if (pathname !== '/') navigate(channelCalendarPath(channel.id))
  }

  function openManage() {
    setMenuOpen(false)
    navigate('/canais')
  }

  if (channels.length === 0) {
    return (
      <button
        type="button"
        onClick={openManage}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-border-soft bg-elevated/40 px-3.5 text-[12px] font-medium text-muted transition-colors hover:border-accent/35 hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        Criar canal
      </button>
    )
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      {/* Mobile: pill do canal atual */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
        className="flex h-10 max-w-[11rem] items-center gap-2 rounded-full border border-border-soft/80 bg-elevated/55 px-1.5 pr-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-colors hover:border-accent/25 md:hidden"
      >
        <ChannelAvatar channel={selected} sizeClass="h-7 w-7" ring />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[12px] font-semibold text-text">
            {selected?.name ?? 'Canais'}
          </span>
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform', menuOpen && 'rotate-180')}
        />
      </button>

      {/* Desktop: faixa ordenada */}
      <div className="hidden max-w-[min(46vw,36rem)] items-center gap-1 rounded-full border border-border-soft/80 bg-elevated/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md md:flex">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {channels.map((channel) => {
            const current = selected?.id === channel.id
            return (
              <button
                key={channel.id}
                type="button"
                title={channel.name}
                aria-label={
                  current
                    ? `${channel.name}, canal principal`
                    : `Definir ${channel.name} como canal principal`
                }
                aria-pressed={current}
                onClick={() => selectChannel(channel)}
                className={cn(
                  'group flex shrink-0 items-center gap-2 rounded-full transition-all duration-200',
                  current ? 'bg-accent/14 py-1 pl-1 pr-3.5' : 'p-1 hover:bg-hover/70',
                )}
              >
                <ChannelAvatar
                  channel={channel}
                  sizeClass={cn(
                    'h-8 w-8',
                    !current && 'opacity-80 group-hover:opacity-100',
                  )}
                  ring={current}
                />
                {current ? (
                  <span className="min-w-0">
                    <span className="block max-w-[9.5rem] truncate text-[12.5px] font-semibold tracking-[-0.01em] text-text">
                      {channel.name}
                    </span>
                    <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-accent">
                      Principal
                    </span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          title="Gerenciar canais"
          aria-label="Gerenciar canais"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-hover hover:text-text"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="Canais"
          className="absolute left-1/2 top-[calc(100%+10px)] z-50 w-[260px] -translate-x-1/2 overflow-hidden rounded-2xl border border-border/80 bg-elevated shadow-popover md:left-auto md:right-0 md:translate-x-0"
        >
          <div className="border-b border-border-soft px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">
              Canal principal
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Define qual agenda aparece no Início.
            </p>
          </div>

          <div className="max-h-[min(16rem,46vh)] overflow-y-auto px-1.5 py-1.5">
            {channels.map((channel) => {
              const current = selected?.id === channel.id
              return (
                <button
                  key={channel.id}
                  type="button"
                  role="menuitem"
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
                    current ? 'bg-hover' : 'hover:bg-hover/60',
                  )}
                  onClick={() => selectChannel(channel)}
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

          <div className="border-t border-border-soft p-1.5">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[12px] font-medium text-muted-2 transition-colors hover:bg-hover/60 hover:text-text"
              onClick={openManage}
            >
              <Plus className="h-3.5 w-3.5" />
              Gerenciar canais
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
