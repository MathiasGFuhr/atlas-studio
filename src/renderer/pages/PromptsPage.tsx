import { useEffect, useMemo, useState } from 'react'
import { Copy, MessageSquareText, Plus, Search, Trash2 } from 'lucide-react'
import type { Channel, ChannelPrompt } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { Modal, ConfirmDialog } from '../components/Modal'
import { Input } from '../components/Input'
import { Textarea } from '../components/Textarea'
import { Select } from '../components/Select'
import { Card } from '../components/Card'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

export function PromptsPage() {
  const api = getAtlasApi()
  const { push } = useToast()
  const [channels, setChannels] = useState<Channel[]>([])
  const [prompts, setPrompts] = useState<ChannelPrompt[]>([])
  const [channelId, setChannelId] = useState('')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelPrompt | null>(null)
  const [deleting, setDeleting] = useState<ChannelPrompt | null>(null)
  const [form, setForm] = useState({
    channelId: '',
    title: '',
    content: '',
  })

  async function load() {
    const [channelList, promptList] = await Promise.all([
      api.channels.list(),
      api.prompts.list({
        channelId: channelId || undefined,
        query: query || undefined,
      }),
    ])
    setChannels(channelList)
    setPrompts(promptList)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, query])

  const channelOptions = useMemo(
    () => [
      { value: '', label: 'Todos os canais' },
      ...channels.map((c) => ({ value: c.id, label: c.name })),
    ],
    [channels],
  )

  const formChannelOptions = useMemo(
    () => [
      { value: '', label: 'Selecione um canal' },
      ...channels.map((c) => ({ value: c.id, label: c.name })),
    ],
    [channels],
  )

  function openCreate() {
    if (channels.length === 0) {
      push('Crie um canal antes de salvar prompts.', 'error')
      return
    }
    setEditing(null)
    setForm({
      channelId: channelId || channels[0].id,
      title: '',
      content: '',
    })
    setModalOpen(true)
  }

  function openEdit(prompt: ChannelPrompt) {
    setEditing(prompt)
    setForm({
      channelId: prompt.channelId,
      title: prompt.title,
      content: prompt.content,
    })
    setModalOpen(true)
  }

  async function save() {
    try {
      if (!form.channelId) {
        push('Vincule o prompt a um canal.', 'error')
        return
      }
      if (!form.title.trim()) {
        push('O título do prompt é obrigatório.', 'error')
        return
      }
      if (!form.content.trim()) {
        push('O texto do prompt é obrigatório.', 'error')
        return
      }
      const payload = {
        channelId: form.channelId,
        title: form.title.trim(),
        content: form.content.trim(),
      }
      if (editing) {
        const updated = await api.prompts.update(editing.id, payload)
        if (!updated) throw new Error('Prompt não encontrado')
        push('Prompt atualizado.', 'success')
      } else {
        await api.prompts.create(payload)
        push('Prompt salvo para o canal.', 'success')
      }
      setModalOpen(false)
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar prompt', 'error')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.prompts.remove(deleting.id)
      push('Prompt removido.', 'success')
      setDeleting(null)
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao remover prompt', 'error')
    }
  }

  async function copyPrompt(prompt: ChannelPrompt) {
    try {
      await api.system.copyText(prompt.content)
      push('Prompt copiado.', 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao copiar prompt', 'error')
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb="Atlas / Canais / Prompts"
        title="Prompts"
        subtitle="Vincule um canal e salve prompts específicos para ele."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Select
            label="Canal"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            options={channelOptions}
          />
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar prompt..."
            className="h-11 w-full rounded-xl border border-border bg-card-2 pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Novo prompt
        </Button>
      </div>

      {channels.length === 0 ? (
        <Card className="flex flex-col items-center py-14 text-center">
          <MessageSquareText className="h-8 w-8 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">Nenhum canal para vincular</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            Crie um canal em Canais para começar a salvar prompts específicos.
          </p>
        </Card>
      ) : prompts.length === 0 ? (
        <Card className="flex flex-col items-center py-14 text-center">
          <MessageSquareText className="h-8 w-8 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">Nenhum prompt ainda</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            Salve instruções, tom de voz ou templates para o canal selecionado.
          </p>
          <Button className="mt-5" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Criar primeiro prompt
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {prompts.map((prompt) => (
            <Card key={prompt.id} className="flex flex-col gap-3 transition-colors hover:border-[#334049]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-text">{prompt.title}</h3>
                  <p className="mt-1 text-xs text-muted">
                    Canal: {prompt.channelName || 'Sem canal'}
                  </p>
                </div>
              </div>
              <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {prompt.content}
              </p>
              <div className="mt-auto flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-xs"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={() => void copyPrompt(prompt)}
                >
                  Copiar
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-xs"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setDeleting(prompt)}
                >
                  Excluir
                </Button>
                <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => openEdit(prompt)}>
                  Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'Editar prompt' : 'Novo prompt'}
        size="lg"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select
            label="Canal vinculado"
            value={form.channelId}
            onChange={(e) => setForm((f) => ({ ...f, channelId: e.target.value }))}
            options={formChannelOptions}
          />
          <Input
            label="Título"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Ex.: Tom de voz, título de vídeo, roteiro curto"
          />
          <Textarea
            label="Prompt"
            className="min-h-[220px]"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Escreva o prompt que deve ser usado neste canal..."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir prompt"
        message={`Excluir “${deleting?.title ?? ''}”? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}
