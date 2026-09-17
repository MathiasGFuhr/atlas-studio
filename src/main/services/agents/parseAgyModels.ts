import type { AgentModelInfo } from '../../../shared/agents/types'
import { extractJsonValue } from './extractJson'
import { parseCodexCatalog } from './parseCodexModels'

const HEADER = /^(model|models|slug|name|id|available|listing)\b/i
const USAGE = /^(usage:|agy\s+models|error:|fatal:|unknown|command not found)/i

function fromLine(line: string): AgentModelInfo | null {
  const trimmed = line.trim()
  if (!trimmed || HEADER.test(trimmed) || USAGE.test(trimmed) || trimmed.startsWith('-')) return null
  if (/^[-*|]+$/.test(trimmed)) return null
  const parts = trimmed.split(/\s{2,}|\t+/)
  const first = (parts[0] || '').trim().split(/\s+/)[0]
  if (!first || !/^[a-z0-9][a-z0-9._:-]*$/i.test(first)) return null
  const label = (parts.slice(1).join(' ').trim() || first).replace(/\s+/g, ' ')
  return { id: first, label }
}

export function parseAgyModelsOutput(stdout: string, stderr = ''): AgentModelInfo[] {
  const text = `${stdout}\n${stderr}`.trim()
  if (!text) return []

  const json = extractJsonValue(stdout) ?? extractJsonValue(stderr)
  if (json != null) {
    const fromJson = parseCodexCatalog(json)
    if (fromJson.length > 0) return fromJson
  }

  const into = new Map<string, AgentModelInfo>()
  for (const raw of text.split(/\r?\n/)) {
    const model = fromLine(raw)
    if (!model) continue
    if (!into.has(model.id)) into.set(model.id, model)
  }
  return [...into.values()]
}
