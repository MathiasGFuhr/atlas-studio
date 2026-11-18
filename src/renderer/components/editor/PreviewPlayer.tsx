import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { resolveAnimationStyle } from '@shared/editor/animationsCatalog'
import { clipCssFilter, clipEffectOverlays } from '@shared/editor/effectsCatalog'
import { aspectRatioValue, type EditorAsset, type EditorClip, type EditorTimeline } from '@shared/editor/types'
import {
  clipDuration,
  clipEnd,
  isEffectClip,
  isTextClip,
  sourceTimeAt,
  timelineDuration,
} from '@shared/editor/timelineOps'
import { watermarkCssPosition } from '@shared/editor/watermark'
import type { PlaybackStore } from '../../lib/editor/playbackStore'
import { assetPlaybackUrl } from '../../lib/editor/editorMedia'
import { TextOverlay } from './TextOverlay'

/** Clipes montados um pouco antes de entrar, para o corte não piscar preto. */
const PRELOAD_AHEAD = 2.5
const KEEP_BEHIND = 0.5
const DRIFT_TOLERANCE = 0.25

type MediaEl = HTMLVideoElement | HTMLAudioElement | HTMLImageElement

type MediaEntry = {
  clip: EditorClip
  el: MediaEl
  visible: boolean
  audible: boolean
  playPending: boolean
}

type TransitionStyle = {
  opacity: number
  transform: string
  filter: string
  clipPath: string
}

const IDENTITY_TRANSITION: TransitionStyle = {
  opacity: 1,
  transform: '',
  filter: '',
  clipPath: '',
}

function nearKey(timeline: EditorTimeline, time: number): string {
  const from = time - KEEP_BEHIND
  const to = time + PRELOAD_AHEAD
  return timeline.clips
    .filter(
      (clip) =>
        !isEffectClip(clip) && !isTextClip(clip) && clip.start <= to && clipEnd(clip) >= from,
    )
    .map((clip) => clip.id)
    .sort()
    .join('|')
}

function activeTextKey(timeline: EditorTimeline, time: number): string {
  return timeline.clips
    .filter((clip) => isTextClip(clip) && clip.start <= time && time < clipEnd(clip))
    .map((clip) => clip.id)
    .join('|')
}

/** Efeitos das faixas `effect` ativos no tempo (faixa de baixo → cima). */
function activeEffectStack(timeline: EditorTimeline, time: number) {
  const stacked: Array<{ id: string; intensity?: number }> = []
  for (let index = timeline.tracks.length - 1; index >= 0; index -= 1) {
    const track = timeline.tracks[index]
    if (!track || track.kind !== 'effect' || track.hidden) continue
    for (const clip of timeline.clips) {
      if (clip.trackId !== track.id || !isEffectClip(clip)) continue
      if (clip.start <= time && time < clipEnd(clip) && clip.effects?.length) {
        stacked.push(...clip.effects)
      }
    }
  }
  return stacked
}

function activeOverlayKey(timeline: EditorTimeline, time: number): string {
  const stack = activeEffectStack(timeline, time)
  if (stack.length === 0) return ''
  return stack.map((item) => item.id).join('|')
}

function activeEffectCss(timeline: EditorTimeline, time: number): string {
  return clipCssFilter(activeEffectStack(timeline, time))
}

function resolveTransitionOutStyle(clip: EditorClip, local: number, duration: number): TransitionStyle {
  const trans = clip.transitionOut
  if (!trans || !(trans.duration > 0) || !(duration > 0)) return IDENTITY_TRANSITION
  const transDur = Math.min(trans.duration, duration * 0.5)
  const startAt = duration - transDur
  if (local <= startAt || transDur <= 0) return IDENTITY_TRANSITION

  const p = Math.max(0, Math.min(1, (local - startAt) / transDur))
  const eased = 1 - (1 - p) * (1 - p)
  const id = trans.id

  if (id === 'slide-left' || id === 'whip-pan') {
    return { opacity: 1 - p * 0.15, transform: `translateX(${(-eased * 100).toFixed(2)}%)`, filter: '', clipPath: '' }
  }
  if (id === 'slide-up') {
    return { opacity: 1 - p * 0.15, transform: `translateY(${(-eased * 100).toFixed(2)}%)`, filter: '', clipPath: '' }
  }
  if (id === 'wipe-left') {
    return { opacity: 1, transform: '', filter: '', clipPath: `inset(0 ${(eased * 100).toFixed(1)}% 0 0)` }
  }
  if (id === 'wipe-right') {
    return { opacity: 1, transform: '', filter: '', clipPath: `inset(0 0 0 ${(eased * 100).toFixed(1)}%)` }
  }
  if (id === 'wipe-up') {
    return { opacity: 1, transform: '', filter: '', clipPath: `inset(0 0 ${(eased * 100).toFixed(1)}% 0)` }
  }
  if (id === 'wipe-down' || id === 'directional' || id === 'directional-wipe') {
    return { opacity: 1, transform: '', filter: '', clipPath: `inset(${(eased * 100).toFixed(1)}% 0 0 0)` }
  }
  if (id === 'horizontal-open') {
    const half = (eased * 50).toFixed(1)
    return { opacity: 1, transform: '', filter: '', clipPath: `inset(0 ${half}% 0 ${half}%)` }
  }
  if (id === 'vertical-open') {
    const half = (eased * 50).toFixed(1)
    return { opacity: 1, transform: '', filter: '', clipPath: `inset(${half}% 0 ${half}% 0)` }
  }
  if (id === 'circle-open' || id === 'circle-iris' || id === 'circle-crop') {
    return { opacity: 1, transform: '', filter: '', clipPath: `circle(${((1 - eased) * 75).toFixed(1)}% at 50% 50%)` }
  }
  if (id === 'cross-zoom' || id === 'simple-zoom' || id === 'dreamy-zoom' || id === 'zoom-circles') {
    return {
      opacity: 1 - eased,
      transform: `scale(${(1 + eased * 0.45).toFixed(3)})`,
      filter: id === 'dreamy-zoom' ? `blur(${(eased * 6).toFixed(1)}px)` : '',
      clipPath: '',
    }
  }
  if (id === 'fade-grayscale') {
    return { opacity: 1 - eased, transform: '', filter: `grayscale(${eased.toFixed(2)})`, clipPath: '' }
  }
  if (id === 'flash-fade' || id === 'overexposure') {
    return {
      opacity: 1 - eased,
      transform: '',
      filter: `brightness(${(1 + Math.sin(p * Math.PI) * 1.1).toFixed(2)})`,
      clipPath: '',
    }
  }
  if (id === 'defocus') {
    return { opacity: 1 - eased, transform: '', filter: `blur(${(eased * 12).toFixed(1)}px)`, clipPath: '' }
  }
  if (id === 'glitch-displace' || id === 'glitch-bands' || id === 'glitch-flicker' || id === 'glitch-memories' || id === 'datamosh') {
    const jitter = Math.sin(p * Math.PI * 10) * 3 * (1 - p)
    return {
      opacity: 1 - eased,
      transform: `translateX(${jitter.toFixed(1)}%)`,
      filter: `contrast(${(1 + p * 0.5).toFixed(2)}) saturate(${(1 + p).toFixed(2)})`,
      clipPath: '',
    }
  }
  if (id === 'rotate-scale' || id === 'swirl' || id === 'vortex' || id === 'pinwheel') {
    return {
      opacity: 1 - eased,
      transform: `rotate(${(eased * 22).toFixed(1)}deg) scale(${(1 - eased * 0.35).toFixed(3)})`,
      filter: '',
      clipPath: '',
    }
  }
  return { opacity: 1 - eased, transform: '', filter: '', clipPath: '' }
}

function applyVisualStyle(
  el: MediaEl,
  clip: EditorClip,
  visible: boolean,
  time: number,
) {
  if (el instanceof HTMLAudioElement) return
  const duration = clipDuration(clip)
  const local = time - clip.start
  const anim = visible
    ? resolveAnimationStyle(clip.animation, local, duration)
    : { opacity: 0, transform: '', filter: '', clipPath: '' }
  const trans = visible ? resolveTransitionOutStyle(clip, local, duration) : IDENTITY_TRANSITION
  const opacity = visible ? Math.max(0, Math.min(1, clip.opacity * anim.opacity * trans.opacity)) : 0
  const scale = Number.isFinite(clip.scale) ? clip.scale : 1
  const scalePart = scale === 1 ? '' : `scale(${scale})`
  const transforms = [scalePart, anim.transform, trans.transform].filter(Boolean)
  const effectFilter = visible ? clipCssFilter(clip.effects) : ''
  const filters = [effectFilter, anim.filter, trans.filter].filter(Boolean)
  el.style.opacity = String(opacity)
  el.style.transform = transforms.join(' ')
  el.style.transformOrigin = 'center center'
  el.style.filter = filters.join(' ')
  el.style.clipPath = trans.clipPath || anim.clipPath || 'none'
}

function playbackVolume(clip: EditorClip, time: number): number {
  let gain = Math.max(0, clip.volume)
  const local = time - clip.start
  const duration = clipDuration(clip)
  const fadeIn = Math.max(0, Math.min(clip.fadeIn || 0, duration))
  const fadeOut = Math.max(0, Math.min(clip.fadeOut || 0, duration))
  if (fadeIn > 0 && local < fadeIn) gain *= local / fadeIn
  if (fadeOut > 0 && local > duration - fadeOut) {
    gain *= Math.max(0, (duration - local) / fadeOut)
  }
  return Math.max(0, Math.min(1, gain))
}

function syncMedia(entry: MediaEntry, time: number, playing: boolean, fps: number) {
  const { clip, el } = entry
  const active = clip.start <= time && time < clipEnd(clip)
  if (el instanceof HTMLImageElement) {
    applyVisualStyle(el, clip, active && entry.visible, time)
    return
  }
  if (!active) {
    if (!el.paused) el.pause()
    entry.playPending = false
    applyVisualStyle(el, clip, false, time)
    if (
      clip.start > time &&
      el.readyState >= 1 &&
      !el.seeking &&
      Math.abs(el.currentTime - clip.inPoint) > 0.05
    ) {
      el.currentTime = clip.inPoint
    }
    return
  }
  applyVisualStyle(el, clip, entry.visible, time)
  el.muted = !entry.audible
  el.volume = playbackVolume(clip, time)
  const target = sourceTimeAt(clip, time)
  if (playing) {
    if (el.paused) {
      if (!el.seeking && Math.abs(el.currentTime - target) > 0.05) {
        el.currentTime = target
      }
      if (!entry.playPending && el.readyState >= 2) {
        entry.playPending = true
        void el
          .play()
          .catch(() => undefined)
          .finally(() => {
            entry.playPending = false
          })
      }
    } else if (!el.seeking && Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
      el.currentTime = target
    }
    return
  }
  if (!el.paused) el.pause()
  entry.playPending = false
  if (!el.seeking && el.readyState >= 1 && Math.abs(el.currentTime - target) > 0.5 / fps) {
    el.currentTime = target
  }
}

const PreviewMediaElement = memo(function PreviewMediaElement({
  clip,
  asset,
  register,
  onReady,
}: {
  clip: EditorClip
  asset: EditorAsset
  register: (clipId: string, el: MediaEl | null) => void
  onReady: () => void
}) {
  const src = assetPlaybackUrl(asset)
  const setRef = useCallback(
    (el: MediaEl | null) => {
      register(clip.id, el)
    },
    [clip.id, register],
  )
  if (!src) return null

  const fit = clip.fit === 'cover' ? 'object-cover' : 'object-contain'
  if (asset.kind === 'image') {
    return (
      <img
        ref={setRef}
        src={src}
        alt=""
        draggable={false}
        onLoad={onReady}
        className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`}
        style={{ opacity: 0 }}
      />
    )
  }
  if (asset.kind === 'audio') {
    return (
      <audio
        ref={setRef}
        src={src}
        preload="auto"
        onLoadedMetadata={onReady}
        onCanPlay={onReady}
        onSeeked={onReady}
      />
    )
  }
  return (
    <video
      ref={setRef}
      src={src}
      preload="auto"
      playsInline
      onLoadedMetadata={onReady}
      onLoadedData={onReady}
      onCanPlay={onReady}
      onSeeked={onReady}
      className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`}
      style={{ opacity: 0 }}
    />
  )
})

const FrameOverlaysLayer = memo(function FrameOverlaysLayer({
  timeline,
  store,
}: {
  timeline: EditorTimeline
  store: PlaybackStore
}) {
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline
  const overlayKey = useSyncExternalStore(store.subscribe, () =>
    activeOverlayKey(timelineRef.current, store.getTime()),
  )
  const overlays = useMemo(() => {
    if (!overlayKey) return []
    return clipEffectOverlays(activeEffectStack(timeline, store.getTime()))
  }, [overlayKey, store, timeline])

  if (overlays.length === 0) return null
  return (
    <>
      {overlays.map((overlay, index) => (
        <div
          key={`fx-overlay-${index}-${overlay.animation ?? 'static'}`}
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background: overlay.background,
            backgroundSize: overlay.backgroundSize,
            opacity: overlay.opacity ?? 0.6,
            mixBlendMode: (overlay.mixBlendMode as CSSProperties['mixBlendMode']) || 'screen',
            animationName: overlay.animation,
            animationDuration: overlay.animationDuration || '8s',
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }}
        />
      ))}
    </>
  )
})

const TextOverlayLayer = memo(function TextOverlayLayer({
  timeline,
  store,
  frameWidth,
  frameHeight,
}: {
  timeline: EditorTimeline
  store: PlaybackStore
  frameWidth: number
  frameHeight: number
}) {
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline
  const activeKey = useSyncExternalStore(store.subscribe, () =>
    activeTextKey(timelineRef.current, store.getTime()),
  )
  const trackById = useMemo(
    () => new Map(timeline.tracks.map((track) => [track.id, track])),
    [timeline.tracks],
  )
  const trackOrder = useMemo(() => {
    const order = new Map<string, number>()
    timeline.tracks.forEach((track, index) => order.set(track.id, index))
    return order
  }, [timeline.tracks])

  const activeTextClips = useMemo(() => {
    if (!activeKey) return []
    const activeIds = new Set(activeKey.split('|'))
    return timeline.clips
      .filter((clip) => {
        if (!isTextClip(clip) || !activeIds.has(clip.id)) return false
        const track = trackById.get(clip.trackId)
        return Boolean(track && track.kind === 'text' && !track.hidden)
      })
      .sort((a, b) => (trackOrder.get(b.trackId) ?? 0) - (trackOrder.get(a.trackId) ?? 0))
  }, [activeKey, timeline.clips, trackById, trackOrder])

  if (activeTextClips.length === 0) return null
  return (
    <>
      {activeTextClips.map((clip) => (
        <TextOverlay
          key={clip.id}
          clip={clip}
          store={store}
          frameWidth={frameWidth}
          frameHeight={frameHeight}
        />
      ))}
    </>
  )
})

export function PreviewPlayer({
  timeline,
  assets,
  store,
}: {
  timeline: EditorTimeline
  assets: Map<string, EditorAsset>
  store: PlaybackStore
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const entries = useRef(new Map<string, MediaEntry>())
  const wmRefs = useRef(new Map<string, HTMLImageElement>())
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  const key = useSyncExternalStore(store.subscribe, () => nearKey(timelineRef.current, store.getTime()))
  const nearIds = useMemo(() => new Set(key ? key.split('|') : []), [key])

  const trackById = useMemo(() => new Map(timeline.tracks.map((track) => [track.id, track])), [timeline.tracks])
  const trackOrder = useMemo(() => {
    const order = new Map<string, number>()
    timeline.tracks.forEach((track, index) => order.set(track.id, index))
    return order
  }, [timeline.tracks])
  const clipById = useMemo(() => new Map(timeline.clips.map((clip) => [clip.id, clip])), [timeline.clips])

  const mounted = useMemo(
    () =>
      timeline.clips
        .filter(
          (clip) =>
            !isEffectClip(clip) && !isTextClip(clip) && nearIds.has(clip.id) && trackById.has(clip.trackId),
        )
        // Faixa de vídeo mais alta na lista fica por cima: entra por último no DOM.
        .sort((a, b) => (trackOrder.get(b.trackId) ?? 0) - (trackOrder.get(a.trackId) ?? 0)),
    [nearIds, timeline.clips, trackById, trackOrder],
  )

  const syncAll = useCallback(() => {
    const tl = timelineRef.current
    const time = store.getTime()
    const playing = store.isPlaying()

    for (const entry of entries.current.values()) {
      syncMedia(entry, time, playing, tl.fps)
    }

    if (stageRef.current) {
      const nextFilter = activeEffectCss(tl, time)
      if (stageRef.current.style.filter !== nextFilter) {
        stageRef.current.style.filter = nextFilter
      }
    }

    if (tl.watermarks.length > 0 && wmRefs.current.size > 0) {
      const dur = Math.max(0.001, timelineDuration(tl))
      for (const wm of tl.watermarks) {
        const el = wmRefs.current.get(wm.id)
        if (!el) continue
        const style = resolveAnimationStyle(wm.animation, time, dur)
        el.style.opacity = String(Math.max(0, Math.min(1, wm.opacity * style.opacity)))
        el.style.transform = style.transform || ''
        el.style.filter = style.filter || ''
      }
    }
  }, [store])

  useEffect(() => store.subscribe(syncAll), [store, syncAll])

  useEffect(() => {
    for (const entry of entries.current.values()) {
      const clip = clipById.get(entry.clip.id)
      const track = clip ? trackById.get(clip.trackId) : undefined
      if (!clip || !track) continue
      entry.clip = clip
      entry.visible = track.kind === 'video' && !track.hidden
      entry.audible = !track.muted && !clip.muted
    }
    syncAll()
  }, [clipById, syncAll, timeline.watermarks, timeline.clips, trackById])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const ratio = aspectRatioValue(timeline.aspect)
    const measure = () => {
      const width = node.clientWidth
      const height = node.clientHeight
      if (!width || !height) return
      if (width / height > ratio) setBox({ width: Math.floor(height * ratio), height })
      else setBox({ width, height: Math.floor(width / ratio) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [timeline.aspect])

  const register = useCallback(
    (clipId: string, el: MediaEl | null) => {
      if (!el) {
        entries.current.delete(clipId)
        return
      }
      const clip = timelineRef.current.clips.find((item) => item.id === clipId)
      if (!clip) return
      const track = timelineRef.current.tracks.find((item) => item.id === clip.trackId)
      if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
        el.preservesPitch = true
      }
      const entry: MediaEntry = {
        clip,
        el,
        visible: Boolean(track && track.kind === 'video' && !track.hidden),
        audible: Boolean(track && !track.muted && !clip.muted),
        playPending: false,
      }
      entries.current.set(clipId, entry)
      syncMedia(entry, store.getTime(), store.isPlaying(), timelineRef.current.fps)
    },
    [store],
  )

  const empty = timeline.clips.length === 0

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
      <div
        onClick={() => {
          if (!empty) store.toggle()
        }}
        title={empty ? undefined : 'Clique para dar play / pausar'}
        className="relative overflow-hidden rounded-md bg-black shadow-card ring-1 ring-border-soft"
        style={{ width: box.width, height: box.height, cursor: empty ? 'default' : 'pointer' }}
      >
        <div ref={stageRef} className="absolute inset-0">
          {mounted.map((clip) => {
            const asset = assets.get(clip.assetId)
            if (!asset) return null
            const src = assetPlaybackUrl(asset)
            if (!src) return null
            return (
              <PreviewMediaElement
                key={`${clip.id}|${src}`}
                clip={clip}
                asset={asset}
                register={register}
                onReady={syncAll}
              />
            )
          })}
        </div>
        {empty ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs leading-relaxed text-muted-2">
            Arraste vídeos da biblioteca para a timeline para começar.
          </div>
        ) : null}
        <FrameOverlaysLayer timeline={timeline} store={store} />
        <TextOverlayLayer timeline={timeline} store={store} frameWidth={box.width} frameHeight={box.height} />
        {timeline.watermarks.map((watermark) => {
          const watermarkAsset = assets.get(watermark.assetId)
          const watermarkSrc =
            watermarkAsset && watermarkAsset.kind === 'image'
              ? assetPlaybackUrl(watermarkAsset) || watermarkAsset.coverUrl || null
              : null
          if (!watermarkSrc) return null
          return (
            <img
              key={watermark.id}
              ref={(el) => {
                if (el) wmRefs.current.set(watermark.id, el)
                else wmRefs.current.delete(watermark.id)
              }}
              src={watermarkSrc}
              alt=""
              draggable={false}
              className="pointer-events-none absolute z-20 object-contain"
              style={{
                width: `${watermark.scale * 100}%`,
                opacity: watermark.opacity,
                transformOrigin: 'center center',
                ...watermarkCssPosition(watermark.corner, watermark.margin * 100),
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
