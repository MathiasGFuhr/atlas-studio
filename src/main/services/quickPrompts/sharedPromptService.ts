import { nextSharedCopyName } from '../../../shared/quickPrompts/sharedCopyName'
import type {
  CustomPrompt,
  SharedPrompt,
  SharedPromptCatalogSnapshot,
} from '../../../shared/quickPrompts/types'
import { logger } from '../logging/logger'
import { quickPromptRepository } from '../../repositories/quickPromptRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import { createSharedPromptCatalog, type SharedPromptCatalog } from './sharedPromptCatalog'
import { createSupabaseSharedPromptClient } from './supabaseSharedPromptClient'
import { getSupabaseConfig } from './supabaseConfig'

let cached:
  | {
      key: string
      catalog: SharedPromptCatalog
    }
  | null = null

function catalog(): SharedPromptCatalog {
  const config = getSupabaseConfig()
  const key = config ? `${config.url}\n${config.anonKey}` : ''
  if (cached?.key === key) return cached.catalog

  const next = createSharedPromptCatalog({
    config,
    getAuthorName: () => settingsRepository.get().accountName,
    getTabName: (prompt) => {
      if (!prompt.tabId) return null
      return quickPromptRepository.getTab(prompt.tabId)?.name ?? prompt.category ?? null
    },
    createClient: createSupabaseSharedPromptClient,
  })
  cached = { key, catalog: next }
  return next
}

export const sharedPromptService = {
  async listShared(): Promise<SharedPromptCatalogSnapshot> {
    const instance = catalog()
    const configured = instance.isConfigured()
    if (!configured) {
      return { configured: false, authorId: null, items: [] }
    }
    const [items, authorId] = await Promise.all([instance.list(), instance.currentAuthorId()])
    return { configured: true, authorId, items }
  },

  async setPublic(id: string, isPublic: boolean): Promise<CustomPrompt> {
    const prompt = quickPromptRepository.get(id)
    if (!prompt) throw new Error('Prompt não encontrado.')
    if (isPublic) {
      await catalog().publish(prompt)
      return quickPromptRepository.setPublic(id, true) ?? prompt
    }
    await catalog().unpublish(prompt.id)
    return quickPromptRepository.setPublic(id, false) ?? prompt
  },

  async copyShared(sharedId: string, input?: { tabId?: string | null }): Promise<CustomPrompt> {
    const snapshot = await this.listShared()
    const shared = snapshot.items.find((item) => item.id === sharedId)
    if (!shared) throw new Error('Prompt público não encontrado.')
    return copySharedPrompt(shared, input?.tabId)
  },

  async syncIfPublic(prompt: CustomPrompt): Promise<void> {
    if (!prompt.isPublic) return
    try {
      await catalog().publish(prompt)
    } catch (error) {
      logger.warn('Falha ao sincronizar prompt público', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  },

  async unpublishLocal(id: string): Promise<void> {
    const prompt = quickPromptRepository.get(id)
    if (!prompt?.isPublic) return
    try {
      await catalog().unpublish(prompt.id)
    } catch (error) {
      logger.warn('Falha ao remover prompt público', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  },
}

function copySharedPrompt(shared: SharedPrompt, tabId?: string | null): CustomPrompt {
  const existing = quickPromptRepository.list()
  return quickPromptRepository.create({
    name: nextSharedCopyName(
      shared.name,
      existing.map((item) => item.name),
    ),
    text: shared.text,
    tabId: tabId ?? null,
    category: shared.tabName ?? undefined,
  })
}
