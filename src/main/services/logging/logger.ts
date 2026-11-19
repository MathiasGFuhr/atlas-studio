import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

type LogLevel = 'info' | 'warn' | 'error'

let ensuredLogsDir: string | null = null
let prunedOldLogs = false

function logsDir(): string {
  const dir = path.join(app.getPath('userData'), 'logs')
  if (ensuredLogsDir !== dir) {
    fs.mkdirSync(dir, { recursive: true })
    ensuredLogsDir = dir
    if (!prunedOldLogs) {
      prunedOldLogs = true
      pruneOldLogs(dir)
    }
  }
  return dir
}

function pruneOldLogs(dir: string) {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    for (const name of fs.readdirSync(dir)) {
      if (!/^atlas-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      if (stat.isFile() && stat.mtimeMs < cutoff) {
        fs.rmSync(full, { force: true })
      }
    }
  } catch {
    /* ignore log rotation cleanup errors */
  }
}

function logFilePath(): string {
  const day = new Date().toISOString().slice(0, 10)
  return path.join(logsDir(), `atlas-${day}.log`)
}

function sanitizeString(value: string): string {
  if (value.length > 400) return `${value.slice(0, 400)}…[truncated ${value.length} chars]`
  if (/api[_-]?key|token|authorization|password|secret/i.test(value)) return '[redacted]'
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\b(?:rpa|sk|sb_secret|eyJ)[A-Za-z0-9._-]{16,}\b/g, '[redacted]')
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return sanitizeString(value)
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (/secret|token|password|authorization|api[_-]?key|runpodApiKey|accessKeyId|secretAccessKey/i.test(k)) {
      out[k] = '[redacted]'
    } else if (k === 'prompt' || k === 'skillMarkdown' || k === 'content') {
      out[k] = typeof v === 'string' ? `[omitted ${v.length} chars]` : '[omitted]'
    } else {
      out[k] = sanitize(v, seen)
    }
  }
  return out
}

function write(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const safeData = data ? sanitize(data) : undefined
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(safeData !== undefined ? { data: safeData } : {}),
  })
  try {
    fs.appendFileSync(logFilePath(), `${line}\n`, { encoding: 'utf8' })
  } catch {
    // logging never breaks generation
  }
  if (level === 'error') console.error(`[atlas] ${event}`, safeData ?? '')
  else console.log(`[atlas] ${event}`, safeData ?? '')
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
