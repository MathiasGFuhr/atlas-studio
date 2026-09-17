import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { ShortsAspectMode } from '@shared/shorts'
import { formatShortsTimecode } from '@shared/shorts'
import { formatClipLength } from '@shared/shortsDuration'
import { buildShortsPreviewFrame } from '@shared/shortsExport'
import { cn } from '../../lib/utils'

export function ShortsClipPreview({
  clipId,
  src,
  start,
  end,
  aspectMode,
  sourceWidth,
  sourceHeight,
  active,
  onPlayingChange,
  resetToken,
  className,
}: {
  clipId?: string
  src: string | null
  start: number
  end: number
  aspectMode: ShortsAspectMode
  sourceWidth: number
  sourceHeight: number
  active: boolean
  onPlayingChange: (playing: boolean) => void
  resetToken?: string
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const windowRef = useRef({ start, end })
  const [current, setCurrent] = useState(start)
  const duration = Math.max(0.1, end - start)
  const frame = buildShortsPreviewFrame(sourceWidth || 1920, sourceHeight || 1080, aspectMode)
  const previewKey = resetToken ?? `${clipId ?? 'clip'}:${start}:${end}`
  windowRef.current = { start, end }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const apply = () => {
      const from = windowRef.current.start
      video.currentTime = from
      setCurrent(from)
    }
    if (video.readyState >= 1) apply()
    video.addEventListener('loadedmetadata', apply)
    return () => video.removeEventListener('loadedmetadata', apply)
  }, [src, previewKey])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (video.currentTime < start || video.currentTime > end) {
      video.currentTime = start
      setCurrent(start)
    }
  }, [clipId, start, end])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (active) {
      if (video.currentTime < start || video.currentTime >= end - 0.04) video.currentTime = start
      void video.play().catch(() => undefined)
      return
    }
    video.pause()
  }, [active, start, end])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    function onTime() {
      const node = videoRef.current
      if (!node) return
      const window = windowRef.current
      setCurrent(node.currentTime)
      if (node.currentTime >= window.end - 0.04) {
        node.pause()
        node.currentTime = window.end
        if (active) onPlayingChange(false)
      }
    }
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [active, onPlayingChange])

  const progress = Math.max(0, Math.min(1, (current - start) / duration))

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className="relative overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: String(frame.aspectRatio) }}
      >
        {src ? (
          <video
            ref={videoRef}
            src={src}
            preload="metadata"
            playsInline
            className="absolute max-h-none max-w-none bg-black"
            style={{
              width: `${frame.videoWidthPct}%`,
              height: `${frame.videoHeightPct}%`,
              left: `${frame.videoLeftPct}%`,
              top: `${frame.videoTopPct}%`,
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: 'fill',
            }}
            onClick={() => onPlayingChange(!active)}
          />
        ) : (
          <div className="absolute inset-0 bg-card-2" />
        )}
        <button
          type="button"
          className={cn(
            'absolute z-10 flex items-center justify-center rounded-full bg-black/55 p-2.5 text-white',
            active ? 'bottom-2 left-2' : 'left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2',
          )}
          onClick={() => onPlayingChange(!active)}
          aria-label={active ? 'Pausar' : 'Assistir'}
        >
          {active ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
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
