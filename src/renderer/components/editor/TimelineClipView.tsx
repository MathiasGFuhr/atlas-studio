import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AlertTriangle, Sparkles, Type, VolumeX } from 'lucide-react'
import { editorEffectById } from '@shared/editor/effectsCatalog'
import { editorTextTemplateById } from '@shared/editor/textTemplatesCatalog'
import { formatDuration, type EditorAsset, type EditorClip, type EditorWaveform } from '@shared/editor/types'
import { clipDuration, isEffectClip, isTextClip } from '@shared/editor/timelineOps'
import { loadWaveform } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'

const MAX_THUMB_SLOTS = 240
const MIN_DURATION = 0.001

function ThumbStrip({ asset, clip, width, height, zoom }: {
  asset: EditorAsset
  clip: EditorClip
  width: number
  height: number
  zoom: number
}) {
  if (!asset.thumbsUrl || asset.thumbsCount < 1 || asset.thumbsTileWidth < 1) return null
  const scale = height / 72
  let tile = Math.max(8, asset.thumbsTileWidth * scale)
  const slots = Math.ceil(width / tile)
  if (slots > MAX_THUMB_SLOTS) tile = width / MAX_THUMB_SLOTS
  const count = Math.min(MAX_THUMB_SLOTS, Math.ceil(width / tile))
  const stripWidth = asset.thumbsCount * asset.thumbsTileWidth * scale
  const tileDrawn = asset.thumbsTileWidth * scale
  const items: ReactNode[] = []
  for (let index = 0; index < count; index += 1) {
    const x = index * tile
    const time = clip.inPoint + (x + tile / 2) / zoom
    const frame =
      asset.kind === 'image' || asset.duration <= 0
        ? 0
        : Math.max(0, Math.min(asset.thumbsCount - 1, Math.floor((time / asset.duration) * asset.thumbsCount)))
    items.push(
      <div
        key={index}
        className="absolute top-0 h-full"
        style={{
          left: x,
          width: Math.ceil(tile),
          backgroundImage: `url("${asset.thumbsUrl}")`,
          backgroundSize: `${stripWidth}px ${height}px`,
          backgroundPosition: `-${frame * tileDrawn}px 0`,
          backgroundRepeat: 'no-repeat',
        }}
      />,
    )
  }
  return <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80">{items}</div>
}

function Waveform({ asset, clip, width, height }: {
  asset: EditorAsset
  clip: EditorClip
  width: number
  height: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waveform, setWaveform] = useState<EditorWaveform | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadWaveform(asset).then((value) => {
      if (!cancelled) setWaveform(value)
    })
    return () => {
      cancelled = true
    }
  }, [asset])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !waveform) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const drawWidth = Math.min(4096, Math.max(1, Math.floor(width * ratio)))
    const drawHeight = Math.max(1, Math.floor(height * ratio))
    canvas.width = drawWidth
    canvas.height = drawHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, drawWidth, drawHeight)
    ctx.fillStyle = 'rgba(52, 211, 153, 0.85)'
    const mid = drawHeight / 2
    const peaks = waveform.peaks
    const pps = Math.max(1, waveform.peaksPerSecond)
    const duration = Math.max(MIN_DURATION, clip.outPoint - clip.inPoint)
    for (let x = 0; x < drawWidth; x += 1) {
      const local = clip.inPoint + (x / drawWidth) * duration
      const index = Math.max(0, Math.min(peaks.length - 1, Math.floor(local * pps)))
      const peak = peaks[index] ?? 0
      const bar = Math.max(1, peak * (drawHeight - 4) * Math.min(1.4, Math.max(0.2, clip.volume)))
      ctx.fillRect(x, mid - bar / 2, 1, bar)
    }
  }, [clip, height, waveform, width])

  if (!waveform) return null
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

export const TimelineClipView = memo(function TimelineClipView({
  clip,
  asset,
  zoom,
  height,
  selected,
  locked,
  onPointerDown,
}: {
  clip: EditorClip
  asset: EditorAsset | undefined
  zoom: number
  height: number
  selected: boolean
  locked: boolean
  onPointerDown: (event: ReactPointerEvent, clip: EditorClip, mode: 'move' | 'trim-start' | 'trim-end') => void
}) {
  const duration = clipDuration(clip)
  const width = Math.max(2, duration * zoom)
  const inner = height - 8
  const effect = isEffectClip(clip)
  const text = isTextClip(clip)
  const effectDef = effect && clip.effectId ? editorEffectById(clip.effectId) : undefined
  const textTemplate = text && clip.text ? editorTextTemplateById(clip.text.templateId) : undefined
  const kind = asset?.kind ?? 'video'
  const tone = effect
    ? 'bg-fuchsia-900/75 border-fuchsia-300/40'
    : text
      ? 'bg-amber-900/75 border-amber-300/40'
      : kind === 'audio'
        ? 'bg-emerald-900/70 border-emerald-400/30'
        : kind === 'image'
          ? 'bg-violet-900/60 border-violet-400/30'
          : 'bg-sky-950/80 border-sky-400/30'
  const label = effect
    ? effectDef?.label ?? clip.effectId ?? 'Efeito'
    : text
      ? clip.text?.title || textTemplate?.label || 'Texto'
      : asset?.name ?? 'Mídia ausente'

  return (
    <div
      data-clip-id={clip.id}
      onPointerDown={(event) => onPointerDown(event, clip, 'move')}
      className={cn(
        'group absolute top-1 select-none overflow-hidden rounded-md border',
        tone,
        locked ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing',
        selected && 'z-[1] ring-2 ring-accent ring-offset-0',
        !effect && !text && !asset && 'border-danger/60 bg-danger-subtle',
      )}
      style={{ left: clip.start * zoom, width, height: inner }}
    >
      {effect ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 8px, rgba(255,255,255,0.02) 8px 16px)',
            filter: effectDef?.cssFilter || undefined,
          }}
        />
      ) : null}
      {text ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              'repeating-linear-gradient(135deg, rgba(251,191,36,0.12) 0 8px, rgba(255,255,255,0.02) 8px 16px)',
          }}
        />
      ) : null}
      {!effect && !text && asset && kind !== 'audio' ? (
        <ThumbStrip asset={asset} clip={clip} width={width} height={inner} zoom={zoom} />
      ) : null}
      {!effect && !text && asset && kind === 'audio' ? (
        <Waveform asset={asset} clip={clip} width={width} height={inner} />
      ) : null}

      {width > 36 ? (
        <div className="pointer-events-none absolute left-1 top-1 flex max-w-[calc(100%-8px)] items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/90">
          {effect ? <Sparkles className="h-3 w-3 shrink-0 text-fuchsia-200" /> : null}
          {text ? <Type className="h-3 w-3 shrink-0 text-amber-200" /> : null}
          {!effect && !text && !asset ? <AlertTriangle className="h-3 w-3 shrink-0 text-danger" /> : null}
          {!effect && !text && clip.muted ? <VolumeX className="h-3 w-3 shrink-0" /> : null}
          <span className="truncate">{label}</span>
          {width > 120 ? <span className="shrink-0 text-white/60">{formatDuration(duration)}</span> : null}
        </div>
      ) : null}

      {!locked ? (
        <>
          <div
            onPointerDown={(event) => {
              event.stopPropagation()
              onPointerDown(event, clip, 'trim-start')
            }}
            className={cn(
              'absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 transition-colors hover:bg-white/40',
              selected && 'bg-accent/70',
            )}
          />
          <div
            onPointerDown={(event) => {
              event.stopPropagation()
              onPointerDown(event, clip, 'trim-end')
            }}
            className={cn(
              'absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition-colors hover:bg-white/40',
              selected && 'bg-accent/70',
            )}
          />
        </>
      ) : null}
    </div>
  )
})
