import type { CustomPrompt, SharedPrompt } from '../../../shared/quickPrompts/types'
import type { SupabaseConfig } from './supabaseConfig'

export type SharedPromptRow = {
  id: string
  local_prompt_id: string
  name: string
  text: string
  tab_name: string | null
  author_id: string
  author_name: string
  published_at: string
  updated_at: string
}

export type SharedPromptClient = {
  ensureUser(): Promise<{ id: string }>
  list(): Promise<SharedPrompt[]>
  findByLocalPromptId(authorId: string, localPromptId: string): Promise<SharedPrompt | null>
  insert(row: Omit<SharedPromptRow, 'id'>): Promise<SharedPrompt>
  update(id: string, patch: Partial<Omit<SharedPromptRow, 'id'>>): Promise<SharedPrompt>
  removeByLocalPromptId(authorId: string, localPromptId: string): Promise<void>
}

const NOT_CONFIGURED = 'O catálogo público do Atlas não está disponível.'

export function createSharedPromptCatalog(options: {
  config: SupabaseConfig | null
  getAuthorName: () => string
  getTabName?: (prompt: CustomPrompt) => string | null
  createClient?: (config: SupabaseConfig) => SharedPromptClient
}) {
  const client = options.config && options.createClient ? options.createClient(options.config) : null

  return {
    isConfigured(): boolean {
      return Boolean(options.config && client)
    },

    async currentAuthorId(): Promise<string | null> {
      if (!client) return null
      try {
        const user = await client.ensureUser()
        return user.id
      } catch {
        return null
      }
    },

    async list(): Promise<SharedPrompt[]> {
      if (!client) return []
      return client.list()
    },

    async publish(prompt: CustomPrompt): Promise<SharedPrompt> {
      if (!client) throw new Error(NOT_CONFIGURED)
      const user = await client.ensureUser()
      const now = new Date().toISOString()
      const authorName = options.getAuthorName().trim() || 'Autor anônimo'
      const tabName = options.getTabName?.(prompt) ?? null
      const existing = await client.findByLocalPromptId(user.id, prompt.id)
      if (existing) {
        return client.update(existing.id, {
          name: prompt.name,
          text: prompt.text,
          tab_name: tabName,
          author_name: authorName,
          updated_at: now,
        })
      }
      return client.insert({
        local_prompt_id: prompt.id,
        name: prompt.name,
        text: prompt.text,
        tab_name: tabName,
        author_id: user.id,
        author_name: authorName,
        published_at: now,
        updated_at: now,
      })
    },

    async unpublish(localPromptId: string): Promise<void> {
      if (!client) throw new Error(NOT_CONFIGURED)
      const user = await client.ensureUser()
      await client.removeByLocalPromptId(user.id, localPromptId)
    },
  }
}

export type SharedPromptCatalog = ReturnType<typeof createSharedPromptCatalog>

export function mapSharedPromptRow(row: SharedPromptRow): SharedPrompt {
  return {
    id: row.id,
    localPromptId: row.local_prompt_id,
    name: row.name,
    text: row.text,
    tabName: row.tab_name,
    authorId: row.author_id,
    authorName: row.author_name,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}

