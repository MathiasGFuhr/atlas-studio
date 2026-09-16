import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Download, Pause, Play, Plus, Scissors, Trash2 } from 'lucide-react'
import type { AutoCutPreset, MusicAnalysis, MusicSegment, MusicTrack } from '@shared/musicAnalysis'
import { autoCutMusic, computePeaks, formatTimecode, mixToMono } from '@shared/musicAnalysis'
import { analyzeMusic } from '@shared/musicAnalysis'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Waveform } from '../components/Waveform'
import { getAtlasApi } from '../lib/api'
import { decodeWavPcm } from '../lib/decodeWav'
import { useToast } from '../components/Toast'
import { environmentBreadcrumb } from '../lib/environments'

const PRESETS: Array<{ id: AutoCutPreset; label: string; hint: string }> = [
  { id: 'completo', label: 'Cortes automáticos', hint: 'Separa trechos com áudio e corta silêncios' },
  { id: 'silencio', label: 'Só as pontas', hint: 'Remove silêncio do começo e do fim' },
  { id: 'gancho15', label: 'Gancho 15s', hint: 'Janela mais energética de 15 segundos' },
  { id: 'gancho30', label: 'Gancho 30s', hint: 'Janela mais energética de 30 segundos' },
]

function asBytes(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return Uint8Array.from(value)
}

export function MusicEditorPage() {
  const { id } = useParams()
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [track, setTrack] = useState<MusicTrack | null>(null)
  const [analysis, setAnalysis] = useState<MusicAnalysis | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const selected = useMemo(
    () => track?.cuts.find((cut) => cut.id === selectedId) ?? track?.cuts[0] ?? null,
    [track, selectedId],
  )

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const current = await api.music.get(id)
        if (!current) throw new Error('Música não encontrada')
        const preview = asBytes(await api.music.preview(id))
        const { samples, sampleRate } = decodeWavPcm(preview)
        const mono = mixToMono({
          numberOfChannels: 1,
          length: samples.length,
          getChannelData: () => samples,
        })
        const nextAnalysis = analyzeMusic(mono, sampleRate)
        const nextPeaks = computePeaks(mono, 220)
        let nextTrack = { ...current, duration: nextAnalysis.duration }
        if (nextTrack.cuts.length === 0) {
          nextTrack = {
            ...nextTrack,
            cutMode: 'automatico',
            cuts: autoCutMusic(nextAnalysis, 'completo'),
          }
          await api.music.update(id, {
            duration: nextTrack.duration,
            cutMode: nextTrack.cutMode,
            cuts: nextTrack.cuts,
          })
        } else if (!current.duration) {
          await api.music.update(id, { duration: nextTrack.duration })
        }
        if (cancelled) return
        const copy = new Uint8Array(preview.byteLength)
        copy.set(preview)
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = URL.createObjectURL(new Blob([copy], { type: 'audio/wav' }))
        if (audioRef.current) audioRef.current.src = objectUrlRef.current
        setTrack(nextTrack)
        setAnalysis(nextAnalysis)
        setPeaks(nextPeaks)
        setSelectedId(nextTrack.cuts[0]?.id ?? null)
      } catch (error) {
        if (!cancelled) {
          push(error instanceof Error ? error.message : 'Não foi possível abrir a música', 'error')
          navigate('/musica/faixas')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [api, id, navigate, push])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setPlayhead(audio.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [track])

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function persist(patch: Partial<MusicTrack>) {
    if (!track) return
    const updated = await api.music.update(track.id, patch)
    if (updated) setTrack(updated)
  }

  function queuePersist(patch: Partial<MusicTrack>) {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void persist(patch)
    }, 180)
  }

  async function applyPreset(preset: AutoCutPreset) {
    if (!track || !analysis) return
    const cuts = autoCutMusic(analysis, preset)
    setSelectedId(cuts[0]?.id ?? null)
    await persist({ cutMode: 'automatico', cuts })
    push('Cortes automáticos atualizados.', 'success')
  }

  async function changeCut(idCut: string, start: number, end: number, source: MusicSegment['source'] = 'manual') {
    if (!track) return
    const duration = track.duration || analysis?.duration || end
    const cuts = track.cuts.map((cut) =>
      cut.id === idCut
        ? {
            ...cut,
            start: Math.max(0, Math.min(start, duration - 0.05)),
            end: Math.max(start + 0.05, Math.min(end, duration)),
            source,
          }
        : cut,
    )
    setTrack({ ...track, cuts, cutMode: 'manual' })
    queuePersist({ cuts, cutMode: 'manual' })
  }

  async function addCut() {
    if (!track) return
    const start = Math.min(playhead, Math.max(0, (track.duration || 0) - 4))
    const end = Math.min(track.duration || start + 4, start + 8)
    const cut: MusicSegment = {
      id: `cut-manual-${Date.now()}`,
      start,
      end,
      label: `Corte ${track.cuts.length + 1}`,
      source: 'manual',
    }
    const cuts = [...track.cuts, cut]
    setSelectedId(cut.id)
    await persist({ cuts, cutMode: 'manual' })
  }

  async function removeCut(cutId: string) {
    if (!track) return
    const cuts = track.cuts.filter((cut) => cut.id !== cutId)
    setSelectedId(cuts[0]?.id ?? null)
    await persist({ cuts, cutMode: cuts.every((cut) => cut.source === 'auto') ? 'automatico' : 'manual' })
  }

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      return
    }
    if (selected) {
      audio.currentTime = selected.start
    }
    void audio.play()
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !selected || !playing) return
    if (audio.currentTime >= selected.end) {
      audio.pause()
      audio.currentTime = selected.start
    }
  }, [playhead, playing, selected])

  async function exportCut(cut: MusicSegment) {
    if (!track) return
    setBusy(true)
    try {
      const saved = await api.music.export({
        id: track.id,
        start: cut.start,
        end: cut.end,
        filename: `${track.name}-${cut.label.replace(/\s+/g, '-').toLowerCase()}.mp3`,
      })
      if (saved) push('Corte exportado.', 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao exportar o corte', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !track) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Analisando a música...
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <audio ref={audioRef} />
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', track.name, 'Editor de cortes')}
        title={track.name}
        subtitle="O Atlas já sugeriu os cortes. Arraste as alças na onda, recorte na mão ou peça outro preset automático."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            navigate(track.projectId ? `/musica/projetos/${track.projectId}` : '/musica/faixas')
          }
        >
          Voltar
        </Button>
        <Button icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} onClick={togglePlayback}>
          {playing ? 'Pausar' : 'Ouvir corte'}
        </Button>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => void addCut()}>
          Novo corte manual
        </Button>
        <span className="ml-auto text-xs text-muted">
          {formatTimecode(playhead)} / {formatTimecode(track.duration)} · modo{' '}
          {track.cutMode === 'manual' ? 'manual' : 'automático'}
        </span>
      </div>

      <Card className="mb-5">
        <Waveform
          peaks={peaks}
          duration={track.duration}
          cuts={track.cuts}
          selectedId={selected?.id ?? null}
          playhead={playhead}
          onSelect={(cutId, time) => {
            setSelectedId(cutId)
            if (audioRef.current) audioRef.current.currentTime = time
          }}
          onChangeCut={(cutId, start, end) => {
            void changeCut(cutId, start, end)
          }}
        />
      </Card>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="rounded-2xl border border-border-soft bg-card p-4 text-left hover:border-accent/40"
            onClick={() => void applyPreset(preset.id)}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Scissors className="h-4 w-4 text-accent" />
              {preset.label}
            </div>
            <p className="mt-1 text-xs text-muted">{preset.hint}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {track.cuts.map((cut, index) => (
          <Card key={cut.id} className={cut.id === selected?.id ? 'border-accent/40' : ''}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[140px] flex-1">
                <Input
                  label={`Corte ${index + 1}`}
                  value={cut.label}
                  onChange={(event) => {
                    const cuts = track.cuts.map((item) =>
                      item.id === cut.id ? { ...item, label: event.target.value } : item,
                    )
                    void persist({ cuts, cutMode: 'manual' })
                  }}
                />
              </div>
              <div className="w-[140px]">
                <Input
                  label="Início"
                  value={cut.start.toFixed(2)}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value)) void changeCut(cut.id, value, cut.end)
                  }}
                />
              </div>
              <div className="w-[140px]">
                <Input
                  label="Fim"
                  value={cut.end.toFixed(2)}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isFinite(value)) void changeCut(cut.id, cut.start, value)
                  }}
                />
              </div>
              <p className="pb-3 text-xs text-muted">{formatTimecode(cut.end - cut.start)}</p>
              <Button
                variant="secondary"
                className="h-11"
                onClick={() => {
                  setSelectedId(cut.id)
                  if (audioRef.current) {
                    audioRef.current.currentTime = cut.start
                    void audioRef.current.play()
                  }
                }}
              >
                Ouvir
              </Button>
              <Button
                className="h-11"
                icon={<Download className="h-4 w-4" />}
                disabled={busy}
                onClick={() => void exportCut(cut)}
              >
                Exportar MP3
              </Button>
              <Button
                variant="ghost"
                className="h-11"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => void removeCut(cut.id)}
              >
                Remover
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
