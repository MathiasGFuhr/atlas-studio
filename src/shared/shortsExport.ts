import {
  SHORTS_OUTPUT_HEIGHT,
  SHORTS_OUTPUT_WIDTH,
  clipDuration,
  type ShortsAspectMode,
  type ShortsClip,
  type ShortsEditorialRecord,
  type ShortsJob,
  type TranscriptCue,
} from './shorts'

export interface VerticalCropPlan {
  filter: string
  focusStrategy: 'center'
  cropWidth: number
  cropHeight: number
  cropX: number
  cropY: number
}

function even(value: number): number {
  const rounded = Math.max(2, Math.floor(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

/**
 * Crop + scale 9:16 sem distorcer. Foco automático na V1 = centro seguro.
 */
export function buildVerticalCropPlan(
  width: number,
  height: number,
  mode: ShortsAspectMode,
): VerticalCropPlan | null {
  if (mode === 'original') return null
  const srcW = Math.max(2, Math.round(width))
  const srcH = Math.max(2, Math.round(height))
  const targetRatio = 9 / 16
  const srcRatio = srcW / srcH

  let cropW: number
  let cropH: number
  if (srcRatio > targetRatio) {
    cropH = even(srcH)
    cropW = even(srcH * targetRatio)
  } else {
    cropW = even(srcW)
    cropH = even(srcW / targetRatio)
  }
  cropW = Math.min(cropW, even(srcW))
  cropH = Math.min(cropH, even(srcH))
  const cropX = even((srcW - cropW) / 2)
  const cropY = even((srcH - cropH) / 2)

  return {
    filter: `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${SHORTS_OUTPUT_WIDTH}:${SHORTS_OUTPUT_HEIGHT}`,
    focusStrategy: 'center',
    cropWidth: cropW,
    cropHeight: cropH,
    cropX,
    cropY,
  }
}

export interface ShortsPreviewFrame {
  /** Largura / altura da janela visível (9/16 no crop vertical). */
  aspectRatio: number
  videoWidthPct: number
  videoHeightPct: number
  videoLeftPct: number
  videoTopPct: number
  cropped: boolean
}

/**
 * Layout CSS que reproduz o crop FFmpeg sem gerar um arquivo 1080×1920.
 * O elemento de vídeo é dimensionado para que só a janela recortada preencha o frame.
 */
export function buildShortsPreviewFrame(
  width: number,
  height: number,
  mode: ShortsAspectMode,
): ShortsPreviewFrame {
  const srcW = Math.max(1, width)
  const srcH = Math.max(1, height)
  const plan = buildVerticalCropPlan(srcW, srcH, mode)
  if (!plan) {
    return {
      aspectRatio: srcW / srcH,
      videoWidthPct: 100,
      videoHeightPct: 100,
      videoLeftPct: 0,
      videoTopPct: 0,
      cropped: false,
    }
  }
  return {
    aspectRatio: 9 / 16,
    videoWidthPct: (srcW / plan.cropWidth) * 100,
    videoHeightPct: (srcH / plan.cropHeight) * 100,
    videoLeftPct: -(plan.cropX / plan.cropWidth) * 100,
    videoTopPct: -(plan.cropY / plan.cropHeight) * 100,
    cropped: true,
  }
}

export function buildShortsEditorialRecord(
  job: Pick<ShortsJob, 'sourcePath' | 'sourceName' | 'aspectMode' | 'probe'>,
  clip: ShortsClip,
): ShortsEditorialRecord {
  const plan = job.probe
    ? buildVerticalCropPlan(job.probe.width, job.probe.height, job.aspectMode)
    : null
  return {
    sourceVideo: job.sourcePath,
    sourceName: job.sourceName,
    start: clip.start,
    end: clip.end,
    duration: clipDuration(clip),
    score: clip.score,
    reason: clip.reason,
    hook: clip.hook,
    title: clip.title,
    description: clip.description,
    hashtags: clip.hashtags,
    format: job.aspectMode,
    crop: plan
      ? {
          cropWidth: plan.cropWidth,
          cropHeight: plan.cropHeight,
          cropX: plan.cropX,
          cropY: plan.cropY,
          focusStrategy: plan.focusStrategy,
        }
      : null,
    exportPath: clip.exportedPath,
  }
}

export function wrapCaptionLines(text: string, maxChars = 32, maxLines = 2): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ''
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines - 1) {
      const rest = [current, ...words.slice(words.indexOf(word) + 1)].join(' ')
      lines.push(rest.length > maxChars ? `${rest.slice(0, maxChars - 1)}…` : rest)
      return lines.join('\n')
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, maxLines).join('\n')
}

function srtTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = Math.floor(safe % 60)
  const ms = Math.floor((safe % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

/** Cues recortadas para o clipe, com tempo relativo ao início do Short. */
export function cuesForClip(cues: TranscriptCue[], start: number, end: number): TranscriptCue[] {
  return cues
    .map((cue) => {
      const from = Math.max(cue.start, start)
      const to = Math.min(cue.end, end)
      if (to - from < 0.12) return null
      const text = cue.text.trim()
      if (!text) return null
      return {
        start: from - start,
        end: to - start,
        text,
      }
    })
    .filter((item): item is TranscriptCue => Boolean(item))
}

export function buildSrt(cues: TranscriptCue[]): string {
  return cues
    .map((cue, index) => {
      const text = wrapCaptionLines(cue.text)
      if (!text) return ''
      return `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${text}`
    })
    .filter(Boolean)
    .join('\n\n')
}

export const SHORTS_CAPTION_STYLE =
  "FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=80,Bold=0"
