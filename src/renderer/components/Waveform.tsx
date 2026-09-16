import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { MusicSegment } from '@shared/musicAnalysis'
import { cn } from '../lib/utils'

export function Waveform({
  peaks,
  duration,
  cuts,
  selectedId,
  playhead,
  onSelect,
  onChangeCut,
}: {
  peaks: number[]
  duration: number
  cuts: MusicSegment[]
  selectedId: string | null
  playhead: number
  onSelect: (id: string, time: number) => void
  onChangeCut: (id: string, start: number, end: number) => void
}) {
  const canvasWrap = useRef<HTMLDivElement>(null)
  const bars = useMemo(() => {
    const max = Math.max(0.0001, ...peaks)
    return peaks.map((value) => value / max)
  }, [peaks])

  function timeFromClientX(clientX: number) {
    const rect = canvasWrap.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  function beginDrag(cut: MusicSegment, edge: 'start' | 'end' | 'move', event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    onSelect(cut.id, edge === 'end' ? cut.end : cut.start)
    const originX = event.clientX
    const originStart = cut.start
    const originEnd = cut.end

    function onMove(moveEvent: PointerEvent) {
      const time = timeFromClientX(moveEvent.clientX)
      if (edge === 'start') {
        onChangeCut(cut.id, Math.min(time, originEnd - 0.08), originEnd)
        return
      }
      if (edge === 'end') {
        onChangeCut(cut.id, originStart, Math.max(time, originStart + 0.08))
        return
      }
      const delta = timeFromClientX(moveEvent.clientX) - timeFromClientX(originX)
      const length = originEnd - originStart
      const start = Math.max(0, Math.min(duration - length, originStart + delta))
      onChangeCut(cut.id, start, start + length)
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={canvasWrap}
      className="relative h-[148px] w-full overflow-hidden rounded-2xl border border-border bg-[#0b1318]"
      onPointerDown={(event) => {
        const time = timeFromClientX(event.clientX)
        const hit = [...cuts].reverse().find((cut) => time >= cut.start && time <= cut.end)
        if (hit) onSelect(hit.id, time)
      }}
    >
      <div className="absolute inset-0 flex items-center gap-px px-1">
        {bars.map((value, index) => (
          <div
            key={index}
            className="min-w-px flex-1 rounded-full bg-accent/55"
            style={{ height: `${Math.max(6, value * 88)}%` }}
          />
        ))}
      </div>

      {cuts.map((cut) => {
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
            onPointerDown={(event) => beginDrag(cut, 'move', event)}
          >
            <button
              type="button"
              aria-label="Início do corte"
              className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-lg bg-accent"
              onPointerDown={(event) => beginDrag(cut, 'start', event)}
            />
            <button
              type="button"
              aria-label="Fim do corte"
              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-lg bg-accent"
              onPointerDown={(event) => beginDrag(cut, 'end', event)}
            />
          </div>
        )
      })}

      <div
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-white"
        style={{ left: `${duration > 0 ? (playhead / duration) * 100 : 0}%` }}
      />
    </div>
  )
}
