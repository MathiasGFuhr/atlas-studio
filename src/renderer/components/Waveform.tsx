import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import type { MusicSegment } from '@shared/musicAnalysis'
import { formatTimecode } from '@shared/musicAnalysis'
import { getCutMarkers, type CutMarker } from '@shared/audio/audioCutService'
import { timeFromClientX } from '@shared/audio/playback'
import { cn } from '../lib/utils'

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

export function Waveform({
  peaks,
  duration,
  cuts,
  selectedId,
  playhead,
  zoom,
  onSeek,
  onSelect,
  onChangeCut,
  onCommitCut,
  onMoveMarker,
  onCommitMarker,
  onZoom,
  onBeginGesture,
}: {
  peaks: number[]
  duration: number
  cuts: MusicSegment[]
  selectedId: string | null
  playhead: number
  zoom: number
  onSeek: (time: number) => void
  onSelect: (id: string | null, time: number) => void
  onChangeCut: (id: string, start: number, end: number) => void
  onCommitCut: () => void
  onMoveMarker: (marker: CutMarker, time: number) => void
  onCommitMarker: () => void
  onZoom: (next: number) => void
  onBeginGesture: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasWrap = useRef<HTMLDivElement>(null)
  const [dragTip, setDragTip] = useState<{ time: number; x: number } | null>(null)
  const bars = useMemo(() => {
    const sampled = downsamplePeaks(peaks, 640)
    const max = Math.max(0.0001, ...sampled)
    return sampled.map((value) => value / max)
  }, [peaks])
  const markers = useMemo(() => getCutMarkers(cuts, duration), [cuts, duration])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || zoom <= 1 || duration <= 0) return
    const x = (playhead / duration) * viewport.scrollWidth
    const view = viewport.clientWidth
    if (x < viewport.scrollLeft + 32 || x > viewport.scrollLeft + view - 32) {
      viewport.scrollLeft = Math.max(0, x - view / 2)
    }
  }, [playhead, zoom, duration])

  function resolveTime(clientX: number) {
    return timeFromClientX(clientX, canvasWrap.current?.getBoundingClientRect() ?? null, duration)
  }

  function beginHandleDrag(cut: MusicSegment, edge: 'start' | 'end' | 'move', event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    onBeginGesture()
    const clickTime = resolveTime(event.clientX)
    onSelect(cut.id, clickTime)
    onSeek(clickTime)
    const originX = event.clientX
    const originStart = cut.start
    const originEnd = cut.end

    function onMove(moveEvent: PointerEvent) {
      const time = resolveTime(moveEvent.clientX)
      setDragTip({ time, x: moveEvent.clientX })
      if (edge === 'start') {
        onChangeCut(cut.id, Math.min(time, originEnd - 0.08), originEnd)
        return
      }
      if (edge === 'end') {
        onChangeCut(cut.id, originStart, Math.max(time, originStart + 0.08))
        return
      }
      const delta = resolveTime(moveEvent.clientX) - resolveTime(originX)
      const length = originEnd - originStart
      const start = Math.max(0, Math.min(duration - length, originStart + delta))
      onChangeCut(cut.id, start, start + length)
    }

    function onUp() {
      setDragTip(null)
      onCommitCut()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function beginMarkerDrag(marker: CutMarker, event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    onBeginGesture()
    onSelect(marker.rightId ?? marker.leftId, marker.time)
    onSeek(marker.time)

    function onMove(moveEvent: PointerEvent) {
      const time = resolveTime(moveEvent.clientX)
      setDragTip({ time, x: moveEvent.clientX })
      onMoveMarker(marker, time)
    }

    function onUp() {
      setDragTip(null)
      onCommitMarker()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const direction = event.deltaY < 0 ? 1 : -1
    onZoom(Math.min(8, Math.max(1, Number((zoom + direction * 0.25).toFixed(2)))))
  }

  return (
    <div
      ref={viewportRef}
      className="relative h-[148px] w-full overflow-x-auto overflow-y-hidden rounded-2xl border border-border bg-[#0b1318]"
      onWheel={onWheel}
    >
      <div
        ref={canvasWrap}
        className="relative h-full min-w-full overflow-hidden"
        style={{ width: `${Math.max(100, zoom * 100)}%` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const time = resolveTime(event.clientX)
          const hit = [...cuts].reverse().find((cut) => time >= cut.start && time <= cut.end)
          onSelect(hit?.id ?? selectedId, time)
          onSeek(time)
        }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {bars.map((value, index) => (
            <div
              key={index}
              className="absolute top-1/2 rounded-[1px] bg-accent/55"
              style={{
                left: `${(index / bars.length) * 100}%`,
                width: `${100 / bars.length}%`,
                height: `${value < 0.045 ? Math.max(2, value * 40) : Math.max(8, value * 88)}%`,
                transform: 'translateY(-50%)',
              }}
            />
          ))}
        </div>

        {cuts.map((cut, index) => {
          const left = duration > 0 ? (cut.start / duration) * 100 : 0
          const width = duration > 0 ? ((cut.end - cut.start) / duration) * 100 : 0
          const selected = cut.id === selectedId
          return (
            <div
              key={cut.id}
              className={cn(
                'absolute top-2 bottom-2 rounded-lg border',
                selected ? 'border-accent bg-accent/20' : 'border-white/15 bg-white/5',
              )}
              style={{ left: `${left}%`, width: `${Math.max(0.6, width)}%` }}
              onPointerDown={(event) => beginHandleDrag(cut, 'move', event)}
            >
              <span className="pointer-events-none absolute left-3 top-1 truncate text-[10px] font-medium uppercase tracking-wide text-white/70">
                {cut.label || `Trecho ${index + 1}`}
              </span>
              <button
                type="button"
                aria-label="Alça esquerda"
                title="Arraste para ajustar o início"
                className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-lg bg-accent"
                onPointerDown={(event) => beginHandleDrag(cut, 'start', event)}
              />
              <button
                type="button"
                aria-label="Alça direita"
                title="Arraste para ajustar o fim"
                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-lg bg-accent"
                onPointerDown={(event) => beginHandleDrag(cut, 'end', event)}
              />
            </div>
          )
        })}

        {markers.map((marker) => (
          <button
            key={`${marker.leftId}-${marker.rightId}-${marker.time}`}
            type="button"
            title={`Marcador ${formatTimecode(marker.time)}`}
            aria-label={`Ponto de corte ${formatTimecode(marker.time)}`}
            className="absolute top-0 bottom-0 z-10 w-2 -translate-x-1/2 cursor-ew-resize bg-white/80 hover:bg-white"
            style={{ left: `${duration > 0 ? (marker.time / duration) * 100 : 0}%` }}
            onPointerDown={(event) => beginMarkerDrag(marker, event)}
          />
        ))}

        <div
          className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]"
          style={{ left: `${duration > 0 ? (playhead / duration) * 100 : 0}%` }}
        />
      </div>

      {dragTip ? (
        <div
          className="pointer-events-none absolute top-2 z-30 rounded-md bg-black/80 px-2 py-1 text-[11px] font-medium text-white"
          style={{
            left: Math.min(
              Math.max(8, dragTip.x - (viewportRef.current?.getBoundingClientRect().left ?? 0) - 36),
              (viewportRef.current?.clientWidth ?? 120) - 80,
            ),
          }}
        >
          {formatTimecode(dragTip.time)}
        </div>
      ) : null}
    </div>
  )
}
