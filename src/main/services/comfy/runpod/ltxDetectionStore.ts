/**
 * Persistência do snapshot LTX por fingerprint de conta (SQLite settings).
 * Sem expor API keys / S3 secrets.
 */

import type { LtxAutoDetectResult } from '../../../../shared/ltxAutoDetect'
import type { LtxDetectionSnapshot } from '../../../../shared/ltxDetectionSnapshot'
import { getDb } from '../../../db/database'

const SNAPSHOT_KEY = 'ltxDetectionSnapshot'
const LEGACY_BY_ACCOUNT_PREFIX = 'ltxDetectionSnapshot:'

type SettingsIo = {
  read(key: string): string | null
  write(key: string, value: string): void
  remove?(key: string): void
}

function defaultSettingsIo(): SettingsIo {
  return {
    read(key) {
      const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined
      return row?.value ?? null
    },
    write(key, value) {
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    },
    remove(key) {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
    },
  }
}

function parseSnapshot(raw: string | null): LtxDetectionSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LtxDetectionSnapshot
    if (!parsed?.accountFingerprint || !parsed?.result || !parsed?.savedAt) return null
    return parsed
  } catch {
    return null
  }
}

export function getLtxDetectionSnapshot(
  accountFingerprint: string | null,
  io: SettingsIo = defaultSettingsIo(),
): LtxDetectionSnapshot | null {
  if (!accountFingerprint) return null
  const keyed = parseSnapshot(io.read(`${LEGACY_BY_ACCOUNT_PREFIX}${accountFingerprint}`))
  if (keyed && keyed.accountFingerprint === accountFingerprint) return keyed
  const current = parseSnapshot(io.read(SNAPSHOT_KEY))
  if (current && current.accountFingerprint === accountFingerprint) return current
  return null
}

export function saveLtxDetectionSnapshot(
  result: LtxAutoDetectResult,
  meta: {
    inventoryVerifiedAt: string | null
    inventoryVolumeId: string | null
    inventoryWorkflowName: string | null
    inventoryWorkflowFingerprint: string | null
    inventorySource: 's3' | 'comfy' | 'none'
  },
  io: SettingsIo = defaultSettingsIo(),
): LtxDetectionSnapshot | null {
  const accountFingerprint = result.accountFingerprint
  if (!accountFingerprint) return null
  const snapshot: LtxDetectionSnapshot = {
    accountFingerprint,
    savedAt: new Date().toISOString(),
    inventoryVerifiedAt: meta.inventoryVerifiedAt,
    inventoryVolumeId: meta.inventoryVolumeId,
    inventoryWorkflowName: meta.inventoryWorkflowName,
    inventoryWorkflowFingerprint: meta.inventoryWorkflowFingerprint,
    inventorySource: meta.inventorySource,
    result: {
      ...result,
      dryRun: true,
      mutationCalls: 0,
    },
  }
  const payload = JSON.stringify(snapshot)
  io.write(SNAPSHOT_KEY, payload)
  io.write(`${LEGACY_BY_ACCOUNT_PREFIX}${accountFingerprint}`, payload)
  return snapshot
}

export function clearLtxDetectionSnapshotForOtherAccounts(
  keepFingerprint: string | null,
  io: SettingsIo = defaultSettingsIo(),
): void {
  const current = parseSnapshot(io.read(SNAPSHOT_KEY))
  if (current && keepFingerprint && current.accountFingerprint !== keepFingerprint) {
    io.write(SNAPSHOT_KEY, JSON.stringify({ ...current, result: null }))
    // Mantém snapshot por conta; a chave “ativa” limpa se for de outra conta.
    io.remove?.(SNAPSHOT_KEY)
  }
}
