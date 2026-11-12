import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  Captions,
  CheckSquare,
  Clapperboard,
  Crosshair,
  FolderOpen,
  Image as ImageIcon,
  ListPlus,
  Loader2,
  Mic2,
  Music2,
  Plus,
  RefreshCw,
  Trash2,
  Type,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { sceneNumberFromAsset } from '@shared/editor/syncToMusic'
import {
  formatDuration,
  type EditorAsset,
  type EditorAssetOrigin,
  type EditorLipsyncGroup,
} from '@shared/editor/types'
import { getAtlasApi } from '../../lib/api'
import { EDITOR_ASSET_DRAG_TYPE, formatBytes } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'
import type { EditorAnimationKind } from '@shared/editor/animationsCatalog'
import type { EditorEffectId } from '@shared/editor/effectsCatalog'
import type { EditorTransitionId } from '@shared/editor/transitionsCatalog'
import type { EditorLibraryTool } from './editorLibraryTools'
import { AnimationsLibraryPanel } from './AnimationsLibraryPanel'
import { EffectsLibraryPanel } from './EffectsLibraryPanel'
import { TextLibraryPanel } from './TextLibraryPanel'
import { TransitionsLibraryPanel } from './TransitionsLibraryPanel'

function isSyncableVideo(asset: EditorAsset): boolean {
  return asset.kind === 'video' && asset.available !== false
}

type MediaFilter = 'all' | 'lipsync' | 'stage'

const MEDIA_FILTERS: Array<{ id: MediaFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'lipsync', label: 'Lipsync' },
  { id: 'stage', label: 'Encenação' },
]

function isLipsyncVideo(asset: EditorAsset): boolean {
  return asset.kind === 'video' && asset.origin === 'lipsync'
}

function isStageVideo(asset: EditorAsset): boolean {
  return asset.kind === 'video' && asset.origin !== 'lipsync'
}

function AssetThumb({ asset }: { asset: EditorAsset }) {
  if (asset.kind === 'audio') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-emerald-950/60">
        <Music2 className="h-6 w-6 text-emerald-300/80" />
      </div>
    )
  }
  if (!asset.thumbsUrl || asset.thumbsTileWidth < 1) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-elevated">
        {asset.kind === 'image' ? (
          <ImageIcon className="h-6 w-6 text-muted-2" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-muted-2" />
        )}
      </div>
    )
  }
  if (asset.kind === 'image') {
    return <img src={asset.thumbsUrl} alt="" draggable={false} className="h-full w-full object-cover" />
  }
  // Frame do meio da tira de miniaturas, esticado para cobrir o card.
  const middle = Math.floor(asset.thumbsCount / 2)
  const percent = asset.thumbsCount > 1 ? (middle / (asset.thumbsCount - 1)) * 100 : 0
  return (
    <div
      className="h-full w-full"
      style={{
        backgroundImage: `url("${asset.thumbsUrl}")`,
        backgroundSize: `${asset.thumbsCount * 100}% 100%`,
        backgroundPosition: `${percent}% 0`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}

function AssetCard({
  asset,
  used,
  selected,
  syncPartLabel,
  onSelect,
  onAdd,
  onSync,
  onRemove,
  onSetOrigin,
}: {
  asset: EditorAsset
  used: boolean
  selected: boolean
  syncPartLabel: string | null
  onSelect: (event: ReactMouseEvent) => void
  onAdd: () => void
  onSync: () => void
  onRemove: () => void
  onSetOrigin?: (origin: EditorAssetOrigin) => void
}) {
  const unavailable = asset.available === false
  const canSync = Boolean(syncPartLabel) && !unavailable
  const isVideo = asset.kind === 'video'
  return (
    <div
      draggable={!unavailable}
      onDragStart={(event) => {
        event.dataTransfer.setData(EDITOR_ASSET_DRAG_TYPE, asset.id)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={onSelect}
      onDoubleClick={() => !unavailable && onAdd()}
      title={asset.sourcePath}
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-card transition-colors',
        selected ? 'border-accent/70 ring-1 ring-accent/40' : 'border-border-soft',
        unavailable ? 'opacity-60' : 'cursor-grab hover:border-border-strong active:cursor-grabbing',
      )}
    >
      <div className="relative aspect-video overflow-hidden">
        <AssetThumb asset={asset} />
        {asset.kind !== 'image' ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
            {formatDuration(asset.duration)}
          </span>
        ) : null}
        {asset.origin === 'lipsync' ? (
          <span className="absolute left-1 top-1 rounded bg-black/70 p-0.5 text-white" title="Vídeo do Lipsync">
            <Mic2 className="h-3 w-3" />
          </span>
        ) : isVideo ? (
          <span
            className="absolute left-1 top-1 rounded bg-black/70 p-0.5 text-white"
            title="Encenação / show"
          >
            <Clapperboard className="h-3 w-3" />
          </span>
        ) : null}
        {asset.proxyStatus === 'pending' ? (
          <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white/90">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            Otimizando
          </span>
        ) : null}
        {used ? (
          <span
            className="absolute right-1 top-1 rounded bg-accent/90 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-on-accent shadow-sm"
            title="Já está na timeline"
          >
            Adicionado
          </span>
        ) : null}
        {unavailable ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
        ) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 px-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          {canSync ? (
            <button
              type="button"
              title={`Sincronizar com ${syncPartLabel} da música`}
              onClick={(event) => {
                event.stopPropagation()
                onSync()
              }}
              className="flex max-w-full items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold text-on-accent shadow-sm"
            >
              <Crosshair className="h-3 w-3 shrink-0" />
              <span className="truncate">Sync · {syncPartLabel}</span>
            </button>
          ) : null}
          {isVideo && onSetOrigin ? (
            <button
              type="button"
              title={
                asset.origin === 'lipsync'
                  ? 'Mover para Encenação / show'
                  : 'Mover para Lipsync'
              }
              onClick={(event) => {
                event.stopPropagation()
                onSetOrigin(asset.origin === 'lipsync' ? 'file' : 'lipsync')
              }}
              className="flex max-w-full items-center gap-1 rounded-full bg-elevated/95 px-2.5 py-1 text-[10px] font-semibold text-text"
            >
              {asset.origin === 'lipsync' ? (
                <Clapperboard className="h-3 w-3 shrink-0" />
              ) : (
                <Mic2 className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">
                {asset.origin === 'lipsync' ? '→ Encenação' : '→ Lipsync'}
              </span>
            </button>
          ) : null}
          <div className="flex items-center gap-1.5">
            {!unavailable ? (
              <button
                type="button"
                title="Adicionar ao fim da timeline"
                onClick={(event) => {
                  event.stopPropagation()
                  onAdd()
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-elevated text-text hover:bg-accent hover:text-on-accent"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              title="Remover da biblioteca"
              onClick={(event) => {
                event.stopPropagation()
                onRemove()
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-elevated text-muted hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      <p className="truncate px-2 py-1.5 text-[11px] text-muted">{asset.name}</p>
    </div>
  )
}

function MediaSection({
  title,
  Icon,
  count,
  children,
}: {
  title: string
  Icon: LucideIcon
  count: number
  children: ReactNode
}) {
  if (count === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-2" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-2">
          {title}
        </h3>
        <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[9px] tabular-nums text-muted">
          {count}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  )
}

function LibraryPlaceholder({
  Icon,
  title,
  description,
}: {
  Icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated text-muted-2">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-[11px] leading-relaxed text-muted-2">{description}</p>
      </div>
    </div>
  )
}

export function MediaPanel({
  tool,
  assets,
  usedAssetIds,
  busy,
  onImportDialog,
  onImportFiles,
  onImportLipsync,
  onAdd,
  onSync,
  onSyncMany,
  onRemove,
  onSetOrigin,
  onPickEffect,
  onPickTransition,
  activeEffectIds,
  animationTarget,
  onAnimationTargetChange,
  activeAnimation,
  hasWatermark,
  onPickAnimation,
  onClearAnimationKind,
  onPickTextTemplate,
}: {
  tool: EditorLibraryTool
  assets: EditorAsset[]
  usedAssetIds: Set<string>
  busy: boolean
  onImportDialog: () => void
  onImportFiles: (files: File[]) => void
  onImportLipsync: (paths: string[], addToTimeline: boolean) => void
  onAdd: (asset: EditorAsset) => void
  onSync: (asset: EditorAsset) => void
  onSyncMany: (assets: EditorAsset[]) => void
  onRemove: (asset: EditorAsset) => void
  onSetOrigin?: (asset: EditorAsset, origin: EditorAssetOrigin) => void
  onPickEffect?: (id: EditorEffectId, options?: { applyToAll?: boolean }) => void
  onPickTransition?: (id: EditorTransitionId) => void
  activeEffectIds?: string[]
  animationTarget?: 'clip' | 'watermark'
  onAnimationTargetChange?: (target: 'clip' | 'watermark') => void
  activeAnimation?: { inId: string | null; outId: string | null; comboId: string | null } | null
  hasWatermark?: boolean
  onPickAnimation?: (kind: EditorAnimationKind, id: string) => void
  onClearAnimationKind?: (kind: EditorAnimationKind) => void
  onPickTextTemplate?: (templateId: string) => void
}) {
  const api = getAtlasApi()
  const [dragOver, setDragOver] = useState(false)
  const [groups, setGroups] = useState<EditorLipsyncGroup[] | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
  const lastClickedIdRef = useRef<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const lipsyncVideos = useMemo(() => assets.filter(isLipsyncVideo), [assets])
  const stageVideos = useMemo(() => assets.filter(isStageVideo), [assets])
  const otherAssets = useMemo(
    () => assets.filter((asset) => asset.kind !== 'video'),
    [assets],
  )
  const videoAssets = useMemo(() => {
    if (mediaFilter === 'lipsync') return lipsyncVideos.filter(isSyncableVideo)
    if (mediaFilter === 'stage') return stageVideos.filter(isSyncableVideo)
    return assets.filter(isSyncableVideo)
  }, [assets, lipsyncVideos, mediaFilter, stageVideos])
  const videoIdSet = useMemo(() => new Set(videoAssets.map((asset) => asset.id)), [videoAssets])
  const selectedVideos = useMemo(
    () => videoAssets.filter((asset) => selectedIds.includes(asset.id)),
    [selectedIds, videoAssets],
  )

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => videoIdSet.has(id)))
  }, [videoIdSet])

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      setGroups(await api.editor.listLipsync())
    } catch {
      setGroups([])
    } finally {
      setLoadingGroups(false)
    }
  }, [api])

  useEffect(() => {
    if (tool === 'lipsync' && groups === null) void loadGroups()
  }, [groups, loadGroups, tool])

  const importedPaths = new Set(assets.map((asset) => asset.sourcePath.toLowerCase()))

  const selectAllVideos = useCallback(() => {
    setSelectedIds(videoAssets.map((asset) => asset.id))
  }, [videoAssets])

  const clearSelection = useCallback(() => setSelectedIds([]), [])

  const handleAssetSelect = useCallback(
    (asset: EditorAsset, event: ReactMouseEvent) => {
      if (!isSyncableVideo(asset)) {
        setSelectedIds([])
        lastClickedIdRef.current = null
        return
      }
      const ids = videoAssets.map((item) => item.id)
      const index = ids.indexOf(asset.id)
      if (index < 0) return

      if (event.shiftKey && lastClickedIdRef.current) {
        const anchor = ids.indexOf(lastClickedIdRef.current)
        if (anchor >= 0) {
          const [from, to] = anchor < index ? [anchor, index] : [index, anchor]
          setSelectedIds(ids.slice(from, to + 1))
          return
        }
      }

      if (event.metaKey || event.ctrlKey) {
        setSelectedIds((prev) =>
          prev.includes(asset.id) ? prev.filter((id) => id !== asset.id) : [...prev, asset.id],
        )
      } else {
        setSelectedIds([asset.id])
      }
      lastClickedIdRef.current = asset.id
    },
    [videoAssets],
  )

  const syncTargets = selectedVideos.length > 0 ? selectedVideos : videoAssets
  const syncLabel =
    selectedVideos.length > 0
      ? `Sincronizar ${selectedVideos.length}`
      : videoAssets.length > 0
        ? 'Sincronizar todos'
        : 'Sincronizar'

  const onDrop = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDragOver(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length > 0) onImportFiles(files)
  }

  const onPanelKeyDown = (event: ReactKeyboardEvent) => {
    if (tool !== 'media') return
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selectAllVideos()
      return
    }
    if (event.key === 'Escape') {
      clearSelection()
    }
  }

  if (tool === 'effects') {
    return <EffectsLibraryPanel activeEffectIds={activeEffectIds} onPickEffect={onPickEffect} />
  }

  if (tool === 'animations') {
    return (
      <AnimationsLibraryPanel
        target={animationTarget ?? 'clip'}
        onTargetChange={onAnimationTargetChange ?? (() => undefined)}
        activeInId={activeAnimation?.inId}
        activeOutId={activeAnimation?.outId}
        activeComboId={activeAnimation?.comboId}
        hasWatermark={Boolean(hasWatermark)}
        onPick={onPickAnimation ?? (() => undefined)}
        onClearKind={onClearAnimationKind ?? (() => undefined)}
      />
    )
  }

  if (tool === 'transitions') {
    return <TransitionsLibraryPanel onPickTransition={onPickTransition} />
  }

  if (tool === 'captions') {
    return (
      <LibraryPlaceholder
        Icon={Captions}
        title="Legendas"
        description="Em breve: legendas sincronizadas com a narração e estilos prontos."
      />
    )
  }

  if (tool === 'text') {
    return <TextLibraryPanel onPickTemplate={onPickTextTemplate ?? (() => undefined)} />
  }

  return (
    <div
      ref={panelRef}
      tabIndex={0}
      onKeyDown={onPanelKeyDown}
      className="flex h-full min-h-0 flex-col outline-none"
    >
      {tool === 'media' ? (
        <div
          className={cn('flex min-h-0 flex-1 flex-col', dragOver && 'bg-accent-subtle/30')}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false)
          }}
          onDrop={onDrop}
        >
          <div className="space-y-2 p-2">
            <button
              type="button"
              disabled={busy}
              onClick={onImportDialog}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong py-3 text-xs font-semibold text-muted transition-colors hover:border-accent/60 hover:text-text disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar vídeo, áudio ou imagem
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-border-soft bg-elevated/40 p-0.5">
              {MEDIA_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMediaFilter(item.id)}
                  className={cn(
                    'flex-1 rounded-md px-1.5 py-1 text-[10px] font-semibold transition-colors',
                    mediaFilter === item.id
                      ? 'bg-accent-subtle text-accent'
                      : 'text-muted hover:text-text',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {videoAssets.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  title="Selecionar todos os vídeos visíveis (Ctrl+A)"
                  onClick={selectAllVideos}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border-soft px-2 py-1.5 text-[10px] font-semibold text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
                >
                  <CheckSquare className="h-3 w-3" />
                  Selecionar todos
                </button>
                <button
                  type="button"
                  disabled={busy || syncTargets.length === 0}
                  title={
                    selectedVideos.length > 0
                      ? `Alinhar ${selectedVideos.length} vídeo(s) pelo áudio igual ao da música`
                      : 'Alinhar os vídeos visíveis pelo áudio igual ao da música'
                  }
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onSyncMany(syncTargets)
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-2 py-1.5 text-[10px] font-semibold text-on-accent transition-colors hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
                  {syncLabel}
                </button>
              </div>
            ) : null}
            {selectedVideos.length > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="w-full text-center text-[10px] text-muted-2 hover:text-muted"
              >
                {selectedVideos.length} selecionado(s) · limpar
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-3">
            {assets.length === 0 ? (
              <p className="px-2 py-8 text-center text-[11px] leading-relaxed text-muted-2">
                Importe arquivos ou arraste do Explorer para cá. Os originais nunca são alterados.
              </p>
            ) : (
              <>
                {(mediaFilter === 'all' || mediaFilter === 'lipsync') && (
                  <MediaSection title="Lipsync" Icon={Mic2} count={lipsyncVideos.length}>
                    {lipsyncVideos.map((asset) => {
                      const scene = sceneNumberFromAsset(asset)
                      return (
                        <AssetCard
                          key={asset.id}
                          asset={asset}
                          used={usedAssetIds.has(asset.id)}
                          selected={selectedIds.includes(asset.id)}
                          syncPartLabel={scene != null ? `Trecho ${scene}` : null}
                          onSelect={(event) => handleAssetSelect(asset, event)}
                          onAdd={() => onAdd(asset)}
                          onSync={() => onSync(asset)}
                          onRemove={() => onRemove(asset)}
                          onSetOrigin={
                            onSetOrigin ? (origin) => onSetOrigin(asset, origin) : undefined
                          }
                        />
                      )
                    })}
                  </MediaSection>
                )}
                {(mediaFilter === 'all' || mediaFilter === 'stage') && (
                  <MediaSection title="Encenação e show" Icon={Clapperboard} count={stageVideos.length}>
                    {stageVideos.map((asset) => {
                      const scene = sceneNumberFromAsset(asset)
                      return (
                        <AssetCard
                          key={asset.id}
                          asset={asset}
                          used={usedAssetIds.has(asset.id)}
                          selected={selectedIds.includes(asset.id)}
                          syncPartLabel={scene != null ? `Trecho ${scene}` : null}
                          onSelect={(event) => handleAssetSelect(asset, event)}
                          onAdd={() => onAdd(asset)}
                          onSync={() => onSync(asset)}
                          onRemove={() => onRemove(asset)}
                          onSetOrigin={
                            onSetOrigin ? (origin) => onSetOrigin(asset, origin) : undefined
                          }
                        />
                      )
                    })}
                  </MediaSection>
                )}
                {mediaFilter === 'all' && (
                  <MediaSection title="Áudio e imagens" Icon={Music2} count={otherAssets.length}>
                    {otherAssets.map((asset) => (
                      <AssetCard
                        key={asset.id}
                        asset={asset}
                        used={usedAssetIds.has(asset.id)}
                        selected={selectedIds.includes(asset.id)}
                        syncPartLabel={null}
                        onSelect={(event) => handleAssetSelect(asset, event)}
                        onAdd={() => onAdd(asset)}
                        onSync={() => onSync(asset)}
                        onRemove={() => onRemove(asset)}
                      />
                    ))}
                  </MediaSection>
                )}
                {mediaFilter === 'lipsync' && lipsyncVideos.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-2">
                    Nenhum vídeo de Lipsync aqui. Importe pela aba Lipsync ou use “→ Lipsync” no card.
                  </p>
                ) : null}
                {mediaFilter === 'stage' && stageVideos.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted-2">
                    Nenhum vídeo de encenação/show. Importe takes de show ou mova um card para cá.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-[11px] text-muted-2">Vídeos em {'{pasta do projeto}'}/lipsync</p>
            <button
              type="button"
              title="Atualizar"
              onClick={() => void loadGroups()}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 hover:bg-hover hover:text-text"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingGroups && 'animate-spin')} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
            {groups === null || (loadingGroups && groups.length === 0) ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-2" />
              </div>
            ) : groups.length === 0 ? (
              <p className="px-2 py-8 text-center text-[11px] leading-relaxed text-muted-2">
                Nenhum vídeo de Lipsync encontrado. Os vídeos gerados no Comfy aparecem aqui quando o projeto
                tem uma pasta vinculada.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.projectId} className="rounded-lg border border-border-soft bg-card">
                  <div className="flex items-center gap-2 border-b border-border-soft px-2.5 py-2">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-2" />
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold text-text" title={group.folder}>
                      {group.projectName}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      title="Importar todos em ordem e colocar na timeline"
                      onClick={() => onImportLipsync(group.videos.map((video) => video.path), true)}
                      className="flex items-center gap-1 rounded-md bg-accent-subtle px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
                    >
                      <ListPlus className="h-3 w-3" />
                      Tudo na timeline
                    </button>
                  </div>
                  <ul className="divide-y divide-border-soft">
                    {group.videos.map((video) => {
                      const pathKey = video.path.toLowerCase()
                      const imported = importedPaths.has(pathKey)
                      const matched = assets.find((asset) => asset.sourcePath.toLowerCase() === pathKey)
                      const used = Boolean(matched && usedAssetIds.has(matched.id))
                      return (
                        <li key={video.path} className="flex items-center gap-2 px-2.5 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] text-text">{video.name}</p>
                            <p className="text-[10px] text-muted-2">{formatBytes(video.size)}</p>
                          </div>
                          {used ? (
                            <span
                              className="shrink-0 rounded bg-accent-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent"
                              title="Já está na timeline"
                            >
                              Adicionado
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              title={
                                imported
                                  ? 'Já está na biblioteca — adicionar à timeline'
                                  : 'Importar e adicionar à timeline'
                              }
                              onClick={() => onImportLipsync([video.path], true)}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-accent disabled:opacity-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
