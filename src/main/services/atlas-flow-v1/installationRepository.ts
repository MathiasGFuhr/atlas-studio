import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../../db/database'

export type FlowInstallationRow = {
  id: string
  tenantId: string
  atlasUserId: string
  label: string
  extensionId: string | null
  extensionVersion: string | null
  protocolVersion: number
  adapterVersion: string | null
  tokenHash: string | null
  tokenEpoch: number
  enabled: number
  lastSeenAt: string | null
  createdAt: string
  revokedAt: string | null
  transportKind: string
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createInstallationRepository(database: AppDatabase) {
  return {
    create(input: {
      tenantId: string
      atlasUserId: string
      label?: string
      transportKind?: string
    }): FlowInstallationRow {
      const id = randomUUID()
      const createdAt = nowIso()
      const label = input.label?.trim() || 'Extensão Atlas Flow'
      const transportKind = input.transportKind ?? 'loopback-http-ws'
      database
        .prepare(
          `INSERT INTO flow_installations (
            id, tenant_id, atlas_user_id, label, extension_id, extension_version,
            protocol_version, adapter_version, token_hash, token_epoch, enabled,
            last_seen_at, created_at, revoked_at, transport_kind
          ) VALUES (?, ?, ?, ?, NULL, NULL, 1, NULL, NULL, 0, 1, NULL, ?, NULL, ?)`,
        )
        .run(id, input.tenantId, input.atlasUserId, label, createdAt, transportKind)
      database.persist()
      const row = this.get(id)
      if (!row) throw new Error('Falha ao criar flow_installation')
      return row
    },

    get(id: string): FlowInstallationRow | null {
      const row = database
        .prepare(
          `SELECT id, tenant_id AS tenantId, atlas_user_id AS atlasUserId, label,
            extension_id AS extensionId, extension_version AS extensionVersion,
            protocol_version AS protocolVersion, adapter_version AS adapterVersion,
            token_hash AS tokenHash, token_epoch AS tokenEpoch, enabled,
            last_seen_at AS lastSeenAt, created_at AS createdAt,
            revoked_at AS revokedAt, transport_kind AS transportKind
           FROM flow_installations WHERE id = ?`,
        )
        .get(id) as FlowInstallationRow | undefined
      return row ?? null
    },

    listActive(tenantId: string): FlowInstallationRow[] {
      return database
        .prepare(
          `SELECT id, tenant_id AS tenantId, atlas_user_id AS atlasUserId, label,
            extension_id AS extensionId, extension_version AS extensionVersion,
            protocol_version AS protocolVersion, adapter_version AS adapterVersion,
            token_hash AS tokenHash, token_epoch AS tokenEpoch, enabled,
            last_seen_at AS lastSeenAt, created_at AS createdAt,
            revoked_at AS revokedAt, transport_kind AS transportKind
           FROM flow_installations
           WHERE tenant_id = ? AND revoked_at IS NULL AND enabled = 1
           ORDER BY created_at DESC`,
        )
        .all(tenantId) as FlowInstallationRow[]
    },
  }
}
