import fs from 'node:fs'
import path from 'node:path'

const MAX_MIGRATION_BACKUPS = 5

export function isBackupSettingEnabled(value: unknown): boolean {
  if (value === false || value === 0 || value === 'false') return false
  if (typeof value === 'string') {
    try {
      return isBackupSettingEnabled(JSON.parse(value))
    } catch {
      return value.trim().toLowerCase() !== 'nao' && value.trim().toLowerCase() !== 'não'
    }
  }
  return true
}

/**
 * Cópia pontual do SQLite antes de migração relevante.
 * Não deve ser chamada em todo startup — só quando o schema vai avançar.
 */
export function backupSqliteFile(opts: {
  dbFilePath: string
  enabled: boolean
  reason: string
  keep?: number
}): string | null {
  if (!opts.enabled) return null
  const source = opts.dbFilePath
  if (!source || !fs.existsSync(source)) return null
  const size = fs.statSync(source).size
  if (size <= 0) return null

  const dir = path.join(path.dirname(source), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(dir, `atlas-studio-${sanitizeReason(opts.reason)}-${stamp}.db`)
  fs.copyFileSync(source, dest)
  pruneOldBackups(dir, opts.keep ?? MAX_MIGRATION_BACKUPS)
  return dest
}

function sanitizeReason(reason: string): string {
  return reason.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'migrate'
}

function pruneOldBackups(dir: string, keep: number) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('atlas-studio-') && name.endsWith('.db'))
    .map((name) => {
      const full = path.join(dir, name)
      return { full, mtime: fs.statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)

  for (const extra of files.slice(keep)) {
    try {
      fs.unlinkSync(extra.full)
    } catch {
      /* ignore */
    }
  }
}
