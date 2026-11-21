import { clipDuration, isEffectClip, isTextClip, MIN_CLIP_DURATION } from './timelineOps'
import type { EditorAssetKind, EditorClip, EditorTimeline } from './types'

export type ClipCutExportAssetInput = {
  name: string
  path: string
  kind: EditorAssetKind
  hasAudio: boolean
}

export type EditorClipCutItem = {
  clipId: string
  assetId: string
  index: number
  fileName: string
  sourcePath: string
  inPoint: number
  duration: number
  hasAudio: boolean
}

function sanitizeStem(rawName: string, fallback: string): string {
  const withoutExt = rawName.replace(/\.[^/.\\]+$/, '')
  const printable = Array.from(withoutExt)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
  const cleaned = printable
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  return cleaned || fallback
}

function pathBaseNameLower(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return (parts[parts.length - 1] ?? '').toLowerCase()
}

/**
 * Seleciona e ordena os clipes de vídeo da timeline para exportação individual
 * (cada clipe recortado exatamente em `inPoint`..`outPoint`, pronto para o CapCut).
 */
export function buildClipCutExportItems(input: {
  timeline: EditorTimeline
  assets: Record<string, ClipCutExportAssetInput | undefined>
  clipIds?: readonly string[]
}): EditorClipCutItem[] {
  const trackOrder = new Map<string, number>()
  const visibleVideoTrackIds = new Set<string>()
  input.timeline.tracks.forEach((track, idx) => {
    trackOrder.set(track.id, idx)
    if (track.kind === 'video' && !track.hidden) {
      visibleVideoTrackIds.add(track.id)
    }
  })

  const filterSet =
    input.clipIds && input.clipIds.length > 0 ? new Set(input.clipIds) : null

  const candidates: Array<{ clip: EditorClip; asset: ClipCutExportAssetInput }> = []
  for (const clip of input.timeline.clips) {
    if (isEffectClip(clip) || isTextClip(clip)) continue
    if (!visibleVideoTrackIds.has(clip.trackId)) continue
    if (filterSet && !filterSet.has(clip.id)) continue
    const asset = input.assets[clip.assetId]
    if (!asset || asset.kind !== 'video') continue
    if (clipDuration(clip) < MIN_CLIP_DURATION) continue
    candidates.push({ clip, asset })
  }

  candidates.sort((a, b) => {
    const startDiff = a.clip.start - b.clip.start
    if (Math.abs(startDiff) > 1e-6) return startDiff
    const trackDiff =
      (trackOrder.get(a.clip.trackId) ?? 0) - (trackOrder.get(b.clip.trackId) ?? 0)
    if (trackDiff !== 0) return trackDiff
    return a.clip.inPoint - b.clip.inPoint
  })

  const padWidth = Math.max(2, String(candidates.length).length)
  return candidates.map(({ clip, asset }, idx) => {
    const index = idx + 1
    const prefix = String(index).padStart(padWidth, '0')
    const stem = sanitizeStem(asset.name, `cena-${prefix}`)
    let fileName = `${prefix} - ${stem}.mp4`
    if (fileName.toLowerCase() === pathBaseNameLower(asset.path)) {
      fileName = `${prefix} - ${stem} (corte).mp4`
    }
    return {
      clipId: clip.id,
      assetId: clip.assetId,
      index,
      fileName,
      sourcePath: asset.path,
      inPoint: Math.max(0, clip.inPoint),
      duration: clipDuration(clip),
      hasAudio: asset.hasAudio,
    }
  })
}

export function buildClipCutFfmpegArgs(input: {
  sourcePath: string
  outputPath: string
  inPoint: number
  duration: number
  hasAudio?: boolean
  stripAudio: boolean
  maxQuality: boolean
}): string[] {
  const includeAudio = !input.stripAudio
  return [
    '-y',
    '-hide_banner',
    '-ss',
    Math.max(0, input.inPoint).toFixed(3),
    '-i',
    input.sourcePath,
    '-t',
    Math.max(MIN_CLIP_DURATION, input.duration).toFixed(3),
    '-map',
    '0:v:0',
    ...(includeAudio ? ['-map', '0:a:0?'] : ['-an']),
    '-c:v',
    'libx264',
    '-preset',
    input.maxQuality ? 'slow' : 'veryfast',
    '-crf',
    input.maxQuality ? '14' : '16',
    '-pix_fmt',
    'yuv420p',
    ...(includeAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : []),
    '-movflags',
    '+faststart',
    input.outputPath,
  ]
}
