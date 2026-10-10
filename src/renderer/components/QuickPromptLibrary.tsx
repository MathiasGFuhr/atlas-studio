import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check,
  Copy,
  Folder,
  FolderPlus,
  Globe,
  Inbox,
  Layers,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { ALL_PROMPT_TABS_ID, SHARED_PROMPT_TABS_ID } from '@shared/quickPrompts'
import type {
  CustomPrompt,
  CustomPromptTab,
  SharedPrompt,
  SharedPromptCatalogSnapshot,
} from '@shared/quickPrompts'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { Textarea } from './Textarea'
import { ConfirmDialog, Modal } from './Modal'
import { getAtlasApi } from '../lib/api'
import { notifyPromptsChanged, onPromptsChanged } from '../lib/promptEvents'
import { useToast } from './Toast'
import { cn, formatRelativeDate } from '../lib/utils'

const TAB_STORAGE_KEY = 'atlas.quickPrompts.subTab'
const LEGACY_TABS = new Set(['image', 'animation', 'custom'])
const FAVORITES_PROMPT_TABS_ID = 'favorites'
const UNTABBED_PROMPT_TABS_ID = 'untabbed'

const EMPTY_PROMPT_FORM = { name: '', tabId: '', text: '', scope: 'global', isPublic: false }
const EMPTY_SHARED_CATALOG: SharedPromptCatalogSnapshot = {
  configured: true,
  authorId: null,
  items: [],
}
const EMPTY_TAB_FORM = { name: '' }

function readStoredTab(): string {
  try {
    const value = window.localStorage.getItem(TAB_STORAGE_KEY)
    if (!value || LEGACY_TABS.has(value)) return ALL_PROMPT_TABS_ID
    return value
  } catch {
    return ALL_PROMPT_TABS_ID
  }
}

function parseTabParam(value: string | null | undefined): string | null {
  if (!value || LEGACY_TABS.has(value)) return null
  return value
}

function isBuiltInTab(id: string): boolean {
  return (
    id === ALL_PROMPT_TABS_ID ||
    id === SHARED_PROMPT_TABS_ID ||
    id === FAVORITES_PROMPT_TABS_ID ||
    id === UNTABBED_PROMPT_TABS_ID
  )
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function isLongPrompt(text: string): boolean {
  return text.length > 220 || text.split('\n').length > 4
}

function formatCharacters(text: string): string {
  const count = text.length
  return `${new Intl.NumberFormat('pt-BR').format(count)} ${count === 1 ? 'caractere' : 'caracteres'}`
}

/**
 * Biblioteca de Meus prompts: CRUD dos textos salvos e das sub-abas
 * que o usuário cria (lipsync, câmeras, etc.).
 */
export function QuickPromptLibrary({
  projectId,
  copied,
  onCopied,
}: {
  projectId: string | null
  copied: string | null
  onCopied: (key: string) => void
}) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [ready, setReady] = useState(false)
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [tabs, setTabs] = useState<CustomPromptTab[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [sharedCatalog, setSharedCatalog] = useState<SharedPromptCatalogSnapshot>(EMPTY_SHARED_CATALOG)
  const [activeTabId, setActiveTabId] = useState(
    () => parseTabParam(searchParams.get('tab')) ?? readStoredTab(),
  )
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())

  const [editing, setEditing] = useState<CustomPrompt | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_PROMPT_FORM)
  const [removing, setRemoving] = useState<CustomPrompt | null>(null)

  const [tabEditor, setTabEditor] = useState<CustomPromptTab | 'new' | null>(null)
  const [tabForm, setTabForm] = useState(EMPTY_TAB_FORM)
  const [removingTab, setRemovingTab] = useState<CustomPromptTab | null>(null)

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs])
  const activeTab = isBuiltInTab(activeTabId) ? null : (tabById.get(activeTabId) ?? null)

  const load = useCallback(async () => {
    try {
      const [promptList, tabList, favoriteList, shared] = await Promise.all([
        api.quickPrompts.list({ projectId }),
        api.quickPrompts.listTabs(),
        api.quickPrompts.listFavorites(),
        api.quickPrompts.listShared().catch(() => EMPTY_SHARED_CATALOG),
      ])
      setCustomPrompts(promptList)
      setTabs(tabList)
      setFavorites(favoriteList)
      setSharedCatalog(shared)
    } finally {
      setReady(true)
    }
  }, [api, projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return onPromptsChanged(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    const fromUrl = parseTabParam(searchParams.get('tab'))
    if (fromUrl) setActiveTabId(fromUrl)
  }, [searchParams])

  useEffect(() => {
    if (isBuiltInTab(activeTabId) || tabs.length === 0) return
    if (tabs.some((tab) => tab.id === activeTabId)) return
    setActiveTabId(ALL_PROMPT_TABS_ID)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, ALL_PROMPT_TABS_ID)
    } catch {
      /* preferência de UI */
    }
    setSearchParams({}, { replace: true })
  }, [tabs, activeTabId, setSearchParams])

  const tabCounts = useMemo(() => {
    const byTab = new Map<string, number>()
    let untabbed = 0
    let favoriteCount = 0
    for (const prompt of customPrompts) {
      if (favoriteSet.has(prompt.id)) favoriteCount += 1
      if (prompt.tabId) byTab.set(prompt.tabId, (byTab.get(prompt.tabId) ?? 0) + 1)
      else untabbed += 1
    }
    return { byTab, untabbed, favorites: favoriteCount }
  }, [customPrompts, favoriteSet])

  const items = useMemo(() => {
    const term = query.trim().toLowerCase()
    const scoped =
      activeTabId === ALL_PROMPT_TABS_ID
        ? customPrompts
        : activeTabId === FAVORITES_PROMPT_TABS_ID
          ? customPrompts.filter((prompt) => favoriteSet.has(prompt.id))
          : activeTabId === UNTABBED_PROMPT_TABS_ID
            ? customPrompts.filter((prompt) => !prompt.tabId)
            : customPrompts.filter((prompt) => prompt.tabId === activeTabId)

    const filtered = term
      ? scoped.filter((prompt) => {
          const tabName = prompt.tabId ? (tabById.get(prompt.tabId)?.name ?? '') : ''
          return (
            prompt.name.toLowerCase().includes(term) ||
            prompt.text.toLowerCase().includes(term) ||
            tabName.toLowerCase().includes(term)
          )
        })
      : scoped

    return [
      ...filtered.filter((item) => favoriteSet.has(item.id)),
      ...filtered.filter((item) => !favoriteSet.has(item.id)),
    ]
  }, [query, customPrompts, favoriteSet, activeTabId, tabById])

  function selectTab(next: string) {
    setActiveTabId(next)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next)
    } catch {
      /* preferência de UI */
    }
    const params = new URLSearchParams(searchParams)
    if (next === ALL_PROMPT_TABS_ID) params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  async function copy(text: string, key: string) {
    try {
      await api.system.copyText(text)
      onCopied(key)
      push('Texto copiado', 'success')
    } catch {
      push('Não foi possível copiar o prompt.', 'error')
    }
  }

  async function addSharedToLibrary(item: SharedPrompt) {
    try {
      await api.quickPrompts.copyShared(item.id)
      push('Prompt adicionado à sua biblioteca.', 'success')
      notifyPromptsChanged()
      await load()
    } catch (error) {
      pushError(error, 'Falha ao copiar o prompt público')
    }
  }

  async function toggleFavorite(id: string) {
    setFavorites(await api.quickPrompts.setFavorite(id, !favoriteSet.has(id)))
  }

  function toggleOpen(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCreate() {
    setEditing(null)
    setForm({
      ...EMPTY_PROMPT_FORM,
      tabId: activeTab?.id ?? '',
    })
    setFormOpen(true)
  }

  function openEdit(prompt: CustomPrompt) {
    setEditing(prompt)
    setForm({
      name: prompt.name,
      tabId: prompt.tabId ?? '',
      text: prompt.text,
      scope: prompt.projectId ? 'project' : 'global',
      isPublic: prompt.isPublic,
    })
    setFormOpen(true)
  }

  function openCreateTab() {
    setTabEditor('new')
    setTabForm(EMPTY_TAB_FORM)
  }

  function openEditTab(tab: CustomPromptTab) {
    setTabEditor(tab)
    setTabForm({ name: tab.name })
  }

  async function savePrompt() {
    try {
      const payload = {
        name: form.name,
        text: form.text,
        tabId: form.tabId || null,
        projectId: form.scope === 'project' ? projectId : null,
      }
      const saved = editing
        ? await api.quickPrompts.update(editing.id, payload)
        : await api.quickPrompts.create(payload)
      if (!saved) throw new Error('Não foi possível salvar o prompt.')
      if (form.isPublic !== saved.isPublic) {
        await api.quickPrompts.setPublic(saved.id, form.isPublic)
      } else if (form.isPublic) {
        await api.quickPrompts.setPublic(saved.id, true)
      }
      push(editing ? 'Prompt atualizado.' : 'Prompt salvo.', 'success')
      setFormOpen(false)
      notifyPromptsChanged()
      await load()
    } catch (error) {
      pushError(error, 'Falha ao salvar o prompt')
    }
  }

  async function removePrompt() {
    if (!removing) return
    const target = removing
    setRemoving(null)
    try {
      await api.quickPrompts.remove(target.id)
      push('Prompt excluído.', 'success')
      notifyPromptsChanged()
      await load()
    } catch (error) {
      pushError(error, 'Falha ao excluir o prompt')
    }
  }

  async function saveTab() {
    try {
      const name = tabForm.name.trim()
      if (tabEditor === 'new') {
        const created = await api.quickPrompts.createTab({ name })
        push('Aba criada.', 'success')
        setTabEditor(null)
        notifyPromptsChanged()
        await load()
        selectTab(created.id)
        return
      }
      if (!tabEditor) return
      await api.quickPrompts.updateTab(tabEditor.id, { name })
      push('Aba atualizada.', 'success')
      setTabEditor(null)
      notifyPromptsChanged()
      await load()
    } catch (error) {
      pushError(error, 'Falha ao salvar a aba')
    }
  }

  async function removeTab() {
    if (!removingTab) return
    const target = removingTab
    setRemovingTab(null)
    try {
      await api.quickPrompts.removeTab(target.id)
      push('Aba excluída.', 'success')
      if (activeTabId === target.id) selectTab(ALL_PROMPT_TABS_ID)
      notifyPromptsChanged()
      await load()
    } catch (error) {
      pushError(error, 'Falha ao excluir a aba')
    }
  }

  const tabSelectOptions = [
    { value: '', label: 'Sem aba (Todos)' },
    ...tabs.map((tab) => ({ value: tab.id, label: tab.name })),
  ]

  const viewingShared = activeTabId === SHARED_PROMPT_TABS_ID
  const viewingFavorites = activeTabId === FAVORITES_PROMPT_TABS_ID
  const viewingUntabbed = activeTabId === UNTABBED_PROMPT_TABS_ID
  const showUntabbed = tabCounts.untabbed > 0 || viewingUntabbed

  const sharedItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return sharedCatalog.items
    return sharedCatalog.items.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        item.text.toLowerCase().includes(term) ||
        (item.authorName ?? '').toLowerCase().includes(term) ||
        (item.tabName ?? '').toLowerCase().includes(term)
      )
    })
  }, [query, sharedCatalog.items])

  const shownCount = viewingShared ? sharedItems.length : items.length
  const summary = query.trim()
    ? countLabel(shownCount, 'resultado', 'resultados')
    : countLabel(shownCount, 'prompt', 'prompts')

  const view = viewingShared
    ? {
        title: 'Públicos',
        description: 'Prompts compartilhados com outros usuários do Atlas',
      }
    : viewingFavorites
      ? {
          title: 'Favoritos',
          description: 'Atalho para os prompts marcados com estrela',
        }
      : viewingUntabbed
        ? {
            title: 'Sem aba',
            description: 'Prompts que ainda não estão em um grupo',
          }
        : activeTab
          ? {
              title: activeTab.name,
              description: 'Prompts deste grupo',
            }
          : {
              title: 'Todos',
              description: 'Biblioteca completa, com favoritos no topo',
            }

  const emptyMessage = viewingShared
    ? query
      ? 'Nenhum prompt público encontrado'
      : 'Nenhum prompt público ainda'
    : viewingFavorites
      ? query
        ? 'Nenhum favorito encontrado'
        : 'Nenhum favorito ainda'
      : query
        ? 'Nenhum prompt encontrado'
        : activeTab
          ? `Nenhum prompt em “${activeTab.name}”`
          : viewingUntabbed
            ? 'Nenhum prompt sem aba'
            : 'Nenhum prompt criado ainda'

  const emptyHint = viewingShared
    ? query
      ? 'Tente outro nome, autor ou trecho do texto.'
      : sharedCatalog.configured
        ? 'Quando alguém marcar um prompt como público, ele aparece aqui.'
        : 'A biblioteca pública aparece quando o Supabase está configurado.'
    : viewingFavorites
      ? query
        ? 'Tente outro nome ou trecho do texto.'
        : 'Marque a estrela em um prompt para encontrá-lo aqui.'
      : query
        ? 'Tente outro nome, aba ou trecho do texto.'
        : activeTab
          ? 'Adicione um texto neste grupo ou mova um prompt existente para cá.'
          : 'Peça para a IA salvar um prompt na conversa ou crie o primeiro agora.'

  const searchPlaceholder = viewingShared
    ? 'Buscar por nome, autor ou texto...'
    : viewingFavorites
      ? 'Buscar nos favoritos...'
      : activeTab
        ? `Buscar em ${activeTab.name}...`
        : 'Buscar por nome ou texto...'

  const listEmpty = viewingShared ? sharedItems.length === 0 : items.length === 0
  const favoriteItems = items.filter((item) => favoriteSet.has(item.id))
  const otherItems = items.filter((item) => !favoriteSet.has(item.id))
  const showGroups =
    !viewingShared && !viewingFavorites && favoriteItems.length > 0 && otherItems.length > 0

  function renderPrompt(item: CustomPrompt) {
    const tabName = item.tabId ? tabById.get(item.tabId)?.name : null
    return (
      <PromptCard
        key={item.id}
        item={item}
        tabName={tabName ?? null}
        favorite={favoriteSet.has(item.id)}
        copied={copied === item.id}
        expanded={openIds.has(item.id)}
        onToggleFavorite={() => void toggleFavorite(item.id)}
        onToggleExpanded={() => toggleOpen(item.id)}
        onOpenTab={
          item.tabId
            ? () => selectTab(item.tabId as string)
            : () => selectTab(UNTABBED_PROMPT_TABS_ID)
        }
        onCopy={() => void copy(item.text, item.id)}
        onEdit={() => openEdit(item)}
        onRemove={() => setRemoving(item)}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-[0_8px_24px_rgba(0,0,0,0.25)] lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border-soft bg-sidebar lg:min-h-0 lg:w-[248px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="hidden px-4 pb-1 pt-4 lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-2">Biblioteca</p>
          <p className="mt-1 text-sm font-medium text-text">
            {countLabel(customPrompts.length, 'prompt', 'prompts')}
          </p>
        </div>

        <nav
          role="tablist"
          aria-label="Coleções de prompts"
          className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:px-2 lg:pb-3"
        >
          <NavButton
            active={activeTabId === ALL_PROMPT_TABS_ID}
            icon={<Layers className="h-4 w-4" />}
            label="Todos"
            count={customPrompts.length}
            onClick={() => selectTab(ALL_PROMPT_TABS_ID)}
          />
          <NavButton
            active={viewingFavorites}
            icon={<Star className={cn('h-4 w-4', viewingFavorites && 'fill-current')} />}
            label="Favoritos"
            count={tabCounts.favorites}
            onClick={() => selectTab(FAVORITES_PROMPT_TABS_ID)}
          />
          <NavButton
            active={viewingShared}
            icon={<Globe className="h-4 w-4" />}
            label="Públicos"
            count={sharedCatalog.items.length}
            onClick={() => selectTab(SHARED_PROMPT_TABS_ID)}
          />
          {showUntabbed ? (
            <NavButton
              active={viewingUntabbed}
              icon={<Inbox className="h-4 w-4" />}
              label="Sem aba"
              count={tabCounts.untabbed}
              onClick={() => selectTab(UNTABBED_PROMPT_TABS_ID)}
            />
          ) : null}

          <div className="mx-1 h-6 w-px shrink-0 self-center bg-border lg:hidden" aria-hidden />
          <p className="mb-1 mt-4 hidden px-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-2 lg:block">
            Abas
          </p>
          {tabs.length === 0 ? (
            <p className="hidden px-2.5 py-1 text-xs leading-relaxed text-muted-2 lg:block">
              Nenhuma aba ainda. Crie uma para agrupar os prompts.
            </p>
          ) : (
            tabs.map((tab) => (
              <NavButton
                key={tab.id}
                active={activeTabId === tab.id}
                icon={<Folder className="h-4 w-4" />}
                label={tab.name}
                count={tabCounts.byTab.get(tab.id) ?? 0}
                onClick={() => selectTab(tab.id)}
              />
            ))
          )}
          <button
            type="button"
            onClick={openCreateTab}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border px-2.5 py-2 text-[13px] font-semibold text-muted transition-colors hover:border-accent/40 hover:text-text lg:mt-1 lg:w-full lg:justify-center"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Nova aba
          </button>
        </nav>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-soft px-4 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-text">{view.title}</h2>
            <p className="mt-1 text-xs text-muted">
              {view.description}
              <span className="text-muted-2"> · {summary}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {activeTab ? (
              <>
                <Button
                  variant="ghost"
                  aria-label="Renomear aba"
                  className="h-9 px-2.5 text-xs"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => openEditTab(activeTab)}
                >
                  <span className="hidden sm:inline">Renomear</span>
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Excluir aba"
                  className="h-9 px-2.5 text-xs"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => setRemovingTab(activeTab)}
                >
                  <span className="hidden sm:inline">Excluir aba</span>
                </Button>
              </>
            ) : null}
            {viewingShared ? null : (
              <Button className="h-9" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                Adicionar prompt
              </Button>
            )}
          </div>
        </div>

        <div className="shrink-0 border-b border-border-soft px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-2" />
            <Input
              aria-label="Buscar prompts"
              className={cn('pl-9', query && 'pr-10')}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-2 hover:bg-white/5 hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {!ready ? (
            <div className="space-y-2" aria-hidden>
              <div className="h-28 animate-pulse rounded-2xl border border-border-soft bg-card-2" />
              <div className="h-28 animate-pulse rounded-2xl border border-border-soft bg-card-2" />
              <div className="h-28 animate-pulse rounded-2xl border border-border-soft bg-card-2" />
            </div>
          ) : listEmpty ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-dark text-accent">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-text">{emptyMessage}</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{emptyHint}</p>
              {!viewingShared && !viewingFavorites && !query ? (
                <Button className="mt-4" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                  Adicionar prompt
                </Button>
              ) : null}
            </div>
          ) : viewingShared ? (
            <div className="space-y-2">
              {sharedItems.map((item) => {
                const mine = Boolean(sharedCatalog.authorId && item.authorId === sharedCatalog.authorId)
                return (
                  <SharedPromptCard
                    key={item.id}
                    item={item}
                    mine={mine}
                    copied={copied === item.id}
                    expanded={openIds.has(item.id)}
                    onToggleExpanded={() => toggleOpen(item.id)}
                    onCopy={() => void copy(item.text, item.id)}
                    onAdd={() => void addSharedToLibrary(item)}
                  />
                )
              })}
            </div>
          ) : showGroups ? (
            <div className="space-y-2">
              <GroupLabel>Favoritos</GroupLabel>
              {favoriteItems.map(renderPrompt)}
              <GroupLabel>Demais prompts</GroupLabel>
              {otherItems.map(renderPrompt)}
            </div>
          ) : (
            <div className="space-y-2">{items.map(renderPrompt)}</div>
          )}
        </div>
      </section>

      <Modal
        open={formOpen}
        title={editing ? 'Editar prompt' : 'Novo prompt'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void savePrompt()}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Nome"
            placeholder="Cantor close praia"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Aba"
              options={tabSelectOptions}
              value={form.tabId}
              onChange={(e) => setForm({ ...form, tabId: e.target.value })}
            />
            {projectId ? (
              <Select
                label="Disponibilidade"
                options={[
                  { value: 'global', label: 'Todos os projetos de Música' },
                  { value: 'project', label: 'Somente este projeto' },
                ]}
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
              />
            ) : null}
          </div>
          <Textarea
            label="Texto"
            placeholder="Escreva o prompt completo..."
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
          <label className="flex items-start gap-2 text-sm text-text">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.isPublic}
              onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
            />
            <span>
              <span className="font-medium">Tornar público</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                Outros usuários do Atlas veem este prompt na aba Públicos e podem copiar para a biblioteca deles.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(tabEditor)}
        title={tabEditor === 'new' ? 'Nova aba' : 'Renomear aba'}
        onClose={() => setTabEditor(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTabEditor(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveTab()}>Salvar</Button>
          </>
        }
      >
        <Input
          label="Nome da aba"
          placeholder="Lipsync, ângulos de câmera..."
          value={tabForm.name}
          onChange={(e) => setTabForm({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void saveTab()
            }
          }}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Excluir prompt"
        message={`O prompt "${removing?.name ?? ''}" será removido definitivamente.`}
        confirmLabel="Excluir"
        onConfirm={() => void removePrompt()}
        onClose={() => setRemoving(null)}
      />

      <ConfirmDialog
        open={Boolean(removingTab)}
        title="Excluir aba"
        message={`A aba "${removingTab?.name ?? ''}" será excluída. Os prompts dela continuam em Meus prompts, em Todos.`}
        confirmLabel="Excluir"
        onConfirm={() => void removeTab()}
        onClose={() => setRemovingTab(null)}
      />
    </div>
  )
}

function NavButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors lg:w-full',
        active ? 'bg-accent-dark text-accent' : 'text-muted hover:bg-white/[0.04] hover:text-text',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-accent' : 'text-muted-2')}>{icon}</span>
      <span className="truncate">{label}</span>
      <span
        className={cn(
          'ml-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums lg:ml-auto',
          active ? 'text-accent/80' : 'text-muted-2',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2 first:pt-0">
      {children}
    </p>
  )
}

function MetaChip({
  children,
  tone = 'neutral',
  onClick,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent'
  onClick?: () => void
}) {
  const className = cn(
    'inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
    tone === 'accent' ? 'bg-accent-dark text-accent' : 'bg-white/5 text-muted',
  )
  if (!onClick) return <span className={className}>{children}</span>
  return (
    <button type="button" onClick={onClick} className={cn(className, 'hover:text-text')}>
      {children}
    </button>
  )
}

function IconAction({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-text',
        danger && 'hover:bg-danger/10 hover:text-danger',
      )}
    >
      {children}
    </button>
  )
}

function PromptBody({
  text,
  expanded,
  onToggle,
}: {
  text: string
  expanded: boolean
  onToggle: () => void
}) {
  const long = isLongPrompt(text)
  return (
    <div className="mt-3">
      <p
        className={cn(
          'whitespace-pre-wrap break-words rounded-xl border border-border-soft bg-bg px-3 py-2.5 text-[13px] leading-relaxed text-text/80',
          long && !expanded && 'line-clamp-3',
        )}
      >
        {text}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-2">{formatCharacters(text)}</p>
        {long ? (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs font-semibold text-accent hover:text-accent-hover"
          >
            {expanded ? 'Recolher' : 'Ver completo'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function PromptCard({
  item,
  tabName,
  favorite,
  copied,
  expanded,
  onToggleFavorite,
  onToggleExpanded,
  onOpenTab,
  onCopy,
  onEdit,
  onRemove,
}: {
  item: CustomPrompt
  tabName: string | null
  favorite: boolean
  copied: boolean
  expanded: boolean
  onToggleFavorite: () => void
  onToggleExpanded: () => void
  onOpenTab?: () => void
  onCopy: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <article className="rounded-2xl border border-border-soft bg-card-2 px-3.5 py-3.5 transition-colors hover:border-border">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={favorite ? 'Desfavoritar' : 'Favoritar'}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={cn(
            'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            favorite ? 'text-accent' : 'text-muted-2 hover:bg-white/5 hover:text-text',
          )}
        >
          <Star className={cn('h-4 w-4', favorite && 'fill-current')} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 title={item.name} className="truncate text-[15px] font-semibold tracking-tight text-text">
                {item.name}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <MetaChip onClick={onOpenTab}>{tabName ?? 'Sem aba'}</MetaChip>
                {item.isPublic ? <MetaChip tone="accent">Público</MetaChip> : null}
                {item.projectId ? <MetaChip>Este projeto</MetaChip> : null}
                <span className="text-[11px] text-muted-2">{formatRelativeDate(item.updatedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="secondary"
                className="h-8 px-2.5 text-xs"
                icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                onClick={onCopy}
              >
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              <IconAction label="Editar prompt" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </IconAction>
              <IconAction label="Excluir prompt" danger onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconAction>
            </div>
          </div>
          <PromptBody text={item.text} expanded={expanded} onToggle={onToggleExpanded} />
        </div>
      </div>
    </article>
  )
}

function SharedPromptCard({
  item,
  mine,
  copied,
  expanded,
  onToggleExpanded,
  onCopy,
  onAdd,
}: {
  item: SharedPrompt
  mine: boolean
  copied: boolean
  expanded: boolean
  onToggleExpanded: () => void
  onCopy: () => void
  onAdd: () => void
}) {
  return (
    <article className="rounded-2xl border border-border-soft bg-card-2 px-3.5 py-3.5 transition-colors hover:border-border">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-text">{item.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <MetaChip>{item.authorName || 'Autor anônimo'}</MetaChip>
            {item.tabName ? <MetaChip>{item.tabName}</MetaChip> : null}
            {mine ? <MetaChip tone="accent">Seu</MetaChip> : null}
            <span className="text-[11px] text-muted-2">{formatRelativeDate(item.updatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            className="h-8 px-2.5 text-xs"
            icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            onClick={onCopy}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <Button variant="secondary" className="h-8 px-2.5 text-xs" onClick={onAdd}>
            Adicionar aos meus
          </Button>
        </div>
      </div>
      <PromptBody text={item.text} expanded={expanded} onToggle={onToggleExpanded} />
    </article>
  )
}
