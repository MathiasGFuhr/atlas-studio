import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Channel, ChannelVideo } from '@shared/types'
import { toDateKey, todayDateKey } from '@shared/channelVideos'
import {
  pickSidebarChannel,
  readLastSidebarChannelId,
} from '@shared/sidebarChannel'
import { Card } from '../Card'
import { getAtlasApi } from '../../lib/api'
import { onSidebarChannelChanged } from '../../lib/sidebarChannelEvents'
import { cn } from '../../lib/utils'
import calendarBg from '../../assets/calendar-bg.jpg'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function monthLabel(year: number, month: number): string {
  const label = new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function HomeCalendarCard({
  channels,
  onOpenDay,
  onOpenVideo,
  onOpenChannel,
}: {
  channels: Channel[]
  onOpenDay: (channelId: string, dateKey: string) => void
  onOpenVideo: (video: ChannelVideo) => void
  onOpenChannel: (channelId: string) => void
}) {
  const api = getAtlasApi()
  const now = useMemo(() => new Date(), [])
  const [lastChannelId, setLastChannelId] = useState<string | null>(() =>
    readLastSidebarChannelId(typeof localStorage === 'undefined' ? null : localStorage),
  )
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [videos, setVideos] = useState<ChannelVideo[]>([])
  const [loading, setLoading] = useState(false)

  const musicChannels = useMemo(
    () => channels.filter((channel) => channel.channelType === 'music'),
    [channels],
  )
  const selectedChannel = useMemo(
    () => pickSidebarChannel(musicChannels, { lastChannelId }),
    [musicChannels, lastChannelId],
  )
  const channelId = selectedChannel?.id ?? ''

  useEffect(() => {
    return onSidebarChannelChanged((id) => setLastChannelId(id))
  }, [])

  useEffect(() => {
    if (!channelId) {
      setVideos([])
      return
    }
    let cancelled = false
    const from = toDateKey(year, month, 1)
    const to = toDateKey(year, month, new Date(year, month + 1, 0).getDate())
    setLoading(true)
    void api.videos
      .list({ channelId, from, to, excludeStatus: 'publicado' })
      .then((list) => {
        if (!cancelled) setVideos(list)
      })
      .catch(() => {
        if (!cancelled) setVideos([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, channelId, month, year])

  const videosByDate = useMemo(() => {
    const map = new Map<string, ChannelVideo[]>()
    for (const video of videos) {
      const list = map.get(video.scheduledDate) ?? []
      list.push(video)
      map.set(video.scheduledDate, list)
    }
    return map
  }, [videos])

  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const startWeekday = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDays = new Date(year, month, 0).getDate()
    const items: Array<{ key: string; day: number; inMonth: boolean }> = []

    for (let i = startWeekday - 1; i >= 0; i -= 1) {
      const day = prevDays - i
      items.push({ key: toDateKey(year, month - 1, day), day, inMonth: false })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      items.push({ key: toDateKey(year, month, day), day, inMonth: true })
    }
    while (items.length % 7 !== 0) {
      const extra = items.length - (startWeekday + daysInMonth) + 1
      items.push({ key: toDateKey(year, month + 1, extra), day: extra, inMonth: false })
    }
    return items
  }, [month, year])

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  const today = todayDateKey()
  const monthCount = videos.length

  return (
    <Card padding="lg" className="relative flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
        <img
          src={calendarBg}
          alt=""
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-bg/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/45 via-bg/60 to-bg/88" />
      </div>

      <div className="relative mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Calendário
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Agenda do canal</h2>
        </div>
        {selectedChannel ? (
          <button
            type="button"
            onClick={() => onOpenChannel(selectedChannel.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Abrir
          </button>
        ) : null}
      </div>

      {musicChannels.length === 0 ? (
        <div className="relative flex flex-1 flex-col items-center justify-center text-center">
          <CalendarDays className="mb-2 h-5 w-5 text-muted-2" />
          <p className="text-sm font-medium text-text">Nenhum canal cadastrado</p>
          <p className="mt-1 text-xs text-muted-2">Crie um canal para planejar a agenda.</p>
        </div>
      ) : (
        <>
          <div className="relative mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-text">
                {selectedChannel?.name ?? 'Canal principal'}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-2">
                Canal principal · troque na barra lateral
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-soft bg-bg/30 text-muted backdrop-blur-sm transition-colors hover:text-text"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-[7.5rem] text-center text-xs font-semibold text-text">
                {monthLabel(year, month)}
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-soft bg-bg/30 text-muted backdrop-blur-sm transition-colors hover:text-text"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative mb-2 flex items-center justify-end text-[11px] text-muted-2">
            <span className="tabular-nums">
              {loading ? '…' : `${monthCount} vídeo${monthCount === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="relative grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day, index) => (
              <div
                key={`${day}-${index}`}
                className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-2"
              >
                {day}
              </div>
            ))}
            {cells.map((cell) => {
              const dayVideos = videosByDate.get(cell.key) ?? []
              const hasVideos = dayVideos.length > 0
              const isToday = cell.key === today
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={!cell.inMonth || !channelId}
                  onClick={() => {
                    if (!channelId || !cell.inMonth) return
                    if (dayVideos[0]) onOpenVideo(dayVideos[0])
                    else onOpenDay(channelId, cell.key)
                  }}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] tabular-nums transition-colors',
                    !cell.inMonth && 'text-muted-2/35',
                    cell.inMonth && !hasVideos && 'text-muted hover:bg-hover hover:text-text',
                    cell.inMonth &&
                      hasVideos &&
                      'bg-accent/12 font-semibold text-accent hover:bg-accent/18',
                    isToday && cell.inMonth && 'ring-1 ring-accent/50',
                  )}
                  title={
                    hasVideos
                      ? dayVideos.map((video) => video.title || 'Sem título').join(' · ')
                      : cell.inMonth
                        ? 'Abrir dia no calendário'
                        : undefined
                  }
                >
                  {cell.day}
                  {hasVideos ? (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
