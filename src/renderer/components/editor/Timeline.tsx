import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Eye, EyeOff, Film, GripVertical, Lock, Music2, Sparkles, Trash2, Type, Unlock, Volume2, VolumeX } from 'lucide-react'
import {
  formatDuration,
  type EditorAsset,
  type EditorClip,
  type EditorTimeline,
  type EditorTrack,
  type EditorTrackKind,
} from '@shared/editor/types'
import {
  addTrack,
  clipDuration,
  clipEnd,
  findClip,
  findTrack,
  moveClip,
  moveTrack,
  removeTrack,
  snapCandidates,
  snapClipStart,
  snapTime,
  timelineDuration,
  trimClip,
  updateTrack,
} from '@shared/editor/timelineOps'
import type { PlaybackStore } from '../../lib/editor/playbackStore'
import { EDITOR_ASSET_DRAG_TYPE, EDITOR_EFFECT_DRAG_TYPE } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'
import { TimelineClipView } from './TimelineClipView'

export const TIMELINE_MIN_ZOOM = 2
export const TIMELINE_MAX_ZOOM = 400
export const TIMELINE_HEADER_WIDTH = 176

const RULER_HEIGHT = 28
const ROW_HEIGHT: Record<EditorTrackKind, number> = { video: 72, audio: 52, effect: 40, text: 40 }
const SNAP_PX = 8
const DRAG_THRESHOLD_PX = 3
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

type DragMode = 'move' | 'trim-start' | 'trim-end'

type DragState = {
  mode: DragMode
  origin: EditorClip
  base: EditorTimeline
  pointerX: number
  pointerY: number
  candidates: number[]
  started: boolean
  /** Soltar na área vazia acima das faixas → cria linha nova no topo. */
  newTrackAbove: boolean
}

type DropHint = { trackId: string | null; time: number; zone?: 'top' | 'bottom' }

type MarqueeState = {
  x1: number
  y1: number
  x2: number
  y2: number
  additive: boolean
  baseIds: string[]
}

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function clipIdsInClientRect(
  root: HTMLElement,
  box: { left: number; top: number; right: number; bottom: number },
): string[] {
  const ids: string[] = []
  for (const node of root.querySelectorAll('[data-clip-id]')) {
    const id = node.getAttribute('data-clip-id')
    if (!id) continue
    const rect = node.getBoundingClientRect()
    if (rectsIntersect(box, rect)) ids.push(id)
  }
  return ids
}

function Playhead({ store, zoom, onScrubStart }: {
  store: PlaybackStore
  zoom: number
  onScrubStart: (event: ReactPointerEvent) => void
}) {
  const time = useSyncExternalStore(store.subscribe, store.getTime)
  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-30 overflow-hidden"
      style={{ left: TIMELINE_HEADER_WIDTH, right: 0 }}
    >
      <div
        className="absolute bottom-0 top-0"
        style={{ transform: `translateX(${time * zoom}px)` }}
      >
        {/* Área larga em toda a altura — arrasta o playhead de qualquer ponto da linha */}
        <div
          onPointerDown={onScrubStart}
          title="Arrastar playhead"
          className="pointer-events-auto absolute -left-2 bottom-0 top-0 z-10 w-4 cursor-ew-resize"
        />
        <div className="pointer-events-none absolute -left-[6px] top-0 h-3.5 w-3 rounded-b-sm bg-accent" />
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-px bg-accent" />
      </div>
    </div>
  )
}

function Ruler({ zoom, from, to }: { zoom: number; from: number; to: number }) {
  const major = RULER_STEPS.find((step) => step * zoom >= 80) ?? RULER_STEPS[RULER_STEPS.length - 1]
  const minor = (major * zoom) / 5 >= 8 ? major / 5 : major / 2
  const ticks: Array<{ time: number; isMajor: boolean }> = []
  const start = Math.max(0, Math.floor(from / minor) * minor)
  for (let time = start; time <= to + minor; time += minor) {
    const rounded = Math.round(time * 1000) / 1000
    ticks.push({ time: rounded, isMajor: Math.abs(rounded / major - Math.round(rounded / major)) < 1e-6 })
    if (ticks.length > 2000) break
  }
  return (
    <>
      {ticks.map((tick) => (
        <div
          key={tick.time}
          className="pointer-events-none absolute bottom-0"
          style={{ left: TIMELINE_HEADER_WIDTH + tick.time * zoom }}
        >
          <div className={cn('w-px bg-border-strong', tick.isMajor ? 'h-2.5' : 'h-1.5')} />
          {tick.isMajor ? (
            <span className="absolute bottom-3 left-1 whitespace-nowrap text-[10px] tabular-nums text-muted-2">
              {formatDuration(tick.time)}
            </span>
          ) : null}
        </div>
      ))}
    </>
  )
}

const TRACK_REORDER_DRAG_TYPE = 'application/x-atlas-track-reorder'

function TrackHeader({
  track,
  canRemove,
  clipCount,
  reorderHint,
  onPatch,
  onRemove,
  onReorderDragStart,
  onReorderDragOver,
  onReorderDrop,
  onReorderDragEnd,
}: {
  track: EditorTrack
  canRemove: boolean
  clipCount: number
  reorderHint: 'before' | 'after' | null
  onPatch: (patch: Partial<Pick<EditorTrack, 'muted' | 'locked' | 'hidden'>>) => void
  onRemove: () => void
  onReorderDragStart: (event: ReactDragEvent<HTMLElement>) => void
  onReorderDragOver: (event: ReactDragEvent<HTMLElement>) => void
  onReorderDrop: (event: ReactDragEvent<HTMLElement>) => void
  onReorderDragEnd: () => void
}) {
  const movable = track.kind !== 'audio'
  const Icon =
    track.kind === 'effect'
      ? Sparkles
      : track.kind === 'text'
        ? Type
        : track.kind === 'video'
          ? Film
          : Music2
  const button = 'flex h-6 w-6 items-center justify-center rounded-md text-muted-2 transition-colors hover:bg-hover hover:text-text'
  return (
    <div
      className="relative flex h-full items-center gap-1 border-r border-border-soft bg-sidebar px-1.5"
      title={movable ? undefined : 'Faixa de música fica fixa'}
      onDragOver={onReorderDragOver}
      onDrop={onReorderDrop}
      onDragEnd={onReorderDragEnd}
    >
      {reorderHint === 'before' ? (
        <span className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 rounded-full bg-accent" />
      ) : null}
      {reorderHint === 'after' ? (
        <span className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 rounded-full bg-accent" />
      ) : null}
      {movable ? (
        <button
          type="button"
          draggable
          title="Arraste para reordenar (música fica fixa)"
          aria-label={`Reordenar ${track.name}`}
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-2 hover:bg-hover hover:text-text active:cursor-grabbing"
          onDragStart={onReorderDragStart}
          onDragEnd={onReorderDragEnd}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          track.kind === 'effect'
            ? 'text-fuchsia-300'
            : track.kind === 'text'
              ? 'text-amber-300'
              : 'text-muted-2',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-text">{track.name}</p>
        <p className="text-[10px] text-muted-2">{clipCount} {clipCount === 1 ? 'clipe' : 'clipes'}</p>
      </div>
      {track.kind !== 'effect' && track.kind !== 'text' ? (
        <button
          type="button"
          title={track.muted ? 'Ativar som da faixa' : 'Silenciar faixa'}
          className={cn(button, track.muted && 'text-warning')}
          onClick={() => onPatch({ muted: !track.muted })}
        >
          {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      ) : null}
      {track.kind === 'video' || track.kind === 'effect' || track.kind === 'text' ? (
        <button
          type="button"
          title={track.hidden ? 'Mostrar faixa' : 'Ocultar faixa'}
          className={cn(button, track.hidden && 'text-warning')}
          onClick={() => onPatch({ hidden: !track.hidden })}
        >
          {track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      ) : null}
      <button
        type="button"
        title={track.locked ? 'Destravar faixa' : 'Travar faixa'}
        className={cn(button, track.locked && 'text-warning')}
        onClick={() => onPatch({ locked: !track.locked })}
      >
        {track.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>
      {canRemove ? (
        <button type="button" title="Remover faixa" className={cn(button, 'hover:text-danger')} onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export function Timeline({
  timeline,
  assets,
  store,
  zoom,
  onZoomChange,
  selectedIds,
  onSelect,
  snapping,
  onCommit,
  onDropAsset,
  onDropFiles,
  onDropEffect,
}: {
  timeline: EditorTimeline
  assets: Map<string, EditorAsset>
  store: PlaybackStore
  zoom: number
  onZoomChange: (zoom: number) => void
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  snapping: boolean
  onCommit: (next: EditorTimeline) => void
  onDropAsset: (assetId: string, trackId: string | null, time: number) => void
  onDropFiles: (files: File[], trackId: string | null, time: number) => void
  onDropEffect?: (effectId: string, trackId: string | null, time: number) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const topDropRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const dragRef = useRef<DragState | null>(null)
  const draftRef = useRef<EditorTimeline | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const marqueeActiveRef = useRef(false)
  const anchorRef = useRef<{ time: number; offset: number } | null>(null)
  const prevZoomRef = useRef(zoom)
  const [draft, setDraft] = useState<EditorTimeline | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewWidth, setViewWidth] = useState(800)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)
  const [reorderDragId, setReorderDragId] = useState<string | null>(null)
  const [reorderHint, setReorderHint] = useState<{ overId: string; edge: 'before' | 'after' } | null>(null)
  const scrollRafRef = useRef(0)
  const pendingScrollLeftRef = useRef(0)

  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const snappingRef = useRef(snapping)
  snappingRef.current = snapping
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit

  const view = draft ?? timeline
  const duration = timelineDuration(view)
  const laneWidth = Math.max(duration + 10, (viewWidth - TIMELINE_HEADER_WIDTH) / Math.max(zoom, 0.001)) * zoom
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const clipsByTrack = useMemo(() => {
    const map = new Map<string, EditorClip[]>()
    for (const clip of view.clips) {
      const list = map.get(clip.trackId) ?? []
      list.push(clip)
      map.set(clip.trackId, list)
    }
    return map
  }, [view.clips])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const measure = () => setViewWidth(node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const timeFromClientX = useCallback((clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, (clientX - rect.left - TIMELINE_HEADER_WIDTH) / zoomRef.current)
  }, [])

  const trackAtClientY = useCallback((clientY: number): string | null => {
    for (const [trackId, node] of rowRefs.current) {
      const rect = node.getBoundingClientRect()
      if (clientY >= rect.top && clientY < rect.bottom) return trackId
    }
    return null
  }, [])

  const isAboveTracks = useCallback((clientY: number) => {
    const zone = topDropRef.current
    if (!zone) return false
    const rect = zone.getBoundingClientRect()
    return clientY >= rect.top && clientY < rect.bottom
  }, [])

  // Ctrl + roda = zoom ancorado no mouse. Precisa de listener nativo para poder cancelar o scroll.
  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      const visible = Math.max(1, node.clientWidth - TIMELINE_HEADER_WIDTH)
      const offset = Math.min(visible, Math.max(0, event.clientX - rect.left - TIMELINE_HEADER_WIDTH))
      const time = (node.scrollLeft + offset) / zoomRef.current
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      const next = Math.max(TIMELINE_MIN_ZOOM, Math.min(TIMELINE_MAX_ZOOM, zoomRef.current * factor))
      if (next === zoomRef.current) return
      anchorRef.current = { time, offset }
      onZoomChange(next)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [onZoomChange])

  useLayoutEffect(() => {
    const node = scrollerRef.current
    if (!node) return

    const visible = Math.max(1, node.clientWidth - TIMELINE_HEADER_WIDTH)
    const anchor = anchorRef.current
    const prevZoom = prevZoomRef.current

    if (anchor) {
      anchorRef.current = null
      node.scrollLeft = Math.max(0, anchor.time * zoom - anchor.offset)
    } else if (prevZoom !== zoom && prevZoom > 0) {
      // Slider / +/- : mantém o centro da área visível no mesmo tempo.
      const centerTime = (node.scrollLeft + visible / 2) / prevZoom
      node.scrollLeft = Math.max(0, centerTime * zoom - visible / 2)
    }

    prevZoomRef.current = zoom
    const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth)
    if (node.scrollLeft > maxScroll) node.scrollLeft = maxScroll
    setScrollLeft(node.scrollLeft)
  }, [zoom, laneWidth])

  // Durante o play, a timeline acompanha o playhead.
  useEffect(
    () =>
      store.subscribe(() => {
        const node = scrollerRef.current
        if (!node || !store.isPlaying()) return
        const x = store.getTime() * zoomRef.current
        const visible = node.clientWidth - TIMELINE_HEADER_WIDTH
        if (x < node.scrollLeft || x > node.scrollLeft + visible - 24) {
          node.scrollLeft = Math.max(0, x - 48)
        }
      }),
    [store],
  )

  const startScrub = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      store.pause()
      store.seek(timeFromClientX(event.clientX))
      const move = (e: PointerEvent) => store.seek(timeFromClientX(e.clientX))
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [store, timeFromClientX],
  )

  /** Arrastar a área vazia embaixo das faixas move a timeline horizontalmente. */
  const startPan = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0) return
    const node = scrollerRef.current
    if (!node) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startScroll = node.scrollLeft
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const move = (e: PointerEvent) => {
      node.scrollLeft = Math.max(0, startScroll - (e.clientX - startX))
    }
    const up = (e: PointerEvent) => {
      try {
        target.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  const contentPointFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  /** Clique curto na área vazia: limpa seleção e busca. Arraste: seleção retangular. */
  const startMarqueeOrClick = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      event.stopPropagation()

      const additive = event.shiftKey || event.ctrlKey || event.metaKey
      const origin = contentPointFromClient(event.clientX, event.clientY)
      const baseIds = additive ? [...selectedIds] : []
      marqueeActiveRef.current = false
      marqueeRef.current = {
        x1: origin.x,
        y1: origin.y,
        x2: origin.x,
        y2: origin.y,
        additive,
        baseIds,
      }
      store.pause()

      const move = (e: PointerEvent) => {
        const state = marqueeRef.current
        const root = contentRef.current
        if (!state || !root) return
        const point = contentPointFromClient(e.clientX, e.clientY)
        const dx = Math.abs(point.x - state.x1)
        const dy = Math.abs(point.y - state.y1)
        if (!marqueeActiveRef.current) {
          if (dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return
          marqueeActiveRef.current = true
        }
        const next: MarqueeState = { ...state, x2: point.x, y2: point.y }
        marqueeRef.current = next
        setMarquee(next)

        const left = Math.min(e.clientX, event.clientX)
        const right = Math.max(e.clientX, event.clientX)
        const top = Math.min(e.clientY, event.clientY)
        const bottom = Math.max(e.clientY, event.clientY)
        const hit = clipIdsInClientRect(root, { left, top, right, bottom })
        if (next.additive) {
          const merged = new Set(next.baseIds)
          for (const id of hit) merged.add(id)
          onSelect([...merged])
        } else {
          onSelect(hit)
        }
      }

      const up = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const wasMarquee = marqueeActiveRef.current
        marqueeRef.current = null
        marqueeActiveRef.current = false
        setMarquee(null)
        if (!wasMarquee) {
          if (!additive) onSelect([])
          store.seek(timeFromClientX(e.clientX))
        }
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [contentPointFromClient, onSelect, selectedIds, store, timeFromClientX],
  )

  const handleClipPointerDown = useCallback(
    (event: ReactPointerEvent, clip: EditorClip, mode: DragMode) => {
      if (event.button !== 0) return
      event.stopPropagation()
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        onSelect(selectedIds.includes(clip.id) ? selectedIds.filter((id) => id !== clip.id) : [...selectedIds, clip.id])
        return
      }
      if (!selectedIds.includes(clip.id) || selectedIds.length > 1) onSelect([clip.id])
      const track = findTrack(timeline, clip.trackId)
      if (!track || track.locked) return
      event.preventDefault()

      dragRef.current = {
        mode,
        origin: clip,
        base: timeline,
        pointerX: event.clientX,
        pointerY: event.clientY,
        candidates: snapCandidates(timeline, clip.id, [store.getTime()]),
        started: false,
        newTrackAbove: false,
      }

      const move = (e: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        if (
          !drag.started &&
          Math.abs(e.clientX - drag.pointerX) < DRAG_THRESHOLD_PX &&
          Math.abs(e.clientY - drag.pointerY) < DRAG_THRESHOLD_PX
        ) {
          return
        }
        drag.started = true
        const currentZoom = zoomRef.current
        const dx = (e.clientX - drag.pointerX) / currentZoom
        const threshold = SNAP_PX / currentZoom
        const snap = snappingRef.current
        let next: EditorTimeline
        if (drag.mode === 'move') {
          let start = Math.max(0, drag.origin.start + dx)
          if (snap) start = snapClipStart(start, clipDuration(drag.origin), drag.candidates, threshold)
          const hitTrack = trackAtClientY(e.clientY)
          drag.newTrackAbove = !hitTrack && isAboveTracks(e.clientY)
          const trackId = hitTrack ?? drag.origin.trackId
          next = moveClip(drag.base, drag.origin.id, { start, trackId })
        } else if (drag.mode === 'trim-start') {
          drag.newTrackAbove = false
          let time = drag.origin.start + dx
          if (snap) time = snapTime(time, drag.candidates, threshold)
          next = trimClip(drag.base, drag.origin.id, 'start', time)
        } else {
          drag.newTrackAbove = false
          let time = clipEnd(drag.origin) + dx
          if (snap) time = snapTime(time, drag.candidates, threshold)
          next = trimClip(drag.base, drag.origin.id, 'end', time)
        }
        draftRef.current = next
        setDraft(next)
      }

      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const drag = dragRef.current
        let result = draftRef.current
        dragRef.current = null
        draftRef.current = null
        setDraft(null)
        if (!drag?.started || !result || result === drag.base) return
        if (drag.newTrackAbove && drag.mode === 'move') {
          const kind = findTrack(drag.base, drag.origin.trackId)?.kind
          if (kind === 'effect' || kind === 'text' || kind === 'video') {
            const moved = findClip(result, drag.origin.id)
            const created = addTrack(result, kind)
            result = moved
              ? moveClip(created.timeline, drag.origin.id, {
                  start: moved.start,
                  trackId: created.trackId,
                })
              : created.timeline
          }
        }
        if (result !== drag.base) onCommitRef.current(result)
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [isAboveTracks, onSelect, selectedIds, store, timeline, trackAtClientY],
  )

  const acceptsDrop = (event: ReactDragEvent) =>
    event.dataTransfer.types.includes(EDITOR_ASSET_DRAG_TYPE) ||
    event.dataTransfer.types.includes(EDITOR_EFFECT_DRAG_TYPE) ||
    event.dataTransfer.types.includes('Files')

  const handleDragOver = (
    event: ReactDragEvent,
    trackId: string | null,
    zone?: 'top' | 'bottom',
  ) => {
    if (!acceptsDrop(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    const time = timeFromClientX(event.clientX)
    setDropHint((current) =>
      current &&
      current.trackId === trackId &&
      current.zone === zone &&
      Math.abs(current.time - time) < 0.02
        ? current
        : { trackId, time, zone },
    )
  }

  const handleDrop = (event: ReactDragEvent, trackId: string | null) => {
    if (!acceptsDrop(event)) return
    event.preventDefault()
    setDropHint(null)
    const time = timeFromClientX(event.clientX)
    const effectId = event.dataTransfer.getData(EDITOR_EFFECT_DRAG_TYPE)
    if (effectId) {
      onDropEffect?.(effectId, trackId, time)
      return
    }
    const assetId = event.dataTransfer.getData(EDITOR_ASSET_DRAG_TYPE)
    if (assetId) {
      onDropAsset(assetId, trackId, time)
      return
    }
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length > 0) onDropFiles(files, trackId, time)
  }

  const clearReorder = useCallback(() => {
    setReorderDragId(null)
    setReorderHint(null)
  }, [])

  const beginTrackReorder = useCallback((trackId: string, event: ReactDragEvent<HTMLElement>) => {
    if (findTrack(timeline, trackId)?.kind === 'audio') {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(TRACK_REORDER_DRAG_TYPE, trackId)
    event.dataTransfer.effectAllowed = 'move'
    setReorderDragId(trackId)
  }, [timeline])

  const updateTrackReorderHint = useCallback(
    (overId: string, event: ReactDragEvent<HTMLElement>) => {
      const types = Array.from(event.dataTransfer.types)
      const isReorder =
        Boolean(reorderDragId) || types.includes(TRACK_REORDER_DRAG_TYPE)
      if (!isReorder) return
      if (reorderDragId === overId) {
        setReorderHint(null)
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const rect = event.currentTarget.getBoundingClientRect()
      const edge = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      setReorderHint({ overId, edge })
    },
    [reorderDragId],
  )

  const commitTrackReorder = useCallback(
    (overId: string, event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const draggedId =
        event.dataTransfer.getData(TRACK_REORDER_DRAG_TYPE) || reorderDragId || ''
      const hint =
        reorderHint && reorderHint.overId === overId
          ? reorderHint
          : {
              overId,
              edge:
                event.clientY <
                event.currentTarget.getBoundingClientRect().top +
                  event.currentTarget.getBoundingClientRect().height / 2
                  ? ('before' as const)
                  : ('after' as const),
            }
      clearReorder()
      if (!draggedId || draggedId === overId) return
      const overTrack = findTrack(timeline, overId)
      if (!overTrack) return

      let beforeTrackId: string | null
      if (overTrack.kind === 'audio') {
        beforeTrackId = null
      } else if (hint.edge === 'before') {
        beforeTrackId = overId
      } else {
        const index = timeline.tracks.findIndex((track) => track.id === overId)
        const next = timeline.tracks.slice(index + 1).find((track) => track.kind !== 'audio')
        beforeTrackId = next?.id ?? null
      }
      const next = moveTrack(timeline, draggedId, beforeTrackId)
      if (next !== timeline) onCommit(next)
    },
    [clearReorder, onCommit, reorderDragId, reorderHint, timeline],
  )

  const from = scrollLeft / zoom
  const to = (scrollLeft + viewWidth - TIMELINE_HEADER_WIDTH) / zoom
  const kindCounts = useMemo(() => {
    const counts: Partial<Record<EditorTrackKind, number>> = {}
    for (const track of view.tracks) {
      counts[track.kind] = (counts[track.kind] ?? 0) + 1
    }
    return counts
  }, [view.tracks])

  return (
    <div
      ref={scrollerRef}
      onScroll={(event) => {
        pendingScrollLeftRef.current = event.currentTarget.scrollLeft
        if (scrollRafRef.current) return
        scrollRafRef.current = requestAnimationFrame(() => {
          scrollRafRef.current = 0
          setScrollLeft(pendingScrollLeftRef.current)
        })
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropHint(null)
      }}
      className="relative h-full overflow-auto bg-bg"
    >
      <div
        ref={contentRef}
        className="relative flex min-h-full flex-col"
        style={{ width: TIMELINE_HEADER_WIDTH + laneWidth }}
      >
        <div
          className="sticky top-0 z-40 flex border-b border-border-soft bg-sidebar"
          style={{ height: RULER_HEIGHT, width: TIMELINE_HEADER_WIDTH + laneWidth }}
        >
          <div
            className="sticky left-0 z-50 flex shrink-0 items-center border-r border-border-soft bg-sidebar px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2 shadow-[4px_0_12px_rgba(0,0,0,0.35)]"
            style={{ width: TIMELINE_HEADER_WIDTH }}
          >
            Faixas
          </div>
          <div
            className="relative cursor-pointer"
            style={{ width: laneWidth }}
            onPointerDown={startScrub}
          />
          <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ left: TIMELINE_HEADER_WIDTH }}>
            <div className="absolute inset-0" style={{ transform: `translateX(${-TIMELINE_HEADER_WIDTH}px)` }}>
              <Ruler zoom={zoom} from={from} to={to} />
            </div>
          </div>
        </div>

        {/* Faixa compacta no topo para criar camada acima sem empurrar as tracks pra baixo. */}
        <div
          ref={topDropRef}
          className={cn(
            'relative flex h-11 shrink-0 items-center border-b border-dashed border-border-soft transition-colors',
            dropHint?.trackId === null && dropHint.zone === 'top' && 'bg-accent-subtle/40',
          )}
          style={{ width: TIMELINE_HEADER_WIDTH + laneWidth }}
          title="Solte mídia ou efeito para criar faixa no topo"
          onDragOver={(event) => handleDragOver(event, null, 'top')}
          onDrop={(event) => handleDrop(event, null)}
        >
          <div
            className="sticky left-0 z-40 flex h-full shrink-0 items-center border-r border-border-soft bg-sidebar px-3 text-[10px] text-muted-2 shadow-[4px_0_12px_rgba(0,0,0,0.35)]"
            style={{ width: TIMELINE_HEADER_WIDTH }}
          >
            Nova camada
          </div>
          <p className="px-4 text-[11px] text-muted-2">
            Arraste efeito ou mídia aqui para criar uma faixa acima.
          </p>
        </div>

        {view.tracks.map((track) => {
          const clips = clipsByTrack.get(track.id) ?? []
          const height = ROW_HEIGHT[track.kind]
          const hint = dropHint && dropHint.trackId === track.id ? dropHint : null
          return (
            <div
              key={track.id}
              ref={(node) => {
                if (node) rowRefs.current.set(track.id, node)
                else rowRefs.current.delete(track.id)
              }}
              className={cn(
                'relative flex shrink-0 border-b border-border-soft',
                track.kind === 'effect'
                  ? 'bg-fuchsia-950/30'
                  : track.kind === 'text'
                    ? 'bg-amber-950/25'
                    : track.kind === 'audio'
                      ? 'bg-card/40'
                      : 'bg-card/70',
              )}
              style={{ height, width: TIMELINE_HEADER_WIDTH + laneWidth }}
            >
              <div
                className="sticky left-0 z-40 shrink-0 bg-sidebar shadow-[4px_0_12px_rgba(0,0,0,0.35)]"
                style={{ width: TIMELINE_HEADER_WIDTH }}
              >
                <TrackHeader
                  track={track}
                  clipCount={clips.length}
                  canRemove={
                    track.kind === 'effect' || track.kind === 'text'
                      ? true
                      : (kindCounts[track.kind] ?? 0) > 1
                  }
                  reorderHint={
                    reorderHint?.overId === track.id && reorderDragId !== track.id
                      ? reorderHint.edge
                      : null
                  }
                  onPatch={(patch) => onCommit(updateTrack(timeline, track.id, patch))}
                  onRemove={() => onCommit(removeTrack(timeline, track.id))}
                  onReorderDragStart={(event) => beginTrackReorder(track.id, event)}
                  onReorderDragOver={(event) => updateTrackReorderHint(track.id, event)}
                  onReorderDrop={(event) => commitTrackReorder(track.id, event)}
                  onReorderDragEnd={clearReorder}
                />
              </div>
              <div
                className={cn('relative overflow-hidden', track.hidden && 'opacity-50')}
                style={{ width: laneWidth }}
                onPointerDown={startMarqueeOrClick}
                onDragOver={(event) => handleDragOver(event, track.id)}
                onDrop={(event) => handleDrop(event, track.id)}
              >
                {clips.map((clip) => (
                  <TimelineClipView
                    key={clip.id}
                    clip={clip}
                    asset={assets.get(clip.assetId)}
                    zoom={zoom}
                    height={height}
                    selected={selected.has(clip.id)}
                    locked={track.locked}
                    onPointerDown={handleClipPointerDown}
                  />
                ))}
                {hint ? (
                  <div
                    className="pointer-events-none absolute inset-y-1 w-0.5 rounded bg-accent"
                    style={{ left: hint.time * zoom }}
                  />
                ) : null}
              </div>
            </div>
          )
        })}

        <div
          className={cn(
            'relative flex h-10 shrink-0 items-center border-b border-dashed border-border-soft transition-colors',
            dropHint?.trackId === null && dropHint.zone === 'bottom' && 'bg-accent-subtle/40',
          )}
          style={{ width: TIMELINE_HEADER_WIDTH + laneWidth }}
          onDragOver={(event) => handleDragOver(event, null, 'bottom')}
          onDrop={(event) => handleDrop(event, null)}
        >
          <div
            className="sticky left-0 z-40 flex h-full shrink-0 items-center border-r border-border-soft bg-sidebar px-3 text-[10px] text-muted-2 shadow-[4px_0_12px_rgba(0,0,0,0.35)]"
            style={{ width: TIMELINE_HEADER_WIDTH }}
          >
            Nova faixa
          </div>
          <p className="px-4 text-[11px] text-muted-2">
            Solte aqui para criar outra faixa (entra acima das existentes).
          </p>
        </div>

        <div
          className="relative min-h-[72px] flex-1 cursor-grab active:cursor-grabbing"
          style={{ width: TIMELINE_HEADER_WIDTH + laneWidth }}
          title="Arraste para mover a timeline"
          onPointerDown={startPan}
        />

        <Playhead store={store} zoom={zoom} onScrubStart={startScrub} />

        {marquee ? (
          <div
            className="pointer-events-none absolute z-40 rounded-sm border border-accent bg-accent/15"
            style={{
              left: Math.min(marquee.x1, marquee.x2),
              top: Math.min(marquee.y1, marquee.y2),
              width: Math.abs(marquee.x2 - marquee.x1),
              height: Math.abs(marquee.y2 - marquee.y1),
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
