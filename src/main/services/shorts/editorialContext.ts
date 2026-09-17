import type { ShortsEditorialContext, ShortsJob } from '../../../shared/shorts'
import {
  languageFieldsFromResolution,
  resolveContentLanguage,
  type ContentLanguageSignals,
  type ShortsLanguageFields,
} from '../../../shared/shortsLanguage'
import { channelRepository } from '../../repositories/channelRepository'
import { musicRepository } from '../../repositories/musicRepository'
import { nicheRepository } from '../../repositories/nicheRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { scriptRepository } from '../../repositories/scriptRepository'

export function collectShortsLanguageSignals(job: ShortsJob): ContentLanguageSignals {
  const project = job.projectId ? projectRepository.get(job.projectId) : null
  const channel = project?.channelId ? channelRepository.get(project.channelId) : null
  const niche = channel?.nicheId ? nicheRepository.get(channel.nicheId) : null
  const scripts = project ? scriptRepository.list({ projectId: project.id }) : []
  const transcriptText = job.transcript.map((cue) => cue.text.trim()).filter(Boolean).join(' ')
  const extraText = job.clips
    .map((clip) => [clip.title, clip.description, clip.hook].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')

  return {
    languageOverride: job.languageOverride,
    transcriptLanguage: job.transcriptLanguage,
    transcriptText,
    channelLanguage: channel?.description ?? null,
    projectLanguage: scripts.find((item) => item.language.trim())?.language ?? null,
    nicheLanguage: niche?.defaultLanguage ?? null,
    extraText,
    filename: job.sourceName,
    title: job.name,
  }
}

export function resolveShortsLanguageFields(job: ShortsJob): ShortsLanguageFields {
  const resolved = resolveContentLanguage(collectShortsLanguageSignals(job))
  return languageFieldsFromResolution(resolved, {
    languageOverride: job.languageOverride,
    transcriptLanguage: job.transcriptLanguage,
  })
}

export function shortsLanguageAnalysisNote(job: ShortsJob): string | null {
  const resolved = resolveContentLanguage(collectShortsLanguageSignals(job))
  if (!resolved.discrepancy || resolved.languageSource !== 'transcript' || !resolved.contentLanguage) return null
  return `Idioma da transcrição (${resolved.contentLanguage}) difere do canal. Os metadados do YouTube seguirão o idioma real do conteúdo.`
}

export function resolveShortsEditorialContext(job: ShortsJob): ShortsEditorialContext {
  const project = job.projectId ? projectRepository.get(job.projectId) : null
  const channel = project?.channelId ? channelRepository.get(project.channelId) : null
  const tracks =
    project && (job.profile === 'music' || project.projectType === 'music')
      ? musicRepository.list({ projectId: project.id })
      : []
  const language = resolveContentLanguage(collectShortsLanguageSignals(job))
  const songTitle = tracks[0]?.name.trim() || undefined
  const channelName = channel?.name.trim() || undefined
  const artistName = job.profile === 'music' ? channelName : undefined

  return {
    language: language.contentLanguage || language.languageName,
    contentLanguage: language.contentLanguage,
    languageName: language.languageName,
    languageSource: language.languageSource,
    languageConfidence: language.languageConfidence,
    sourceName: job.sourceName,
    ...(channelName ? { channelName } : {}),
    ...(artistName ? { artistName } : {}),
    ...(songTitle ? { songTitle } : {}),
  }
}
