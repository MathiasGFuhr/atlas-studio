import type { ShortsJob, ShortsProgressEvent } from './shorts'
import { SHORTS_PROGRESS_LABEL } from './shorts'

export function isShortsAnalyzeStage(stage: ShortsProgressEvent['stage']): boolean {
  return stage !== 'exporting'
}

export function shortsAnalyzeProgressLabel(event: ShortsProgressEvent | null | undefined): string {
  if (!event) return SHORTS_PROGRESS_LABEL.preparing_video
  return event.message || SHORTS_PROGRESS_LABEL[event.stage]
}

export function shortsExportProgressLabel(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return 'Gerando Short...'
  const rounded = Math.max(0, Math.min(100, Math.round(percent)))
  return `Gerando Short... ${rounded}%`
}

export function shortsAnalyzeResultToast(
  job: ShortsJob,
  preservedCount = 0,
): { message: string; type: 'success' | 'error' } {
  if (job.status === 'error') {
    return {
      message: job.errorMessage || 'A análise falhou. O vídeo original foi preservado.',
      type: 'error',
    }
  }
  return {
    message: preservedCount
      ? `${job.clips.length} Shorts no projeto. Shorts exportados foram preservados.`
      : `${job.clips.length} Shorts sugeridos.`,
    type: 'success',
  }
}

export function mergeShortsJobSnapshot(current: ShortsJob | null, incoming: ShortsJob | null): ShortsJob | null {
  if (!incoming) return current
  if (!current || current.id !== incoming.id) return incoming
  return incoming.updatedAt >= current.updatedAt ? incoming : current
}
