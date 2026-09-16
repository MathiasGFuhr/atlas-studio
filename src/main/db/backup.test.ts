import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { backupSqliteFile, isBackupSettingEnabled } from './backup'

describe('backup de banco', () => {
  it('respeita backupEnabled', () => {
    expect(isBackupSettingEnabled(true)).toBe(true)
    expect(isBackupSettingEnabled(false)).toBe(false)
    expect(isBackupSettingEnabled(JSON.stringify(false))).toBe(false)
  })

  it('não copia em startup vazio ou com backup desligado', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-backup-'))
    const missing = path.join(dir, 'missing.db')
    expect(backupSqliteFile({ dbFilePath: missing, enabled: true, reason: 'v2' })).toBeNull()

    const empty = path.join(dir, 'empty.db')
    fs.writeFileSync(empty, '')
    expect(backupSqliteFile({ dbFilePath: empty, enabled: true, reason: 'v2' })).toBeNull()

    const db = path.join(dir, 'atlas-studio.db')
    fs.writeFileSync(db, 'sqlite')
    expect(backupSqliteFile({ dbFilePath: db, enabled: false, reason: 'v2' })).toBeNull()
  })

  it('copia só quando há dados e guarda no máximo N arquivos', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-backup-'))
    const db = path.join(dir, 'atlas-studio.db')
    fs.writeFileSync(db, 'conteudo-real')

    const first = backupSqliteFile({ dbFilePath: db, enabled: true, reason: 'schema-2', keep: 2 })
    expect(first && fs.existsSync(first)).toBe(true)

    // timestamps distintos
    const wait = Date.now() + 20
    while (Date.now() < wait) {
      /* busy */
    }
    backupSqliteFile({ dbFilePath: db, enabled: true, reason: 'schema-3', keep: 2 })
    while (Date.now() < wait + 20) {
      /* busy */
    }
    backupSqliteFile({ dbFilePath: db, enabled: true, reason: 'schema-4', keep: 2 })

    const backups = fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.endsWith('.db'))
    expect(backups).toHaveLength(2)
  })
})
