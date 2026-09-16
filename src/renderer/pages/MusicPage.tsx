import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music2, Plus, Scissors, Trash2 } from 'lucide-react'
import type { MusicTrack } from '@shared/musicAnalysis'
import { formatTimecode } from '@shared/musicAnalysis'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmDialog } from '../components/Modal'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { ENVIRONMENTS, environmentBreadcrumb } from '../lib/environments'
import { formatRelativeDate } from '../lib/utils'

export function MusicPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<MusicTrack | null>(null)

  async function load() {
    setTracks(await api.music.list())
  }

  useEffect(() => {
    void load()
  }, [])

  async function importTrack() {
    setImporting(true)
    try {
      const track = await api.music.import()
      if (!track) return
      push('Música importada. Abrindo o editor de cortes.', 'success')
      navigate(`/musica/faixas/${track.id}`)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao importar a música', 'error')
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
      push(error instanceof Error ? error.message : 'Falha ao remover a música', 'error')
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Faixas')}
        title="Cortes de música"
        subtitle="Importe uma faixa para o Atlas analisar o áudio e sugerir cortes profissionais. Você pode aceitar o corte automático ou ajustar na mão."
      />

      <div className="mb-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/musica')}>
          Projetos de Música
        </Button>
        <Button
          icon={<Plus className="h-4 w-4" />}
          style={{ backgroundColor: ENVIRONMENTS.music.color }}
          onClick={() => void importTrack()}
          disabled={importing}
        >
          {importing ? 'Importando...' : 'Importar música'}
        </Button>
      </div>

      {tracks.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Music2 className="mb-4 h-10 w-10 text-muted" />
          <p className="text-sm text-muted">Nenhuma música importada ainda.</p>
          <p className="mt-1 max-w-md text-xs text-muted-2">
            O Atlas detecta silêncios, picos e ganchos para montar os cortes. Depois você recorta, escuta e exporta cada trecho em MP3.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tracks.map((track) => (
            <Card key={track.id} className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-dark text-accent">
                  <Scissors className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold text-text">{track.name}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {formatTimecode(track.duration)} · {track.cuts.length}{' '}
                    {track.cuts.length === 1 ? 'corte' : 'cortes'} ·{' '}
                    {track.cutMode === 'manual' ? 'manual' : 'automático'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-2">{formatRelativeDate(track.updatedAt)}</p>
              <div className="mt-auto flex items-center justify-between gap-2">
                <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => navigate(`/musica/faixas/${track.id}`)}>
                  Abrir editor
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
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir música?"
        message={`A faixa “${deleting?.name ?? ''}” e os cortes salvos serão removidos.`}
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
