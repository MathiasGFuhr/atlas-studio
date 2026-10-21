import type { BriefItem, WorkspaceBriefing } from '../../../shared/chat/atlasKnowledge'
import { formatWorkspaceBriefing } from '../../../shared/chat/atlasKnowledge'
import { formatWorldClockTime } from '../../../shared/worldClocks'
import { channelRepository } from '../../repositories/channelRepository'
import { lipSyncRefRepository } from '../../repositories/lipSyncRefRepository'
import { musicRepository } from '../../repositories/musicRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import { shortsRepository } from '../../repositories/shortsRepository'
import { taskRepository } from '../../repositories/taskRepository'

const LIMIT = 20

function take<T>(items: T[]): { shown: T[]; omitted: number } {
  return { shown: items.slice(0, LIMIT), omitted: Math.max(0, items.length - LIMIT) }
}

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

function day(value: string | null | undefined): string {
  if (!value) return ''
  const [year, month, date] = value.split('-')
  if (year && month && date && year.length === 4) return `${date}/${month}`
  return value
}

function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function collectWorkspaceBriefing(now = new Date()): WorkspaceBriefing {
  const settings = safe(() => settingsRepository.get(), null)
  const projects = safe(() => projectRepository.list(), [])
  const projectName = new Map(projects.map((item) => [item.id, item.name]))
  const channels = safe(() => channelRepository.list(), [])
  const tasks = safe(() => taskRepository.list().filter((item) => item.status === 'pending'), [])
  const tracks = safe(() => musicRepository.list(), [])
  const shorts = safe(() => shortsRepository.list(), [])
  const videos = safe(() => channelRepository.listVideos({ excludeStatus: 'publicado', limit: 40 }), [])
  const lipsync = safe(() => lipSyncRefRepository.list({ status: 'active' }), [])
  const clocks = settings?.worldClocks ?? []

  const projectSlice = take(projects)
  const channelSlice = take(channels)
  const taskSlice = take(tasks)
  const trackSlice = take(tracks)
  const shortSlice = take(shorts)
  const videoSlice = take(videos)
  const lipsyncSlice = take(lipsync)

  const asItems = (
    rows: Array<{ id: string; label: string; detail?: string }>,
  ): BriefItem[] => rows

  return {
    accountName: settings?.accountName?.trim() || '',
    projects: asItems(projectSlice.shown.map((item) => ({ id: item.id, label: item.name }))),
    channels: asItems(channelSlice.shown.map((item) => ({ id: item.id, label: item.name }))),
    tasks: asItems(
      taskSlice.shown.map((item) => ({
        id: item.id,
        label: item.title,
        detail: day(item.dueDate) || undefined,
      })),
    ),
    tracks: asItems(
      trackSlice.shown.map((item) => ({
        id: item.id,
        label: item.name,
        detail: [duration(item.duration), item.projectId ? projectName.get(item.projectId) : '']
          .filter(Boolean)
          .join(' · '),
      })),
    ),
    shorts: asItems(
      shortSlice.shown.map((item) => ({
        id: item.id,
        label: item.name,
        detail: `${item.status} · ${item.clips.length} cortes`,
      })),
    ),
    videos: asItems(
      videoSlice.shown.map((item) => ({
        id: item.id,
        label: item.title,
        detail: [item.channelName, day(item.scheduledDate), item.status].filter(Boolean).join(' · '),
      })),
    ),
    lipsync: asItems(
      lipsyncSlice.shown.map((item) => ({
        id: item.id,
        label: item.label || 'Sem nome',
        detail: item.projectName || undefined,
      })),
    ),
    clocks: clocks.map((clock) => ({
      id: clock.id,
      label: clock.label,
      detail: formatWorldClockTime(now, clock.timeZone),
    })),
    omitted: {
      projects: projectSlice.omitted,
      channels: channelSlice.omitted,
      tasks: taskSlice.omitted,
      tracks: trackSlice.omitted,
      shorts: shortSlice.omitted,
      videos: videoSlice.omitted,
      lipsync: lipsyncSlice.omitted,
    },
  }
}

export function workspaceBriefingText(now = new Date()): string {
  try {
    return formatWorkspaceBriefing(collectWorkspaceBriefing(now))
  } catch {
    return 'Panorama indisponível neste momento.'
  }
}
