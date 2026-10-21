import { Music2 } from 'lucide-react'
import type { ProjectType } from '@shared/types'

export interface EnvironmentMeta {
  type: ProjectType
  label: string
  tagline: string
  description: string
  icon: typeof Music2
  color: string
  basePath: string
  projectsPath: string
}

export const ENVIRONMENTS: Record<ProjectType, EnvironmentMeta> = {
  music: {
    type: 'music',
    label: 'Música',
    tagline: 'Projetos musicais e produção de áudio',
    description: 'Organize suas faixas e os cortes de cada projeto musical.',
    icon: Music2,
    color: '#35bf9b',
    basePath: '/musica',
    projectsPath: '/musica/projetos',
  },
}

export function projectPath(_type: ProjectType, projectId: string): string {
  return `${ENVIRONMENTS.music.projectsPath}/${projectId}`
}

/** Breadcrumb padrão das páginas internas: "Atlas / Música". */
export function environmentBreadcrumb(_type: ProjectType, ...rest: string[]): string {
  return ['Atlas', ENVIRONMENTS.music.label, ...rest].join(' / ')
}
