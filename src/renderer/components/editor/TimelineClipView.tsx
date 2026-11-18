import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { AlertTriangle, Sparkles, Type, VolumeX, X } from 'lucide-react'
import { editorEffectById } from '@shared/editor/effectsCatalog'
import { editorTextTemplateById } from '@shared/editor/textTemplatesCatalog'
import { editorTransitionById } from '@shared/editor/transitionsCatalog'
import { formatDuration, type EditorAsset, type EditorClip, type EditorWaveform } from '@shared/editor/types'
import { clipDuration, isEffectClip, isTextClip } from '@shared/editor/timelineOps'
import { loadWaveform } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'

const MAX_THUMB_SLOTS = 180
const MIN_DURATION = 0.001

const ThumbStrip = memo(function ThumbStrip({
  thumbsUrl,
  thumbsCount,
  thumbsTileWidth,
  assetDuration,
  isImage,
  inPoint,
  width,
  height,
  zoom,
}: {
  thumbsUrl: string
  thumbsCount: number
  thumbsTileWidth: number
  assetDuration: number
  isImage: boolean
  inPoint: number
  width: number
  height: number
  zoom: number
}) {
  if (!thumbsUrl || thumbsCount < 1 || thumbsTileWidth < 1) return null
  const scale = height / 72
  let tile = Math.max(10, thumbsTileWidth * scale)
  const slots = Math.ceil(width / tile)
  if (slots > MAX_THUMB_SLOTS) tile = width / MAX_THUMB_SLOTS
  const count = Math.min(MAX_THUMB_SLOTS, Math.ceil(width / tile))
  const stripWidth = thumbsCount * thumbsTileWidth * scale
  const tileDrawn = thumbsTileWidth * scale
  const items: ReactNode[] = []
  for (let index = 0; index < count; index += 1) {
    const x = index * tile
    const time = inPoint + (x + tile / 2) / zoom
    const frame =
      isImage || assetDuration <= 0
        ? 0
        : Math.max(0, Math.min(thumbsCount - 1, Math.floor((time / assetDuration) * thumbsCount)))
    items.push(
      <div
        key={index}
        className="absolute top-0 h-full"
        style={{
          left: x,
          width: Math.ceil(tile),
          backgroundImage: `url("${thumbsUrl}")`,
          backgroundSize: `${stripWidth}px ${height}px`,
          backgroundPosition: `-${frame * tileDrawn}px 0`,
          backgroundRepeat: 'no-repeat',
        }}
      />,
    )
  }
  return <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80">{items}</div>
})

const Waveform = memo(function Waveform({
  asset,
  inPoint,
  outPoint,
  volume,
  muted,
  width,
  height,
}: {
  asset: EditorAsset
  inPoint: number
  outPoint: number
  volume: number
  muted: boolean
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
    if (canvas.width !== drawWidth) canvas.width = drawWidth
    if (canvas.height !== drawHeight) canvas.height = drawHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, drawWidth, drawHeight)
    ctx.fillStyle = muted ? 'rgba(148, 163, 184, 0.35)' : 'rgba(52, 211, 153, 0.85)'
    const mid = drawHeight / 2
    const peaks = waveform.peaks
    const pps = Math.max(1, waveform.peaksPerSecond)
    const duration = Math.max(MIN_DURATION, outPoint - inPoint)
    const volScale = Math.min(1.4, Math.max(0.2, volume))
    const step = drawWidth > 1200 ? 2 : 1
    for (let x = 0; x < drawWidth; x += step) {
      const local = inPoint + (x / drawWidth) * duration
      const index = Math.max(0, Math.min(peaks.length - 1, Math.floor(local * pps)))
      const peak = peaks[index] ?? 0
      const bar = Math.max(1, peak * (drawHeight - 4) * volScale)
      ctx.fillRect(x, mid - bar / 2, step, bar)
    }
  }, [height, inPoint, muted, outPoint, volume, waveform, width])

  if (!waveform) return null
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
})

export const TimelineClipView = memo(function TimelineClipView({
  clip,
  asset,
  zoom,
  height,
  selected,
  locked,
  inView = true,
  onPointerDown,
  onRemoveTransition,
}: {
  clip: EditorClip
  asset: EditorAsset | undefined
  zoom: number
  height: number
  selected: boolean
  locked: boolean
  inView?: boolean
  onPointerDown: (event: ReactPointerEvent, clip: EditorClip, mode: 'move' | 'trim-start' | 'trim-end') => void
  onRemoveTransition?: (clipId: string) => void
}) {
  const duration = clipDuration(clip)
  const width = Math.max(2, duration * zoom)
  const inner = height - 8
  const effect = isEffectClip(clip)
  const text = isTextClip(clip)
  const effectDef = effect && clip.effectId ? editorEffectById(clip.effectId) : undefined
  const textTemplate = text && clip.text ? editorTextTemplateById(clip.text.templateId) : undefined
  const transitionDef = clip.transitionOut ? editorTransitionById(clip.transitionOut.id) : undefined
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
      {inView && !effect && !text && asset && kind !== 'audio' && asset.thumbsUrl ? (
        <ThumbStrip
          thumbsUrl={asset.thumbsUrl}
          thumbsCount={asset.thumbsCount}
          thumbsTileWidth={asset.thumbsTileWidth}
          assetDuration={asset.duration}
          isImage={asset.kind === 'image'}
          inPoint={clip.inPoint}
          width={width}
          height={inner}
          zoom={zoom}
        />
      ) : null}
      {inView && !effect && !text && asset && kind === 'audio' ? (
        <Waveform
          asset={asset}
          inPoint={clip.inPoint}
          outPoint={clip.outPoint}
          volume={clip.volume}
          muted={clip.muted}
          width={width}
          height={inner}
        />
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

      {clip.transitionOut ? (
        <div
          title={`Transição: ${transitionDef?.label ?? clip.transitionOut.id} (${clip.transitionOut.duration.toFixed(1)}s) — clique no × para remover`}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute bottom-1 right-2.5 z-[5] flex max-w-[calc(100%-14px)] items-center gap-1 rounded bg-accent/90 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-on-accent shadow"
        >
          {width > 64 ? (
            <span className="truncate">{transitionDef?.label ?? clip.transitionOut.id}</span>
          ) : null}
          {!locked && onRemoveTransition ? (
            <button
              type="button"
              title={`Remover transição ${transitionDef?.label ?? clip.transitionOut.id}`}
              onClick={(event) => {
                event.stopPropagation()
                onRemoveTransition(clip.id)
              }}
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm hover:bg-black/25"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          ) : null}
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
