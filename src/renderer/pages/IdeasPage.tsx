import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, ExternalLink, Lightbulb, Loader2, Music2, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { parseIdeaLinks, type IdeaItem, type IdeaKind } from '@shared/ideas'
import type { Channel } from '@shared/types'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { useToast } from '../components/Toast'
import { getAtlasApi } from '../lib/api'
import { environmentBreadcrumb } from '../lib/environments'
import { cn } from '../lib/utils'

const KINDS: Array<{ id: IdeaKind; label: string }> = [
  { id: 'clipe', label: 'Clipe' },
  { id: 'musica', label: 'Música' },
  { id: 'geral', label: 'Geral' },
]

function kindLabel(kind: IdeaKind): string {
  return KINDS.find((item) => item.id === kind)?.label || 'Geral'
}

export function IdeasPage() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [items, setItems] = useState<IdeaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<IdeaKind>('clipe')
  const [channelId, setChannelId] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])
  const [filter, setFilter] = useState<IdeaKind | 'todas'>('todas')
  const [channelFilter, setChannelFilter] = useState('todos')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    void Promise.all([api.ideas.list(), api.channels.list({ channelType: 'music' })])
      .then(([list, channelList]) => {
        if (!alive) return
        const active = (channelList || []).filter((channel) => channel.active !== false)
        setItems(list)
        setChannels(active)
        setChannelId((current) => current || active[0]?.id || '')
      })
      .catch((error) => {
        if (alive) pushError(error, 'Não foi possível abrir as ideias.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [api, pushError])

  function channelOf(id: string | null | undefined): Channel | undefined {
    if (!id) return undefined
    return channels.find((channel) => channel.id === id)
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filter !== 'todas' && item.kind !== filter) return false
      if (channelFilter !== 'todos' && item.channelId !== channelFilter) return false
      if (!q) return true
      const channelName = channelOf(item.channelId)?.name || item.channelName || ''
      return [item.title, item.author, item.note, item.url, channelName].join(' ').toLowerCase().includes(q)
    })
  }, [items, filter, query, channelFilter, channels])

  async function onAdd() {
    const links = parseIdeaLinks(url)
    if (links.length === 0) {
      push('Cole um link de vídeo, como o do YouTube.')
      return
    }
    const channel = channelOf(channelId)
    if (!channel) {
      push('Escolha o canal dessa ideia.')
      return
    }
    setSaving(true)
    try {
      const created: IdeaItem[] = []
      for (const link of links) {
        created.push(
          await api.ideas.add({
            url: link,
            note,
            kind,
            channelId: channel.id,
            channelName: channel.name,
          }),
        )
      }
      setItems((prev) => [...created.reverse(), ...prev])
      setUrl('')
      setNote('')
      push(created.length === 1 ? 'Ideia guardada.' : `${created.length} ideias guardadas.`, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível guardar o link.')
    } finally {
      setSaving(false)
    }
  }

  async function onKind(item: IdeaItem, nextKind: IdeaKind) {
    if (item.kind === nextKind) return
    const updated = await api.ideas.update({ id: item.id, kind: nextKind })
    if (!updated) return
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)))
  }

  async function onChannel(item: IdeaItem, nextChannelId: string) {
    const channel = channelOf(nextChannelId)
    if (!channel || item.channelId === channel.id) return
    const updated = await api.ideas.update({
      id: item.id,
      channelId: channel.id,
      channelName: channel.name,
    })
    if (!updated) return
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)))
  }

  async function onRemove(item: IdeaItem) {
    const removed = await api.ideas.remove(item.id)
    if (!removed) return
    setItems((prev) => prev.filter((entry) => entry.id !== item.id))
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Ideias')}
        title="Ideias"
        subtitle="Guarde links de vídeos de cada canal para inspirar o clipe ou a própria música."
      />

      <form
        className="mb-6 rounded-2xl border border-border-soft bg-card p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void onAdd()
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Link do vídeo</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-border bg-input px-3.5 text-sm text-text placeholder:text-muted-2 focus:border-accent/70 focus:outline-none"
          />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Nota</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="O que aproveitar daqui: corte, luz, refrão, clima…"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm text-text placeholder:text-muted-2 focus:border-accent/70 focus:outline-none"
          />
        </label>
        <label className="mt-3 flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Canal</span>
          <select
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-input px-3.5 text-sm text-text focus:border-accent/70 focus:outline-none"
          >
            {channels.length === 0 ? <option value="">Nenhum canal cadastrado</option> : null}
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setKind(item.id)}
              className={cn(
                'h-9 rounded-full px-3 text-sm',
                kind === item.id ? 'bg-accent text-on-accent' : 'bg-elevated text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          ))}
          <Button type="submit" className="ml-auto" disabled={saving || !url.trim() || !channelId} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('todas')}
          className={cn(
            'h-9 rounded-full px-3 text-sm',
            filter === 'todas' ? 'bg-accent text-on-accent' : 'bg-elevated text-muted hover:text-text',
          )}
        >
          Todas
        </button>
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              'h-9 rounded-full px-3 text-sm',
              filter === item.id ? 'bg-accent text-on-accent' : 'bg-elevated text-muted hover:text-text',
            )}
          >
            {item.label}
          </button>
        ))}
        <select
          value={channelFilter}
          onChange={(event) => setChannelFilter(event.target.value)}
          className="h-9 rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-accent/70 focus:outline-none"
        >
          <option value="todos">Todos os canais</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
        <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            className="h-9 w-full rounded-xl border border-border bg-input pl-9 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/70 focus:outline-none"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Abrindo ideias…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent-subtle text-accent">
            <Lightbulb className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-text">Nenhuma ideia por aqui.</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Cole um link de vídeo e marque se a ideia é para o clipe ou para a música.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-border-soft bg-card">
              <button
                type="button"
                onClick={() => void api.system.openPath(item.url)}
                className="block w-full bg-elevated text-left"
              >
                {item.thumbDataUrl ? (
                  <img src={item.thumbDataUrl} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-muted-2">
                    <Lightbulb className="h-6 w-6" />
                  </div>
                )}
              </button>
              <div className="space-y-2 p-3.5">
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 text-sm font-medium leading-snug text-text">{item.title}</h2>
                  <button
                    type="button"
                    title="Abrir vídeo"
                    onClick={() => void api.system.openPath(item.url)}
                    className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-text"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => void onRemove(item)}
                    className="rounded-lg p-1.5 text-muted hover:bg-danger/15 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {item.author ? <p className="text-xs text-muted-2">{item.author}</p> : null}
                <label className="flex items-center gap-2">
                  {channelOf(item.channelId)?.avatarDataUrl ? (
                    <img
                      src={channelOf(item.channelId)?.avatarDataUrl || ''}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-subtle text-accent">
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <select
                    value={item.channelId || ''}
                    onChange={(event) => void onChannel(item, event.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-input px-2 text-xs text-text focus:border-accent/70 focus:outline-none"
                  >
                    {!item.channelId ? <option value="">Sem canal</option> : null}
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </label>
                {item.note ? <p className="text-sm leading-relaxed text-muted">{item.note}</p> : null}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {KINDS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => void onKind(item, option.id)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px]',
                        item.kind === option.id
                          ? 'bg-accent-subtle text-accent'
                          : 'bg-elevated text-muted-2 hover:text-text',
                      )}
                    >
                      {option.id === 'clipe' ? <Clapperboard className="h-3 w-3" /> : null}
                      {option.id === 'musica' ? <Music2 className="h-3 w-3" /> : null}
                      {option.id === 'geral' ? kindLabel(option.id) : option.label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  )
}
