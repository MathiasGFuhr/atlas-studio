import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react'
import {
  ACTIONS,
  AUDIENCE_CONTEXTS,
  CAMERAS,
  FRAMINGS,
  IMAGE_FRAMINGS,
  IMAGE_PERFORMANCES,
  IMAGE_SUBJECTS,
  PERFORMANCES,
  SCENE_CAMERAS,
  SCENE_FRAMINGS,
  STAGE_CONTEXTS,
} from '@shared/quickPrompts'
import type { CustomPrompt } from '@shared/quickPrompts'
import { Card } from './Card'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { Textarea } from './Textarea'
import { ConfirmDialog, Modal } from './Modal'
import { presetFavoriteKey } from '../lib/quickPromptOptions'
import { getAtlasApi } from '../lib/api'
import { useToast } from './Toast'
import { cn } from '../lib/utils'

/**
 * Biblioteca dos Prompts rápidos: busca nos presets embutidos e CRUD dos
 * prompts escritos à mão. Os presets vivem no código; só o que o usuário
 * cria (e os favoritos) vai para o banco.
 */

const CATEGORY_LABELS: Record<string, string> = {
  // Animar / Lipsync
  performance: 'Performance',
  action: 'Ação',
  framing: 'Enquadramento',
  camera: 'Câmera',
  'stage-context': 'Contexto de palco',
  // Criar imagem
  'image-subject': 'Imagem · Quem aparece',
  'image-performance': 'Imagem · Performance',
  'image-framing': 'Imagem · Ângulo',
  custom: 'Personalizado',
}

interface LibraryItem {
  key: string
  name: string
  category: string
  text: string
  /** Presets embutidos não podem ser editados nem removidos. */
  custom: CustomPrompt | null
}

/** Presets embutidos das duas categorias, achatados numa lista pesquisável. */
const PRESET_ITEMS: LibraryItem[] = [
  ...IMAGE_SUBJECTS.map((item) => ({ ...item, category: 'image-subject' as const })),
  ...IMAGE_PERFORMANCES.map((item) => ({ ...item, category: 'image-performance' as const })),
  ...IMAGE_FRAMINGS.map((item) => ({ ...item, category: 'image-framing' as const })),
  ...STAGE_CONTEXTS.map((item) => ({ ...item, category: 'stage-context' as const })),
  ...AUDIENCE_CONTEXTS.map((item) => ({ ...item, category: 'stage-context' as const })),
  ...PERFORMANCES.map((item) => ({ ...item, category: 'performance' as const })),
  ...ACTIONS.map((item) => ({ ...item, category: 'action' as const })),
  ...FRAMINGS.map((item) => ({ ...item, category: 'framing' as const })),
  ...SCENE_FRAMINGS.map((item) => ({ ...item, category: 'framing' as const })),
  ...CAMERAS.map((item) => ({ ...item, category: 'camera' as const })),
  ...SCENE_CAMERAS.map((item) => ({ ...item, category: 'camera' as const })),
].map((item) => ({
  key: presetFavoriteKey(item.category, item.id),
  name: item.label,
  category: item.category,
  text: item.text,
  custom: null,
}))

const EMPTY_FORM = { name: '', category: 'custom', text: '', scope: 'global' }

export function QuickPromptLibrary({
  projectId,
  favorites,
  onFavoritesChange,
  onCopy,
  copied,
}: {
  /** `null` quando aberto fora de um projeto: só os prompts globais aparecem. */
  projectId: string | null
  favorites: Set<string>
  onFavoritesChange: (favorites: string[]) => void
  onCopy: (text: string, key: string, message?: string) => Promise<void>
  copied: string | null
}) {
  const api = getAtlasApi()
  const { push } = useToast()

  const [query, setQuery] = useState('')
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])
  const [editing, setEditing] = useState<CustomPrompt | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [removing, setRemoving] = useState<CustomPrompt | null>(null)

  const load = useCallback(async () => {
    setCustomPrompts(await api.quickPrompts.list({ projectId }))
  }, [api, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const items = useMemo(() => {
    const term = query.trim().toLowerCase()
    const custom: LibraryItem[] = customPrompts.map((prompt) => ({
      key: prompt.id,
      name: prompt.name,
      category: prompt.category,
      text: prompt.text,
      custom: prompt,
    }))

    // Sem busca, a lista mostra só o que o usuário salvou. Os presets embutidos
    // já estão nos seletores acima e apareceriam como ruído aqui.
    const pool = term ? [...custom, ...PRESET_ITEMS] : custom
    const filtered = term
      ? pool.filter(
          (item) =>
            item.name.toLowerCase().includes(term) ||
            item.text.toLowerCase().includes(term) ||
            (CATEGORY_LABELS[item.category] ?? item.category).toLowerCase().includes(term),
        )
      : pool

    // Favoritos primeiro, preservando a ordem original dentro de cada grupo.
    return [
      ...filtered.filter((item) => favorites.has(item.key)),
      ...filtered.filter((item) => !favorites.has(item.key)),
    ]
  }, [query, customPrompts, favorites])

  async function toggleFavorite(key: string) {
    onFavoritesChange(await api.quickPrompts.setFavorite(key, !favorites.has(key)))
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(prompt: CustomPrompt) {
    setEditing(prompt)
    setForm({
      name: prompt.name,
      category: prompt.category,
      text: prompt.text,
      scope: prompt.projectId ? 'project' : 'global',
    })
    setFormOpen(true)
  }

  async function save() {
    try {
      const payload = {
        name: form.name,
        category: form.category,
        text: form.text,
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
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar o prompt', 'error')
    }
  }

  async function remove() {
    if (!removing) return
    const target = removing
    setRemoving(null)
    try {
      await api.quickPrompts.remove(target.id)
      push('Prompt excluído.', 'success')
      await load()
      onFavoritesChange(await api.quickPrompts.listFavorites())
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao excluir o prompt', 'error')
    }
  }

  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <Input
            className="pl-9"
            placeholder="Buscar prompts salvos e presets..."
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
        <p className="py-4 text-center text-xs text-muted">
          {query
            ? 'Nenhum prompt ou preset encontrado para esta busca.'
            : 'Nenhum prompt personalizado ainda. Use a busca para encontrar presets ou crie o seu.'}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-2 rounded-xl border border-border bg-card-2 px-3 py-2"
            >
              <button
                type="button"
                aria-label={favorites.has(item.key) ? 'Desfavoritar' : 'Favoritar'}
                aria-pressed={favorites.has(item.key)}
                onClick={() => void toggleFavorite(item.key)}
                className={cn(
                  'shrink-0 rounded-lg p-1 transition-colors',
                  favorites.has(item.key) ? 'text-accent' : 'text-muted-2 hover:text-text',
                )}
              >
                <Star className={cn('h-3.5 w-3.5', favorites.has(item.key) && 'fill-current')} />
              </button>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-text">{item.name}</div>
                <div className="truncate text-xs text-muted-2">
                  {CATEGORY_LABELS[item.category] ?? item.category}
                  {item.custom?.projectId ? ' · somente este projeto' : ''}
                  {' · '}
                  {item.text}
                </div>
              </div>

              <Button
                variant="ghost"
                className="h-8 shrink-0 px-2 text-xs"
                icon={
                  copied === item.key ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )
                }
                onClick={() => void onCopy(item.text, item.key, 'Texto copiado')}
              >
                {copied === item.key ? 'Copiado' : 'Copiar'}
              </Button>

              {item.custom ? (
                <>
                  <Button
                    variant="ghost"
                    aria-label="Editar prompt"
                    className="h-8 shrink-0 px-2"
                    onClick={() => openEdit(item.custom!)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Excluir prompt"
                    className="h-8 shrink-0 px-2"
                    onClick={() => setRemoving(item.custom)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : null}
            </div>
          ))}
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
            <Button onClick={() => void save()}>Salvar</Button>
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
            <Input
              label="Categoria"
              placeholder="custom"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
            {/* Sem projeto aberto só existe um escopo possível: global. */}
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

      <ConfirmDialog
        open={Boolean(removing)}
        title="Excluir prompt"
        message={`O prompt "${removing?.name ?? ''}" será removido definitivamente.`}
        confirmLabel="Excluir"
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </Card>
  )
}
