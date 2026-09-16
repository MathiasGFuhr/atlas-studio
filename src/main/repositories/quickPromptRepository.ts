import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type { CustomPrompt } from '../../shared/quickPrompts/types'

type QuickPromptRow = {
  id: string
  name: string
  category: string
  text: string
  project_id: string | null
  created_at: string
  updated_at: string
}

function mapPrompt(row: QuickPromptRow): CustomPrompt {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'custom',
    text: row.text,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Prompts rápidos personalizados e favoritos.
 *
 * Os presets padrão vivem em `src/shared/quickPrompts/presets.ts` e não são
 * duplicados no banco. Aqui ficam só o que o usuário escreve (`quick_prompts`)
 * e quais itens ele marcou como favoritos (`quick_prompt_favorites`), que
 * guarda tanto ids de preset quanto ids de prompt personalizado.
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
    projectId?: string | null
  }): CustomPrompt {
    const name = input.name?.trim()
    if (!name) throw new Error('O nome do prompt é obrigatório.')
    const text = input.text?.trim()
    if (!text) throw new Error('O texto do prompt é obrigatório.')

    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO quick_prompts (id, name, category, text, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        name,
        input.category?.trim() || 'custom',
        text,
        input.projectId?.trim() || null,
        timestamp,
        timestamp,
      )
    return this.get(id)!
  },

  update(
    id: string,
    patch: Partial<Pick<CustomPrompt, 'name' | 'category' | 'text' | 'projectId'>>,
  ): CustomPrompt | null {
    const current = this.get(id)
    if (!current) return null

    const name = (patch.name ?? current.name).trim()
    if (!name) throw new Error('O nome do prompt é obrigatório.')
    const text = (patch.text ?? current.text).trim()
    if (!text) throw new Error('O texto do prompt é obrigatório.')
    const category = (patch.category ?? current.category).trim() || 'custom'
    const projectId =
      patch.projectId !== undefined ? patch.projectId?.trim() || null : current.projectId

    getDb()
      .prepare(
        `UPDATE quick_prompts SET name = ?, category = ?, text = ?, project_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(name, category, text, projectId, new Date().toISOString(), id)
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM quick_prompts WHERE id = ?').run(id)
    getDb().prepare('DELETE FROM quick_prompt_favorites WHERE item_id = ?').run(id)
    return true
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
}
