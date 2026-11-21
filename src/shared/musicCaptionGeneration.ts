import type { MusicCaptionLanguage, MusicCaptionModel, MusicTrack } from './musicAnalysis'

export interface MusicCaptionJob {
  trackId: string
  trackName: string
  language: MusicCaptionLanguage
  model: MusicCaptionModel
  startedAt: string
}

export interface MusicCaptionFinishedEvent {
  trackId: string
  trackName: string
  track: MusicTrack | null
  error?: string | null
  finishedAt: string
}

export interface MusicCaptionStateEvent {
  active: MusicCaptionJob[]
  finished?: MusicCaptionFinishedEvent
}

export function upsertMusicCaptionJob(list: MusicCaptionJob[], job: MusicCaptionJob): MusicCaptionJob[] {
  const index = list.findIndex((item) => item.trackId === job.trackId)
  if (index === -1) return [...list, job]
  const next = [...list]
  next[index] = job
  return next
}

export function removeMusicCaptionJob(list: MusicCaptionJob[], trackId: string): MusicCaptionJob[] {
  return list.filter((item) => item.trackId !== trackId)
}

/**
 * Mescla apenas a legenda gerada sobre o estado atual da faixa,
 * preservando cortes ou seleções que o usuário possa ter editado enquanto aguardava.
 */
export function mergeTrackCaptions(
  current: MusicTrack,
  incoming: MusicTrack | null | undefined,
): MusicTrack {
  if (!incoming || incoming.id !== current.id) return current
  return {
    ...current,
    captions: incoming.captions ?? [],
    captionsLanguage: incoming.captionsLanguage ?? current.captionsLanguage ?? null,
    updatedAt: incoming.updatedAt >= current.updatedAt ? incoming.updatedAt : current.updatedAt,
  }
}

export function musicCaptionResultToast(
  track: MusicTrack | null,
  trackName?: string | null,
  isViewingTrack = false,
): { message: string; type: 'success' | 'error' } {
  const label = track?.name?.trim() || trackName?.trim() || ''
  if (track?.captions.length) {
    return {
      message: isViewingTrack || !label ? 'Legenda gerada.' : `Legenda gerada para “${label}”.`,
      type: 'success',
    }
  }
  return {
    message:
      isViewingTrack || !label ? 'Nenhuma fala encontrada.' : `Nenhuma fala encontrada em “${label}”.`,
    type: 'success',
  }
}
