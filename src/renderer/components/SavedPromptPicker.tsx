import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Library, Search, X } from 'lucide-react'
import { ALL_PROMPT_TABS_ID } from '@shared/quickPrompts'
import type { CustomPrompt, CustomPromptTab } from '@shared/quickPrompts'
import { MUSIC_PROMPTS_PATH } from '@shared/workspaceCapabilities'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { Select } from './Select'
import { getAtlasApi } from '../lib/api'
import { onPromptsChanged } from '../lib/promptEvents'
import { useToast } from './Toast'
import { cn } from '../lib/utils'

const UNTABBED_ID = 'untabbed'

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= 160) return flat
  return `${flat.slice(0, 157)}…`
}

/**
 * Escolhe um texto da biblioteca de Prompts e devolve o conteúdo para
 * preencher o campo da imagem de lipsync.
 */
export function SavedPromptPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (prompt: CustomPrompt) => void
}) {
  const api = getAtlasApi()
  const { pushError } = useToast()
  const [prompts, setPrompts] = useState<CustomPrompt[]>([])
  const [tabs, setTabs] = useState<CustomPromptTab[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [tabId, setTabId] = useState(ALL_PROMPT_TABS_ID)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setQuery('')
    setTabId(ALL_PROMPT_TABS_ID)

    async function load() {
      try {
        const [promptList, tabList] = await Promise.all([
          api.quickPrompts.list(),
          api.quickPrompts.listTabs(),
        ])
        if (cancelled) return
        setPrompts(promptList)
        setTabs(tabList)
      } catch (error) {
        if (!cancelled) pushError(error, 'Não foi possível carregar os prompts salvos.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const unsubscribe = onPromptsChanged(() => {
      void load()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [api, open, pushError])

  const tabById = useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return prompts.filter((prompt) => {
      if (tabId === UNTABBED_ID && prompt.tabId) return false
      if (tabId !== ALL_PROMPT_TABS_ID && tabId !== UNTABBED_ID && prompt.tabId !== tabId) {
        return false
      }
      if (!term) return true
      const tabName = prompt.tabId ? (tabById.get(prompt.tabId)?.name ?? '') : ''
      return (
        prompt.name.toLowerCase().includes(term) ||
        prompt.text.toLowerCase().includes(term) ||
        tabName.toLowerCase().includes(term)
      )
    })
  }, [prompts, query, tabById, tabId])

  const tabOptions = [
    { value: ALL_PROMPT_TABS_ID, label: 'Todas as abas' },
    ...tabs.map((tab) => ({ value: tab.id, label: tab.name })),
    { value: UNTABBED_ID, label: 'Sem aba' },
  ]

  return (
    <Modal
      open={open}
      title="Prompts salvos"
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Escolha um texto da aba Prompts. Ele entra no campo desta imagem e você ainda pode editar
          depois.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-2" />
            <Input
              aria-label="Buscar prompts salvos"
              className={cn('pl-9', query && 'pr-10')}
              placeholder="Buscar por nome ou texto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
          <Select
            aria-label="Filtrar por aba"
            options={tabOptions}
            value={tabId}
            onChange={(event) => setTabId(event.target.value)}
          />
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted">Carregando…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <Library className="mx-auto mb-2 h-5 w-5 text-muted-2" />
            <p className="text-sm font-medium text-text">
              {prompts.length === 0 ? 'Nenhum prompt salvo ainda' : 'Nenhum prompt nesta busca'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
              Crie e organize os textos na aba Prompts. Eles aparecem aqui para usar em cada imagem.
            </p>
            <Link
              to={MUSIC_PROMPTS_PATH}
              onClick={onClose}
              className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
            >
              Abrir aba Prompts
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((prompt) => {
              const tabName = prompt.tabId ? tabById.get(prompt.tabId)?.name : null
              return (
                <li key={prompt.id}>
                  <button
                    type="button"
                    onClick={() => onPick(prompt)}
                    className="w-full rounded-xl border border-border bg-card-2 px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent/5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
                        {prompt.name}
                      </span>
                      {tabName ? (
                        <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {tabName}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">
                      {preview(prompt.text)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
