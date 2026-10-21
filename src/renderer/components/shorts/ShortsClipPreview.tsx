import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Pause, Play } from 'lucide-react'
import type { ShortsAspectMode } from '@shared/shorts'
import { formatShortsTimecode, shortsClipPreviewSrc } from '@shared/shorts'
import { formatClipLength } from '@shared/shortsDuration'
import { buildShortsPreviewFrame } from '@shared/shortsExport'
import {
  clickToSourcePoint,
  interpolateFraming,
  maxVerticalCrop,
  type ShortsCropWindow,
  type ShortsFramingPlan,
} from '@shared/shortsFraming'
import { logoPreviewStyle, type ShortsLogoSettings } from '@shared/shortsLogo'
import { cn } from '../../lib/utils'

function mediaStyleFrom(frame: {
  videoWidthPct: number
  videoHeightPct: number
  videoLeftPct: number
  videoTopPct: number
}) {
  return {
    width: `${frame.videoWidthPct}%`,
    height: `${frame.videoHeightPct}%`,
    left: `${frame.videoLeftPct}%`,
    top: `${frame.videoTopPct}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill' as const,
  }
}

export function ShortsClipPreview({
  clipId,
  src,
  start,
  end,
  aspectMode,
  sourceWidth,
  sourceHeight,
  framingPlan,
  picking,
  placingLogo,
  logo,
  logoUrl,
  active,
  onPlayingChange,
  onAssignPoint,
  onPlaceLogo,
  resetToken,
  posterUrl,
  className,
}: {
  clipId?: string
  src: string | null
  start: number
  end: number
  aspectMode: ShortsAspectMode
  sourceWidth: number
  sourceHeight: number
  framingPlan?: ShortsFramingPlan | null
  picking?: boolean
  placingLogo?: boolean
  logo?: ShortsLogoSettings | null
  logoUrl?: string | null
  active: boolean
  onPlayingChange: (playing: boolean) => void
  onAssignPoint?: (x: number, y: number, time: number) => void
  onPlaceLogo?: (x: number, y: number) => void
  resetToken?: string
  posterUrl?: string | null
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const splitRef = useRef<HTMLVideoElement | null>(null)
  const windowRef = useRef({ start, end })
  const [current, setCurrent] = useState(start)
  const [frameReady, setFrameReady] = useState(false)
  const duration = Math.max(0.1, end - start)
  const frame = buildShortsPreviewFrame(
    sourceWidth || 1920,
    sourceHeight || 1080,
    aspectMode,
    framingPlan,
    current,
  )
  const key = interpolateFraming(framingPlan ?? { mode: aspectMode, sourceWidth, sourceHeight, keyframes: [], subjects: [], usedFallback: true, confidence: 0, animated: false }, current)
  const fallbackCrop = maxVerticalCrop(sourceWidth || 1920, sourceHeight || 1080)
  const previewKey = resetToken ?? `${clipId ?? 'clip'}:${start}:${end}`
  const clipSrc = useMemo(
    () => shortsClipPreviewSrc(src, { id: clipId ?? 'clip', start, end }),
    [src, clipId, start, end],
  )
  windowRef.current = { start, end }
  const split = frame.layout === 'split' && frame.top && frame.bottom

  useEffect(() => {
    setFrameReady(false)
    setCurrent(start)
  }, [clipSrc, previewKey, start])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !clipSrc) return
    let cancelled = false

    let seeks = 0
    const seekToClip = () => {
      if (cancelled) return
      const from = windowRef.current.start
      if (Math.abs(video.currentTime - from) > 0.04) {
        seeks += 1
        video.currentTime = from
        return
      }
      setCurrent(video.currentTime)
      setFrameReady(true)
    }

    const onSeeked = () => {
      if (cancelled) return
      const window = windowRef.current
      if ((video.currentTime < window.start - 0.08 || video.currentTime > window.end) && seeks < 4) {
        seeks += 1
        video.currentTime = window.start
        return
      }
      if (video.currentTime < window.start - 0.08) return
      setCurrent(video.currentTime)
      setFrameReady(true)
    }

    video.addEventListener('loadedmetadata', seekToClip)
    video.addEventListener('loadeddata', seekToClip)
    video.addEventListener('seeked', onSeeked)
    if (video.readyState >= 1) seekToClip()

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', seekToClip)
      video.removeEventListener('loadeddata', seekToClip)
      video.removeEventListener('seeked', onSeeked)
    }
  }, [clipSrc, previewKey])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (video.currentTime < start || video.currentTime > end) {
      video.currentTime = start
      setCurrent(start)
      setFrameReady(false)
    }
  }, [clipId, start, end])

  useEffect(() => {
    const video = videoRef.current
    const splitVideo = splitRef.current
    if (!video) return
    if (active) {
      setFrameReady(true)
      if (video.currentTime < start || video.currentTime >= end - 0.04) video.currentTime = start
      void video.play().catch(() => undefined)
      if (splitVideo) {
        splitVideo.currentTime = video.currentTime
        void splitVideo.play().catch(() => undefined)
      }
      return
    }
    video.pause()
    splitVideo?.pause()
  }, [active, start, end, split])

  // O pai passa um callback novo a cada render; via ref o listener de timeupdate não é recriado.
  const onPlayingChangeRef = useRef(onPlayingChange)
  onPlayingChangeRef.current = onPlayingChange

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    function onTime() {
      const node = videoRef.current
      if (!node) return
      const window = windowRef.current
      setCurrent(node.currentTime)
      const slave = splitRef.current
      if (slave && Math.abs(slave.currentTime - node.currentTime) > 0.08) {
        slave.currentTime = node.currentTime
      }
      if (node.currentTime >= window.end - 0.04) {
        node.pause()
        node.currentTime = window.end
        slave?.pause()
        if (active) onPlayingChangeRef.current(false)
      }
    }
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [active])

  const progress = Math.max(0, Math.min(1, (current - start) / duration))
  const mediaStyle = mediaStyleFrom(frame)

  function assignFromClick(event: { clientX: number; clientY: number; currentTarget: EventTarget & Element }, crop: ShortsCropWindow) {
    if (!onAssignPoint) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = clickToSourcePoint({
      clientX: event.clientX,
      clientY: event.clientY,
      rect,
      sourceWidth: sourceWidth || 1920,
      sourceHeight: sourceHeight || 1080,
      crop,
    })
    onAssignPoint(point.x, point.y, current)
  }

  function placeLogoFromClick(event: MouseEvent<HTMLElement>) {
    if (!onPlaceLogo) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    onPlaceLogo(x, y)
  }

  function onPaneClick(
    event: MouseEvent<HTMLElement>,
    crop: ShortsCropWindow,
  ) {
    if (placingLogo) return
    if (picking && onAssignPoint) {
      event.preventDefault()
      event.stopPropagation()
      assignFromClick(event, crop)
      return
    }
    onPlayingChange(!active)
  }

  const showLogo = Boolean(logo?.enabled && logoUrl)
  const logoStyle = logo ? logoPreviewStyle(logo) : null

  const videoNode = (ref: typeof videoRef, style: typeof mediaStyle, extraClass?: string) =>
    clipSrc ? (
      <video
        key={ref === videoRef ? previewKey : `${previewKey}-split`}
        ref={ref}
        src={clipSrc}
        poster={posterUrl ?? undefined}
        preload={active ? 'auto' : 'metadata'}
        muted={ref !== videoRef}
        playsInline
        className={cn('absolute max-h-none max-w-none bg-overlay', extraClass)}
        style={style}
      />
    ) : (
      <div className="absolute inset-0 bg-elevated" />
    )

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-xl bg-overlay',
          (picking || placingLogo) && 'ring-2 ring-accent',
        )}
        style={{ aspectRatio: String(frame.aspectRatio) }}
      >
        {split && frame.top && frame.bottom ? (
          <div className="absolute inset-0 flex flex-col">
            <div
              className="relative h-1/2 overflow-hidden"
              onClick={(event) => onPaneClick(event, key?.top ?? fallbackCrop)}
            >
              {videoNode(videoRef, mediaStyleFrom(frame.top))}
              {posterUrl && !frameReady ? (
                <img src={posterUrl} alt="" className="absolute z-[1] max-h-none max-w-none bg-overlay" style={mediaStyleFrom(frame.top)} />
              ) : null}
            </div>
            <div
              className="relative h-1/2 overflow-hidden border-t border-overlay/40"
              onClick={(event) => onPaneClick(event, key?.bottom ?? fallbackCrop)}
            >
              {videoNode(splitRef, mediaStyleFrom(frame.bottom))}
              {posterUrl && !frameReady ? (
                <img src={posterUrl} alt="" className="absolute z-[1] max-h-none max-w-none bg-overlay" style={mediaStyleFrom(frame.bottom)} />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 overflow-hidden" onClick={(event) => onPaneClick(event, key ?? fallbackCrop)}>
            {videoNode(videoRef, mediaStyle)}
            {posterUrl && !frameReady ? (
              <img src={posterUrl} alt="" className="absolute z-[1] max-h-none max-w-none bg-overlay" style={mediaStyle} />
            ) : null}
          </div>
        )}
        {showLogo && logoUrl && logoStyle ? (
          <img
            src={logoUrl}
            alt=""
            className="pointer-events-none absolute z-[8] max-w-none object-contain"
            style={logoStyle}
          />
        ) : null}
        {placingLogo ? (
          <button
            type="button"
            className="absolute inset-0 z-[9] cursor-crosshair bg-transparent"
            aria-label="Posicionar logo"
            onClick={placeLogoFromClick}
          />
        ) : null}
        <button
          type="button"
          className={cn(
            'absolute z-10 flex items-center justify-center rounded-full bg-overlay/55 p-2.5 text-text',
            active ? 'bottom-2 left-2' : 'left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2',
            (picking || placingLogo) && 'pointer-events-none opacity-0',
          )}
          onClick={() => onPlayingChange(!active)}
          aria-label={active ? 'Pausar' : 'Assistir'}
        >
          {active ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        {picking ? (
          <p className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-overlay/70 px-3 py-1 text-[11px] text-text">
            Clique na pessoa para definir o foco
          </p>
        ) : null}
        {placingLogo ? (
          <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-overlay/70 px-3 py-1 text-[11px] text-text">
            Clique para posicionar a logo
          </p>
        ) : null}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        aria-label="Posição do trecho"
        className="w-full accent-accent"
        onChange={(event) => {
          const video = videoRef.current
          if (!video) return
          const next = start + Number(event.target.value) * duration
          video.currentTime = next
          if (splitRef.current) splitRef.current.currentTime = next
          setCurrent(next)
        }}
      />
      <p className="text-[11px] tabular-nums text-muted-2">
        {formatClipLength(Math.max(0, current - start))} / {formatClipLength(duration)}
        <span className="ml-2">{formatShortsTimecode(start)} → {formatShortsTimecode(end)}</span>
      </p>
    </div>
  )
}
