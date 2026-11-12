import { editorAnimationById } from './animationsCatalog'
import { clipFfmpegEffects } from './effectsCatalog'
import { resolveTextPresentation } from './textStyleResolve'
import {
  clipDuration,
  isEffectClip,
  isTextClip,
  timelineDuration,
  MIN_CLIP_DURATION,
} from './timelineOps'
import type { EditorAssetKind, EditorClip, EditorClipAnimation, EditorTimeline } from './types'
import { watermarkMarginPx, watermarkOverlayXy, watermarkWidthPx } from './watermark'

export type EditorExportAssetInput = {
  path: string
  kind: EditorAssetKind
  hasAudio: boolean
}

export type EditorExportPlan = {
  inputArgs: string[]
  filterGraph: string
  outputArgs: string[]
  duration: number
  visualClipCount: number
  audioClipCount: number
}

const AUDIO_RATE = 48000

function t(value: number): string {
  return Math.max(0, value).toFixed(3)
}

/** Anexa `enable=between` a cada filtro do span (cadeias com vírgula). */
function withTimeEnable(ffmpegChain: string, start: number, end: number): string {
  const enable = `enable='between(t,${t(start)},${t(end)})'`
  return ffmpegChain
    .split(',')
    .map((part) => {
      const trimmed = part.trim()
      if (!trimmed || trimmed.includes('enable=')) return trimmed
      return `${trimmed}:${enable}`
    })
    .filter(Boolean)
    .join(',')
}

/** Escapa texto para filtro `drawtext` do FFmpeg. */
function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, '\\n')
}

function drawtextXy(
  align: 'left' | 'center' | 'right',
  xPercent: number,
  yPercent: number,
): { x: string; y: string } {
  const xExpr =
    align === 'left'
      ? `(w*${(xPercent / 100).toFixed(4)})`
      : align === 'right'
        ? `(w*${(xPercent / 100).toFixed(4)}-text_w)`
        : `(w*${(xPercent / 100).toFixed(4)}-text_w/2)`
  const yExpr = `(h*${(yPercent / 100).toFixed(4)}-text_h/2)`
  return { x: xExpr, y: yExpr }
}

/** Fades de entrada/saída aproximando animações CapCut no export. */
function animationFadeFilters(animation: EditorClipAnimation | undefined, length: number): string {
  if (!animation || !(length > 0)) return ''
  const parts: string[] = []
  const inDef = editorAnimationById(animation.inId)
  const outDef = editorAnimationById(animation.outId)
  const inDur = Math.min(Math.max(0, animation.inDuration || 0), length * 0.5)
  const outDur = Math.min(Math.max(0, animation.outDuration || 0), length * 0.5)
  if (inDef && inDur > 0 && inDef.ffmpegHint !== 'none') {
    parts.push(`fade=t=in:st=0:d=${t(inDur)}:alpha=1`)
  }
  if (outDef && outDur > 0 && outDef.ffmpegHint !== 'none') {
    parts.push(`fade=t=out:st=${t(Math.max(0, length - outDur))}:d=${t(outDur)}:alpha=1`)
  }
  return parts.length > 0 ? `,${parts.join(',')}` : ''
}

function visualFilter(
  clip: EditorClip,
  inputIndex: number,
  label: string,
  size: { width: number; height: number },
  fps: number,
): string {
  const { width: w, height: h } = size
  // lanczos melhora o upscale quando a fonte é menor que a resolução de export.
  const fit =
    clip.fit === 'cover'
      ? `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},format=rgba`
      : `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0`
  const scale = Number.isFinite(clip.scale) ? clip.scale : 1
  const opacity = Number.isFinite(clip.opacity) ? clip.opacity : 1
  const scaledW = Math.max(2, Math.round(w * scale))
  const scaledH = Math.max(2, Math.round(h * scale))
  // Zoom a partir do centro + opacidade, sempre devolvendo o frame final w×h.
  const transform =
    scale === 1 && opacity >= 0.999
      ? 'setsar=1'
      : `scale=${scaledW}:${scaledH}:flags=lanczos,pad=${Math.max(scaledW, w)}:${Math.max(scaledH, h)}:(ow-iw)/2:(oh-ih)/2:color=black@0,crop=${w}:${h},format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)},setsar=1`
  const effectChain = clipFfmpegEffects(clip.effects)
  const effects = effectChain.length > 0 ? `,${effectChain.join(',')}` : ''
  const length = clipDuration(clip)
  const anim = animationFadeFilters(clip.animation, length)
  return `[${inputIndex}:v]fps=${fps},${fit}${effects},${transform}${anim},setpts=PTS-STARTPTS+${t(clip.start)}/TB[${label}]`
}

/**
 * Converte a timeline em argumentos do FFmpeg. Entrada 0 é o fundo preto e entrada 1 o
 * silêncio de base; cada clipe vira uma entrada já recortada com -ss/-t.
 */
export function buildEditorExportPlan(input: {
  timeline: EditorTimeline
  assets: Record<string, EditorExportAssetInput | undefined>
  width: number
  height: number
  outputPath: string
}): EditorExportPlan {
  const { timeline, assets, width, height } = input
  const duration = timelineDuration(timeline)
  if (duration < MIN_CLIP_DURATION) throw new Error('A timeline está vazia.')
  const fps = timeline.fps
  const size = { width, height }

  const inputArgs: string[] = [
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${width}x${height}:r=${fps}:d=${t(duration)}`,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${AUDIO_RATE}:cl=stereo`,
  ]
  let nextInput = 2
  const inputByClip = new Map<string, number>()

  const addInput = (clip: EditorClip, asset: EditorExportAssetInput) => {
    const length = clipDuration(clip)
    if (asset.kind === 'image') {
      inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', t(length), '-i', asset.path)
    } else {
      inputArgs.push('-ss', t(clip.inPoint), '-t', t(length), '-i', asset.path)
    }
    inputByClip.set(clip.id, nextInput)
    nextInput += 1
  }

  const trackById = new Map(timeline.tracks.map((track) => [track.id, track]))
  const ordered = [...timeline.clips].sort((a, b) => a.start - b.start)
  for (const clip of ordered) {
    if (isEffectClip(clip) || isTextClip(clip)) continue
    const asset = assets[clip.assetId]
    if (!asset || !trackById.has(clip.trackId)) continue
    addInput(clip, asset)
  }

  const filters: string[] = []

  // Composição: da faixa de vídeo de baixo para a de cima.
  const videoTracks = timeline.tracks.filter((track) => track.kind === 'video' && !track.hidden).reverse()
  let base = '0:v'
  let visualCount = 0
  for (const track of videoTracks) {
    const clips = ordered.filter((clip) => clip.trackId === track.id && inputByClip.has(clip.id))
    for (const clip of clips) {
      const asset = assets[clip.assetId]
      if (!asset || asset.kind === 'audio') continue
      const label = `v${visualCount}`
      const out = `o${visualCount}`
      filters.push(visualFilter(clip, inputByClip.get(clip.id)!, label, size, fps))
      const end = clip.start + clipDuration(clip)
      filters.push(
        `[${base}][${label}]overlay=eof_action=pass:enable='between(t,${t(clip.start)},${t(end)})'[${out}]`,
      )
      base = out
      visualCount += 1
    }
  }

  // Spans de efeito (faixas effect): de baixo para cima, com enable between.
  const effectTracks = timeline.tracks.filter((track) => track.kind === 'effect' && !track.hidden).reverse()
  let effectSpanCount = 0
  for (const track of effectTracks) {
    const spans = ordered.filter((clip) => clip.trackId === track.id && isEffectClip(clip))
    for (const clip of spans) {
      const chain = clipFfmpegEffects(clip.effects)
      if (chain.length === 0) continue
      const end = clip.start + clipDuration(clip)
      const labeled = withTimeEnable(chain.join(','), clip.start, end)
      const out = `fx${effectSpanCount}`
      filters.push(`[${base}]${labeled}[${out}]`)
      base = out
      effectSpanCount += 1
    }
  }

  let watermarkCount = 0
  for (const watermark of timeline.watermarks) {
    const watermarkAsset = assets[watermark.assetId]
    if (!watermarkAsset || watermarkAsset.kind !== 'image') continue
    const wmIndex = nextInput
    inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', t(duration), '-i', watermarkAsset.path)
    nextInput += 1
    const wmW = watermarkWidthPx({ width }, watermark)
    const margin = watermarkMarginPx({ width, height }, watermark)
    const { x, y } = watermarkOverlayXy(watermark.corner, String(margin))
    const opacity = watermark.opacity.toFixed(3)
    const wmAnim = animationFadeFilters(watermark.animation, duration)
    const wmLabel = `wm${watermarkCount}`
    const wmOut = `wmout${watermarkCount}`
    filters.push(
      `[${wmIndex}:v]scale=${wmW}:-1:flags=lanczos,format=rgba,colorchannelmixer=aa=${opacity}${wmAnim}[${wmLabel}]`,
    )
    filters.push(`[${base}][${wmLabel}]overlay=x=${x}:y=${y}:format=auto[${wmOut}]`)
    base = wmOut
    watermarkCount += 1
  }

  // Textos (faixas text): drawtext de baixo para cima.
  const textTracks = timeline.tracks.filter((track) => track.kind === 'text' && !track.hidden).reverse()
  let textSpanCount = 0
  for (const track of textTracks) {
    const spans = ordered.filter((clip) => clip.trackId === track.id && isTextClip(clip) && clip.text)
    for (const clip of spans) {
      const content = clip.text!
      const presentation = resolveTextPresentation(content)
      if (!presentation) continue
      const end = clip.start + clipDuration(clip)
      const enable = `enable='between(t,${t(clip.start)},${t(end)})'`
      const { x, y } = drawtextXy(presentation.align, presentation.xPercent, presentation.yPercent)
      const lines: string[] = []
      if (presentation.title.trim()) {
        const fontsize = Math.max(8, Math.round((presentation.titleStyle.fontSizePercent / 100) * height))
        const fontcolor = (presentation.titleStyle.color || '#ffffff').replace('#', '0x')
        lines.push(
          `drawtext=text='${escapeDrawtext(presentation.title)}':fontsize=${fontsize}:fontcolor=${fontcolor}:x=${x}:y=${y}:${enable}`,
        )
      }
      if (presentation.subtitle.trim() && presentation.subtitleStyle) {
        const fontsize = Math.max(8, Math.round((presentation.subtitleStyle.fontSizePercent / 100) * height))
        const fontcolor = (presentation.subtitleStyle.color || '#dddddd').replace('#', '0x')
        const subY = `(h*${(presentation.yPercent / 100).toFixed(4)}+text_h*0.7)`
        const subX =
          presentation.align === 'left'
            ? `(w*${(presentation.xPercent / 100).toFixed(4)})`
            : presentation.align === 'right'
              ? `(w*${(presentation.xPercent / 100).toFixed(4)}-text_w)`
              : `(w*${(presentation.xPercent / 100).toFixed(4)}-text_w/2)`
        lines.push(
          `drawtext=text='${escapeDrawtext(presentation.subtitle)}':fontsize=${fontsize}:fontcolor=${fontcolor}:x=${subX}:y=${subY}:${enable}`,
        )
      }
      if (lines.length === 0) continue
      const out = `tx${textSpanCount}`
      filters.push(`[${base}]${lines.join(',')}[${out}]`)
      base = out
      textSpanCount += 1
    }
  }

  filters.push(`[${base}]format=yuv420p[vout]`)

  const audioLabels: string[] = []
  for (const clip of ordered) {
    const track = trackById.get(clip.trackId)
    const asset = assets[clip.assetId]
    const index = inputByClip.get(clip.id)
    if (!track || !asset || index == null) continue
    if (track.muted || clip.muted || clip.volume <= 0) continue
    if (asset.kind === 'image' || !asset.hasAudio) continue
    const label = `a${audioLabels.length}`
    const delayMs = Math.round(clip.start * 1000)
    const length = clipDuration(clip)
    const fadeIn = Math.max(0, Math.min(clip.fadeIn || 0, length))
    const fadeOut = Math.max(0, Math.min(clip.fadeOut || 0, length))
    const fades: string[] = []
    if (fadeIn > 0) fades.push(`afade=t=in:st=0:d=${t(fadeIn)}`)
    if (fadeOut > 0) fades.push(`afade=t=out:st=${t(Math.max(0, length - fadeOut))}:d=${t(fadeOut)}`)
    const fadeChain = fades.length > 0 ? `,${fades.join(',')}` : ''
    filters.push(
      `[${index}:a]aresample=${AUDIO_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${clip.volume.toFixed(3)}${fadeChain},adelay=${delayMs}:all=1[${label}]`,
    )
    audioLabels.push(label)
  }
  filters.push(`[1:a]atrim=0:${t(duration)},asetpts=PTS-STARTPTS[asil]`)
  if (audioLabels.length > 0) {
    const mixInputs = ['asil', ...audioLabels].map((label) => `[${label}]`).join('')
    filters.push(
      `${mixInputs}amix=inputs=${audioLabels.length + 1}:duration=first:dropout_transition=0:normalize=0,atrim=0:${t(duration)}[aout]`,
    )
  } else {
    filters.push('[asil]anull[aout]')
  }

  const outputArgs = [
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    String(AUDIO_RATE),
    '-movflags',
    '+faststart',
    '-t',
    t(duration),
    input.outputPath,
  ]

  return {
    inputArgs,
    filterGraph: filters.join(';'),
    outputArgs,
    duration,
    visualClipCount: visualCount,
    audioClipCount: audioLabels.length,
  }
}
