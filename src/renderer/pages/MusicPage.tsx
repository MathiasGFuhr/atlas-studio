import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Captions, Clock3, Music2, Plus, Scissors, Trash2 } from 'lucide-react'
import type { MusicTrack } from '@shared/musicAnalysis'
import { formatTimecode } from '@shared/musicAnalysis'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/Modal'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { environmentBreadcrumb } from '../lib/environments'
import { cn, formatRelativeDate } from '../lib/utils'

export function MusicPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push, pushError } = useToast()
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<MusicTrack | null>(null)

  async function load() {
    setTracks(await api.music.list())
  }

  useEffect(() => {
    void load()
  }, [])

  const stats = useMemo(() => {
    const cuts = tracks.reduce((sum, track) => sum + track.cuts.length, 0)
    const withCaptions = tracks.filter((track) => (track.captions?.length ?? 0) > 0).length
    return { cuts, withCaptions }
  }, [tracks])

  async function importTrack() {
    setImporting(true)
    try {
      const track = await api.music.import()
      if (!track) return
      push('Música importada. Abrindo o editor de cortes.', 'success')
      navigate(`/musica/faixas/${track.id}`)
    } catch (error) {
      pushError(error, 'Falha ao importar a música')
    } finally {
      setImporting(false)
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

  return (
    <PageShell>
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <PageHeader
          className="mb-0"
          breadcrumb={environmentBreadcrumb('music', 'Cortes')}
          title="Cortes"
          subtitle="Importe a faixa, corte os trechos e gere a legenda. Depois envie ao LipSync."
        />
        <div data-tour="page-actions" className="flex shrink-0 flex-wrap items-center gap-2">
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
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Card padding="sm" className="bg-elevated/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Faixas</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{tracks.length}</p>
          </Card>
          <Card padding="sm" className="bg-elevated/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Cortes</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{stats.cuts}</p>
          </Card>
          <Card padding="sm" className="bg-elevated/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Com legenda</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{stats.withCaptions}</p>
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
      ) : (
        <Card padding="sm" className="overflow-hidden p-0">
          <div className="border-b border-border-soft px-5 py-3">
            <p className="text-sm font-medium text-text">Biblioteca</p>
            <p className="mt-0.5 text-xs text-muted">Clique na faixa para abrir o editor.</p>
          </div>
          <ul className="divide-y divide-border-soft">
            {tracks.map((track) => {
              const captionCount = track.captions?.length ?? 0
              return (
                <li key={track.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'group flex cursor-pointer flex-col gap-4 px-5 py-4 transition-colors hover:bg-hover/60 sm:flex-row sm:items-center',
                    )}
                    onClick={() => navigate(`/musica/faixas/${track.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/musica/faixas/${track.id}`)
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
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
                            {track.cuts.length} {track.cuts.length === 1 ? 'corte' : 'cortes'}
                          </span>
                          {captionCount > 0 ? (
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

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <p className="text-xs text-muted-2">{formatRelativeDate(track.updatedAt)}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`/musica/faixas/${track.id}`)
                          }}
                        >
                          Abrir
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 px-3 text-xs"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleting(track)
                          }}
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
