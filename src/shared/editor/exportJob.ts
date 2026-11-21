import type { EditorExportProgress } from './types'

export type EditorExportMode = 'single' | 'clips'

export type EditorExportJobStatus = 'picking' | 'rendering' | 'done' | 'failed'

export interface EditorExportJob {
  projectId: string
  projectName: string
  mode: EditorExportMode
  status: EditorExportJobStatus
  percent: number | null
  message: string
  outputPath: string | null
  error: string | null
  updatedAt: number
}

export function clampExportPercent(percent: number | null | undefined): number {
  if (percent == null || !Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(100, Math.round(percent)))
}

export function applyEditorExportProgress(
  jobs: Record<string, EditorExportJob>,
  event: EditorExportProgress,
  now = Date.now(),
): Record<string, EditorExportJob> {
  if (event.kind === 'short') return jobs

  const existing = jobs[event.projectId]
  const mode: EditorExportMode =
    existing?.mode ?? (event.kind === 'clips' ? 'clips' : 'single')
  const projectName = existing?.projectName ?? ''

  if (event.stage === 'rendering') {
    // Não regride se a promise IPC já encerrou o job antes de um último tick em trânsito.
    if (existing && (existing.status === 'done' || existing.status === 'failed')) {
      return jobs
    }
    return {
      ...jobs,
      [event.projectId]: {
        projectId: event.projectId,
        projectName,
        mode,
        status: 'rendering',
        percent: clampExportPercent(event.percent),
        message: event.message,
        outputPath: existing?.outputPath ?? null,
        error: null,
        updatedAt: now,
      },
    }
  }

  if (event.stage === 'done') {
    return {
      ...jobs,
      [event.projectId]: {
        projectId: event.projectId,
        projectName,
        mode,
        status: 'done',
        percent: 100,
        message: event.message,
        outputPath: event.outputPath ?? existing?.outputPath ?? null,
        error: null,
        updatedAt: now,
      },
    }
  }

  return {
    ...jobs,
    [event.projectId]: {
      projectId: event.projectId,
      projectName,
      mode,
      status: 'failed',
      percent: existing?.percent ?? null,
      message: event.message,
      outputPath: existing?.outputPath ?? null,
      error: event.message,
      updatedAt: now,
    },
  }
}

export function isExportJobInFlight(job: EditorExportJob | null | undefined): boolean {
  return job?.status === 'picking' || job?.status === 'rendering'
}

export function pickPrimaryExportBarJob(jobs: Record<string, EditorExportJob>): {
  primary: EditorExportJob | null
  activeCount: number
} {
  const visible = Object.values(jobs).filter((job) => job.status !== 'picking')
  if (visible.length === 0) return { primary: null, activeCount: 0 }

  const rendering = visible
    .filter((job) => job.status === 'rendering')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (rendering.length > 0) {
    return { primary: rendering[0]!, activeCount: rendering.length }
  }

  const failed = visible
    .filter((job) => job.status === 'failed')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (failed.length > 0) {
    return { primary: failed[0]!, activeCount: 0 }
  }

  const done = visible
    .filter((job) => job.status === 'done')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return { primary: done[0] ?? null, activeCount: 0 }
}

export function formatExportBarLabel(job: EditorExportJob): string {
  if (job.status === 'rendering') {
    return job.mode === 'clips' ? 'Exportando cenas' : 'Exportando vídeo'
  }
  if (job.status === 'done') {
    return job.mode === 'clips' ? 'Cenas exportadas' : 'Vídeo exportado'
  }
  if (job.status === 'failed') {
    return job.mode === 'clips' ? 'Falha ao exportar cenas' : 'Falha ao exportar vídeo'
  }
  return 'Preparando exportação'
}

