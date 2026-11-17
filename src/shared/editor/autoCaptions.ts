import type { EditorTimeline } from './types'
import { findTrack, insertTextClip, isTextClip } from './timelineOps'

/** Modelo usado só pelas legendas geradas. Some da biblioteca de texto. */
export const AUTO_CAPTION_TEMPLATE_ID = 'cap-auto'

export type AutoCaptionCue = {
  start: number
  end: number
  text: string
}

/** Áudio da timeline que a legenda deve acompanhar. Sem faixa de áudio, usa o vídeo mais longo. */
export function pickCaptionAssetId(timeline: EditorTimeline): string | null {
  const spans = new Map<string, { audio: number; video: number }>()
  for (const clip of timeline.clips) {
    if (clip.role !== 'media') continue
    const track = findTrack(timeline, clip.trackId)
    if (!track || (track.kind !== 'audio' && track.kind !== 'video')) continue
    const span = clip.outPoint - clip.inPoint
    if (span < 0.4) continue
    const current = spans.get(clip.assetId) ?? { audio: 0, video: 0 }
    if (track.kind === 'audio') current.audio += span
    else current.video += span
    spans.set(clip.assetId, current)
  }
  let bestId: string | null = null
  let bestAudio = 0
  let bestVideo = 0
  for (const [assetId, span] of spans) {
    if (span.audio > bestAudio || (span.audio === bestAudio && span.audio > 0 && assetId < (bestId ?? assetId))) {
      if (span.audio > 0) {
        bestAudio = span.audio
        bestId = assetId
      }
    }
    if (bestAudio === 0 && span.video > bestVideo) {
      bestVideo = span.video
      bestId = assetId
    }
  }
  return bestId
}

/**
 * Coloca uma legenda em cada fala, no tempo do clipe de origem.
 * Gerar de novo troca só as legendas automáticas.
 */
export function applyAutomaticCaptions(
  timeline: EditorTimeline,
  assetId: string,
  cues: AutoCaptionCue[],
): EditorTimeline {
  const usable = cues.filter((cue) => cue.text.trim() && cue.end > cue.start)
  if (!assetId || usable.length === 0) return timeline

  const sources = timeline.clips.filter((clip) => {
    if (clip.role !== 'media' || clip.assetId !== assetId) return false
    const kind = findTrack(timeline, clip.trackId)?.kind
    return kind === 'audio' || kind === 'video'
  })
  const audioSources = sources.filter((clip) => findTrack(timeline, clip.trackId)?.kind === 'audio')
  const windows = audioSources.length > 0 ? audioSources : sources.filter((clip) => findTrack(timeline, clip.trackId)?.kind === 'video')
  if (windows.length === 0) return timeline

  const cleaned: EditorTimeline = {
    ...timeline,
    clips: timeline.clips.filter(
      (clip) => !(isTextClip(clip) && clip.text?.templateId === AUTO_CAPTION_TEMPLATE_ID),
    ),
  }

  let next = cleaned
  let inserted = 0
  for (const clip of windows) {
    for (const cue of usable) {
      const startIn = Math.max(cue.start, clip.inPoint)
      const endIn = Math.min(cue.end, clip.outPoint)
      if (endIn - startIn < 0.2) continue
      const placed = insertTextClip(next, AUTO_CAPTION_TEMPLATE_ID, {
        start: clip.start + (startIn - clip.inPoint),
        duration: endIn - startIn,
        exactStart: true,
        title: cue.text.trim(),
        subtitle: '',
      })
      if (!placed.clipId) continue
      next = placed.timeline
      inserted += 1
    }
  }
  return inserted > 0 ? next : timeline
}
