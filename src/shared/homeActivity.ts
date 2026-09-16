import type { MusicTrack } from './musicAnalysis'
import type { AtlasTask, Channel, Project, ProjectType, ScriptRecord } from './types'

function projectHref(type: ProjectType, id: string): string {
  return type === 'music' ? `/musica/projetos/${id}` : `/historia/projetos/${id}`
}

export type HomeActivityKind =
  | 'project-created'
  | 'project-updated'
  | 'script-updated'
  | 'task-completed'
  | 'channel-created'
  | 'music-updated'

export interface HomeActivityItem {
  id: string
  kind: HomeActivityKind
  title: string
  detail: string
  at: string
  href: string | null
}

function isCreateEvent(createdAt: string, updatedAt: string): boolean {
  return createdAt === updatedAt
}

function projectActivity(project: Project): HomeActivityItem {
  const created = isCreateEvent(project.createdAt, project.updatedAt)
  return {
    id: `project:${project.id}:${created ? 'created' : 'updated'}`,
    kind: created ? 'project-created' : 'project-updated',
    title: project.name,
    detail: created
      ? `Projeto de ${project.projectType === 'music' ? 'Música' : 'História'} criado`
      : `Projeto de ${project.projectType === 'music' ? 'Música' : 'História'} atualizado`,
    at: created ? project.createdAt : project.updatedAt,
    href: projectHref(project.projectType, project.id),
  }
}

function scriptActivity(script: ScriptRecord): HomeActivityItem {
  const created = isCreateEvent(script.createdAt, script.updatedAt)
  return {
    id: `script:${script.id}:${created ? 'created' : 'updated'}`,
    kind: 'script-updated',
    title: script.title,
    detail: created ? 'Roteiro criado' : 'Roteiro atualizado',
    at: created ? script.createdAt : script.updatedAt,
    href: `/historia/roteiros/${script.id}`,
  }
}

function taskActivity(task: AtlasTask): HomeActivityItem | null {
  if (task.status !== 'completed' || !task.completedAt) return null
  return {
    id: `task:${task.id}:completed`,
    kind: 'task-completed',
    title: task.title,
    detail: 'Tarefa concluída',
    at: task.completedAt,
    href: '/tarefas',
  }
}

function channelActivity(channel: Channel): HomeActivityItem {
  const created = isCreateEvent(channel.createdAt, channel.updatedAt)
  return {
    id: `channel:${channel.id}:${created ? 'created' : 'updated'}`,
    kind: 'channel-created',
    title: channel.name,
    detail: created ? 'Canal criado' : 'Canal atualizado',
    at: created ? channel.createdAt : channel.updatedAt,
    href: `/canais/${channel.id}`,
  }
}

function musicActivity(track: MusicTrack): HomeActivityItem {
  const created = isCreateEvent(track.createdAt, track.updatedAt)
  return {
    id: `music:${track.id}:${created ? 'created' : 'updated'}`,
    kind: 'music-updated',
    title: track.name,
    detail: created ? 'Faixa importada' : 'Projeto musical atualizado',
    at: created ? track.createdAt : track.updatedAt,
    href: `/musica/faixas/${track.id}`,
  }
}

export function buildHomeActivity(
  input: {
    projects: Project[]
    scripts: ScriptRecord[]
    tasks: AtlasTask[]
    channels: Channel[]
    tracks: MusicTrack[]
  },
  limit = 6,
): HomeActivityItem[] {
  const items: HomeActivityItem[] = [
    ...input.projects.map(projectActivity),
    ...input.scripts.map(scriptActivity),
    ...input.tasks.map(taskActivity).filter((item): item is HomeActivityItem => Boolean(item)),
    ...input.channels.map(channelActivity),
    ...input.tracks.map(musicActivity),
  ]

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
