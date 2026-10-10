import { describe, expect, it } from 'vitest'
import type { CustomPrompt, SharedPrompt } from '../../../shared/quickPrompts/types'
import {
  createSharedPromptCatalog,
  type SharedPromptClient,
} from './sharedPromptCatalog'

function prompt(patch: Partial<CustomPrompt> = {}): CustomPrompt {
  return {
    id: 'local-1',
    name: 'Cantor praia',
    category: 'lipsync',
    text: 'close-up na praia',
    tabId: 'tab-1',
    projectId: null,
    isPublic: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

function memoryClient(): SharedPromptClient & { rows: SharedPrompt[] } {
  const rows: SharedPrompt[] = []
  const authorId = 'author-1'
  return {
    rows,
    async ensureUser() {
      return { id: authorId }
    },
    async list() {
      return [...rows]
    },
    async findByLocalPromptId(nextAuthorId, localPromptId) {
      return (
        rows.find((row) => row.authorId === nextAuthorId && row.localPromptId === localPromptId) ??
        null
      )
    },
    async insert(row) {
      const created: SharedPrompt = {
        id: `remote-${rows.length + 1}`,
        localPromptId: row.local_prompt_id,
        name: row.name,
        text: row.text,
        tabName: row.tab_name,
        authorId: row.author_id,
        authorName: row.author_name,
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
      }
      rows.push(created)
      return created
    },
    async update(id, patch) {
      const index = rows.findIndex((row) => row.id === id)
      if (index < 0) throw new Error('missing')
      const current = rows[index]
      const next: SharedPrompt = {
        ...current,
        name: patch.name ?? current.name,
        text: patch.text ?? current.text,
        tabName: patch.tab_name === undefined ? current.tabName : patch.tab_name,
        authorName: patch.author_name ?? current.authorName,
        updatedAt: patch.updated_at ?? current.updatedAt,
      }
      rows[index] = next
      return next
    },
    async removeByLocalPromptId(nextAuthorId, localPromptId) {
      const index = rows.findIndex(
        (row) => row.authorId === nextAuthorId && row.localPromptId === localPromptId,
      )
      if (index >= 0) rows.splice(index, 1)
    },
  }
}

describe('sharedPromptCatalog', () => {
  it('lista vazio e recusa publicar sem Supabase configurado', async () => {
    const catalog = createSharedPromptCatalog({
      config: null,
      getAuthorName: () => 'Mathias',
    })
    expect(catalog.isConfigured()).toBe(false)
    expect(await catalog.list()).toEqual([])
    await expect(catalog.publish(prompt())).rejects.toThrow(/não está disponível/)
  })

  it('publica, atualiza e despublica pelo id local', async () => {
    const client = memoryClient()
    const catalog = createSharedPromptCatalog({
      config: { url: 'https://example.supabase.co', anonKey: 'anon' },
      getAuthorName: () => 'Mathias',
      getTabName: () => 'Lipsync',
      createClient: () => client,
    })

    const published = await catalog.publish(prompt())
    expect(published.authorName).toBe('Mathias')
    expect(published.tabName).toBe('Lipsync')
    expect(client.rows).toHaveLength(1)

    const updated = await catalog.publish(prompt({ name: 'Cantor noite', text: 'noite' }))
    expect(updated.id).toBe(published.id)
    expect(updated.name).toBe('Cantor noite')
    expect(client.rows).toHaveLength(1)

    await catalog.unpublish('local-1')
    expect(client.rows).toHaveLength(0)
  })
})
