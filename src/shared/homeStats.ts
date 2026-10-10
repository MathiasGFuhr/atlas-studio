import type { MusicTrack } from './musicAnalysis'
import type { Project } from './types'

export interface HomeModuleStats {
  musicCount: number
  trackCount: number
  tracks: MusicTrack[]
}

/**
 * Métricas do card de Música. Só entram faixas ainda vinculadas a um projeto existente.
 */
export function buildHomeModuleStats(input: {
  projects: Project[]
  tracks: MusicTrack[]
}): HomeModuleStats {
  const musicIds = new Set(input.projects.map((project) => project.id))
  const tracks = input.tracks.filter((track) => {
    const projectId = track.projectId
    return projectId ? musicIds.has(projectId) : false
  })

  return {
    musicCount: musicIds.size,
    trackCount: tracks.length,
    tracks,
  }
}
