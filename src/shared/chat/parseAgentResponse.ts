import type { ChatActionCall } from './types'

export interface ParsedAgentResponse {
  message: string
  conversationTitle?: string
  actions: ChatActionCall[]
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseActionList(value: unknown): ChatActionCall[] {
  if (!Array.isArray(value)) return []
  const actions: ChatActionCall[] = []
  for (const item of value) {
    const row = asObject(item)
    if (!row) continue
    const name = String(row.name ?? row.action ?? '').trim()
    if (!name) continue
    const input = asObject(row.input) ?? asObject(row.arguments) ?? asObject(row.params) ?? {}
    actions.push({ name, input })
  }
  return actions
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = text.trim()
  if (!raw) return null

  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1].trim() : raw

  try {
    const parsed = JSON.parse(candidate) as unknown
    return asObject(parsed)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown
      return asObject(parsed)
    } catch {
      return null
    }
  }
}

export function parseAgentResponse(text: string): ParsedAgentResponse {
  const json = extractJsonObject(text)
  if (!json) {
    return { message: text.trim(), actions: [] }
  }

  const message = String(json.message ?? json.reply ?? json.text ?? '').trim()
  const title = String(json.conversationTitle ?? json.title ?? '').trim()
  const actions = parseActionList(json.actions ?? json.tool_calls ?? json.tools)

  if (!message && actions.length === 0) {
    return { message: text.trim(), actions: [] }
  }

  return {
    message: message || 'Pronto.',
    conversationTitle: title || undefined,
    actions,
  }
}

export function titleFromFirstMessage(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Nova conversa'
  return cleaned.length > 48 ? `${cleaned.slice(0, 45).trim()}…` : cleaned
}
