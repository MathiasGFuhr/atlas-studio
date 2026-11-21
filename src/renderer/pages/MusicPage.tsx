import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Captions,
  Check,
  Clock3,
  FolderOpen,
  GripVertical,
  Loader2,
  Music2,
  Plus,
  Scissors,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import type { MusicTrack } from '@shared/musicAnalysis'
import { formatTimecode } from '@shared/musicAnalysis'
import {
  MUSIC_NO_SINGER_ID,
  groupMusicTracksBySinger,
  matchesMusicTrackQuery,
  type MusicSingerGroup,
} from '@shared/musicGrouping'
import type { Channel } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/Modal'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { environmentBreadcrumb } from '../lib/environments'
import { onChannelsChanged } from '../lib/channelEvents'
import { cn, formatRelativeDate } from '../lib/utils'
import { useMusicCaptionGeneration } from '../hooks/useMusicCaptionGeneration'

function SingerAvatar({
  channel,
  isNoSinger,
}: {
  channel: Channel | null
  isNoSinger: boolean
}) {
  const color = channel?.color || '#35bf9b'
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border-soft"
      style={
        isNoSinger
          ? undefined
          : { background: `linear-gradient(145deg, ${color}33, var(--color-elevated))` }
      }
    >
      {channel?.avatarDataUrl ? (
        <img src={channel.avatarDataUrl} alt="" className="h-full w-full object-cover" />
      ) : isNoSinger ? (
        <FolderOpen className="h-5 w-5 text-muted" />
      ) : (
        <UserRound className="h-5 w-5" style={{ color }} />
      )}
    </div>
  )
}

export function MusicPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { push, pushError } = useToast()
  const captionGeneration = useMusicCaptionGeneration()
  const prevActiveCountRef = useRef(captionGeneration.activeJobs.length)

  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [query, setQuery] = useState('')
  const [importChannelId, setImportChannelId] = useState('')
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [dropTargetChannelId, setDropTargetChannelId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<MusicTrack | null>(null)

  const groupId = searchParams.get('cantor')

  const setGroupId = useCallback(
    (nextId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (nextId) next.set('cantor', nextId)
          else next.delete('cantor')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const load = useCallback(async () => {
    setTracks(await api.music.list())
  }, [api])

  const loadChannels = useCallback(async () => {
    try {
      const list = await api.channels.list({ channelType: 'music' })
      setChannels(
        list
          .filter((channel) => channel.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })),
      )
    } catch (error) {
      console.error('[atlas] falha ao listar cantores', error)
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadChannels()
    return onChannelsChanged(() => void loadChannels())
  }, [loadChannels])

  useEffect(() => {
    const count = captionGeneration.activeJobs.length
    if (count < prevActiveCountRef.current) {
      void load()
    }
    prevActiveCountRef.current = count
  }, [captionGeneration.activeJobs.length, load])

  const channelsById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels],
  )

  const filtered = useMemo(
    () => tracks.filter((track) => matchesMusicTrackQuery(track, query)),
    [tracks, query],
  )

  const groups = useMemo(
    () => groupMusicTracksBySinger(filtered, channels),
    [filtered, channels],
  )

  const activeGroup: MusicSingerGroup | null = useMemo(
    () => (groupId ? groups.find((group) => group.id === groupId) ?? null : null),
    [groupId, groups],
  )

  useEffect(() => {
    if (groupId && tracks.length > 0 && !groups.some((group) => group.id === groupId)) {
      setGroupId(null)
    }
    setSelectedIds([])
  }, [groupId, groups, setGroupId, tracks.length])

  const visibleTracks = activeGroup ? activeGroup.tracks : filtered

  const stats = useMemo(() => {
    const cuts = visibleTracks.reduce((sum, track) => sum + track.cuts.length, 0)
    const withCaptions = visibleTracks.filter((track) => (track.captions?.length ?? 0) > 0).length
    return { count: visibleTracks.length, cuts, withCaptions }
  }, [visibleTracks])

  async function importTrack() {
    setImporting(true)
    const targetChannelId =
      activeGroup && activeGroup.id !== MUSIC_NO_SINGER_ID
        ? activeGroup.id
        : importChannelId.trim() || null
    try {
      const track = await api.music.import(null, targetChannelId)
      if (!track) return
      push('Música importada. Abrindo o editor de cortes.', 'success')
      const editorUrl = targetChannelId
        ? `/musica/faixas/${track.id}?cantor=${encodeURIComponent(targetChannelId)}`
        : `/musica/faixas/${track.id}`
      navigate(editorUrl)
    } catch (error) {
      pushError(error, 'Falha ao importar a música')
    } finally {
      setImporting(false)
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  async function assignTracksToChannel(
    trackIds: string[],
    targetChannelId: string | null,
    targetLabel: string,
  ) {
    if (trackIds.length === 0) return
    setBusy(true)
    try {
      const updatedList: MusicTrack[] = []
      for (const id of trackIds) {
        const updated = await api.music.update(id, { channelId: targetChannelId })
        if (updated) updatedList.push(updated)
      }
      const map = new Map(updatedList.map((item) => [item.id, item]))
      setTracks((current) => current.map((item) => map.get(item.id) ?? item))
      setSelectedIds([])
      setDraggingIds([])
      setDropTargetChannelId(null)
      push(
        updatedList.length === 1
          ? `Música vinculada a ${targetLabel}.`
          : `${updatedList.length} músicas vinculadas a ${targetLabel}.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Falha ao vincular músicas ao cantor')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.music.remove(deleting.id)
      push('Música removida.', 'success')
      setDeleting(null)
      await load()
    } catch (error) {
      pushError(error, 'Falha ao remover a música')
    }
  }

  function openTrack(track: MusicTrack) {
    const cantorParam = activeGroup?.id ?? track.channelId ?? null
    navigate(
      cantorParam
        ? `/musica/faixas/${track.id}?cantor=${encodeURIComponent(cantorParam)}`
        : `/musica/faixas/${track.id}`,
    )
  }

  const showingTracks = Boolean(activeGroup)

  return (
    <PageShell>
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <PageHeader
          className="mb-0"
          breadcrumb={
            activeGroup
              ? environmentBreadcrumb('music', 'Cortes', activeGroup.name)
              : environmentBreadcrumb('music', 'Cortes')
          }
          title={activeGroup ? activeGroup.name : 'Cortes'}
          subtitle={
            activeGroup
              ? 'Faixas deste cantor. Clique para cortar, legendar ou enviar ao LipSync.'
              : 'Escolha o cantor para ver as músicas — ou importe uma nova faixa.'
          }
        />
        <div data-tour="page-actions" className="flex shrink-0 flex-wrap items-center gap-2">
          {!activeGroup && channels.length > 0 ? (
            <select
              aria-label="Cantor para importação"
              value={importChannelId}
              onChange={(event) => setImportChannelId(event.target.value)}
              className="h-11 rounded-xl border border-border bg-elevated px-3 text-sm text-text focus:border-accent/50 focus:outline-none"
            >
              <option value="">Sem cantor</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            className="h-11 px-5"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => void importTrack()}
            disabled={importing}
          >
            {importing ? 'Importando...' : 'Importar música'}
          </Button>
        </div>
      </div>

      {tracks.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {activeGroup ? (
            <Button
              variant="secondary"
              className="h-11"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => setGroupId(null)}
            >
              Cantores
            </Button>
          ) : null}
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={activeGroup ? 'Buscar música...' : 'Buscar cantor ou música...'}
              className="h-11 w-full rounded-xl border border-border bg-elevated pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      {tracks.length > 0 ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Card padding="sm" className="bg-elevated/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Faixas</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{stats.count}</p>
          </Card>
          <Card padding="sm" className="bg-elevated/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Cortes</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{stats.cuts}</p>
          </Card>
          <Card padding="sm" className="bg-elevated/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Com legenda</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-text">
              {stats.withCaptions}
            </p>
          </Card>
        </div>
      ) : null}

      {tracks.length === 0 ? (
        <Card className="overflow-hidden border-dashed">
          <div className="relative px-6 py-16 text-center sm:px-10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-accent/10 to-transparent" />
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent-subtle text-accent">
              <Scissors className="h-6 w-6" />
            </div>
            <h2 className="relative mt-5 text-lg font-semibold text-text">Comece pela primeira faixa</h2>
            <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              Importe o áudio, marque os cortes e prepare a legenda. Cada trecho pode ir depois para o LipSync.
            </p>
            <div className="relative mt-6 flex justify-center">
              <Button
                className="h-11 px-5"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => void importTrack()}
                disabled={importing}
              >
                {importing ? 'Importando...' : 'Importar música'}
              </Button>
            </div>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <Music2 className="h-10 w-10 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">Nenhum resultado encontrado</p>
          <p className="mt-1 text-xs text-muted">Tente buscar por cantor ou nome da música.</p>
        </Card>
      ) : !showingTracks ? (
        <>
          <p className="mb-4 text-xs text-muted-2">
            {groups.length} {groups.length === 1 ? 'cantor' : 'cantores'} · {filtered.length}{' '}
            {filtered.length === 1 ? 'faixa' : 'faixas'}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {groups.map((group) => {
              const channel =
                group.id === MUSIC_NO_SINGER_ID ? null : channelsById.get(group.id) ?? null
              const hasGenerating = group.tracks.some((item) =>
                captionGeneration.isGenerating(item.id),
              )
              return (
                <Card
                  key={group.id}
                  padding="none"
                  className="group/card overflow-hidden transition-colors hover:border-border-strong"
                >
                  <button
                    type="button"
                    onClick={() => setGroupId(group.id)}
                    className="flex w-full items-center gap-3.5 p-4 text-left transition-colors hover:bg-hover/40"
                  >
                    <SingerAvatar
                      channel={channel}
                      isNoSinger={group.id === MUSIC_NO_SINGER_ID}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-semibold text-text">
                          {group.name}
                        </p>
                        {hasGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {group.tracks.length}{' '}
                        {group.tracks.length === 1 ? 'faixa' : 'faixas'} · {group.cutsCount}{' '}
                        {group.cutsCount === 1 ? 'corte' : 'cortes'} · {group.captionsCount}{' '}
                        {group.captionsCount === 1 ? 'legenda' : 'legendas'}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-2">
                        {formatRelativeDate(group.latestUpdatedAt)}
                      </p>
                    </div>
                  </button>
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-2">
              {activeGroup!.tracks.length}{' '}
              {activeGroup!.tracks.length === 1 ? 'faixa' : 'faixas'}
              {selectedIds.length > 0
                ? ` · ${selectedIds.length} selecionada(s)`
                : ' · arraste ou selecione para mover de cantor'}
            </p>
            {activeGroup!.tracks.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === activeGroup!.tracks.length
                      ? []
                      : activeGroup!.tracks.map((item) => item.id),
                  )
                }
                className="text-xs font-medium text-accent hover:underline"
              >
                {selectedIds.length === activeGroup!.tracks.length
                  ? 'Limpar seleção'
                  : 'Selecionar todas'}
              </button>
            ) : null}
          </div>

          {channels.length > 0 ? (
            <div className="mb-4 rounded-xl border border-border-soft bg-elevated/60 p-2.5">
              <p className="mb-2 text-[11px] font-medium text-muted">
                {selectedIds.length > 0
                  ? 'Arraste as selecionadas ou clique no cantor para vincular:'
                  : 'Arraste qualquer faixa ou selecione para mover de cantor:'}
              </p>
              <div className="flex flex-wrap gap-2">
                {channels.map((channel) => {
                  const isCurrent = activeGroup!.id === channel.id
                  const isOver = dropTargetChannelId === channel.id
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      disabled={
                        busy ||
                        (selectedIds.length === 0 && draggingIds.length === 0) ||
                        isCurrent
                      }
                      onDragOver={(event) => {
                        if (isCurrent) return
                        event.preventDefault()
                        setDropTargetChannelId(channel.id)
                      }}
                      onDragLeave={() => {
                        if (dropTargetChannelId === channel.id) setDropTargetChannelId(null)
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (isCurrent) return
                        const ids = draggingIds.length > 0 ? draggingIds : selectedIds
                        void assignTracksToChannel(ids, channel.id, channel.name)
                      }}
                      onClick={() => {
                        if (selectedIds.length > 0 && !isCurrent) {
                          void assignTracksToChannel(selectedIds, channel.id, channel.name)
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                        isOver
                          ? 'scale-[1.03] border-accent bg-accent-subtle text-accent ring-2 ring-accent/40'
                          : isCurrent
                            ? 'border-border-soft bg-surface/50 text-muted-2 opacity-50'
                            : selectedIds.length > 0
                              ? 'border-border bg-surface text-text hover:border-accent/60 hover:bg-accent-subtle/40'
                              : 'border-border-soft bg-surface text-muted',
                      )}
                    >
                      <UserRound className="h-3.5 w-3.5" />
                      {channel.name}
                    </button>
                  )
                })}
                {activeGroup!.id !== MUSIC_NO_SINGER_ID ? (
                  <button
                    type="button"
                    disabled={busy || (selectedIds.length === 0 && draggingIds.length === 0)}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDropTargetChannelId(MUSIC_NO_SINGER_ID)
                    }}
                    onDragLeave={() => {
                      if (dropTargetChannelId === MUSIC_NO_SINGER_ID) setDropTargetChannelId(null)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const ids = draggingIds.length > 0 ? draggingIds : selectedIds
                      void assignTracksToChannel(ids, null, 'Sem cantor')
                    }}
                    onClick={() => {
                      if (selectedIds.length > 0) {
                        void assignTracksToChannel(selectedIds, null, 'Sem cantor')
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                      dropTargetChannelId === MUSIC_NO_SINGER_ID
                        ? 'scale-[1.03] border-accent bg-accent-subtle text-accent ring-2 ring-accent/40'
                        : selectedIds.length > 0
                          ? 'border-border bg-surface text-text hover:border-accent/60'
                          : 'border-border-soft bg-surface text-muted',
                    )}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Sem cantor
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <Card padding="sm" className="overflow-hidden p-0">
            <div className="border-b border-border-soft px-5 py-3">
              <p className="text-sm font-medium text-text">Biblioteca</p>
              <p className="mt-0.5 text-xs text-muted">Clique na faixa para abrir o editor.</p>
            </div>
            <ul className="divide-y divide-border-soft">
              {activeGroup!.tracks.map((track) => {
                const captionCount = track.captions?.length ?? 0
                const generatingCaption = captionGeneration.isGenerating(track.id)
                const isSelected = selectedIds.includes(track.id)
                return (
                  <li
                    key={track.id}
                    draggable={channels.length > 0}
                    onDragStart={(event) => {
                      const ids =
                        isSelected && selectedIds.length > 0 ? selectedIds : [track.id]
                      setDraggingIds(ids)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', ids.join(','))
                    }}
                    onDragEnd={() => {
                      setDraggingIds([])
                      setDropTargetChannelId(null)
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'group flex cursor-pointer flex-col gap-4 px-5 py-4 transition-colors hover:bg-hover/60 sm:flex-row sm:items-center',
                        isSelected && 'bg-accent-subtle/20',
                      )}
                      onClick={() => openTrack(track)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openTrack(track)
                        }
                      }}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        {channels.length > 0 ? (
                          <div
                            className="flex shrink-0 items-center gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <GripVertical className="h-4 w-4 cursor-grab text-muted-2/70" />
                            <button
                              type="button"
                              aria-label={
                                isSelected ? `Desmarcar ${track.name}` : `Selecionar ${track.name}`
                              }
                              onClick={() => toggleSelected(track.id)}
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
                                isSelected
                                  ? 'border-accent bg-accent text-bg'
                                  : 'border-border bg-elevated text-transparent hover:border-accent/50',
                              )}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-elevated text-accent transition-colors group-hover:border-accent/30 group-hover:bg-accent-subtle">
                          <Music2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[15px] font-semibold tracking-tight text-text">
                            {track.name}
                          </h3>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatTimecode(track.duration)}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Scissors className="h-3.5 w-3.5" />
                              {track.cuts.length}{' '}
                              {track.cuts.length === 1 ? 'corte' : 'cortes'}
                            </span>
                            {generatingCaption ? (
                              <span className="inline-flex items-center gap-1.5 text-accent">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Gerando legenda...
                              </span>
                            ) : captionCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 text-accent">
                                <Captions className="h-3.5 w-3.5" />
                                Legenda
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-muted-2">
                                <Captions className="h-3.5 w-3.5" />
                                Sem legenda
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                        <p className="text-xs text-muted-2">
                          {formatRelativeDate(track.updatedAt)}
                        </p>
                        <div
                          className="flex items-center gap-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {channels.length > 0 ? (
                            <select
                              aria-label={`Cantor de ${track.name}`}
                              disabled={busy}
                              value={track.channelId ?? ''}
                              onChange={(event) => {
                                const nextId = event.target.value || null
                                const nextName = nextId
                                  ? channelsById.get(nextId)?.name ?? 'Cantor'
                                  : 'Sem cantor'
                                void assignTracksToChannel([track.id], nextId, nextName)
                              }}
                              className="h-9 max-w-[160px] rounded-xl border border-border-soft bg-elevated px-2.5 text-xs text-text focus:border-accent/50 focus:outline-none"
                            >
                              <option value="">Sem cantor</option>
                              {channels.map((channel) => (
                                <option key={channel.id} value={channel.id}>
                                  {channel.name}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <Button
                            variant="secondary"
                            className="h-9 px-3 text-xs"
                            onClick={() => openTrack(track)}
                          >
                            Abrir
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-9 px-3 text-xs"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            onClick={() => setDeleting(track)}
                          >
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir música?"
        message={`A faixa “${deleting?.name ?? ''}” e os cortes salvos serão removidos.`}
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </PageShell>
  )
}
