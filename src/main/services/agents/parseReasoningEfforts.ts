import { formatEffortLabel } from '../../../shared/agents/resolveRunConfig'
import type { AgentReasoningEffort } from '../../../shared/agents/types'

const HELP_NOISE = new Set([
  'a',
  'an',
  'and',
  'default',
  'effort',
  'flag',
  'for',
  'level',
  'levels',
  'option',
  'options',
  'or',
  'reasoning',
  'select',
  'set',
  'the',
  'this',
  'to',
  'use',
  'value',
  'values',
  'with',
])

export function parseReasoningEffortsFromHelp(helpText: string): AgentReasoningEffort[] {
  const line = helpText.match(/--effort[^\n]*/i)?.[0] ?? ''
  if (!line) return []
  const tokens = [...line.matchAll(/\b([a-z][a-z0-9_-]{1,24})\b/gi)]
    .map((match) => match[1].toLowerCase())
    .filter((token) => !HELP_NOISE.has(token))
  return uniqueEfforts(tokens)
}

export function uniqueEfforts(ids: Array<string | null | undefined>): AgentReasoningEffort[] {
  const seen = new Set<string>()
  const out: AgentReasoningEffort[] = []
  for (const raw of ids) {
    const id = raw?.trim()
    if (!id) continue
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id, label: formatEffortLabel(id) })
  }
  return out
}

export function effortsFromUnknown(value: unknown): AgentReasoningEffort[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return uniqueEfforts(
      value.map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object') {
          const rec = entry as Record<string, unknown>
          return String(rec.effort ?? rec.id ?? rec.level ?? rec.name ?? rec.value ?? '').trim()
        }
        return ''
      }),
    )
  }
  if (typeof value === 'string') {
    return uniqueEfforts(value.split(/[,\s|/]+/))
  }
  return []
}
