import type { ChannelVideo } from './types'

export const CHANNEL_VIDEOS_CHANGED_EVENT = 'atlas-channel-videos-changed'

export const HOME_UPCOMING_VIDEO_LIMIT = 5
export const AGENDA_UPCOMING_VIDEO_LIMIT = 40

export function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function todayDateKey(now = new Date()): string {
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
}

export function parseDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

const MONTHS_SHORT_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Rótulo amigável da data agendada. Sem horário: o cadastro só persiste YYYY-MM-DD. */
export function formatScheduledDateLabel(dateKey: string, now = new Date()): string {
  const today = todayDateKey(now)
  const tomorrow = todayDateKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  )
  if (dateKey === today) return 'Hoje'
  if (dateKey === tomorrow) return 'Amanhã'
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  return `${date.getDate()} ${MONTHS_SHORT_PT[date.getMonth()]}`
}

export function pickUpcomingChannelVideos(
  videos: ChannelVideo[],
  today = todayDateKey(),
  limit = HOME_UPCOMING_VIDEO_LIMIT,
): ChannelVideo[] {
  return videos
    .filter((video) => video.scheduledDate >= today)
    .sort((a, b) => {
      const byDate = a.scheduledDate.localeCompare(b.scheduledDate)
      if (byDate !== 0) return byDate
      return a.createdAt.localeCompare(b.createdAt)
    })
    .slice(0, limit)
}

export function channelVideoPath(channelId: string, videoId: string): string {
  return `/canais/${channelId}/videos/${videoId}`
}

/** Linha discreta na lista de Música quando o projeto já tem publicação. */
export function formatMusicProjectPublicationLine(input: {
  channelName?: string | null
  scheduledDate?: string | null
  now?: Date
}): string | null {
  if (!input.scheduledDate) return null
  const date = formatScheduledDateLabel(input.scheduledDate, input.now)
  const channel = input.channelName?.trim()
  return channel ? `${channel} · ${date}` : date
}

export function channelAgendaPath(): string {
  return '/canais/agenda'
}
