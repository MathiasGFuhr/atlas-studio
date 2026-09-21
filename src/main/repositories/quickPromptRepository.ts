import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type { CustomPrompt, CustomPromptTab } from '../../shared/quickPrompts/types'

type QuickPromptRow = {
  id: string
  name: string
  category: string
  text: string
  tab_id: string | null
  project_id: string | null
  created_at: string
  updated_at: string
}

type QuickPromptTabRow = {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

function mapPrompt(row: QuickPromptRow): CustomPrompt {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'custom',
    text: row.text,
    tabId: row.tab_id?.trim() || null,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTab(row: QuickPromptTabRow): CustomPromptTab {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeTabName(name: string | undefined | null): string {
  return name?.trim() ?? ''
}

/**
 * Prompts rápidos personalizados, sub-abas e favoritos.
 *
 * Os presets padrão vivem em `src/shared/quickPrompts/presets.ts` e não são
 * duplicados no banco. Aqui ficam só o que o usuário escreve (`quick_prompts`),
 * as sub-abas de Meus prompts (`quick_prompt_tabs`) e quais itens ele marcou
 * como favoritos (`quick_prompt_favorites`).
 */
export const quickPromptRepository = {
  /** Prompts globais e, quando informado, os exclusivos do projeto. */
  list(filters?: { projectId?: string | null; query?: string }): CustomPrompt[] {
    let sql = 'SELECT * FROM quick_prompts WHERE 1=1'
    const params: unknown[] = []

    if (filters?.projectId) {
      sql += ' AND (project_id IS NULL OR project_id = ?)'
      params.push(filters.projectId)
    } else {
      sql += ' AND project_id IS NULL'
    }

    if (filters?.query?.trim()) {
      sql += ' AND (name LIKE ? OR text LIKE ? OR category LIKE ?)'
      const like = `%${filters.query.trim()}%`
      params.push(like, like, like)
    }

    sql += ' ORDER BY updated_at DESC'
    return (getDb().prepare(sql).all(...params) as QuickPromptRow[]).map(mapPrompt)
  },

  get(id: string): CustomPrompt | null {
    const row = getDb().prepare('SELECT * FROM quick_prompts WHERE id = ?').get(id) as
      | QuickPromptRow
      | undefined
    return row ? mapPrompt(row) : null
  },

  create(input: {
    name: string
    category?: string
    text: string
    tabId?: string | null
    projectId?: string | null
  }): CustomPrompt {
    const name = input.name?.trim()
    if (!name) throw new Error('O nome do prompt é obrigatório.')
    const text = input.text?.trim()
    if (!text) throw new Error('O texto do prompt é obrigatório.')

    const tab = this.resolveTab({ tabId: input.tabId, category: input.category })

    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO quick_prompts (id, name, category, text, tab_id, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        tab?.name ?? (input.category?.trim() || 'custom'),
        text,
        tab?.id ?? null,
        input.projectId?.trim() || null,
        timestamp,
        timestamp,
      )
    return this.get(id)!
  },

  update(
    id: string,
    patch: Partial<Pick<CustomPrompt, 'name' | 'category' | 'text' | 'tabId' | 'projectId'>>,
  ): CustomPrompt | null {
    const current = this.get(id)
    if (!current) return null

    const name = (patch.name ?? current.name).trim()
    if (!name) throw new Error('O nome do prompt é obrigatório.')
    const text = (patch.text ?? current.text).trim()
    if (!text) throw new Error('O texto do prompt é obrigatório.')

    const tabTouched = patch.tabId !== undefined || patch.category !== undefined
    const tab = tabTouched
      ? this.resolveTab({ tabId: patch.tabId, category: patch.category })
      : this.getTab(current.tabId)
    const category = tab?.name ?? ((patch.category ?? current.category).trim() || 'custom')
    const projectId =
      patch.projectId !== undefined ? patch.projectId?.trim() || null : current.projectId
    const tabId = tabTouched ? (tab?.id ?? null) : current.tabId

    getDb()
      .prepare(
        `UPDATE quick_prompts SET name = ?, category = ?, text = ?, tab_id = ?, project_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(name, category, text, tabId, projectId, new Date().toISOString(), id)
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM quick_prompts WHERE id = ?').run(id)
    getDb().prepare('DELETE FROM quick_prompt_favorites WHERE item_id = ?').run(id)
    return true
  },

  listTabs(): CustomPromptTab[] {
    return (
      getDb()
        .prepare('SELECT * FROM quick_prompt_tabs ORDER BY sort_order ASC, name ASC')
        .all() as QuickPromptTabRow[]
    ).map(mapTab)
  },

  getTab(id: string | null | undefined): CustomPromptTab | null {
    const tabId = id?.trim()
    if (!tabId) return null
    const row = getDb().prepare('SELECT * FROM quick_prompt_tabs WHERE id = ?').get(tabId) as
      | QuickPromptTabRow
      | undefined
    return row ? mapTab(row) : null
  },

  createTab(input: { name: string }): CustomPromptTab {
    const name = normalizeTabName(input.name)
    if (!name) throw new Error('O nome da aba é obrigatório.')
    this.assertUniqueTabName(name)

    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const sortRow = getDb().prepare('SELECT MAX(sort_order) AS v FROM quick_prompt_tabs').get() as
      | { v: number | null }
      | undefined
    const sortOrder = Number(sortRow?.v ?? -1) + 1
    getDb()
      .prepare(
        `INSERT INTO quick_prompt_tabs (id, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, name, sortOrder, timestamp, timestamp)
    return this.getTab(id)!
  },

  updateTab(id: string, patch: { name?: string; sortOrder?: number }): CustomPromptTab | null {
    const current = this.getTab(id)
    if (!current) return null

    const name = patch.name !== undefined ? normalizeTabName(patch.name) : current.name
    if (!name) throw new Error('O nome da aba é obrigatório.')
    this.assertUniqueTabName(name, current.id)
    const sortOrder = patch.sortOrder ?? current.sortOrder

    getDb()
      .prepare(
        `UPDATE quick_prompt_tabs SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
      )
      .run(name, sortOrder, new Date().toISOString(), current.id)

    if (name !== current.name) {
      getDb()
        .prepare('UPDATE quick_prompts SET category = ?, updated_at = ? WHERE tab_id = ?')
        .run(name, new Date().toISOString(), current.id)
    }
    return this.getTab(current.id)
  },

  /** Remove a aba; os prompts continuam em Meus prompts, sem sub-aba. */
  removeTab(id: string): boolean {
    const current = this.getTab(id)
    if (!current) return false
    getDb()
      .prepare(
        `UPDATE quick_prompts SET tab_id = NULL, category = 'custom', updated_at = ? WHERE tab_id = ?`,
      )
      .run(new Date().toISOString(), current.id)
    getDb().prepare('DELETE FROM quick_prompt_tabs WHERE id = ?').run(current.id)
    return true
  },

  /**
   * Resolve a sub-aba a partir de id ou nome (category do chat).
   * Nome inexistente cria a aba — é o que permite a IA salvar em "lipsync".
   */
  resolveTab(input: { tabId?: string | null; category?: string | null }): CustomPromptTab | null {
    if (input.tabId !== undefined) {
      const explicit = input.tabId?.trim() || null
      if (!explicit) return null
      const found = this.getTab(explicit)
      if (!found) throw new Error('Aba de prompt não encontrada.')
      return found
    }

    const name = normalizeTabName(input.category)
    if (!name || name.toLowerCase() === 'custom') return null

    const match = this.listTabs().find((tab) => tab.name.toLowerCase() === name.toLowerCase())
    return match ?? this.createTab({ name })
  },

  /** Ids favoritados — presets embutidos e prompts personalizados juntos. */
  listFavorites(): string[] {
    const rows = getDb()
      .prepare('SELECT item_id FROM quick_prompt_favorites ORDER BY created_at ASC')
      .all() as Array<{ item_id: string }>
    return rows.map((row) => row.item_id)
  },

  setFavorite(itemId: string, favorite: boolean): string[] {
    const id = itemId?.trim()
    if (!id) throw new Error('Item inválido para favoritar.')
    if (favorite) {
      getDb()
        .prepare('INSERT OR REPLACE INTO quick_prompt_favorites (item_id, created_at) VALUES (?, ?)')
        .run(id, new Date().toISOString())
    } else {
      getDb().prepare('DELETE FROM quick_prompt_favorites WHERE item_id = ?').run(id)
    }
    return this.listFavorites()
  },

  assertUniqueTabName(name: string, exceptId?: string) {
    const key = name.toLowerCase()
    const clash = this.listTabs().find(
      (tab) => tab.name.toLowerCase() === key && tab.id !== exceptId,
    )
    if (clash) throw new Error(`Já existe uma aba chamada "${clash.name}".`)
  },
}
