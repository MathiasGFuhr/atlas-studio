import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ImagePlus, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Channel, ChannelVideo, ChannelVideoStatus, TitleStrengthAnalysis } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { Modal, ConfirmDialog } from '../components/Modal'
import { Input } from '../components/Input'
import { Textarea } from '../components/Textarea'
import { Select } from '../components/Select'
import { Card } from '../components/Card'
import { StatusBadge } from '../components/StatusBadge'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { TitleScoreBadge, TitleScorePanel } from '../components/TitleScore'
import { cn } from '../lib/utils'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function monthLabel(year: number, month: number): string {
  const label = new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function todayKey(): string {
  const now = new Date()
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
}

export function ChannelCalendarPage() {
  const { id } = useParams()
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const now = new Date()
  const [channel, setChannel] = useState<Channel | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [videos, setVideos] = useState<ChannelVideo[]>([])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelVideo | null>(null)
  const [pendingThumb, setPendingThumb] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ChannelVideo | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<TitleStrengthAnalysis | null>(null)
  const [analyzedTitle, setAnalyzedTitle] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduledDate: todayKey(),
    status: 'planejado' as ChannelVideoStatus,
  })

  const from = toDateKey(year, month, 1)
  const to = toDateKey(year, month, new Date(year, month + 1, 0).getDate())

  async function load() {
    if (!id) return
    const [found, list] = await Promise.all([
      api.channels.get(id),
      api.videos.list({ channelId: id, from, to }),
    ])
    setChannel(found)
    setVideos(list)
    setLoaded(true)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, year, month])

  const videosByDate = useMemo(() => {
    const map = new Map<string, ChannelVideo[]>()
    for (const video of videos) {
      const list = map.get(video.scheduledDate) ?? []
      list.push(video)
      map.set(video.scheduledDate, list)
    }
    return map
  }, [videos])

  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const startWeekday = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevDays = new Date(year, month, 0).getDate()
    const items: Array<{ key: string; day: number; inMonth: boolean }> = []

    for (let i = startWeekday - 1; i >= 0; i -= 1) {
      const day = prevDays - i
      const date = new Date(year, month - 1, day)
      items.push({
        key: toDateKey(date.getFullYear(), date.getMonth(), day),
        day,
        inMonth: false,
      })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      items.push({ key: toDateKey(year, month, day), day, inMonth: true })
    }
    let extra = 1
    while (items.length % 7 !== 0) {
      const date = new Date(year, month + 1, extra)
      items.push({
        key: toDateKey(date.getFullYear(), date.getMonth(), extra),
        day: extra,
        inMonth: false,
      })
      extra += 1
    }
    return items
  }, [year, month])

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  function openCreate(dateKey?: string) {
    setEditing(null)
    setPendingThumb(null)
    setAnalysis(null)
    setAnalyzedTitle(null)
    setForm({
      title: '',
      description: '',
      scheduledDate: dateKey ?? todayKey(),
      status: 'planejado',
    })
    setModalOpen(true)
  }

  function openEdit(video: ChannelVideo) {
    setEditing(video)
    setPendingThumb(null)
    setAnalysis(video.titleAnalysis ?? null)
    setAnalyzedTitle(video.titleAnalysis ? video.title : null)
    setForm({
      title: video.title,
      description: video.description,
      scheduledDate: video.scheduledDate,
      status: video.status,
    })
    setModalOpen(true)
  }

  async function pickThumb() {
    const file = await api.dialog.selectImage()
    if (!file) return
    if (editing) {
      try {
        const updated = await api.videos.setThumbnail(editing.id, file)
        if (updated) setEditing(updated)
        push('Thumbnail atualizada.', 'success')
        await load()
      } catch (error) {
        push(error instanceof Error ? error.message : 'Falha ao salvar a thumbnail', 'error')
      }
      return
    }
    setPendingThumb(file)
  }

  async function analyzeTitle() {
    if (!form.title.trim()) {
      push('Escreva o título antes de analisar.', 'error')
      return
    }
    setAnalyzing(true)
    try {
      const result = await api.videos.analyzeTitle({
        title: form.title.trim(),
        description: form.description,
        channelName: channel?.name,
        videoId: editing?.id,
      })
      setAnalysis(result.analysis)
      setAnalyzedTitle(form.title.trim())
      if (result.video) setEditing(result.video)
      push(`Força do título: ${result.analysis.score}/100`, 'success')
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao analisar o título', 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  async function save() {
    if (!id) return
    try {
      if (!form.title.trim()) {
        push('O título do vídeo é obrigatório.', 'error')
        return
      }
      if (!form.scheduledDate) {
        push('Escolha a data do vídeo.', 'error')
        return
      }
      let saved: ChannelVideo
      if (editing) {
        const updated = await api.videos.update(editing.id, {
          title: form.title.trim(),
          description: form.description,
          scheduledDate: form.scheduledDate,
          status: form.status,
        })
        if (!updated) throw new Error('Vídeo não encontrado')
        saved = updated
        push('Vídeo atualizado.', 'success')
      } else {
        saved = await api.videos.create({
          channelId: id,
          title: form.title.trim(),
          description: form.description,
          thumbnailPath: '',
          scheduledDate: form.scheduledDate,
          status: form.status,
          scriptId: null,
        })
        push('Vídeo adicionado ao calendário.', 'success')
      }
      if (pendingThumb) {
        const withThumb = await api.videos.setThumbnail(saved.id, pendingThumb)
        if (withThumb) saved = withThumb
      }
      if (analysis && analyzedTitle === form.title.trim()) {
        await api.videos.update(saved.id, {
          titleScore: analysis.score,
          titleAnalysis: analysis,
          titleAnalyzedAt: new Date().toISOString(),
        })
      }
      setModalOpen(false)
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar vídeo', 'error')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.videos.remove(deleting.id)
      push('Vídeo removido.', 'success')
      setDeleting(null)
      setModalOpen(false)
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao remover vídeo', 'error')
    }
  }

  if (!loaded || !channel) {
    return (
      <div className="h-full overflow-y-auto px-8 py-6">
        <PageHeader
          breadcrumb="Atlas / Canais"
          title={loaded ? 'Canal não encontrado' : 'Canal'}
          subtitle={loaded ? 'Esse canal não existe mais.' : 'Carregando calendário...'}
        />
        {loaded ? (
          <Button variant="secondary" onClick={() => navigate('/canais')}>
            Voltar aos canais
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mb-2">
        <button
          type="button"
          onClick={() => navigate('/canais')}
          className="text-xs text-muted hover:text-text"
        >
          ← Voltar aos canais
        </button>
      </div>
      <PageHeader
        breadcrumb={`Atlas / Canais / ${channel.name}`}
        title={channel.name}
        subtitle="Planeje título, descrição e thumbnail de cada vídeo no calendário do canal."
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="h-10 w-10 px-0" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center text-sm font-semibold text-text">
            {monthLabel(year, month)}
          </div>
          <Button variant="secondary" className="h-10 w-10 px-0" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
          Novo vídeo
        </Button>
      </div>

      <Card padding="sm" className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border-soft">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayVideos = videosByDate.get(cell.key) ?? []
            const isToday = cell.key === todayKey()
            return (
              <div
                key={cell.key}
                className={cn(
                  'min-h-[118px] border-b border-r border-border-soft p-2 text-left align-top transition-colors hover:bg-white/[0.03]',
                  !cell.inMonth && 'bg-black/20',
                )}
                onClick={() => {
                  if (dayVideos.length === 0) openCreate(cell.key)
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      openCreate(cell.key)
                    }}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      isToday ? 'bg-accent text-black font-semibold' : cell.inMonth ? 'text-text' : 'text-muted-2',
                    )}
                    aria-label={`Adicionar vídeo em ${cell.key}`}
                  >
                    {cell.day}
                  </button>
                  {dayVideos.length > 2 ? (
                    <span className="text-[10px] text-muted-2">+{dayVideos.length - 2}</span>
                  ) : null}
                </div>
                {dayVideos.slice(0, 2).map((video) => (
                  <button
                    key={video.id}
                    type="button"
                    className="mb-1 w-full overflow-hidden rounded-lg border border-border-soft bg-card-2 text-left"
                    onClick={(event) => {
                      event.stopPropagation()
                      openEdit(video)
                    }}
                  >
                    {video.thumbnailDataUrl ? (
                      <img src={video.thumbnailDataUrl} alt="" className="h-10 w-full object-cover" />
                    ) : (
                      <div className="h-1.5 w-full" style={{ background: channel.color }} />
                    )}
                    <p className="line-clamp-2 px-1.5 py-1 text-[11px] leading-tight text-text">{video.title}</p>
                    {video.titleScore != null ? (
                      <p className="px-1.5 pb-1 text-[10px] text-accent">{video.titleScore}</p>
                    ) : null}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-text">Vídeos deste mês</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum vídeo planejado neste mês. Clique em um dia para adicionar.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {videos.map((video) => (
              <Card key={video.id} className="flex gap-3" padding="sm">
                <div className="h-20 w-[142px] shrink-0 overflow-hidden rounded-lg border border-border-soft bg-card-2">
                  {video.thumbnailDataUrl ? (
                    <img src={video.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-2">
                      <ImagePlus className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{video.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(`${video.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={video.status} />
                    <TitleScoreBadge score={video.titleScore} />
                  </div>
                </div>
                <Button variant="secondary" className="h-9 self-start px-3 text-xs" onClick={() => openEdit(video)}>
                  Editar
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar vídeo' : 'Novo vídeo'}
        size="lg"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            {editing ? (
              <Button
                variant="ghost"
                className="mr-auto"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleting(editing)}
              >
                Excluir
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Título"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título que vai no YouTube"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 px-3 text-xs"
              icon={<Sparkles className={`h-3.5 w-3.5 ${analyzing ? 'animate-pulse' : ''}`} />}
              onClick={() => void analyzeTitle()}
              disabled={analyzing}
            >
              {analyzing ? 'Analisando título...' : 'Analisar força do título'}
            </Button>
            {analysis ? <TitleScoreBadge score={analysis.score} /> : null}
          </div>
          <TitleScorePanel analysis={analysis} />
          {analysis?.suggestions[0] ? (
            <button
              type="button"
              className="text-left text-xs text-accent hover:underline"
              onClick={() => setForm((f) => ({ ...f, title: analysis.suggestions[0] }))}
            >
              Usar a primeira sugestão como título
            </button>
          ) : null}
          <Textarea
            label="Descrição"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descrição do vídeo"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Data"
              type="date"
              value={form.scheduledDate}
              onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ChannelVideoStatus }))}
              options={[
                { value: 'planejado', label: 'Planejado' },
                { value: 'gravado', label: 'Gravado' },
                { value: 'publicado', label: 'Publicado' },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-muted">Thumbnail</p>
            <div className="flex items-start gap-3">
              <div className="h-[90px] w-[160px] overflow-hidden rounded-xl border border-border bg-card-2">
                {editing?.thumbnailDataUrl ? (
                  <img src={editing.thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-2">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                )}
              </div>
              <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => void pickThumb()}>
                {pendingThumb ? 'Imagem selecionada' : 'Escolher thumb'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir vídeo"
        message={`Excluir “${deleting?.title ?? ''}” do calendário?`}
        confirmLabel="Excluir"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
