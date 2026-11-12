import {
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
const DRIFT_TOLERANCE = 0.3

type MediaEntry = {
  clip: EditorClip
  el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement
  visible: boolean
  audible: boolean
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

function activeEffectCss(timeline: EditorTimeline, time: number): string {
  return clipCssFilter(activeEffectStack(timeline, time))
}

function applyVisualStyle(
  el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement,
  clip: EditorClip,
  visible: boolean,
  time: number,
) {
  if (el instanceof HTMLAudioElement) return
  const duration = clipDuration(clip)
  const local = time - clip.start
  const anim = visible ? resolveAnimationStyle(clip.animation, local, duration) : { opacity: 0, transform: '', filter: '' }
  const opacity = visible ? Math.max(0, Math.min(1, clip.opacity * anim.opacity)) : 0
  const scale = Number.isFinite(clip.scale) ? clip.scale : 1
  const scalePart = scale === 1 ? '' : `scale(${scale})`
  const transforms = [scalePart, anim.transform].filter(Boolean)
  const effectFilter = visible ? clipCssFilter(clip.effects) : ''
  const filters = [effectFilter, anim.filter].filter(Boolean)
  el.style.opacity = String(opacity)
  el.style.transform = transforms.join(' ')
  el.style.transformOrigin = 'center center'
  el.style.filter = filters.join(' ')
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
    applyVisualStyle(el, clip, false, time)
    if (clip.start > time && el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - clip.inPoint) > 0.05) {
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
      el.currentTime = target
      void el.play().catch(() => undefined)
    } else if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
      el.currentTime = target
    }
    return
  }
  if (!el.paused) el.pause()
  if (!el.seeking && Math.abs(el.currentTime - target) > 0.5 / fps) el.currentTime = target
}

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
  const [box, setBox] = useState({ width: 0, height: 0 })
  const entries = useRef(new Map<string, MediaEntry>())
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  const key = useSyncExternalStore(store.subscribe, () => nearKey(timelineRef.current, store.getTime()))
  const nearIds = useMemo(() => new Set(key ? key.split('|') : []), [key])
  const frameFilter = useSyncExternalStore(store.subscribe, () =>
    activeEffectCss(timelineRef.current, store.getTime()),
  )
  const watermarkAnimKey = useSyncExternalStore(store.subscribe, () => {
    const tl = timelineRef.current
    if (tl.watermarks.length === 0) return ''
    const dur = Math.max(0.001, timelineDuration(tl))
    const time = store.getTime()
    return tl.watermarks
      .map((wm) => {
        const style = resolveAnimationStyle(wm.animation, time, dur)
        return `${wm.id}:${style.opacity}|${style.transform}|${style.filter}`
      })
      .join(';;')
  })

  const trackById = useMemo(() => new Map(timeline.tracks.map((track) => [track.id, track])), [timeline.tracks])
  const trackOrder = useMemo(() => {
    const order = new Map<string, number>()
    timeline.tracks.forEach((track, index) => order.set(track.id, index))
    return order
  }, [timeline.tracks])

  const mounted = useMemo(
    () =>
      timeline.clips
        .filter(
          (clip) =>
            !isEffectClip(clip) && nearIds.has(clip.id) && trackById.has(clip.trackId),
        )
        // Faixa de vídeo mais alta na lista fica por cima: entra por último no DOM.
        .sort((a, b) => (trackOrder.get(b.trackId) ?? 0) - (trackOrder.get(a.trackId) ?? 0)),
    [nearIds, timeline.clips, trackById, trackOrder],
  )

  const syncAll = useCallback(() => {
    const time = store.getTime()
    const playing = store.isPlaying()
    for (const entry of entries.current.values()) syncMedia(entry, time, playing, timelineRef.current.fps)
  }, [store])

  useEffect(() => store.subscribe(syncAll), [store, syncAll])

  useEffect(() => {
    for (const entry of entries.current.values()) {
      const track = trackById.get(entry.clip.trackId)
      const clip = timeline.clips.find((item) => item.id === entry.clip.id)
      if (!clip || !track) continue
      entry.clip = clip
      entry.visible = track.kind === 'video' && !track.hidden
      entry.audible = !track.muted && !clip.muted
    }
    syncAll()
  }, [syncAll, timeline.clips, trackById])

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
    (clip: EditorClip, el: MediaEntry['el'] | null) => {
      if (!el) {
        entries.current.delete(clip.id)
        return
      }
      const track = trackById.get(clip.trackId)
      entries.current.set(clip.id, {
        clip,
        el,
        visible: Boolean(track && track.kind === 'video' && !track.hidden),
        audible: Boolean(track && !track.muted && !clip.muted),
      })
      syncMedia(entries.current.get(clip.id)!, store.getTime(), store.isPlaying(), timelineRef.current.fps)
    },
    [store, trackById],
  )

  const empty = timeline.clips.length === 0
  const watermarkAnims = useMemo(() => {
    const map = new Map<string, { opacity: number; transform: string; filter: string }>()
    if (!watermarkAnimKey) return map
    for (const chunk of watermarkAnimKey.split(';;')) {
      const sep = chunk.indexOf(':')
      if (sep < 0) continue
      const id = chunk.slice(0, sep)
      const [opacity, transform, filter] = chunk.slice(sep + 1).split('|')
      const parsedOpacity = Number(opacity)
      map.set(id, {
        // 0 é válido (fade-out); só cai no 1 se o valor for inválido.
        opacity: Number.isFinite(parsedOpacity) ? parsedOpacity : 1,
        transform: transform || '',
        filter: filter || '',
      })
    }
    return map
  }, [watermarkAnimKey])

  const previewTime = useSyncExternalStore(store.subscribe, store.getTime)
  const frameOverlays = useMemo(
    () => clipEffectOverlays(activeEffectStack(timeline, previewTime)),
    [timeline, previewTime],
  )
  const textClips = useMemo(
    () =>
      timeline.clips
        .filter((clip) => {
          if (!isTextClip(clip)) return false
          const track = trackById.get(clip.trackId)
          return Boolean(track && track.kind === 'text' && !track.hidden)
        })
        // Faixa mais alta na lista fica por cima (mesmo critério do vídeo).
        .sort((a, b) => (trackOrder.get(b.trackId) ?? 0) - (trackOrder.get(a.trackId) ?? 0)),
    [timeline.clips, trackById, trackOrder],
  )

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
      <div
        className="relative overflow-hidden rounded-md bg-black shadow-card ring-1 ring-border-soft"
        style={{ width: box.width, height: box.height }}
      >
        <div className="absolute inset-0" style={{ filter: frameFilter || undefined }}>
          {mounted.map((clip) => {
            const asset = assets.get(clip.assetId)
            const src = assetPlaybackUrl(asset)
            if (!asset || !src) return null
            const fit = clip.fit === 'cover' ? 'object-cover' : 'object-contain'
            if (asset.kind === 'image') {
              return (
                <img
                  key={clip.id}
                  ref={(el) => register(clip, el)}
                  src={src}
                  alt=""
                  draggable={false}
                  className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`}
                  style={{ opacity: 0 }}
                />
              )
            }
            if (asset.kind === 'audio') {
              return <audio key={clip.id} ref={(el) => register(clip, el)} src={src} preload="auto" />
            }
            return (
              <video
                key={`${clip.id}|${src}`}
                ref={(el) => register(clip, el)}
                src={src}
                preload="auto"
                playsInline
                onSeeked={syncAll}
                onLoadedMetadata={syncAll}
                className={`pointer-events-none absolute inset-0 h-full w-full ${fit}`}
                style={{ opacity: 0 }}
              />
            )
          })}
        </div>
        {empty ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs leading-relaxed text-muted-2">
            Arraste vídeos da biblioteca para a timeline para começar.
          </div>
        ) : null}
        {frameOverlays.map((overlay, index) => (
          <div
            key={`fx-overlay-${index}`}
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
        {textClips.map((clip) => (
          <TextOverlay
            key={clip.id}
            clip={clip}
            time={previewTime}
            frameWidth={box.width}
            frameHeight={box.height}
          />
        ))}
        {timeline.watermarks.map((watermark) => {
          const watermarkAsset = assets.get(watermark.assetId)
          const watermarkSrc =
            watermarkAsset && watermarkAsset.kind === 'image'
              ? assetPlaybackUrl(watermarkAsset) || watermarkAsset.coverUrl || null
              : null
          if (!watermarkSrc) return null
          const anim = watermarkAnims.get(watermark.id) ?? {
            opacity: 1,
            transform: '',
            filter: '',
          }
          return (
            <img
              key={watermark.id}
              src={watermarkSrc}
              alt=""
              draggable={false}
              className="pointer-events-none absolute z-20 object-contain"
              style={{
                width: `${watermark.scale * 100}%`,
                opacity: watermark.opacity * anim.opacity,
                transform: anim.transform || undefined,
                filter: anim.filter || undefined,
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
