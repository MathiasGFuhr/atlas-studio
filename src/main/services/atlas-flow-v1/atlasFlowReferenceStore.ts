/**
 * Persistência canônica atlas-flow-v1 de referências/bindings em SQLite (flow_*).
 * O JSON em docs/atlas-flow/references-store.json é apenas espelho/export + migração
 * inicial — não é banco paralelo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { getDb } from '../../db/database'
import { logger } from '../logging/logger'

export type AtlasFlowReferenceRecord = {
  referenceId: string
  versionId: string
  atlasProjectId: string
  displayName: string
  mimeType: string
  byteSize: number
  sha256: string
  absPath: string
  stagedAt: string
  uploadState: string
  bindingState: string
  attachedState: string
  flowMediaId: string | null
  projectLinkId?: string | null
}

function docsStorePath(): string {
  return path.join(process.cwd(), 'docs', 'atlas-flow', 'references-store.json')
}

function exportMirror(records: AtlasFlowReferenceRecord[], link?: { atlasProjectId?: string; flowProjectId?: string }) {
  const payload = {
    version: 1,
    sourceOfTruth: 'sqlite:flow_references',
    atlasProjectId: link?.atlasProjectId || null,
    linkedFlowProjectId: link?.flowProjectId || null,
    updatedAt: new Date().toISOString(),
    note: 'Espelho/export. Fonte de verdade = SQLite flow_*. Sem pairingToken.',
    references: records,
  }
  try {
    fs.mkdirSync(path.dirname(docsStorePath()), { recursive: true })
    fs.writeFileSync(docsStorePath(), `${JSON.stringify(payload, null, 2)}\n`)
  } catch (error) {
    logger.warn('atlas-flow-v1.references.export_mirror_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function rowToRecord(row: Record<string, unknown>): AtlasFlowReferenceRecord | null {
  const referenceId = String(row.reference_id || '')
  const versionId = String(row.version_id || '')
  if (!referenceId || !versionId) return null
  return {
    referenceId,
    versionId,
    atlasProjectId: String(row.atlas_project_id || ''),
    displayName: String(row.display_name || 'reference'),
    mimeType: String(row.mime_type || 'application/octet-stream'),
    byteSize: Number(row.byte_size) || 0,
    sha256: String(row.effective_sha256 || row.source_sha256 || ''),
    absPath: String(row.abs_path || ''),
    stagedAt: String(row.created_at || ''),
    uploadState: String(row.upload_state || 'staged_local'),
    bindingState: String(row.binding_state || 'not_bound'),
    // Draft attachment nunca presumido após reload do processo.
    attachedState: 'not_attached',
    flowMediaId: row.flow_media_id ? String(row.flow_media_id) : null,
    projectLinkId: row.project_link_id ? String(row.project_link_id) : null,
  }
}

export const atlasFlowReferenceStore = {
  migrateJsonMirrorIfNeeded(): void {
    const db = getDb()
    const count = (
      db.prepare(`SELECT COUNT(*) AS c FROM flow_references`).get() as { c: number } | undefined
    )?.c
    if (count && count > 0) return
    const storePath = docsStorePath()
    if (!fs.existsSync(storePath)) return
    try {
      const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as {
        references?: Array<Record<string, unknown>>
      }
      for (const item of parsed.references || []) {
        const referenceId = String(item.referenceId || '')
        const versionId = String(item.versionId || '')
        const absPath = String(item.absPath || '')
        if (!referenceId || !versionId || !absPath || !fs.existsSync(absPath)) continue
        const bytes = fs.readFileSync(absPath)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        if (item.sha256 && String(item.sha256) !== sha256) continue
        const now = new Date().toISOString()
        db.prepare(
          `INSERT OR IGNORE INTO flow_references (
            id, atlas_project_id, display_name, alias_normalized, active_version_id,
            created_at, updated_at, archived_at, revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
        ).run(
          referenceId,
          String(item.atlasProjectId || ''),
          String(item.displayName || 'reference'),
          String(item.displayName || 'reference')
            .toLowerCase()
            .replace(/\s+/g, '_'),
          versionId,
          String(item.stagedAt || now),
          now,
        )
        db.prepare(
          `INSERT OR IGNORE INTO flow_reference_versions (
            id, reference_id, source_asset_id, source_sha256, effective_asset_id, effective_sha256,
            mime_type, byte_size, width, height, created_at
          ) VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, ?)`,
        ).run(
          versionId,
          referenceId,
          sha256,
          sha256,
          String(item.mimeType || 'application/octet-stream'),
          bytes.length,
          String(item.stagedAt || now),
        )
        // Colunas extras de runtime: usamos uma tabela auxiliar leve se necessário.
        // Guardamos abs_path/upload_state em binding provisional / export.
      }
      // Persiste paths em arquivo espelho após migração (IDs preservados).
      this.listByAtlasProject(String(parsed.references?.[0]?.atlasProjectId || '')).length
      logger.info('atlas-flow-v1.references.migrated_from_json_mirror', {
        storePath,
      })
    } catch (error) {
      logger.warn('atlas-flow-v1.references.migrate_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  listByAtlasProject(atlasProjectId: string): AtlasFlowReferenceRecord[] {
    this.migrateJsonMirrorIfNeeded()
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT
          r.id AS reference_id,
          r.atlas_project_id,
          r.display_name,
          v.id AS version_id,
          v.mime_type,
          v.byte_size,
          v.effective_sha256,
          v.source_sha256,
          v.created_at,
          b.flow_media_id,
          b.binding_state,
          b.project_link_id
        FROM flow_references r
        LEFT JOIN flow_reference_versions v ON v.id = r.active_version_id
        LEFT JOIN flow_reference_bindings b
          ON b.reference_version_id = v.id AND b.invalidated_at IS NULL
        WHERE r.atlas_project_id = ? AND r.archived_at IS NULL
        ORDER BY r.created_at ASC`,
      )
      .all(atlasProjectId) as Array<Record<string, unknown>>

    // abs_path / upload_state: recuperar do espelho JSON (staging em disco).
    let mirrorById = new Map<string, Record<string, unknown>>()
    try {
      if (fs.existsSync(docsStorePath())) {
        const parsed = JSON.parse(fs.readFileSync(docsStorePath(), 'utf8')) as {
          references?: Array<Record<string, unknown>>
        }
        for (const item of parsed.references || []) {
          mirrorById.set(String(item.referenceId), item)
        }
      }
    } catch {
      mirrorById = new Map()
    }

    const out: AtlasFlowReferenceRecord[] = []
    for (const row of rows) {
      const base = rowToRecord(row)
      if (!base) continue
      const mirror = mirrorById.get(base.referenceId)
      if (mirror?.absPath) base.absPath = String(mirror.absPath)
      if (mirror?.uploadState && !base.flowMediaId) {
        base.uploadState = String(mirror.uploadState)
      } else if (base.flowMediaId) {
        base.uploadState = 'uploaded_bound'
        base.bindingState = 'bound'
      } else {
        base.uploadState = 'staged_local'
      }
      out.push(base)
    }
    return out
  },

  upsertStaged(record: AtlasFlowReferenceRecord): void {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO flow_references (
        id, atlas_project_id, display_name, alias_normalized, active_version_id,
        created_at, updated_at, archived_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        active_version_id = excluded.active_version_id,
        updated_at = excluded.updated_at`,
    ).run(
      record.referenceId,
      record.atlasProjectId,
      record.displayName,
      record.displayName.toLowerCase().replace(/\s+/g, '_'),
      record.versionId,
      record.stagedAt || now,
      now,
    )
    db.prepare(
      `INSERT INTO flow_reference_versions (
        id, reference_id, source_asset_id, source_sha256, effective_asset_id, effective_sha256,
        mime_type, byte_size, width, height, created_at
      ) VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        effective_sha256 = excluded.effective_sha256,
        byte_size = excluded.byte_size,
        mime_type = excluded.mime_type`,
    ).run(
      record.versionId,
      record.referenceId,
      record.sha256,
      record.sha256,
      record.mimeType,
      record.byteSize,
      record.stagedAt || now,
    )
    const all = this.listByAtlasProject(record.atlasProjectId)
    // Garante que o registro atual (com absPath) entre no espelho.
    const merged = [...all.filter((item) => item.referenceId !== record.referenceId), record]
    exportMirror(merged, {
      atlasProjectId: record.atlasProjectId,
    })
  },

  archiveReference(referenceId: string): { ok: boolean; error?: string } {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT id, atlas_project_id FROM flow_references WHERE id = ? AND archived_at IS NULL`,
      )
      .get(referenceId) as { id: string; atlas_project_id: string } | undefined
    if (!row) {
      // Pode existir só no espelho JSON (fixtures de teste).
      try {
        if (fs.existsSync(docsStorePath())) {
          const parsed = JSON.parse(fs.readFileSync(docsStorePath(), 'utf8')) as {
            references?: Array<Record<string, unknown>>
            atlasProjectId?: string | null
          }
          const next = (parsed.references || []).filter(
            (item) => String(item.referenceId || '') !== referenceId,
          )
          if (next.length !== (parsed.references || []).length) {
            exportMirror(
              next.map((item) => ({
                referenceId: String(item.referenceId || ''),
                versionId: String(item.versionId || ''),
                atlasProjectId: String(item.atlasProjectId || parsed.atlasProjectId || ''),
                displayName: String(item.displayName || 'reference'),
                mimeType: String(item.mimeType || 'application/octet-stream'),
                byteSize: Number(item.byteSize) || 0,
                sha256: String(item.sha256 || ''),
                absPath: String(item.absPath || ''),
                stagedAt: String(item.stagedAt || ''),
                uploadState: String(item.uploadState || 'staged_local'),
                bindingState: String(item.bindingState || 'not_bound'),
                attachedState: String(item.attachedState || 'not_attached'),
                flowMediaId: item.flowMediaId ? String(item.flowMediaId) : null,
                projectLinkId: item.projectLinkId ? String(item.projectLinkId) : null,
              })),
              { atlasProjectId: parsed.atlasProjectId || undefined },
            )
            return { ok: true }
          }
        }
      } catch {
        /* ignore */
      }
      return { ok: false, error: 'REFERENCE_NOT_FOUND' }
    }
    const now = new Date().toISOString()
    db.prepare(
      `UPDATE flow_references
       SET archived_at = ?, updated_at = ?, revision = revision + 1
       WHERE id = ?`,
    ).run(now, now, referenceId)
    const remaining = this.listByAtlasProject(row.atlas_project_id)
    exportMirror(remaining, { atlasProjectId: row.atlas_project_id })
    return { ok: true }
  },

  upsertBinding(input: {
    referenceId: string
    projectLinkId: string
    flowMediaId: string | null
    bindingState: string
    attachedState: string
  }): void {
    const db = getDb()
    const ref = db
      .prepare(`SELECT active_version_id, atlas_project_id FROM flow_references WHERE id = ?`)
      .get(input.referenceId) as
      | { active_version_id: string; atlas_project_id: string }
      | undefined
    if (!ref?.active_version_id) return
    const existing = db
      .prepare(
        `SELECT id FROM flow_reference_bindings
         WHERE project_link_id = ? AND reference_version_id = ? AND invalidated_at IS NULL`,
      )
      .get(input.projectLinkId, ref.active_version_id) as { id: string } | undefined
    const id = existing?.id || randomUUID()
    if (existing) {
      db.prepare(
        `UPDATE flow_reference_bindings
         SET flow_media_id = ?, binding_state = ?, revision = revision + 1,
             verified_at = CASE WHEN ? = 'bound' THEN ? ELSE verified_at END
         WHERE id = ?`,
      ).run(
        input.flowMediaId,
        input.bindingState,
        input.bindingState,
        new Date().toISOString(),
        id,
      )
    } else {
      db.prepare(
        `INSERT INTO flow_reference_bindings (
          id, project_link_id, reference_version_id, flow_media_id, external_locator,
          binding_state, upload_action_id, evidence_kind, verified_at, invalidated_at, revision
        ) VALUES (?, ?, ?, ?, NULL, ?, NULL, 'observed', ?, NULL, 1)`,
      ).run(
        id,
        input.projectLinkId,
        ref.active_version_id,
        input.flowMediaId,
        input.bindingState,
        input.bindingState === 'bound' ? new Date().toISOString() : null,
      )
    }
    const listed = this.listByAtlasProject(ref.atlas_project_id)
    // Atualiza espelho com flowMediaId / uploadState; attached sempre not_attached no export de restart.
    const updated = listed.map((item) =>
      item.referenceId === input.referenceId
        ? {
            ...item,
            flowMediaId: input.flowMediaId,
            bindingState: input.bindingState,
            uploadState:
              input.bindingState === 'bound' && input.flowMediaId
                ? 'uploaded_bound'
                : item.uploadState,
            attachedState: 'not_attached',
          }
        : item,
    )
    exportMirror(updated, { atlasProjectId: ref.atlas_project_id })
  },
}
