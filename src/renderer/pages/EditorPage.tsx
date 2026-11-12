import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Crosshair,
  Download,
  Film,
  Loader2,
  Magnet,
  Maximize2,
  Music2,
  Pause,
  Play,
  Redo2,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  EDITOR_DEFAULT_WATERMARK,
  EDITOR_MAX_WATERMARKS,
  formatTimecode,
  type EditorAspect,
  type EditorAsset,
  type EditorAssetOrigin,
  type EditorClip,
  type EditorProject,
  type EditorTimeline,
  type EditorWatermark,
} from '@shared/editor/types'
import {
  addTrack,
  clipEnd,
  clipsAt,
  deleteClips,
  ensureTextTrack,
  findClip,
  fitClipToMusicDuration,
  applyEffectToFullTimeline,
  insertAssetClip,
  insertEffectClip,
  insertTextClip,
  isEffectClip,
  isTextClip,
  removeAssetClips,
  removeClipEffect,
  setClipAnimationSlot,
  setEffectIntensity,
  makeWatermark,
  removeWatermark,
  removeWatermarksUsingAsset,
  setWatermarkAnimationSlot,
  upsertWatermark,
  splitAt,
  stretchEffectToFullTimeline,
  timelineDuration,
  trackKindForAsset,
  updateClip,
  updateTextContent,
} from '@shared/editor/timelineOps'
import { sceneNumberFromAsset, syncClipToMusicStart } from '@shared/editor/syncToMusic'
import { editorAnimationById, type EditorAnimationKind } from '@shared/editor/animationsCatalog'
import { editorEffectById, type EditorEffectId } from '@shared/editor/effectsCatalog'
import { editorTextTemplateById } from '@shared/editor/textTemplatesCatalog'
import { editorTransitionById, type EditorTransitionId } from '@shared/editor/transitionsCatalog'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { EditorLibraryBar } from '../components/editor/EditorLibraryBar'
import type { EditorLibraryTool } from '../components/editor/editorLibraryTools'
import { MediaPanel } from '../components/editor/MediaPanel'
import { WatermarkConfigModal } from '../components/editor/WatermarkConfigModal'
import { PreviewPlayer } from '../components/editor/PreviewPlayer'
import { PropertiesPanel } from '../components/editor/PropertiesPanel'
import { ExportModal } from '../components/editor/ExportModal'
import {
  Timeline,
  TIMELINE_HEADER_WIDTH,
  TIMELINE_MAX_ZOOM,
  TIMELINE_MIN_ZOOM,
} from '../components/editor/Timeline'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { createPlaybackStore, type PlaybackStore } from '../lib/editor/playbackStore'
import { getAtlasApi } from '../lib/api'
import { clearFabBottomClearance, setFabBottomClearance } from '../lib/fabClearance'
import { cn } from '../lib/utils'

const AUTOSAVE_DELAY_MS = 800
const DEFAULT_ZOOM = 40

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

function clampZoom(value: number) {
  return Math.max(TIMELINE_MIN_ZOOM, Math.min(TIMELINE_MAX_ZOOM, value))
}

function TimeDisplay({ store, duration, fps }: { store: PlaybackStore; duration: number; fps: number }) {
  const time = useSyncExternalStore(store.subscribe, store.getTime)
  return (
    <p className="font-mono text-xs tabular-nums">
      <span className="text-text">{formatTimecode(time, fps)}</span>
      <span className="text-muted-2"> / {formatTimecode(duration, fps)}</span>
    </p>
  )
}

function TransportBar({ store, duration, fps }: { store: PlaybackStore; duration: number; fps: number }) {
  const playing = useSyncExternalStore(store.subscribe, store.isPlaying)
  const step = (delta: number) => {
    store.pause()
    store.seek(store.getTime() + delta)
  }
  const button =
    'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text'
  return (
    <div className="flex items-center justify-center gap-1">
      <button type="button" title="Início (Home)" className={button} onClick={() => step(-Number.MAX_SAFE_INTEGER)}>
        <SkipBack className="h-4 w-4" />
      </button>
      <button type="button" title="Quadro anterior (←)" className={button} onClick={() => step(-1 / fps)}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Play / pausa (Espaço)"
        disabled={duration <= 0}
        onClick={() => store.toggle()}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:bg-hover disabled:text-disabled"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <button type="button" title="Próximo quadro (→)" className={button} onClick={() => step(1 / fps)}>
        <ChevronRight className="h-4 w-4" />
      </button>
      <button type="button" title="Fim (End)" className={button} onClick={() => step(Number.MAX_SAFE_INTEGER)}>
        <SkipForward className="h-4 w-4" />
      </button>
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'error') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-danger">
        <CloudOff className="h-3.5 w-3.5" />
        Falha ao salvar
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-2">
        <Check className="h-3.5 w-3.5" />
        Salvo
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Salvando...
    </span>
  )
}

function EditorWorkspace({ project, initialAssets }: { project: EditorProject; initialAssets: EditorAsset[] }) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push, pushError } = useToast()
  const history = useEditorHistory(project.timeline)
  const { timeline, commit, undo, redo } = history
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  const store = useMemo(() => createPlaybackStore(), [])
  const [assets, setAssets] = useState<EditorAsset[]>(initialAssets)
  const [name, setName] = useState(project.name)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [snapping, setSnapping] = useState(true)
  const [timelineHeight, setTimelineHeight] = useState(320)
  const [busy, setBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [assetToRemove, setAssetToRemove] = useState<EditorAsset | null>(null)
  const [libraryTool, setLibraryTool] = useState<EditorLibraryTool>('media')
  const [watermarkConfigOpen, setWatermarkConfigOpen] = useState(false)
  const [selectedWatermarkId, setSelectedWatermarkId] = useState<string | null>(null)
  const [animationTarget, setAnimationTarget] = useState<'clip' | 'watermark'>('clip')
  const timelineBoxRef = useRef<HTMLDivElement>(null)

  // Empurra o FAB do chat para cima da timeline (só no mount e ao soltar o divisor).
  useEffect(() => {
    setFabBottomClearance(timelineHeight + 12)
    return () => clearFabBottomClearance()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- altura ao vivo no resize; clearance no pointerup
  }, [])

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const usedAssetIds = useMemo(
    () =>
      new Set(
        timeline.clips
          .filter((clip) => !isEffectClip(clip) && !isTextClip(clip))
          .map((clip) => clip.assetId),
      ),
    [timeline.clips],
  )
  const duration = timelineDuration(timeline)

  useLayoutEffect(() => {
    store.setDuration(duration)
  }, [duration, store])

  useEffect(() => () => store.pause(), [store])

  useEffect(
    () =>
      api.editor.onAssetChanged((asset) => {
        if (asset.projectId !== project.id) return
        setAssets((list) => {
          const index = list.findIndex((item) => item.id === asset.id)
          if (index < 0) return [...list, asset]
          return list.map((item) => (item.id === asset.id ? asset : item))
        })
      }),
    [api, project.id],
  )

  // --- autosave ---
  const savedRef = useRef<EditorTimeline>(project.timeline)
  const pendingRef = useRef<EditorTimeline | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () =>
      api.editor.onProjectChanged((event) => {
        if (event.projectId !== project.id) return
        void (async () => {
          try {
            if (timerRef.current) {
              window.clearTimeout(timerRef.current)
              timerRef.current = null
            }
            pendingRef.current = null
            const fresh = await api.editor.get(project.id)
            if (!fresh) return
            history.reset(fresh.project.timeline)
            savedRef.current = fresh.project.timeline
            setAssets(fresh.assets)
            setSaveState('saved')
            push(event.message, 'success')
          } catch (error) {
            console.error('[atlas] falha ao atualizar o editor após ingest do Comfy', error)
          }
        })()
      }),
    [api, history, project.id, push],
  )

  const flush = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    const next = pendingRef.current
    if (!next) return
    pendingRef.current = null
    setSaveState('saving')
    try {
      await api.editor.update(project.id, { timeline: next })
      savedRef.current = next
      setSaveState(pendingRef.current ? 'dirty' : 'saved')
    } catch (error) {
      pendingRef.current = pendingRef.current ?? next
      setSaveState('error')
      console.error('[atlas] falha ao salvar a timeline', error)
    }
  }, [api, project.id])

  useEffect(() => {
    if (timeline === savedRef.current) return
    pendingRef.current = timeline
    setSaveState('dirty')
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
  }, [flush, timeline])

  useEffect(() => () => void flush(), [flush])

  // --- mídia ---
  const mergeAssets = useCallback((incoming: EditorAsset[]) => {
    setAssets((list) => {
      const map = new Map(list.map((asset) => [asset.id, asset]))
      for (const asset of incoming) map.set(asset.id, asset)
      return [...map.values()]
    })
  }, [])

  const reportErrors = useCallback(
    (errors: string[]) => {
      if (errors.length === 0) return
      push(errors.length > 1 ? `${errors[0]} (+${errors.length - 1})` : errors[0], 'error')
    },
    [push],
  )

  const insertAssets = useCallback(
    (list: EditorAsset[], target: { trackId?: string | null; time?: number | null; newTrack?: boolean } = {}) => {
      if (list.length === 0) return
      let next = timelineRef.current
      let trackId = target.trackId ?? null
      let time = target.time ?? null
      let lastKind: string | null = null
      let lastId: string | null = null
      for (const asset of list) {
        if (asset.available === false) continue
        const kind = trackKindForAsset(asset.kind)
        if (lastKind && kind !== lastKind) {
          trackId = null
          time = target.time ?? null
        }
        if (target.newTrack && !trackId) {
          const created = addTrack(next, kind)
          next = created.timeline
          trackId = created.trackId
        }
        const inserted = insertAssetClip(next, asset, { trackId, start: time })
        next = inserted.timeline
        const clip = findClip(next, inserted.clipId)
        trackId = clip?.trackId ?? trackId
        time = clip ? clipEnd(clip) : time
        lastKind = kind
        lastId = inserted.clipId
      }
      commit(next)
      if (lastId) setSelectedIds([lastId])
    },
    [commit],
  )

  const importPaths = useCallback(
    async (paths: string[], origin: EditorAssetOrigin): Promise<EditorAsset[]> => {
      if (paths.length === 0) return []
      setBusy(true)
      try {
        const result = await api.editor.addFiles(project.id, paths, origin)
        mergeAssets(result.assets)
        reportErrors(result.errors)
        return result.assets
      } catch (error) {
        pushError(error, 'Falha ao importar mídia')
        return []
      } finally {
        setBusy(false)
      }
    },
    [api, mergeAssets, project.id, pushError, reportErrors],
  )

  const importDialog = useCallback(async () => {
    setBusy(true)
    try {
      const result = await api.editor.importFiles(project.id)
      mergeAssets(result.assets)
      reportErrors(result.errors)
    } catch (error) {
      pushError(error, 'Falha ao importar mídia')
    } finally {
      setBusy(false)
    }
  }, [api, mergeAssets, project.id, pushError, reportErrors])

  const pickWatermark = useCallback(
    async (targetId: string | null = null) => {
      setBusy(true)
      try {
        const result = await api.editor.importFiles(project.id)
        mergeAssets(result.assets)
        reportErrors(result.errors)
        const image = result.assets.find((asset) => asset.kind === 'image')
        if (!image) {
          if (result.assets.length > 0) {
            push('Escolha um arquivo de imagem (PNG, JPG, WebP…).', 'error')
          }
          return
        }
        const list = timelineRef.current.watermarks
        const existing = targetId ? list.find((item) => item.id === targetId) : null
        if (existing) {
          const next = upsertWatermark(timelineRef.current, { ...existing, assetId: image.id })
          commit(next)
          setSelectedWatermarkId(existing.id)
          push('Imagem da marca d\'água atualizada.', 'success')
        } else if (list.length >= EDITOR_MAX_WATERMARKS) {
          push(`No máximo ${EDITOR_MAX_WATERMARKS} marcas d'água.`, 'error')
          return
        } else {
          const defaults =
            list.length > 0
              ? {
                  corner:
                    list[0].corner === 'top-right' ? ('bottom-left' as const) : ('top-right' as const),
                  scale: list[0].scale,
                  opacity: list[0].opacity,
                  margin: list[0].margin,
                }
              : {}
          const created = makeWatermark(image.id, {
            ...EDITOR_DEFAULT_WATERMARK,
            ...defaults,
            animation: { ...EDITOR_DEFAULT_WATERMARK.animation },
          })
          commit(upsertWatermark(timelineRef.current, created))
          setSelectedWatermarkId(created.id)
          push(
            list.length === 0 ? 'Marca d\'água adicionada.' : 'Segunda marca d\'água adicionada.',
            'success',
          )
        }
        setWatermarkConfigOpen(true)
      } catch (error) {
        pushError(error, 'Falha ao definir a marca d\'água')
      } finally {
        setBusy(false)
      }
    },
    [api, commit, mergeAssets, project.id, push, pushError, reportErrors],
  )

  const clearWatermark = useCallback(
    (watermarkId: string) => {
      const next = removeWatermark(timelineRef.current, watermarkId)
      commit(next)
      if (next.watermarks.length === 0) {
        setSelectedWatermarkId(null)
        setWatermarkConfigOpen(false)
        return
      }
      setSelectedWatermarkId((current) =>
        current === watermarkId ? next.watermarks[0]?.id ?? null : current,
      )
    },
    [commit],
  )

  const patchWatermark = useCallback(
    (
      watermarkId: string,
      patch: Partial<
        Pick<EditorWatermark, 'corner' | 'scale' | 'opacity' | 'margin' | 'animation'>
      >,
    ) => {
      const current = timelineRef.current.watermarks.find((item) => item.id === watermarkId)
      if (!current) return
      commit(
        upsertWatermark(timelineRef.current, {
          ...current,
          ...patch,
          animation: patch.animation
            ? { ...current.animation, ...patch.animation }
            : current.animation,
        }),
        patch.animation ? `wm-anim-dur:${watermarkId}` : undefined,
      )
    },
    [commit],
  )

  const filesToPaths = useCallback(
    (files: File[]) => files.map((file) => api.editor.pathForFile(file)).filter((value) => Boolean(value)),
    [api],
  )

  const importLipsync = useCallback(
    async (paths: string[], addToTimeline: boolean) => {
      const imported = await importPaths(paths, 'lipsync')
      if (!addToTimeline || imported.length === 0) return
      const byPath = new Map(imported.map((asset) => [asset.sourcePath.toLowerCase(), asset]))
      const ordered = paths
        .map((item) => byPath.get(item.toLowerCase()))
        .filter((asset): asset is EditorAsset => Boolean(asset))
      insertAssets(ordered.length > 0 ? ordered : imported)
      push(
        ordered.length === 1 ? 'Vídeo adicionado à timeline.' : `${ordered.length} vídeos adicionados à timeline.`,
        'success',
      )
    },
    [importPaths, insertAssets, push],
  )

  const confirmRemoveAsset = useCallback(async () => {
    const asset = assetToRemove
    if (!asset) return
    setAssetToRemove(null)
    try {
      let next = removeAssetClips(timelineRef.current, asset.id)
      next = removeWatermarksUsingAsset(next, asset.id)
      commit(next)
      await api.editor.removeAsset(asset.id)
      setAssets((list) => list.filter((item) => item.id !== asset.id))
      setSelectedIds([])
    } catch (error) {
      pushError(error, 'Falha ao remover a mídia')
    }
  }, [api, assetToRemove, commit, pushError])

  // --- edição ---
  const split = useCallback(() => {
    const current = timelineRef.current
    const time = store.getTime()
    const under = new Set(clipsAt(current, time).map((clip) => clip.id))
    const chosen = selectedIds.filter((id) => under.has(id))
    commit(splitAt(current, time, chosen.length > 0 ? chosen : undefined))
  }, [commit, selectedIds, store])

  const removeSelected = useCallback(
    (ripple: boolean) => {
      if (selectedIds.length === 0) return
      commit(deleteClips(timelineRef.current, selectedIds, ripple))
      setSelectedIds([])
    },
    [commit, selectedIds],
  )

  const syncAssetsToMusic = useCallback(
    async (inputAssets: EditorAsset[]) => {
      const videos = inputAssets
        .filter((asset) => asset.kind === 'video' && asset.available !== false)
        .slice()
        .sort((a, b) => {
          const sa = sceneNumberFromAsset(a) ?? Number.POSITIVE_INFINITY
          const sb = sceneNumberFromAsset(b) ?? Number.POSITIVE_INFINITY
          return sa - sb || a.name.localeCompare(b.name)
        })
      if (videos.length === 0) {
        push('Selecione pelo menos um vídeo para sincronizar.', 'error')
        return
      }

      setBusy(true)
      try {
        // Alinha pelo mesmo áudio do trecho (1.mp3… / áudio do vídeo) dentro da música da timeline.
        const aligned = await api.editor.alignToMusic(
          project.id,
          videos.map((asset) => asset.id),
        )
        let current = timelineRef.current
        const musicClip = current.clips.find((clip) => clip.assetId === aligned.musicAssetId)
        const musicOffset = musicClip ? Math.max(0, musicClip.start) : 0

        let moved = 0
        let inserted = 0
        let lastStart = 0
        let lastScene: number | null = null
        const newClipIds: string[] = []
        const firstError = aligned.skipped[0]?.reason ?? null

        for (const placement of aligned.placements) {
          const asset = assetMap.get(placement.assetId) ?? videos.find((item) => item.id === placement.assetId)
          if (!asset) continue
          const start = musicOffset + placement.start
          const musicDuration = placement.duration > 0 ? placement.duration : asset.duration
          const existingIds = current.clips
            .filter((clip) => clip.assetId === asset.id)
            .map((clip) => clip.id)

          if (existingIds.length > 0) {
            for (const clipId of existingIds) {
              current = syncClipToMusicStart(current, clipId, start)
              current = fitClipToMusicDuration(current, clipId, musicDuration)
              moved += 1
            }
          } else {
            const result = insertAssetClip(current, asset, { start, exactStart: true })
            current = updateClip(result.timeline, result.clipId, { muted: true })
            current = fitClipToMusicDuration(current, result.clipId, musicDuration)
            newClipIds.push(result.clipId)
            inserted += 1
          }
          lastStart = start
          lastScene = placement.sceneNumber
        }

        const total = moved + inserted
        const skipped = aligned.skipped.length
        if (total === 0) {
          push(
            firstError ??
              'Não consegui alinhar os vídeos. Deixe a música na timeline e os arquivos 1.mp3, 2.mp3… na mesma pasta.',
            'error',
          )
          return
        }

        commit(current)
        if (newClipIds.length > 0) setSelectedIds(newClipIds)
        else {
          const syncedIds = aligned.placements.flatMap((placement) =>
            current.clips.filter((clip) => clip.assetId === placement.assetId).map((clip) => clip.id),
          )
          if (syncedIds.length > 0) setSelectedIds(syncedIds)
        }
        store.seek(Math.max(0, lastStart))
        if (total === 1) {
          const label = lastScene != null ? `Trecho ${lastScene}` : 'Vídeo'
          push(`${label} alinhado em ${formatTimecode(lastStart, current.fps)} pelo áudio.`, 'success')
        } else if (skipped > 0) {
          push(`${total} vídeos alinhados e cortados no trecho · ${skipped} ignorados.`, 'success')
        } else {
          push(`${total} vídeos alinhados e cortados no trecho da música.`, 'success')
        }
      } catch (error) {
        pushError(error, 'Falha ao sincronizar com a música')
      } finally {
        setBusy(false)
      }
    },
    [api, assetMap, commit, project.id, push, pushError, store],
  )

  const syncAssetToMusic = useCallback(
    async (asset: EditorAsset) => {
      await syncAssetsToMusic([asset])
    },
    [syncAssetsToMusic],
  )

  const syncSelectedToMusic = useCallback(async () => {
    const current = timelineRef.current
    const selectedVideoAssets = selectedIds
      .map((id) => {
        const clip = findClip(current, id)
        return clip ? assetMap.get(clip.assetId) : null
      })
      .filter((asset): asset is EditorAsset => Boolean(asset && asset.kind === 'video'))

    if (selectedVideoAssets.length > 0) {
      await syncAssetsToMusic(selectedVideoAssets)
      return
    }

    const timelineVideos = current.clips
      .map((clip) => assetMap.get(clip.assetId))
      .filter((asset): asset is EditorAsset => Boolean(asset && asset.kind === 'video'))

    if (timelineVideos.length > 0) {
      // Unique by asset id
      const unique = [...new Map(timelineVideos.map((asset) => [asset.id, asset])).values()]
      await syncAssetsToMusic(unique)
      return
    }

    const libraryVideos = assets.filter((asset) => asset.kind === 'video' && asset.available !== false)
    await syncAssetsToMusic(libraryVideos)
  }, [assetMap, assets, selectedIds, syncAssetsToMusic])

  const selectedClip: EditorClip | null =
    selectedIds.length > 0 ? (findClip(timeline, selectedIds[0]) ?? null) : null

  const selectionHasVisual = useMemo(() => {
    for (const id of selectedIds) {
      const clip = findClip(timeline, id)
      if (!clip || isEffectClip(clip) || isTextClip(clip)) continue
      const asset = assetMap.get(clip.assetId)
      if (asset && asset.kind !== 'audio') return true
    }
    return false
  }, [assetMap, selectedIds, timeline])

  const selectionHasAudio = useMemo(() => {
    for (const id of selectedIds) {
      const clip = findClip(timeline, id)
      if (!clip || isEffectClip(clip) || isTextClip(clip)) continue
      const asset = assetMap.get(clip.assetId)
      if (asset && (asset.kind === 'audio' || asset.hasAudio)) return true
    }
    return false
  }, [assetMap, selectedIds, timeline])

  const activeEffectIds = useMemo(
    () =>
      timeline.clips
        .filter((clip) => isEffectClip(clip) && clip.effectId)
        .map((clip) => clip.effectId as string),
    [timeline.clips],
  )

  const patchSelected = useCallback(
    (
      patch: Partial<
        Pick<
          EditorClip,
          | 'volume'
          | 'muted'
          | 'fit'
          | 'scale'
          | 'opacity'
          | 'fadeIn'
          | 'fadeOut'
          | 'effects'
          | 'animation'
        >
      >,
    ) => {
      if (selectedIds.length === 0) return
      let next = timelineRef.current
      for (const id of selectedIds) {
        const clip = findClip(next, id)
        if (clip && isEffectClip(clip) && patch.effects?.[0]?.intensity != null) {
          next = setEffectIntensity(next, id, patch.effects[0].intensity)
          continue
        }
        next = updateClip(next, id, patch)
      }
      const key =
        selectedIds.length === 1
          ? patch.volume !== undefined
            ? `volume:${selectedIds[0]}`
            : patch.scale !== undefined
              ? `scale:${selectedIds[0]}`
              : patch.opacity !== undefined
                ? `opacity:${selectedIds[0]}`
                : patch.fadeIn !== undefined
                  ? `fadeIn:${selectedIds[0]}`
                  : patch.fadeOut !== undefined
                    ? `fadeOut:${selectedIds[0]}`
                    : patch.effects !== undefined
                      ? `effects:${selectedIds[0]}`
                      : patch.animation !== undefined
                        ? `animation:${selectedIds[0]}`
                        : undefined
          : patch.volume !== undefined
            ? `volume:multi`
            : patch.scale !== undefined
              ? `scale:multi`
              : patch.opacity !== undefined
                ? `opacity:multi`
                : patch.fadeIn !== undefined
                  ? `fadeIn:multi`
                  : patch.fadeOut !== undefined
                    ? `fadeOut:multi`
                    : patch.effects !== undefined
                      ? `effects:multi`
                      : patch.animation !== undefined
                        ? `animation:multi`
                      : undefined
      commit(next, key)
    },
    [commit, selectedIds],
  )

  const placeEffectOnTimeline = useCallback(
    (
      effectId: EditorEffectId,
      trackId: string | null = null,
      time: number | null = null,
      options: { newTrack?: boolean } = {},
    ) => {
      const effect = editorEffectById(effectId)
      if (!effect) return
      const start = time ?? store.getTime()
      const inserted = insertEffectClip(timelineRef.current, effectId, {
        start,
        trackId,
        exactStart: true,
        forceNewTrack: options.newTrack === true,
      })
      if (!inserted.clipId) return
      commit(inserted.timeline, `effect-insert:${effectId}`)
      setSelectedIds([inserted.clipId])
      push(`Efeito "${effect.label}" adicionado na timeline.`, 'success')
    },
    [commit, push, store],
  )

  /** Clique na biblioteca: se já estiver na timeline, remove; senão, adiciona. */
  const toggleEffectOnTimeline = useCallback(
    (effectId: EditorEffectId, options?: { applyToAll?: boolean }) => {
      const effect = editorEffectById(effectId)
      if (!effect) return
      const existing = timelineRef.current.clips.filter(
        (clip) => isEffectClip(clip) && clip.effectId === effectId,
      )
      if (existing.length > 0) {
        const next = deleteClips(
          timelineRef.current,
          existing.map((clip) => clip.id),
          false,
        )
        commit(next, `effect-remove:${effectId}`)
        setSelectedIds((ids) => ids.filter((id) => !existing.some((clip) => clip.id === id)))
        push(`Efeito "${effect.label}" removido.`, 'success')
        return
      }
      if (options?.applyToAll) {
        const applied = applyEffectToFullTimeline(timelineRef.current, effectId)
        if (!applied.clipId) return
        commit(applied.timeline, `effect-all:${effectId}`)
        setSelectedIds([applied.clipId])
        push(`Efeito "${effect.label}" aplicado do início ao fim.`, 'success')
        return
      }
      placeEffectOnTimeline(effectId)
    },
    [commit, placeEffectOnTimeline, push],
  )

  const activeAnimation = useMemo(() => {
    if (animationTarget === 'watermark') {
      const mark =
        (selectedWatermarkId
          ? timeline.watermarks.find((item) => item.id === selectedWatermarkId)
          : null) ?? timeline.watermarks[0]
      return mark?.animation ?? null
    }
    if (!selectedClip || isEffectClip(selectedClip)) return null
    if (isTextClip(selectedClip)) return selectedClip.animation
    const asset = assetMap.get(selectedClip.assetId)
    if (!asset || asset.kind === 'audio') return null
    return selectedClip.animation
  }, [animationTarget, assetMap, selectedClip, selectedWatermarkId, timeline.watermarks])

  const placeTextTemplate = useCallback(
    (templateId: string) => {
      const template = editorTextTemplateById(templateId)
      if (!template) return
      const inserted = insertTextClip(timelineRef.current, templateId, {
        start: store.getTime(),
        exactStart: true,
      })
      if (!inserted.clipId) return
      commit(inserted.timeline, `text-insert:${templateId}`)
      setSelectedIds([inserted.clipId])
      push(`Texto "${template.label}" adicionado.`, 'success')
    },
    [commit, push, store],
  )

  const applyAnimation = useCallback(
    (kind: EditorAnimationKind, id: string) => {
      const def = editorAnimationById(id)
      if (!def) return
      if (animationTarget === 'watermark') {
        if (timelineRef.current.watermarks.length === 0) {
          push("Defina uma marca d'água antes de animar.", 'error')
          return
        }
        const targetId =
          selectedWatermarkId &&
          timelineRef.current.watermarks.some((item) => item.id === selectedWatermarkId)
            ? selectedWatermarkId
            : timelineRef.current.watermarks[0]?.id
        const next = setWatermarkAnimationSlot(timelineRef.current, kind, id, targetId)
        commit(next, `wm-anim:${kind}:${id}`)
        const active = (targetId
          ? next.watermarks.find((item) => item.id === targetId)
          : next.watermarks[0]
        )?.animation
        const stillOn =
          kind === 'in' ? active?.inId === id : kind === 'out' ? active?.outId === id : active?.comboId === id
        push(
          stillOn
            ? `Animação "${def.label}" na marca d'água.`
            : `Animação "${def.label}" removida da marca d'água.`,
          'success',
        )
        return
      }
      const targets = selectedIds
        .map((clipId) => findClip(timelineRef.current, clipId))
        .filter((clip): clip is EditorClip => Boolean(clip) && !isEffectClip(clip!))
        .filter((clip) => {
          if (isTextClip(clip)) return true
          const asset = assetMap.get(clip.assetId)
          return Boolean(asset && asset.kind !== 'audio')
        })
      if (targets.length === 0) {
        push('Selecione um clipe de vídeo, imagem ou texto na timeline.', 'error')
        return
      }
      let next = timelineRef.current
      for (const clip of targets) next = setClipAnimationSlot(next, clip.id, kind, id)
      commit(next, `clip-anim:${kind}:${id}`)
      push(`Animação "${def.label}" aplicada.`, 'success')
    },
    [animationTarget, assetMap, commit, push, selectedIds, selectedWatermarkId],
  )

  const clearAnimationKind = useCallback(
    (kind: EditorAnimationKind) => {
      if (animationTarget === 'watermark') {
        const wm =
          (selectedWatermarkId
            ? timelineRef.current.watermarks.find((item) => item.id === selectedWatermarkId)
            : null) ?? timelineRef.current.watermarks[0]
        if (!wm) return
        const animation = { ...wm.animation }
        if (kind === 'in') animation.inId = null
        if (kind === 'out') animation.outId = null
        if (kind === 'combo') animation.comboId = null
        commit(upsertWatermark(timelineRef.current, { ...wm, animation }), `wm-anim-clear:${kind}`)
        return
      }
      if (selectedIds.length === 0) {
        push('Selecione um clipe de vídeo ou imagem na timeline.', 'error')
        return
      }
      let next = timelineRef.current
      for (const id of selectedIds) {
        const clip = findClip(next, id)
        if (!clip || isEffectClip(clip)) continue
        const animation = { ...clip.animation }
        if (kind === 'in') animation.inId = null
        if (kind === 'out') animation.outId = null
        if (kind === 'combo') animation.comboId = null
        next = updateClip(next, id, { animation })
      }
      commit(next, `clip-anim-clear:${kind}`)
    },
    [animationTarget, commit, push, selectedIds, selectedWatermarkId],
  )

  const stretchSelectedEffectToAll = useCallback(() => {
    if (selectedIds.length !== 1) return
    const clip = findClip(timelineRef.current, selectedIds[0])
    if (!clip || !isEffectClip(clip)) return
    const next = stretchEffectToFullTimeline(timelineRef.current, clip.id)
    if (next === timelineRef.current) return
    commit(next, `effect-stretch:${clip.id}`)
    const effect = clip.effectId ? editorEffectById(clip.effectId) : null
    push(
      effect
        ? `Efeito "${effect.label}" estendido do início ao fim.`
        : 'Efeito estendido do início ao fim.',
      'success',
    )
  }, [commit, push, selectedIds])

  const removeEffectFromSelected = useCallback(
    (effectId: string) => {
      if (selectedIds.length === 0) return
      let next = timelineRef.current
      for (const id of selectedIds) {
        const clip = findClip(next, id)
        if (clip && isEffectClip(clip) && clip.effectId === effectId) {
          next = deleteClips(next, [id], false)
          continue
        }
        next = removeClipEffect(next, id, effectId)
      }
      commit(next, `effects-remove:${effectId}`)
    },
    [commit, selectedIds],
  )

  const changeAspect = useCallback(
    (aspect: EditorAspect) => {
      if (timelineRef.current.aspect === aspect) return
      commit({ ...timelineRef.current, aspect })
    },
    [commit],
  )

  const fitZoom = useCallback(() => {
    const width = timelineBoxRef.current?.clientWidth ?? 900
    setZoom(clampZoom((width - TIMELINE_HEADER_WIDTH - 48) / Math.max(5, timelineDuration(timelineRef.current))))
  }, [])

  const saveName = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(project.name)
      return
    }
    try {
      await api.editor.update(project.id, { name: trimmed })
    } catch (error) {
      pushError(error, 'Falha ao renomear o projeto')
    }
  }, [api, name, project.id, project.name, pushError])

  // --- atalhos ---
  const shortcutsRef = useRef({ split, removeSelected, undo, redo, fitZoom })
  shortcutsRef.current = { split, removeSelected, undo, redo, fitZoom }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (exportOpen || assetToRemove || watermarkConfigOpen) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const actions = shortcutsRef.current
      const fps = timelineRef.current.fps

      if (event.code === 'Space') {
        event.preventDefault()
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur()
        store.toggle()
      } else if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) actions.redo()
        else actions.undo()
      } else if (mod && key === 'y') {
        event.preventDefault()
        actions.redo()
      } else if (!mod && key === 's') {
        event.preventDefault()
        actions.split()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        actions.removeSelected(event.shiftKey)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        store.pause()
        const delta = (event.shiftKey ? 1 : 1 / fps) * (event.key === 'ArrowRight' ? 1 : -1)
        store.seek(store.getTime() + delta)
      } else if (event.key === 'Home') {
        event.preventDefault()
        store.seek(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        store.seek(store.getDuration())
      } else if (!mod && (event.key === '+' || event.key === '=')) {
        setZoom((value) => clampZoom(value * 1.25))
      } else if (!mod && event.key === '-') {
        setZoom((value) => clampZoom(value / 1.25))
      } else if (event.key === 'Escape') {
        setSelectedIds([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [assetToRemove, exportOpen, store, watermarkConfigOpen])

  // --- divisor redimensionável entre preview e timeline ---
  const startResize = (event: ReactPointerEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = timelineHeight
    let latest = startHeight
    const move = (e: PointerEvent) => {
      const max = Math.round(window.innerHeight * 0.7)
      latest = Math.max(180, Math.min(max, startHeight - (e.clientY - startY)))
      setTimelineHeight(latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setFabBottomClearance(latest + 12)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const toolButton =
    'flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-soft bg-topbar px-3">
        <button
          type="button"
          title="Voltar para os projetos"
          onClick={() => navigate('/editor')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="h-8 min-w-0 max-w-[360px] flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-text hover:border-border-soft focus:border-accent/50 focus:outline-none"
        />
        <SaveIndicator state={saveState} />
        <div className="ml-auto flex items-center gap-1">
          <button type="button" title="Desfazer (Ctrl+Z)" className={toolButton} disabled={!history.canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" title="Refazer (Ctrl+Y)" className={toolButton} disabled={!history.canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </button>
          <Button
            className="ml-2 h-9 py-0"
            icon={<Download className="h-4 w-4" />}
            disabled={duration <= 0}
            onClick={() => {
              store.pause()
              setExportOpen(true)
            }}
          >
            Exportar
          </Button>
        </div>
      </header>

      <EditorLibraryBar
        tool={libraryTool}
        onToolChange={setLibraryTool}
        watermarks={timeline.watermarks}
        watermarkAssets={timeline.watermarks
          .map((item) => assetMap.get(item.assetId))
          .filter((asset): asset is EditorAsset => Boolean(asset))}
        busy={busy}
        onPickWatermark={() => void pickWatermark(null)}
        onOpenWatermarkConfig={() => {
          setSelectedWatermarkId((current) => current ?? timeline.watermarks[0]?.id ?? null)
          setWatermarkConfigOpen(true)
        }}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden border-r border-border-soft bg-sidebar">
          <MediaPanel
            tool={libraryTool}
            assets={assets}
            usedAssetIds={usedAssetIds}
            busy={busy}
            onImportDialog={() => void importDialog()}
            onImportFiles={(files) => void importPaths(filesToPaths(files), 'file')}
            onImportLipsync={(paths, add) => void importLipsync(paths, add)}
            onAdd={(asset) => insertAssets([asset])}
            onSync={(asset) => void syncAssetToMusic(asset)}
            onSyncMany={(list) => void syncAssetsToMusic(list)}
            onRemove={(asset) => {
              if (usedAssetIds.has(asset.id)) setAssetToRemove(asset)
              else {
                const cleaned = removeWatermarksUsingAsset(timelineRef.current, asset.id)
                if (cleaned !== timelineRef.current) commit(cleaned)
                void api.editor.removeAsset(asset.id).then(() =>
                  setAssets((list) => list.filter((item) => item.id !== asset.id)),
                )
              }
            }}
            onSetOrigin={(asset, origin) => {
              void api.editor.setAssetOrigin(asset.id, origin).then((updated) => {
                if (!updated) {
                  push('Não foi possível mover o vídeo de pasta.', 'error')
                  return
                }
                setAssets((list) => list.map((item) => (item.id === updated.id ? updated : item)))
                push(
                  origin === 'lipsync'
                    ? `"${asset.name}" movido para Lipsync.`
                    : `"${asset.name}" movido para Encenação e show.`,
                  'success',
                )
              })
            }}
            onPickEffect={(id, options) => toggleEffectOnTimeline(id, options)}
            activeEffectIds={activeEffectIds}
            animationTarget={animationTarget}
            onAnimationTargetChange={setAnimationTarget}
            activeAnimation={activeAnimation}
            hasWatermark={timeline.watermarks.length > 0}
            onPickAnimation={applyAnimation}
            onClearAnimationKind={clearAnimationKind}
            onPickTextTemplate={placeTextTemplate}
            onPickTransition={(id: EditorTransitionId) => {
              const transition = editorTransitionById(id)
              if (!transition) return
              push(`Transição "${transition.label}" selecionada (${transition.defaultDuration}s).`, 'success')
            }}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-bg">
          <div className="min-h-0 flex-1 p-4">
            <PreviewPlayer timeline={timeline} assets={assetMap} store={store} />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-soft px-4 py-2">
            <TimeDisplay store={store} duration={duration} fps={timeline.fps} />
            <TransportBar store={store} duration={duration} fps={timeline.fps} />
            <span className="w-[140px] text-right text-[11px] text-muted-2">{timeline.aspect}</span>
          </div>
        </section>

        <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-border-soft bg-sidebar">
          <PropertiesPanel
            timeline={timeline}
            clip={selectedClip}
            asset={selectedClip ? (assetMap.get(selectedClip.assetId) ?? null) : null}
            selectionCount={selectedIds.length}
            selectionHasVisual={selectionHasVisual}
            selectionHasAudio={selectionHasAudio}
            onAspectChange={changeAspect}
            onClipPatch={patchSelected}
            onRemoveEffect={removeEffectFromSelected}
            onSplit={split}
            onDelete={() => removeSelected(false)}
            onApplyEffectToAll={stretchSelectedEffectToAll}
            onTextPatch={(patch) => {
              if (selectedIds.length !== 1) return
              const next = updateTextContent(timelineRef.current, selectedIds[0], patch)
              commit(next, `text-edit:${selectedIds[0]}`)
            }}
          />
        </aside>
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={startResize}
        className="h-1.5 shrink-0 cursor-row-resize border-y border-border-soft bg-sidebar transition-colors hover:bg-accent/40"
      />

      <div className="flex shrink-0 flex-col bg-sidebar" style={{ height: timelineHeight }}>
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-soft px-2">
          <button type="button" title="Dividir no playhead (S)" className={toolButton} onClick={split}>
            <Scissors className="h-4 w-4" />
            Dividir
          </button>
          <button
            type="button"
            title="Excluir (Delete) — Shift+Delete fecha o buraco"
            className={toolButton}
            disabled={selectedIds.length === 0}
            onClick={() => removeSelected(false)}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
          <button
            type="button"
            title={
              selectedIds.length > 0
                ? 'Alinhar o trecho selecionado pelo áudio igual ao da música'
                : 'Alinhar todos os vídeos pelo áudio igual ao da música'
            }
            className={toolButton}
            disabled={busy}
            onClick={() => void syncSelectedToMusic()}
          >
            <Crosshair className="h-4 w-4" />
            {selectedIds.length > 0 ? 'Sincronizar' : 'Sincronizar tudo'}
          </button>
          <span className="mx-1 h-5 w-px bg-border-soft" />
          <button
            type="button"
            title="Nova faixa de vídeo"
            className={toolButton}
            onClick={() => commit(addTrack(timelineRef.current, 'video').timeline)}
          >
            <Film className="h-4 w-4" />+ Vídeo
          </button>
          <button
            type="button"
            title="Nova faixa de áudio"
            className={toolButton}
            onClick={() => commit(addTrack(timelineRef.current, 'audio').timeline)}
          >
            <Music2 className="h-4 w-4" />+ Áudio
          </button>
          <button
            type="button"
            title="Nova faixa de efeito"
            className={toolButton}
            onClick={() => commit(addTrack(timelineRef.current, 'effect').timeline)}
          >
            <Sparkles className="h-4 w-4" />+ Efeito
          </button>
          <button
            type="button"
            title="Nova faixa de texto"
            className={toolButton}
            onClick={() => commit(ensureTextTrack(timelineRef.current).timeline)}
          >
            <Type className="h-4 w-4" />+ Texto
          </button>
          <span className="mx-1 h-5 w-px bg-border-soft" />
          <button
            type="button"
            title={snapping ? 'Desligar encaixe magnético' : 'Ligar encaixe magnético'}
            className={cn(toolButton, snapping && 'bg-accent-subtle text-accent hover:bg-accent-subtle hover:text-accent')}
            onClick={() => setSnapping((value) => !value)}
          >
            <Magnet className="h-4 w-4" />
            Encaixe
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" title="Diminuir zoom (-)" className={toolButton} onClick={() => setZoom((v) => clampZoom(v / 1.25))}>
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={Math.log(TIMELINE_MIN_ZOOM)}
              max={Math.log(TIMELINE_MAX_ZOOM)}
              step={0.01}
              value={Math.log(zoom)}
              onChange={(event) => setZoom(clampZoom(Math.exp(Number(event.target.value))))}
              className="w-28 accent-[var(--color-accent)]"
              aria-label="Zoom da timeline"
            />
            <button type="button" title="Aumentar zoom (+)" className={toolButton} onClick={() => setZoom((v) => clampZoom(v * 1.25))}>
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" title="Ajustar à largura" className={toolButton} onClick={fitZoom}>
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div ref={timelineBoxRef} className="min-h-0 flex-1">
          <Timeline
            timeline={timeline}
            assets={assetMap}
            store={store}
            zoom={zoom}
            onZoomChange={setZoom}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            snapping={snapping}
            onCommit={commit}
            onDropAsset={(assetId, trackId, time) => {
              const asset = assetMap.get(assetId)
              if (asset) insertAssets([asset], { trackId, time, newTrack: trackId === null })
            }}
            onDropFiles={(files, trackId, time) => {
              void importPaths(filesToPaths(files), 'file').then((imported) =>
                insertAssets(imported, { trackId, time, newTrack: trackId === null }),
              )
            }}
            onDropEffect={(effectId, trackId, time) => {
              placeEffectOnTimeline(effectId as EditorEffectId, trackId, time, {
                newTrack: trackId === null,
              })
            }}
          />
        </div>
      </div>

      <WatermarkConfigModal
        open={watermarkConfigOpen}
        aspect={timeline.aspect}
        watermarks={timeline.watermarks}
        selectedId={selectedWatermarkId}
        assetsById={assetMap}
        busy={busy}
        onClose={() => setWatermarkConfigOpen(false)}
        onSelect={setSelectedWatermarkId}
        onChange={patchWatermark}
        onPickImage={(watermarkId) => void pickWatermark(watermarkId)}
        onAdd={() => void pickWatermark(null)}
        onRemove={clearWatermark}
      />

      <ExportModal
        open={exportOpen}
        projectId={project.id}
        aspect={timeline.aspect}
        duration={duration}
        onBeforeExport={flush}
        onClose={() => setExportOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(assetToRemove)}
        title="Remover mídia do projeto?"
        message="Os clipes desta mídia também saem da timeline. O arquivo original continua no disco."
        confirmLabel="Remover"
        tone="danger"
        onConfirm={() => void confirmRemoveAsset()}
        onClose={() => setAssetToRemove(null)}
      />
    </div>
  )
}

export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>()
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const [data, setData] = useState<{ project: EditorProject; assets: EditorAsset[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    void api.editor
      .get(id)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          push('Projeto de edição não encontrado.', 'error')
          navigate('/editor', { replace: true })
          return
        }
        setData(result)
      })
      .catch((error) => {
        console.error('[atlas] falha ao abrir o projeto de edição', error)
        navigate('/editor', { replace: true })
      })
    return () => {
      cancelled = true
    }
  }, [api, id, navigate, push])

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Abrindo o editor...
      </div>
    )
  }

  return <EditorWorkspace key={data.project.id} project={data.project} initialAssets={data.assets} />
}
