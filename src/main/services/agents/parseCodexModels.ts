import type { AgentModelInfo } from '../../../shared/agents/types'
import { extractJsonValue } from './extractJson'
import { effortsFromUnknown } from './parseReasoningEfforts'

const SKIP_VISIBILITY = new Set(['hidden', 'internal', 'never'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function modelIdFrom(entry: Record<string, unknown>): string | null {
  const id = String(entry.slug ?? entry.id ?? entry.model ?? entry.name ?? '').trim()
  return id || null
}

function toModel(entry: Record<string, unknown>, configured: string | null): AgentModelInfo | null {
  const id = modelIdFrom(entry)
  if (!id) return null
  const visibility = String(entry.visibility ?? '').trim().toLowerCase()
  if (visibility && SKIP_VISIBILITY.has(visibility) && id !== configured) return null
  const efforts = effortsFromUnknown(
    entry.supported_reasoning_levels ??
      entry.supportedReasoningLevels ??
      entry.reasoning_efforts ??
      entry.reasoningEfforts,
  )
  const label = String(entry.display_name ?? entry.displayName ?? entry.label ?? id).trim() || id
  const description = String(entry.description ?? '').trim()
  return {
    id,
    label,
    description: description || undefined,
    reasoningEfforts: efforts.length > 0 ? efforts : undefined,
  }
}

function collectFromArray(items: unknown[], configured: string | null, into: Map<string, AgentModelInfo>) {
  for (const item of items) {
    if (typeof item === 'string') {
      const id = item.trim()
      if (!id || into.has(id)) continue
      into.set(id, { id, label: id })
      continue
    }
    const rec = asRecord(item)
    if (!rec) continue
    const model = toModel(rec, configured)
    if (model) into.set(model.id, model)
  }
}

function walkCatalog(value: unknown, configured: string | null, into: Map<string, AgentModelInfo>, depth = 0) {
  if (depth > 6 || value == null) return
  if (Array.isArray(value)) {
    const looksLikeModels = value.some((item) => {
      if (typeof item === 'string') return Boolean(item.trim())
      const rec = asRecord(item)
      return Boolean(rec && modelIdFrom(rec))
    })
    if (looksLikeModels) collectFromArray(value, configured, into)
    else value.forEach((item) => walkCatalog(item, configured, into, depth + 1))
    return
  }
  const rec = asRecord(value)
  if (!rec) return
  for (const key of ['models', 'model_list', 'items', 'data', 'catalog', 'available_models']) {
    if (rec[key] != null) walkCatalog(rec[key], configured, into, depth + 1)
  }
  if (into.size === 0 && modelIdFrom(rec)) {
    const model = toModel(rec, configured)
    if (model) into.set(model.id, model)
  }
}

export function parseCodexCatalog(payload: unknown, configured?: string | null): AgentModelInfo[] {
  const into = new Map<string, AgentModelInfo>()
  walkCatalog(payload, configured ?? null, into)
  return [...into.values()]
}

export function parseCodexCatalogText(text: string, configured?: string | null): AgentModelInfo[] {
  const json = extractJsonValue(text)
  if (json != null) return parseCodexCatalog(json, configured)

  const into = new Map<string, AgentModelInfo>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || /^(model|slug|name)\b/i.test(line)) continue
    if (/command not found|not recognized|unknown (command|flag|option)/i.test(line)) continue
    const parts = line.split(/\s{2,}|\t+/)
    const id = (parts[0] || '').trim()
    if (!id || /[^a-z0-9._-]/i.test(id.split(/\s/)[0] ?? '')) continue
    const slug = id.split(/\s+/)[0]
    if (!slug) continue
    const label = (parts[1] || slug).trim()
    if (!into.has(slug)) into.set(slug, { id: slug, label })
  }
  return [...into.values()]
}

export function parseOfficialFallback(text: string): { id: string; message: string } | null {
  const combined = text.trim()
  if (!combined) return null
  const match =
    combined.match(/falling back to\s+[`'"]?([a-z0-9._:-]+)[`'"]?/i) ||
    combined.match(/fallback(?: model)?(?: is|:)\s+[`'"]?([a-z0-9._:-]+)[`'"]?/i)
  const id = match?.[1]?.trim()
  if (!id) return null
  return {
    id,
    message: `O CLI sugere ${id} como alternativa oficial.`,
  }
}

export function mergeModelLists(...lists: AgentModelInfo[][]): AgentModelInfo[] {
  const into = new Map<string, AgentModelInfo>()
  for (const list of lists) {
    for (const model of list) {
      const current = into.get(model.id)
      if (!current) {
        into.set(model.id, model)
        continue
      }
      into.set(model.id, {
        ...current,
        ...model,
        label: model.label || current.label,
        description: model.description || current.description,
        reasoningEfforts: model.reasoningEfforts?.length
          ? model.reasoningEfforts
          : current.reasoningEfforts,
      })
    }
  }
  return [...into.values()]
}
