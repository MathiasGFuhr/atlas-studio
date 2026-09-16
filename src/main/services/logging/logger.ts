import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

type LogLevel = 'info' | 'warn' | 'error'

function logsDir(): string {
  const dir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function logFilePath(): string {
  const day = new Date().toISOString().slice(0, 10)
  return path.join(logsDir(), `atlas-${day}.log`)
}

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    // Nunca registrar prompts completos longos / possíveis secrets
    if (value.length > 400) return `${value.slice(0, 400)}…[truncated ${value.length} chars]`
    if (/api[_-]?key|token|authorization|password|secret/i.test(value)) return '[redacted]'
    return value
  }
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (/secret|token|password|authorization|apiKey/i.test(k)) {
        out[k] = '[redacted]'
      } else if (k === 'prompt' || k === 'skillMarkdown' || k === 'content') {
        out[k] = typeof v === 'string' ? `[omitted ${v.length} chars]` : '[omitted]'
      } else {
        out[k] = sanitize(v)
      }
    }
    return out
  }
  return value
}

function write(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(data ? { data: sanitize(data) } : {}),
  })
  try {
    fs.appendFileSync(logFilePath(), `${line}\n`, { encoding: 'utf8' })
  } catch {
    // logging never breaks generation
  }
  if (level === 'error') console.error(`[atlas] ${event}`, data ?? '')
  else console.log(`[atlas] ${event}`, data ?? '')
}

export const logger = {
  info(event: string, data?: Record<string, unknown>) {
    write('info', event, data)
  },
  warn(event: string, data?: Record<string, unknown>) {
    write('warn', event, data)
  },
  error(event: string, data?: Record<string, unknown>) {
    write('error', event, data)
  },
}
