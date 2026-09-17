import type { AgentRunConfig } from './types'

function trimOrNull(value?: string | null): string | null {
  const next = value?.trim() || ''
  return next || null
}

export function resolveRunConfig(input: {
  overrideModel?: string | null
  overrideEffort?: string | null
  defaultModel?: string | null
  defaultEffort?: string | null
}): AgentRunConfig {
  const overrideModel = trimOrNull(input.overrideModel)
  const overrideEffort = trimOrNull(input.overrideEffort)
  const defaultModel = trimOrNull(input.defaultModel)
  const defaultEffort = trimOrNull(input.defaultEffort)
  return {
    model: overrideModel ?? defaultModel,
    effort: overrideEffort ?? defaultEffort,
    usedModelOverride: Boolean(overrideModel),
    usedEffortOverride: Boolean(overrideEffort),
  }
}

export function formatEffortLabel(id: string): string {
  const trimmed = id.trim()
  if (!trimmed) return trimmed
  return trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1)
}

export function isConfiguredModelMissing(currentModel: string | null, models: Array<{ id: string }>): boolean {
  const id = currentModel?.trim()
  if (!id) return false
  return !models.some((model) => model.id === id)
}
