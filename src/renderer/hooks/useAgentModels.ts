import { useCallback, useEffect, useState } from 'react'
import type { AgentModelSnapshot, AgentModelsBundle, AgentProviderId } from '@shared/agents/types'
import { getAtlasApi } from '../lib/api'

const EMPTY: AgentModelsBundle = {
  codex: emptySnapshot('codex'),
  antigravity: emptySnapshot('antigravity'),
}

function emptySnapshot(provider: AgentProviderId): AgentModelSnapshot {
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
    error: null,
    source: 'none',
    discoveredAt: '',
    fromCache: false,
  }
}

function isBundle(value: AgentModelSnapshot | AgentModelsBundle): value is AgentModelsBundle {
  return 'codex' in value && 'antigravity' in value && !('provider' in value)
}

export function useAgentModels() {
  const api = getAtlasApi()
  const [bundle, setBundle] = useState<AgentModelsBundle>(EMPTY)
  const [loading, setLoading] = useState({ codex: true, antigravity: true })
  const [refreshing, setRefreshing] = useState<AgentProviderId | 'all' | null>(null)

  const apply = useCallback((next: AgentModelSnapshot | AgentModelsBundle) => {
    if (isBundle(next)) {
      setBundle(next)
      setLoading({ codex: false, antigravity: false })
      return
    }
    setBundle((current) => ({ ...current, [next.provider]: next }))
    setLoading((current) => ({ ...current, [next.provider]: false }))
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await api.agents.getCapabilities()
        if (!cancelled) apply(next)
      } catch {
        if (!cancelled) setLoading({ codex: false, antigravity: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, apply])

  useEffect(() => {
    return api.agents.onCapabilitiesChanged((next) => apply(next))
  }, [api, apply])

  async function refresh(provider?: AgentProviderId) {
    setRefreshing(provider ?? 'all')
    if (provider) setLoading((current) => ({ ...current, [provider]: true }))
    else setLoading({ codex: true, antigravity: true })
    try {
      const next = await api.agents.refreshModels(provider)
      apply(next)
    } finally {
      setRefreshing(null)
      if (provider) setLoading((current) => ({ ...current, [provider]: false }))
      else setLoading({ codex: false, antigravity: false })
    }
  }

  async function setDefaultModel(provider: AgentProviderId, model: string) {
    const next = await api.agents.setDefaultModel(provider, model)
    apply(next)
    return next
  }

  async function setReasoningEffort(provider: AgentProviderId, effort: string) {
    const next = await api.agents.setReasoningEffort(provider, effort)
    apply(next)
    return next
  }

  return {
    bundle,
    loading,
    refreshing,
    refresh,
    setDefaultModel,
    setReasoningEffort,
  }
}
