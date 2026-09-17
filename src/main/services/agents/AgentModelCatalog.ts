import type {
  AgentModelSnapshot,
  AgentModelsBundle,
  AgentProviderId,
} from '../../../shared/agents/types'
import { isConfiguredModelMissing } from '../../../shared/agents/resolveRunConfig'
import { logger } from '../logging/logger'
import type { AgentModelProvider } from './AgentModelProvider'
import { AgentModelCache } from './AgentModelCache'
import { effortsForModel } from './CodexModelProvider'

function emptySnapshot(provider: AgentProviderId, error: string | null = null): AgentModelSnapshot {
  return {
    provider,
    version: null,
    models: [],
    currentModel: null,
    currentReasoningEffort: null,
    reasoningEfforts: [],
    supportsReasoningEffort: false,
    configuredModelMissing: false,
    officialFallback: null,
    officialFallbackMessage: null,
    error,
    source: 'none',
    discoveredAt: new Date().toISOString(),
    fromCache: false,
  }
}

export class AgentModelCatalog {
  private listeners = new Set<(bundle: AgentModelsBundle) => void>()
  private inflight = new Map<AgentProviderId, Promise<AgentModelSnapshot>>()

  constructor(
    private readonly providers: Record<AgentProviderId, AgentModelProvider>,
    private readonly cache: AgentModelCache,
  ) {}

  onChange(listener: (bundle: AgentModelsBundle) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async get(provider: AgentProviderId, opts?: { forceRefresh?: boolean }): Promise<AgentModelSnapshot> {
    if (opts?.forceRefresh) {
      this.cache.invalidate(provider)
      return this.discover(provider)
    }
    const version = await this.safeVersion(provider)
    const auth = await this.safeAuth(provider)
    const cached = this.cache.read(provider)
    if (this.cache.isFresh(cached, version, auth) && cached) {
      return { ...cached.snapshot, fromCache: true }
    }
    return this.discover(provider)
  }

  async getAll(opts?: { forceRefresh?: boolean }): Promise<AgentModelsBundle> {
    const [codex, antigravity] = await Promise.all([
      this.get('codex', opts),
      this.get('antigravity', opts),
    ])
    return { codex, antigravity }
  }

  async refresh(provider: AgentProviderId): Promise<AgentModelSnapshot> {
    this.cache.invalidate(provider)
    const snapshot = await this.discover(provider)
    this.emit()
    return snapshot
  }

  async refreshAll(): Promise<AgentModelsBundle> {
    this.cache.invalidate()
    const bundle = await this.getAll({ forceRefresh: true })
    this.emit()
    return bundle
  }

  invalidate(provider?: AgentProviderId) {
    this.cache.invalidate(provider)
  }

  async setDefaultModel(provider: AgentProviderId, model: string): Promise<AgentModelSnapshot> {
    await this.providers[provider].setDefaultModel(model)
    return this.withCurrent(provider)
  }

  async setReasoningEffort(provider: AgentProviderId, effort: string): Promise<AgentModelSnapshot> {
    await this.providers[provider].setReasoningEffort(effort)
    return this.withCurrent(provider)
  }

  private async withCurrent(provider: AgentProviderId): Promise<AgentModelSnapshot> {
    const current = await this.get(provider)
    const next: AgentModelSnapshot = {
      ...current,
      currentModel: await this.providers[provider].getCurrentModel(),
      currentReasoningEffort: await this.providers[provider].getCurrentReasoningEffort(),
    }
    next.reasoningEfforts = effortsForModel(next.models, next.currentModel).length
      ? effortsForModel(next.models, next.currentModel)
      : next.reasoningEfforts
    next.supportsReasoningEffort = next.reasoningEfforts.length > 0
    next.configuredModelMissing = isConfiguredModelMissing(next.currentModel, next.models)
    this.persist(next, await this.safeVersion(provider), await this.safeAuth(provider))
    this.emit()
    return next
  }

  private async discover(provider: AgentProviderId): Promise<AgentModelSnapshot> {
    const existing = this.inflight.get(provider)
    if (existing) return existing
    const task = this.discoverOnce(provider).finally(() => {
      this.inflight.delete(provider)
    })
    this.inflight.set(provider, task)
    return task
  }

  private async discoverOnce(provider: AgentProviderId): Promise<AgentModelSnapshot> {
    const impl = this.providers[provider]
    const version = await this.safeVersion(provider)
    const auth = await this.safeAuth(provider)
    try {
      const listed = await impl.listModels()
      const currentModel = await impl.getCurrentModel()
      const currentEffort = await impl.getCurrentReasoningEffort()
      const modelEfforts = effortsForModel(listed.models, currentModel)
      const providerEfforts = modelEfforts.length > 0 ? modelEfforts : await impl.listReasoningEfforts(currentModel)
      const snapshot: AgentModelSnapshot = {
        provider,
        version,
        models: listed.models,
        currentModel,
        currentReasoningEffort: currentEffort,
        reasoningEfforts: providerEfforts,
        supportsReasoningEffort: providerEfforts.length > 0,
        configuredModelMissing: isConfiguredModelMissing(currentModel, listed.models),
        officialFallback: listed.officialFallback ?? null,
        officialFallbackMessage: listed.officialFallbackMessage ?? null,
        error: listed.models.length === 0 ? listed.error || 'Não foi possível carregar os modelos.' : null,
        source: listed.source,
        discoveredAt: new Date().toISOString(),
        fromCache: false,
      }
      this.persist(snapshot, version, auth)
      return snapshot
    } catch (error) {
      const message = 'Não foi possível carregar os modelos.'
      logger.error('agents.discovery.failed', {
        provider,
        error: error instanceof Error ? error.message : String(error),
      })
      const fallback = emptySnapshot(provider, message)
      fallback.version = version
      fallback.currentModel = await impl.getCurrentModel().catch(() => null)
      fallback.currentReasoningEffort = await impl.getCurrentReasoningEffort().catch(() => null)
      fallback.configuredModelMissing = isConfiguredModelMissing(fallback.currentModel, [])
      return fallback
    }
  }

  private persist(snapshot: AgentModelSnapshot, version: string | null, authFingerprint: string) {
    this.cache.write({
      provider: snapshot.provider,
      version,
      authFingerprint,
      snapshot: { ...snapshot, fromCache: true },
      timestamp: snapshot.discoveredAt,
    })
  }

  private async emit() {
    const bundle = {
      codex: (await this.get('codex')) ?? emptySnapshot('codex'),
      antigravity: (await this.get('antigravity')) ?? emptySnapshot('antigravity'),
    }
    for (const listener of this.listeners) listener(bundle)
  }

  private async safeVersion(provider: AgentProviderId) {
    try {
      return (await this.providers[provider].getVersion()) ?? null
    } catch {
      return null
    }
  }

  private async safeAuth(provider: AgentProviderId) {
    try {
      return (await this.providers[provider].getAuthFingerprint()) || 'unknown'
    } catch {
      return 'unknown'
    }
  }
}
