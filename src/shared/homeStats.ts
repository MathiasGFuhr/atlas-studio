import type { MusicTrack } from './musicAnalysis'
import type { Project, ScriptRecord } from './types'

export interface HomeModuleStats {
  historyCount: number
  musicCount: number
  draftCount: number
  reviewCount: number
  trackCount: number
  scripts: ScriptRecord[]
  tracks: MusicTrack[]
}

/**
 * Métricas dos cards História/Música. Só entram roteiros e faixas
 * ainda vinculados a um projeto existente — conteúdo órfão some da Home.
 */
export function buildHomeModuleStats(input: {
  projects: Project[]
  scripts: ScriptRecord[]
  tracks: MusicTrack[]
}): HomeModuleStats {
  const historyIds = new Set(
    input.projects.filter((project) => project.projectType === 'history').map((project) => project.id),
  )
  const musicIds = new Set(
    input.projects.filter((project) => project.projectType === 'music').map((project) => project.id),
  )
  const scripts = input.scripts.filter((script) => {
    const projectId = script.projectId
    return projectId ? historyIds.has(projectId) : false
  })
  const tracks = input.tracks.filter((track) => {
    const projectId = track.projectId
    return projectId ? musicIds.has(projectId) : false
  })

  return {
    historyCount: historyIds.size,
    musicCount: musicIds.size,
    draftCount: scripts.filter((script) => script.status === 'rascunho').length,
    reviewCount: scripts.filter((script) => script.status === 'em_revisao').length,
    trackCount: tracks.length,
    scripts,
    tracks,
  }
}
