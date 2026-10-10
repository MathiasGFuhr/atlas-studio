import type { MusicTrack } from './musicAnalysis'
import type { ChannelVideo, Project } from './types'

export interface HomeModuleStats {
  /** Publicações futuras de Música ainda na agenda (não publicadas). */
  scheduledCount: number
  trackCount: number
  tracks: MusicTrack[]
}

/**
 * Métricas do card de Música.
 * - Agendados: vídeos futuros de canais de Música (ou vinculados a um projeto musical).
 * - Faixas: só entram faixas ainda vinculadas a um projeto existente.
 */
export function buildHomeModuleStats(input: {
  projects: Project[]
  tracks: MusicTrack[]
  upcomingVideos: ChannelVideo[]
}): HomeModuleStats {
  const musicIds = new Set(input.projects.map((project) => project.id))
  const tracks = input.tracks.filter((track) => {
    const projectId = track.projectId
    return projectId ? musicIds.has(projectId) : false
  })
  const scheduledCount = input.upcomingVideos.filter((video) => {
    if (video.channelType === 'music') return true
    return Boolean(video.projectId && musicIds.has(video.projectId))
  }).length

  return {
    scheduledCount,
    trackCount: tracks.length,
    tracks,
  }
}
