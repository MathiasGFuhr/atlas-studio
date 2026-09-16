import { BookOpen, Music2 } from 'lucide-react'
import type { ProjectType } from '@shared/types'

export interface EnvironmentMeta {
  type: ProjectType
  label: string
  tagline: string
  description: string
  icon: typeof BookOpen
  /** Cor de destaque do ambiente — única diferença visual entre História e Música. */
  color: string
  basePath: string
  projectsPath: string
}

export const ENVIRONMENTS: Record<ProjectType, EnvironmentMeta> = {
  history: {
    type: 'history',
    label: 'História',
    tagline: 'Roteiros, pesquisas e projetos históricos',
    description: 'Crie e revise roteiros usando as Skills e os Nichos da sua biblioteca.',
    icon: BookOpen,
    color: '#35e58b',
    basePath: '/historia',
    projectsPath: '/historia/projetos',
  },
  music: {
    type: 'music',
    label: 'Música',
    tagline: 'Projetos musicais e produção de áudio',
    description: 'Organize suas faixas e os cortes de cada projeto musical.',
    icon: Music2,
    color: '#a78bfa',
    basePath: '/musica',
    projectsPath: '/musica/projetos',
  },
}

export function projectPath(type: ProjectType, projectId: string): string {
  return `${ENVIRONMENTS[type].projectsPath}/${projectId}`
}

/** Breadcrumb padrão das páginas internas: "Atlas / História". */
export function environmentBreadcrumb(type: ProjectType, ...rest: string[]): string {
  return ['Atlas', ENVIRONMENTS[type].label, ...rest].join(' / ')
}
