import type { TitleAnalysisPayload, TitleAnalysisProfile, AnalyzeTitleRequest } from '../../../shared/types'
import { isTitleAnalysisProfile } from '../../../shared/antigravity/titleAnalysis'
import { channelRepository } from '../../repositories/channelRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { musicRepository } from '../../repositories/musicRepository'

function asProfile(value: unknown, fallback: TitleAnalysisProfile = 'general'): TitleAnalysisProfile {
  if (isTitleAnalysisProfile(value)) return value
  if (value === 'music') return 'music'
  return fallback
}

function clip(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max).trim()}…`
}

export function enrichTitleAnalysisPayload(request: AnalyzeTitleRequest): TitleAnalysisPayload {
  const title = request.title.trim()
  const video = request.videoId ? channelRepository.getVideo(request.videoId) : null
  const channelId = request.channelId || video?.channelId
  const channel = channelId ? channelRepository.get(channelId) : null
  const project = video?.projectId
    ? projectRepository.get(video.projectId)
    : video?.projectFolderPath
      ? projectRepository.getByFolderPath(video.projectFolderPath)
      : null
  const tracks = project ? musicRepository.list({ projectId: project.id }) : []

  const projectType = asProfile(
    request.projectType ?? channel?.channelType ?? project?.projectType ?? 'music',
    'music',
  )

  const language = request.language?.trim() || undefined

  const videoContext =
    request.videoContext?.trim() ||
    [request.description?.trim() || video?.description?.trim(), tracks[0] ? clip(tracks[0].name, 200) : '']
      .filter(Boolean)
      .join('\n')
      .trim() ||
    undefined

  const recentFromRequest = (request.recentChannelTitles ?? []).map((item) => item.trim()).filter(Boolean)
  const recentFromChannel = channel
    ? channelRepository.listRecentTitles(channel.id, { excludeVideoId: video?.id, limit: 20 })
    : []
  const recentChannelTitles = [...new Set([...recentFromRequest, ...recentFromChannel])].slice(0, 20)

  const songTitle = request.songTitle?.trim() || (tracks[0]?.name ? tracks[0].name : undefined)
  const artistName = request.artistName?.trim() || undefined
  const eventName = request.eventName?.trim() || undefined
  const thumbnailText = request.thumbnailText?.trim() || undefined
  const videoFormat = request.videoFormat?.trim() || undefined
  const country = request.country?.trim() || undefined
  const performanceDataIfAvailable = request.performanceDataIfAvailable?.filter((item) => item.title.trim())

  return {
    projectType,
    currentTitle: title,
    ...(language ? { language } : {}),
    ...(country ? { country } : {}),
    ...(channel
      ? {
          channel: {
            name: channel.name,
            type: asProfile(channel.channelType, projectType),
            ...(language ? { language } : {}),
          },
        }
      : request.channelName?.trim()
        ? { channel: { name: request.channelName.trim(), type: projectType, ...(language ? { language } : {}) } }
        : {}),
    ...(songTitle ? { songTitle } : {}),
    ...(artistName ? { artistName } : {}),
    ...(eventName ? { eventName } : {}),
    ...(videoFormat ? { videoFormat } : {}),
    ...(videoContext ? { videoContext } : {}),
    ...(thumbnailText ? { thumbnailText } : {}),
    ...(recentChannelTitles.length > 0 ? { recentChannelTitles } : {}),
    ...(performanceDataIfAvailable && performanceDataIfAvailable.length > 0
      ? { performanceDataIfAvailable }
      : {}),
  }
}
