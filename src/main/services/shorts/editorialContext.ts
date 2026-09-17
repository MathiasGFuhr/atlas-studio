import type { ShortsEditorialContext, ShortsJob } from '../../../shared/shorts'
import { channelRepository } from '../../repositories/channelRepository'
import { musicRepository } from '../../repositories/musicRepository'
import { nicheRepository } from '../../repositories/nicheRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { scriptRepository } from '../../repositories/scriptRepository'
import { settingsRepository } from '../../repositories/settingsRepository'

export function resolveShortsEditorialContext(job: ShortsJob): ShortsEditorialContext {
  const settings = settingsRepository.get()
  const project = job.projectId ? projectRepository.get(job.projectId) : null
  const channel = project?.channelId ? channelRepository.get(project.channelId) : null
  const niche = channel?.nicheId ? nicheRepository.get(channel.nicheId) : null
  const scripts = project ? scriptRepository.list({ projectId: project.id }) : []
  const tracks =
    project && (job.profile === 'music' || project.projectType === 'music')
      ? musicRepository.list({ projectId: project.id })
      : []

  const language =
    scripts.find((item) => item.language.trim())?.language.trim() ||
    niche?.defaultLanguage.trim() ||
    settings.defaultLanguage.trim() ||
    'pt-BR'

  const songTitle = tracks[0]?.name.trim() || undefined
  const channelName = channel?.name.trim() || undefined
  const artistName = job.profile === 'music' ? channelName : undefined

  return {
    language,
    sourceName: job.sourceName,
    ...(channelName ? { channelName } : {}),
    ...(artistName ? { artistName } : {}),
    ...(songTitle ? { songTitle } : {}),
  }
}
