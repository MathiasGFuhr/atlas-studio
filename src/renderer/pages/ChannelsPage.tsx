import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, MessageSquareText, Plus, Search, Trash2, Tv } from 'lucide-react'
import type { Channel, Niche } from '@shared/types'
import { PROJECT_TYPE_LABEL } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Modal'
import {
  ChannelEditorModal,
  CHANNEL_COLORS,
  EMPTY_CHANNEL_FORM,
  type ChannelFormValues,
} from '../components/ChannelEditorModal'
import { Card } from '../components/Card'
import { StatusBadge } from '../components/StatusBadge'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { ENVIRONMENTS } from '../lib/environments'

export function ChannelsPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [niches, setNiches] = useState<Niche[]>([])
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Channel | null>(null)
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Channel | null>(null)
  const [form, setForm] = useState<ChannelFormValues>(EMPTY_CHANNEL_FORM)

  async function load() {
    const [list, nicheList] = await Promise.all([
      api.channels.list({ query: query || undefined }),
      api.niches.list(),
    ])
    setChannels(list)
    setNiches(nicheList)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function openCreate() {
    setEditing(null)
    setPendingAvatar(null)
    setForm(EMPTY_CHANNEL_FORM)
    setModalOpen(true)
  }

  function openEdit(channel: Channel) {
    setEditing(channel)
    setPendingAvatar(null)
    setForm({
      name: channel.name,
      description: channel.description,
      nicheId: channel.nicheId ?? '',
      youtubeUrl: channel.youtubeUrl,
      color: channel.color || CHANNEL_COLORS[0],
      channelType: channel.channelType ?? 'history',
      active: channel.active,
    })
    setModalOpen(true)
  }

  async function pickAvatar() {
    const file = await api.dialog.selectImage()
    if (!file) return
    if (editing) {
      try {
        await api.channels.setAvatar(editing.id, file)
        push('Foto do canal atualizada.', 'success')
        await load()
        const updated = await api.channels.get(editing.id)
        if (updated) setEditing(updated)
      } catch (error) {
        push(error instanceof Error ? error.message : 'Falha ao salvar a foto', 'error')
      }
      return
    }
    setPendingAvatar(file)
  }

  async function save() {
    try {
      if (!form.name.trim()) {
        push('O nome do canal é obrigatório.', 'error')
        return
      }
      const payload = {
        name: form.name.trim(),
        description: form.description,
        avatarPath: editing?.avatarPath ?? '',
        nicheId: form.nicheId || null,
        youtubeUrl: form.youtubeUrl.trim(),
        color: form.color,
        channelType: form.channelType,
        active: form.active,
      }
      let saved: Channel
      if (editing) {
        const updated = await api.channels.update(editing.id, payload)
        if (!updated) throw new Error('Canal não encontrado')
        saved = updated
        push('Canal atualizado.', 'success')
      } else {
        saved = await api.channels.create(payload)
        push('Canal criado.', 'success')
      }
      if (pendingAvatar) {
        await api.channels.setAvatar(saved.id, pendingAvatar)
      }
      setModalOpen(false)
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar canal', 'error')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.channels.remove(deleting.id)
      push('Canal removido.', 'success')
      setDeleting(null)
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao remover canal', 'error')
    }
  }

  return (
    <div className="h-full min-w-0 w-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb="Atlas / Canais"
        title="Canais"
        subtitle="Gerencie seus canais e planeje os vídeos no calendário editorial."
      />

      <div className="mb-5 flex min-w-0 w-full flex-wrap items-center justify-end gap-3">
        <div className="relative min-w-[min(100%,16rem)] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar canal..."
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-card-2 pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="secondary"
            icon={<MessageSquareText className="h-4 w-4" />}
            onClick={() => navigate('/prompts')}
          >
            Prompts
          </Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Novo canal
          </Button>
        </div>
      </div>

      {channels.length === 0 ? (
        <Card className="flex flex-col items-center py-14 text-center">
          <Tv className="h-8 w-8 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">Nenhum canal ainda</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            Crie um canal para montar o calendário de vídeos com título, descrição e thumbnail.
          </p>
          <Button className="mt-5" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Criar primeiro canal
          </Button>
        </Card>
      ) : (
        <div className="grid min-w-0 w-full grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
          {channels.map((channel) => (
            <Card key={channel.id} className="flex min-w-0 w-full flex-col gap-4 transition-colors hover:border-[#334049]">
              <div className="flex min-w-0 gap-3">
                <div
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border-soft"
                  style={{ background: `linear-gradient(145deg, ${channel.color}33, #10161a)` }}
                >
                  {channel.avatarDataUrl ? (
                    <img src={channel.avatarDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Tv className="h-6 w-6" style={{ color: channel.color }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold text-text" title={channel.name}>
                    {channel.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted">
                    {channel.description || 'Sem descrição'}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
                <span className="shrink-0">
                  {channel.videoCount ?? 0} {(channel.videoCount ?? 0) === 1 ? 'vídeo' : 'vídeos'}
                </span>
                <span
                  className="min-w-0 truncate"
                  style={{ color: ENVIRONMENTS[channel.channelType ?? 'history'].color }}
                >
                  {PROJECT_TYPE_LABEL[channel.channelType ?? 'history']}
                </span>
                {channel.nicheName ? (
                  <span className="min-w-0 truncate">Nicho: {channel.nicheName}</span>
                ) : null}
              </div>

              <div className="mt-auto flex min-w-0 flex-wrap items-center justify-between gap-2">
                <StatusBadge
                  className="shrink-0"
                  status={channel.active ? 'ativo' : 'rascunho'}
                  label={channel.active ? 'Ativo' : 'Inativo'}
                />
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="h-9 shrink-0 px-3 text-xs"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setDeleting(channel)}
                  >
                    Excluir
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-9 shrink-0 px-3 text-xs"
                    onClick={() => openEdit(channel)}
                  >
                    Editar
                  </Button>
                  <Button
                    className="h-9 shrink-0 px-3 text-xs"
                    icon={<CalendarDays className="h-3.5 w-3.5" />}
                    onClick={() => navigate(`/canais/${channel.id}`)}
                  >
                    Calendário
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ChannelEditorModal
        open={modalOpen}
        editing={editing}
        form={form}
        niches={niches}
        pendingAvatar={pendingAvatar}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onClose={() => setModalOpen(false)}
        onSubmit={() => void save()}
        onPickAvatar={() => void pickAvatar()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir canal"
        message={`Excluir “${deleting?.name ?? ''}” também remove o calendário e as thumbs dos vídeos. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
