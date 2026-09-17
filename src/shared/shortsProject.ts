import { PROJECT_TYPE_LABEL } from './types'
import type { ShortsClip, ShortsJob, ShortsProfile } from './shorts'

/** Alias conceitual: o job persistido em `shorts_jobs` é o projeto do Shorts Studio. */
export type ShortsProject = ShortsJob

export type ShortsProjectSort = 'updated_desc' | 'updated_asc' | 'name'

export interface ShortsProjectListFilters {
  projectId?: string | null
  query?: string
  sort?: ShortsProjectSort
}

/** Nome padrão do projeto: arquivo sem extensão. */
export function shortsProjectNameFromFileName(fileName: string): string {
  const trimmed = String(fileName ?? '').trim()
  if (!trimmed) return 'Novo Shorts'
  const base = trimmed.replace(/^.*[/\\]/, '').replace(/\.[^./\\]+$/, '').trim()
  return base || trimmed
}

export function shortsProfileLabel(profile: ShortsProfile): string {
  return PROJECT_TYPE_LABEL[profile] ?? profile
}

export function exportedShortsCount(clips: ShortsClip[]): number {
  return clips.filter((clip) => Boolean(clip.exportedPath) || clip.accepted).length
}

export function matchesShortsProjectSearch(
  project: Pick<ShortsJob, 'name' | 'sourceName' | 'profile'>,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const profileLabel = shortsProfileLabel(project.profile).toLowerCase()
  return (
    project.name.toLowerCase().includes(needle) ||
    project.sourceName.toLowerCase().includes(needle) ||
    project.profile.toLowerCase().includes(needle) ||
    profileLabel.includes(needle)
  )
}

export function sortShortsProjects(projects: ShortsJob[], sort: ShortsProjectSort = 'updated_desc'): ShortsJob[] {
  const copy = [...projects]
  if (sort === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
    return copy
  }
  copy.sort((a, b) => {
    const delta = a.updatedAt.localeCompare(b.updatedAt)
    return sort === 'updated_asc' ? delta : -delta
  })
  return copy
}

export function shortsProjectStatus(project: Pick<ShortsJob, 'status' | 'clips'>): 'pending' | 'error' | 'ready' | 'clips' {
  if (project.status === 'error') return 'error'
  if (project.status === 'analyzing') return 'pending'
  if (!project.clips.length || project.status === 'draft') return 'pending'
  const exported = exportedShortsCount(project.clips)
  if (exported > 0 && exported >= project.clips.length) return 'ready'
  return 'clips'
}

export function shortsProjectStatusLabel(project: Pick<ShortsJob, 'status' | 'clips'>): string {
  const status = shortsProjectStatus(project)
  if (status === 'error') return 'Erro'
  if (status === 'pending') return 'Análise pendente'
  if (status === 'ready') return 'Pronto'
  const cuts = project.clips.length
  const exported = exportedShortsCount(project.clips)
  const cutsLabel = cuts === 1 ? '1 corte' : `${cuts} cortes`
  if (!exported) return cutsLabel
  const exportedLabel = exported === 1 ? '1 exportado' : `${exported} exportados`
  return `${cutsLabel} · ${exportedLabel}`
}
