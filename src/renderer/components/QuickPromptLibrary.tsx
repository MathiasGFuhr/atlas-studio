import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Copy, FolderPlus, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react'
import { ALL_PROMPT_TABS_ID } from '@shared/quickPrompts'
import type { CustomPrompt, CustomPromptTab } from '@shared/quickPrompts'
import { Card } from './Card'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { Textarea } from './Textarea'
import { ConfirmDialog, Modal } from './Modal'
import { getAtlasApi } from '../lib/api'
import { notifyPromptsChanged, onPromptsChanged } from '../lib/promptEvents'
import { useToast } from './Toast'
import { cn } from '../lib/utils'

const TAB_STORAGE_KEY = 'atlas.quickPrompts.subTab'
const LEGACY_TABS = new Set(['image', 'animation', 'custom'])

const EMPTY_PROMPT_FORM = { name: '', tabId: '', text: '', scope: 'global' }
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

/**
 * Biblioteca de Meus prompts: CRUD dos textos salvos e das sub-abas
 * que o usuário cria (lipsync, câmeras, etc.).
 */
export function QuickPromptLibrary({
  projectId,
  copied,
  onCopied,
  embedded = false,
}: {
  projectId: string | null
  copied: string | null
  onCopied: (key: string) => void
  /** Sem o card externo, para usar dentro de Meus prompts. */
  embedded?: boolean
}) {
  const api = getAtlasApi()
  const { push } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [tabs, setTabs] = useState<CustomPromptTab[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [activeTabId, setActiveTabId] = useState(
    () => parseTabParam(searchParams.get('tab')) ?? readStoredTab(),
  )

  const [editing, setEditing] = useState<CustomPrompt | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_PROMPT_FORM)
  const [removing, setRemoving] = useState<CustomPrompt | null>(null)

  const [tabEditor, setTabEditor] = useState<CustomPromptTab | 'new' | null>(null)
  const [tabForm, setTabForm] = useState(EMPTY_TAB_FORM)
  const [removingTab, setRemovingTab] = useState<CustomPromptTab | null>(null)

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])
  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs])
  const activeTab = activeTabId === ALL_PROMPT_TABS_ID ? null : (tabById.get(activeTabId) ?? null)

  const load = useCallback(async () => {
    const [promptList, tabList, favoriteList] = await Promise.all([
      api.quickPrompts.list({ projectId }),
      api.quickPrompts.listTabs(),
      api.quickPrompts.listFavorites(),
    ])
    setCustomPrompts(promptList)
    setTabs(tabList)
    setFavorites(favoriteList)
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
    if (activeTabId === ALL_PROMPT_TABS_ID || tabs.length === 0) return
    if (tabs.some((tab) => tab.id === activeTabId)) return
    setActiveTabId(ALL_PROMPT_TABS_ID)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, ALL_PROMPT_TABS_ID)
    } catch {
      /* preferência de UI */
    }
    setSearchParams({}, { replace: true })
  }, [tabs, activeTabId, setSearchParams])

  const items = useMemo(() => {
    const term = query.trim().toLowerCase()
    const scoped =
      activeTabId === ALL_PROMPT_TABS_ID
        ? customPrompts
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
  }, [query, customPrompts, favorites, favoriteSet, activeTabId, tabById])

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

  async function toggleFavorite(id: string) {
    setFavorites(await api.quickPrompts.setFavorite(id, !favoriteSet.has(id)))
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
      if (editing) {
        await api.quickPrompts.update(editing.id, payload)
        push('Prompt atualizado.', 'success')
      } else {
        await api.quickPrompts.create(payload)
        push('Prompt salvo.', 'success')
      }
      setFormOpen(false)
      notifyPromptsChanged()
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar o prompt', 'error')
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
      push(error instanceof Error ? error.message : 'Falha ao excluir o prompt', 'error')
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
      push(error instanceof Error ? error.message : 'Falha ao salvar a aba', 'error')
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
      push(error instanceof Error ? error.message : 'Falha ao excluir a aba', 'error')
    }
  }

  const tabSelectOptions = [
    { value: '', label: 'Sem aba (Todos)' },
    ...tabs.map((tab) => ({ value: tab.id, label: tab.name })),
  ]

  const emptyMessage = query
    ? 'Nenhum prompt encontrado'
    : activeTab
      ? `Nenhum prompt em “${activeTab.name}”`
      : 'Nenhum prompt criado ainda'
  const emptyHint = query
    ? 'Nenhum prompt encontrado para esta busca.'
    : activeTab
      ? 'Clique em Adicionar prompt para guardar um texto nesta aba.'
      : 'Peça para a IA salvar um prompt na conversa ou clique em Adicionar prompt.'

  const body = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card-2 p-1">
        <TabButton active={activeTabId === ALL_PROMPT_TABS_ID} onClick={() => selectTab(ALL_PROMPT_TABS_ID)}>
          Todos
        </TabButton>
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTabId === tab.id}
            onClick={() => selectTab(tab.id)}
            onEdit={() => openEditTab(tab)}
            onRemove={() => setRemovingTab(tab)}
          >
            {tab.name}
          </TabButton>
        ))}
        <button
          type="button"
          onClick={openCreateTab}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Nova aba
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <Input
            className="pl-9"
            placeholder={
              activeTab ? `Buscar em ${activeTab.name}...` : 'Buscar meus prompts...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          className="h-11"
          icon={<Plus className="h-4 w-4" />}
          onClick={openCreate}
        >
          Adicionar prompt
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <p className="text-sm font-medium text-text">{emptyMessage}</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const tabName = item.tabId ? tabById.get(item.tabId)?.name : null
            return (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded-xl border border-border bg-card-2 px-3 py-2"
              >
                <button
                  type="button"
                  aria-label={favoriteSet.has(item.id) ? 'Desfavoritar' : 'Favoritar'}
                  aria-pressed={favoriteSet.has(item.id)}
                  onClick={() => void toggleFavorite(item.id)}
                  className={cn(
                    'shrink-0 rounded-lg p-1 transition-colors',
                    favoriteSet.has(item.id) ? 'text-accent' : 'text-muted-2 hover:text-text',
                  )}
                >
                  <Star className={cn('h-3.5 w-3.5', favoriteSet.has(item.id) && 'fill-current')} />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text">{item.name}</div>
                  {tabName || item.projectId ? (
                    <div className="text-xs text-muted-2">
                      {[tabName, item.projectId ? 'somente este projeto' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  ) : null}
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                    {item.text}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  className="h-8 shrink-0 px-2 text-xs"
                  icon={
                    copied === item.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={() => void copy(item.text, item.id)}
                >
                  {copied === item.id ? 'Copiado' : 'Copiar'}
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Editar prompt"
                  className="h-8 shrink-0 px-2"
                  onClick={() => openEdit(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Excluir prompt"
                  className="h-8 shrink-0 px-2"
                  onClick={() => setRemoving(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}

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

  if (embedded) return body
  return (
    <Card padding="sm" className="space-y-3">
      {body}
    </Card>
  )
}

function TabButton({
  active,
  onClick,
  onEdit,
  onRemove,
  children,
}: {
  active: boolean
  onClick: () => void
  onEdit?: () => void
  onRemove?: () => void
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg transition-colors',
        active ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
      >
        {children}
      </button>
      {active && onEdit && onRemove ? (
        <span className="flex pr-1">
          <button
            type="button"
            aria-label="Renomear aba"
            onClick={onEdit}
            className="rounded-md p-1 hover:bg-white/10"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Excluir aba"
            onClick={onRemove}
            className="rounded-md p-1 hover:bg-white/10"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      ) : null}
    </div>
  )
}
