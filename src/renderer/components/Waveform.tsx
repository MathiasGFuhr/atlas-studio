import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { AudioLines, Captions, Trash2 } from 'lucide-react'
import type { MusicCaption, MusicSegment } from '@shared/musicAnalysis'
import { formatTimecode } from '@shared/musicAnalysis'
import { findCutAtTime, getCutMarkers, type CutMarker } from '@shared/audio/audioCutService'
import { timeFromClientX } from '@shared/audio/playback'
import { cn } from '../lib/utils'

const RULER_H = 'h-10'
const CAPTION_H = 'h-14'
const WAVE_H = 'h-[132px]'
const RULER_PX = 40
const CAPTION_PX = 56

function downsamplePeaks(peaks: number[], maxBars: number): number[] {
  if (peaks.length <= maxBars) return peaks
  const out = new Array(maxBars).fill(0)
  const step = peaks.length / maxBars
  for (let i = 0; i < peaks.length; i += 1) {
    const idx = Math.min(maxBars - 1, Math.floor(i / step))
    const value = peaks[i] ?? 0
    if (value > out[idx]) out[idx] = value
  }
  return out
}

function formatRulerTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function PlayheadCap() {
  return (
    <svg width="11" height="14" viewBox="0 0 11 14" aria-hidden className="block">
      <path d="M1.2 0h8.6c.66 0 1.2.5 1.2 1.1V7.2L5.5 14 0 7.2V1.1C0 .5.54 0 1.2 0Z" fill="#fff" />
    </svg>
  )
}

export function Waveform({
  peaks,
  duration,
  cuts,
  captions = [],
  selectedId,
  playhead,
  zoom,
  trackName,
  flash,
  onSeek,
  onSelect,
  onDeleteCut,
  onChangeCut: _onChangeCut,
  onCommitCut: _onCommitCut,
  onMoveMarker,
  onCommitMarker,
  onZoom,
  onBeginGesture,
}: {
  peaks: number[]
  duration: number
  cuts: MusicSegment[]
  captions?: MusicCaption[]
  selectedId: string | null
  playhead: number
  zoom: number
  trackName?: string
  flash?: boolean
  onSeek: (time: number) => void
  onSelect: (id: string | null, time: number) => void
  onDeleteCut?: (id: string) => void
  onChangeCut: (id: string, start: number, end: number) => void
  onCommitCut: () => void
  onMoveMarker: (marker: CutMarker, time: number) => void
  onCommitMarker: () => void
  onZoom: (next: number) => void
  onBeginGesture: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasWrap = useRef<HTMLDivElement>(null)
  const waveBoxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [laneWidth, setLaneWidth] = useState(0)
  const [dragTip, setDragTip] = useState<{ time: number; x: number; y: number } | null>(null)
  const markers = useMemo(() => getCutMarkers(cuts, duration), [cuts, duration])
  const selected = cuts.find((cut) => cut.id === selectedId) ?? null

  const ticks = useMemo(() => {
    if (duration <= 0 || laneWidth <= 0) return [] as Array<{ time: number; major: boolean }>
    const pxPerSec = laneWidth / duration
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
    let major = steps[steps.length - 1]
    for (const step of steps) {
      if (step * pxPerSec >= 84) {
        major = step
        break
      }
    }
    const minorMs = Math.max(1, Math.round((major / 4) * 1000))
    const majorMs = Math.max(minorMs, Math.round(major * 1000))
    const endMs = Math.round(duration * 1000)
    const out: Array<{ time: number; major: boolean }> = []
    for (let ms = 0; ms <= endMs; ms += minorMs) {
      out.push({ time: ms / 1000, major: ms % majorMs === 0 })
    }
    return out
  }, [duration, laneWidth])

  useEffect(() => {
    const box = waveBoxRef.current
    if (!box) return
    const measure = () => setLaneWidth(box.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [zoom])

  useEffect(() => {
    const box = waveBoxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas || laneWidth <= 0) return
    const width = box.clientWidth
    const height = box.clientHeight
    if (width < 2 || height < 2 || duration <= 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const columns = downsamplePeaks(peaks, Math.max(48, Math.floor(width / 2)))
    const max = Math.max(0.0001, ...columns)
    const mid = height / 2
    const colW = width / Math.max(1, columns.length)

    const paint = (from: number, to: number, color: string) => {
      ctx.fillStyle = color
      const i0 = Math.max(0, Math.floor((from / duration) * columns.length))
      const i1 = Math.min(columns.length, Math.ceil((to / duration) * columns.length))
      for (let i = i0; i < i1; i += 1) {
        const value = (columns[i] ?? 0) / max
        const barH = Math.max(2, value * height * 0.78)
        ctx.fillRect(i * colW, mid - barH / 2, Math.max(1, colW * 0.7), barH)
      }
    }

    paint(0, duration, '#6fd0ee')
    if (selected) paint(selected.start, selected.end, '#f2fcff')

    ctx.fillStyle = 'rgba(8, 10, 12, 0.88)'
    for (const marker of markers) {
      const x = (marker.time / duration) * width
      ctx.fillRect(x - 1.5, 0, 3, height)
    }

    const fade = ctx.createLinearGradient(0, 0, 0, 22)
    fade.addColorStop(0, 'rgba(10, 32, 42, 0.55)')
    fade.addColorStop(1, 'rgba(10, 32, 42, 0)')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, width, 22)
  }, [cuts, duration, laneWidth, markers, peaks, selected])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || zoom <= 1 || duration <= 0) return
    const x = (playhead / duration) * viewport.scrollWidth
    const view = viewport.clientWidth
    if (x < viewport.scrollLeft + 40 || x > viewport.scrollLeft + view - 40) {
      viewport.scrollLeft = Math.max(0, x - view / 2)
    }
  }, [playhead, zoom, duration])

  const stopDragRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopDragRef.current?.(), [])

  function resolveTime(clientX: number) {
    return timeFromClientX(clientX, canvasWrap.current?.getBoundingClientRect() ?? null, duration)
  }

  function trackDrag(onMove: (event: PointerEvent) => void, onEnd: () => void) {
    stopDragRef.current?.()
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (stopDragRef.current === stop) stopDragRef.current = null
    }
    const finish = () => {
      stop()
      onEnd()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    stopDragRef.current = stop
  }

  function beginScrub(event: ReactPointerEvent, selectCut: boolean) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const time = resolveTime(event.clientX)
    if (selectCut) {
      const hit = [...cuts].reverse().find((cut) => time >= cut.start && time <= cut.end)
      onSelect(hit?.id ?? selectedId, time)
    }
    onSeek(time)
    setDragTip({ time, x: event.clientX, y: event.clientY })

    trackDrag(
      (moveEvent) => {
        const next = resolveTime(moveEvent.clientX)
        onSeek(next)
        setDragTip({ time: next, x: moveEvent.clientX, y: moveEvent.clientY })
      },
      () => setDragTip(null),
    )
  }

  function beginMarkerDrag(marker: CutMarker, event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    onBeginGesture()
    onSelect(marker.rightId ?? marker.leftId, marker.time)
    onSeek(marker.time)

    function onMove(moveEvent: PointerEvent) {
      const time = resolveTime(moveEvent.clientX)
      setDragTip({ time, x: moveEvent.clientX, y: moveEvent.clientY })
      onMoveMarker(marker, time)
    }

    trackDrag(onMove, () => {
      setDragTip(null)
      onCommitMarker()
    })
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const direction = event.deltaY < 0 ? 1 : -1
      onZoom(Math.min(8, Math.max(1, Number((zoom + direction * 0.25).toFixed(2)))))
      return
    }
    const viewport = viewportRef.current
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth + 2) return
    if (zoom <= 1 && Math.abs(event.deltaX) < 1) return
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    viewport.scrollLeft += delta
  }

  const showCaptions = captions.length > 0
  const waveTop = RULER_PX + (showCaptions ? CAPTION_PX : 0)
  const playheadLeft = duration > 0 ? (playhead / duration) * 100 : 0
  const pendingCut = useMemo(() => {
    if (duration <= 0) return null
    const origin = markers.reduce((last, marker) => (marker.time <= playhead + 0.001 ? marker.time : last), 0)
    return { origin, seconds: Math.max(0, playhead - origin) }
  }, [duration, markers, playhead])
  const pendingLabelOnLeft = playheadLeft > 78

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141414] text-white select-none">
      <div className="flex">
        <div className="flex w-[72px] shrink-0 flex-col border-r border-white/10 bg-[#1b1b1b] text-white/55">
          <div className={cn(RULER_H, 'border-b border-white/10')} />
          {showCaptions ? (
            <div className={cn(CAPTION_H, 'flex flex-col items-center justify-center gap-1 border-b border-white/10')} title="Legenda">
              <Captions className="h-4 w-4 text-[#f3e6c8]" />
              <span className="text-[10px] tracking-wide">Letra</span>
            </div>
          ) : null}
          <div className={cn(WAVE_H, 'flex flex-col items-center justify-center gap-1')} title="Áudio">
            <AudioLines className="h-4 w-4 text-[#7fd0ee]" />
            <span className="text-[10px] tracking-wide">Áudio</span>
          </div>
        </div>

        <div
          ref={viewportRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onWheel={onWheel}
        >
          <div
            ref={canvasWrap}
            className="relative min-w-full"
            style={{ width: `${Math.max(100, zoom * 100)}%` }}
          >
            <div
              className={cn(RULER_H, 'relative cursor-ew-resize border-b border-white/10 bg-[#1c1c1c]')}
              onPointerDown={(event) => beginScrub(event, false)}
            >
              {ticks.map((tick) => (
                <div
                  key={tick.time}
                  className="absolute bottom-0"
                  style={{ left: `${duration > 0 ? (tick.time / duration) * 100 : 0}%` }}
                >
                  {tick.major ? (
                    <span
                      className="absolute bottom-3 whitespace-nowrap font-mono text-[11px] text-white/70"
                      style={{ transform: tick.time === 0 ? 'translateX(4px)' : 'translateX(-50%)' }}
                    >
                      {formatRulerTime(tick.time)}
                    </span>
                  ) : null}
                  <span
                    className={cn('absolute bottom-0 block w-px bg-white/25', tick.major ? 'h-2' : 'h-1')}
                  />
                </div>
              ))}
            </div>

            {showCaptions ? (
              <div
                className={cn(CAPTION_H, 'relative cursor-ew-resize border-b border-white/10 bg-[#121212]')}
                onPointerDown={(event) => beginScrub(event, false)}
              >
                {captions.map((caption, index) => {
                  const active = playhead >= caption.start && playhead < caption.end
                  const left = duration > 0 ? (caption.start / duration) * 100 : 0
                  const width = duration > 0 ? ((caption.end - caption.start) / duration) * 100 : 0
                  const widthPx = duration > 0 ? ((caption.end - caption.start) / duration) * laneWidth : 0
                  return (
                    <button
                      key={`${caption.start}-${caption.end}-${index}`}
                      type="button"
                      title={caption.text}
                      className={cn(
                        'absolute top-2 bottom-2 overflow-hidden rounded-md px-2 text-left text-[13px] leading-8 font-medium text-[#f6efe2]',
                        active ? 'z-10 bg-[#6a5738]' : 'bg-[#3c3428] hover:bg-[#4a4032]',
                      )}
                      style={{
                        left: `calc(${left}% + ${index > 0 ? 2 : 0}px)`,
                        width: `max(4px, calc(${width}% - ${index > 0 ? 2 : 0}px))`,
                        boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.85)' : undefined,
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        const hit = findCutAtTime(cuts, caption.start)
                        if (hit) onSelect(hit.id, caption.start)
                        onSeek(caption.start)
                      }}
                    >
                      {widthPx >= 72 ? <span className="block truncate">{caption.text}</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}

            <div
              className={cn(WAVE_H, 'relative cursor-ew-resize bg-[#121212]')}
              onPointerDown={(event) => beginScrub(event, true)}
            >
              <div ref={waveBoxRef} className="pointer-events-none absolute inset-x-1 top-1.5 bottom-1.5 overflow-hidden rounded-md bg-[#114861]">
                <canvas ref={canvasRef} className="block h-full w-full" />
                {trackName ? (
                  <div className="absolute inset-x-0 top-0 truncate px-3 pt-2 text-sm font-medium text-white/90">
                    {trackName}
                  </div>
                ) : null}
              </div>
              {duration > 0
                ? cuts.map((cut) => {
                    const isSelected = cut.id === selectedId
                    const left = (cut.start / duration) * 100
                    const width = ((cut.end - cut.start) / duration) * 100
                    const widthPx = ((cut.end - cut.start) / duration) * laneWidth
                    return (
                      <div
                        key={cut.id}
                        className={cn(
                          'pointer-events-none absolute top-1.5 bottom-1.5 z-10 rounded-md',
                          isSelected
                            ? 'ring-1 ring-white/80 bg-white/10'
                            : 'ring-1 ring-white/15 hover:ring-white/35',
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        {widthPx >= 64 ? (
                          <span
                            className={cn(
                              'pointer-events-none absolute bottom-1.5 left-2 max-w-[calc(100%-0.75rem)] truncate rounded px-1.5 py-0.5 text-[10px] font-medium',
                              isSelected
                                ? 'bg-black/55 text-white'
                                : 'bg-black/35 text-white/80',
                            )}
                          >
                            {cut.label}
                          </span>
                        ) : null}
                        {isSelected && onDeleteCut ? (
                          <button
                            type="button"
                            title="Remover corte (Delete)"
                            aria-label={`Remover ${cut.label}`}
                            className="pointer-events-auto absolute top-1.5 right-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white/90 transition-colors hover:bg-danger/80 hover:text-white"
                            onPointerDown={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                            }}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              onDeleteCut(cut.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    )
                  })
                : null}
            </div>

            {pendingCut && duration > 0 && pendingCut.seconds > 0.05 ? (
              <div
                className="pointer-events-none absolute z-30 bg-white/15"
                style={{
                  top: waveTop,
                  height: 10,
                  left: `${(pendingCut.origin / duration) * 100}%`,
                  width: `${(pendingCut.seconds / duration) * 100}%`,
                }}
              />
            ) : null}

            {markers.map((marker) => (
              <button
                key={`${marker.leftId}-${marker.rightId}-${marker.time}`}
                type="button"
                title={`Marcador ${formatTimecode(marker.time)}`}
                aria-label={`Ponto de corte ${formatTimecode(marker.time)}`}
                className="absolute bottom-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize"
                style={{
                  top: waveTop,
                  left: `${duration > 0 ? (marker.time / duration) * 100 : 0}%`,
                }}
                onPointerDown={(event) => beginMarkerDrag(marker, event)}
              >
                <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/80" />
              </button>
            ))}

            <div
              role="slider"
              aria-label="Indicador de reprodução"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration * 1000)}
              aria-valuenow={Math.round(playhead * 1000)}
              aria-valuetext={formatTimecode(playhead)}
              tabIndex={-1}
              className="absolute top-0 bottom-0 z-40 w-4 -translate-x-1/2 cursor-ew-resize"
              style={{ left: `${playheadLeft}%` }}
              onPointerDown={(event) => beginScrub(event, false)}
            >
              <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2">
                <PlayheadCap />
              </div>
              <div
                className={cn(
                  'pointer-events-none absolute top-3 bottom-0 left-1/2 w-px -translate-x-1/2 bg-white',
                  flash && 'shadow-[0_0_12px_2px_rgba(255,255,255,0.95)]',
                )}
              />
              {pendingCut && pendingCut.seconds > 0.05 ? (
                <div
                  className={cn(
                    'pointer-events-none absolute bottom-4 z-50 whitespace-nowrap rounded-md bg-white px-2 py-1 font-mono text-xs font-semibold text-[#141414] shadow',
                    pendingLabelOnLeft ? 'right-3' : 'left-3',
                  )}
                  title="Duração do corte, do último corte até o indicador"
                >
                  {formatTimecode(pendingCut.seconds)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {dragTip ? (
        <div
          className="pointer-events-none fixed z-50 -translate-y-full rounded-md bg-black/85 px-1.5 py-0.5 font-mono text-[10px] text-white"
          style={{ left: dragTip.x + 14, top: dragTip.y - 8 }}
        >
          {formatTimecode(dragTip.time)}
        </div>
      ) : null}
    </div>
  )
}
