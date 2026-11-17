/**
 * Jobs atlas-flow-v1: prompts, attempts, commands e results em SQLite flow_*.
 * A extensão faz claim HTTP; o renderer só acessa via IPC (sem token).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { normalizeFlowImageSettings } from '../../../shared/flowImageSettings'
import { getDb } from '../../db/database'
import { logger } from '../logging/logger'
import { benchPreviewDataUrl } from '../media/imageThumbnails'
import { localImageThumbUrl, localImageUrl } from '../media/localImageUrl'
import { atlasFlowReferenceStore } from './atlasFlowReferenceStore'
import { buildSceneStrip, sendFlowResultToLipSync, type FlowSceneStrip } from './flowLipSyncScenes'
import { pickLatestExistingCover } from './projectCover'

export type FlowBenchReference = {
  referenceId: string
  versionId: string
  displayName: string
  alias: string
  useAsCharacter: boolean
  uploadState: string
  bindingState: string
  attachedState: string
  flowMediaId: string | null
  byteSize: number
  sha256: string
  absPath: string
  thumbDataUrl: string | null
}

export type FlowBenchResult = {
  resultBindingId: string
  attemptId: string
  outputIndex: number
  flowMediaId: string | null
  originProof: string | null
  automaticCorrelation: boolean
  sha256: string
  byteSize: number
  mimeType: string
  width: number | null
  height: number | null
  absPath: string
  retrievalState: string
  fileExists: boolean
  thumbDataUrl: string | null
  approved: boolean
  lipsyncSent: boolean
  /** true = só prévia remota / sem arquivo local confirmado */
  remotePreviewOnly: boolean
}

export type FlowBenchRecoveryCandidate = {
  candidateKey: string
  flowMediaId: string | null
  srcKey: string | null
  alt: string | null
  width: number | null
  height: number | null
  inBaseline: boolean
  sha256: string | null
  alreadyBoundElsewhere: boolean
  previewDataUrl: string | null
}

export type FlowBenchArchivedLine = {
  promptId: string
  position: number
  archivedAt: string
  promptText: string
  attemptId: string
  attemptCreatedAt: string
  results: FlowBenchResult[]
}

export type FlowBenchOutputSlot = {
  slotKey: string
  outputIndex: number
  state:
    | 'awaiting'
    | 'preparing_refs'
    | 'generating'
    | 'receiving'
    | 'ready'
    | 'failed'
    | 'recover_pending'
  /** Percentual só quando observado no Flow; null = indeterminado. */
  percent: number | null
  resultBindingId: string | null
  attemptId: string
  fileReady: boolean
  thumbDataUrl: string | null
  approved: boolean
  lipsyncSent: boolean
  remotePreviewOnly: boolean
}

export type FlowBenchPromptLine = {
  promptId: string
  position: number
  draftText: string
  selectedReferenceIds: string[]
  activeAttempt: {
    attemptId: string
    state: string
    executionStage: string | null
    submissionCertainty: string
    failureCode: string | null
    failureDetail: string | null
    createdAt: string
    expectedOutputs: number | null
    observedOutputs: number
    retrievedOutputs: number
    progressPercent: number | null
    progressSequence: number
    progressObservedAt: string | null
    completionKind: string | null
    missingCorrelation: string[]
    recoveryCandidates: FlowBenchRecoveryCandidate[]
    outputSlots: FlowBenchOutputSlot[]
  } | null
  /** Cartões de todas as tentativas da linha. Regenerar uma imagem não apaga as outras. */
  gallerySlots: FlowBenchOutputSlot[]
  results: FlowBenchResult[]
}

export type FlowBenchUpdateEvent = {
  kind:
    | 'attempt_progress'
    | 'attempt_stage'
    | 'result_staged'
    | 'attempt_complete'
    | 'result_misattribution_corrected'
  commandId?: string | null
  attemptId: string | null
  atlasProjectId?: string | null
  sequence: number
  observedAt: string
  executionStage?: string | null
  state?: string | null
  progressPercent?: number | null
  generatingCardCount?: number | null
  completedEvidenceCount?: number | null
  resultBindingId?: string | null
  clientSequence?: number | null
  reason?: string | null
  markedIds?: string[]
}

export type FlowBenchSnapshot = {
  atlasProjectId: string
  projectName: string
  link: {
    id: string
    flowProjectId: string | null
    flowProjectUrl: string | null
    linkState: string
    observedTitle: string | null
    lastError: string | null
  } | null
  references: FlowBenchReference[]
  prompts: FlowBenchPromptLine[]
  /** Cortes da música ligada: números 1..N e quais já foram para o LipSync. */
  sceneStrip: FlowSceneStrip
  archivedHistory: FlowBenchArchivedLine[]
  coordinator: {
    running: boolean
    endpoint: string | null
    extensionConnected: boolean
    lastExtensionSeenAt: number | null
    lastInstallationId: string | null
    activeExecutorInstallationId: string | null
    activeExecutorLastSeenAt: string | null
  }
  session: {
    evidenceStatus: string | null
    href: string | null
    observedAt: string | null
    sessionUsable: boolean
    loginRequired: boolean
    accountLabel: string | null
  }
  connection: {
    phase: string
    label: string
    detail: string | null
    accountLabel: string | null
    sessionUsable: boolean
    loginRequired: boolean
    extensionConnected: boolean
    pairingOfferActive: boolean
    hasPairedInstallation: boolean
    extensionPathHint: string
  }
  /** Últimos comandos/eventos da fila (diagnóstico na bancada). */
  recentActivity: Array<{
    at: string
    kind: 'command' | 'event'
    operation?: string | null
    status?: string | null
    eventType?: string | null
    commandId?: string | null
    attemptId?: string | null
    detail?: string | null
  }>
  note: string
}

function nowIso(): string {
  return new Date().toISOString()
}

type BenchUpdateListener = (event: FlowBenchUpdateEvent) => void
const benchUpdateListeners = new Set<BenchUpdateListener>()
/** Último clientSequence de progresso aplicado por tentativa (anti fora-de-ordem). */
const lastProgressClientSeqByAttempt = new Map<string, number>()

function emitBenchUpdate(event: FlowBenchUpdateEvent): void {
  for (const listener of benchUpdateListeners) {
    try {
      listener(event)
    } catch (error) {
      logger.warn('atlas-flow-v1.bench_update.listener_error', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function mapAttemptSlotState(input: {
  attemptState: string
  executionStage: string | null
  hasResult: boolean
  fileReady: boolean
  failureCode: string | null
}): FlowBenchOutputSlot['state'] {
  if (input.hasResult && input.fileReady) return 'ready'
  if (input.hasResult && !input.fileReady) return 'recover_pending'
  if (
    input.failureCode === 'CAPTURE_INCOMPLETE' ||
    input.failureCode === 'CAPTURE_FAILED' ||
    input.attemptState === 'partial'
  ) {
    return 'recover_pending'
  }
  if (input.attemptState === 'failed' || input.attemptState === 'canceled') return 'failed'
  const stage = String(input.executionStage || '')
  if (
    input.attemptState === 'preparing' ||
    stage === 'claimed' ||
    stage.includes('upload') ||
    stage.includes('attach')
  ) {
    return 'preparing_refs'
  }
  if (stage === 'receiving_image' || input.attemptState === 'retrieving' || stage === 'capture_bytes') {
    return 'receiving'
  }
  if (
    input.attemptState === 'generating' ||
    input.attemptState === 'submitting' ||
    stage === 'observe' ||
    stage === 'generating' ||
    stage === 'prompt_generate'
  ) {
    return 'generating'
  }
  if (input.attemptState === 'queued' || stage === 'waiting_executor') return 'awaiting'
  return 'generating'
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function readReferenceMeta(referenceId: string, fallbackName: string): {
  alias: string
  displayName: string
  useAsCharacter: boolean
} {
  const db = getDb()
  const fallbackAlias = aliasOf(fallbackName)
  try {
    const row = db
      .prepare(
        `SELECT alias_normalized, display_name, use_as_character
         FROM flow_references WHERE id = ?`,
      )
      .get(referenceId) as
      | { alias_normalized: string; display_name: string; use_as_character: number | null }
      | undefined
    const alias = row?.alias_normalized || fallbackAlias
    return {
      alias,
      displayName: row?.display_name || fallbackName,
      useAsCharacter: Number(row?.use_as_character) === 1,
    }
  } catch {
    const row = db
      .prepare(`SELECT alias_normalized, display_name FROM flow_references WHERE id = ?`)
      .get(referenceId) as { alias_normalized: string; display_name: string } | undefined
    const alias = row?.alias_normalized || fallbackAlias
    return {
      alias,
      displayName: row?.display_name || fallbackName,
      useAsCharacter: alias.trim().toLowerCase() === 'cantor',
    }
  }
}

function aliasOf(displayName: string): string {
  const compact = displayName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
  return compact || 'ref'
}

/** Colchetes `[alias]` e menções `@alias` de personagem no texto do prompt. */
export function extractBracketAliases(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const raw = String(text || '')
  for (const match of raw.matchAll(/\[([A-Za-zÀ-ÿ0-9_][^\]\n]{0,78})\]/g)) {
    const normalized = aliasOf(String(match[1] || '').replace(/^\[|\]$/g, ''))
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    found.push(normalized)
  }
  for (const match of raw.matchAll(/(?:^|[\s,.;:!?()[\]])@([A-Za-zÀ-ÿ0-9_][A-Za-zÀ-ÿ0-9_-]{0,77})/g)) {
    const normalized = aliasOf(String(match[1] || ''))
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    found.push(normalized)
  }
  return found
}

export type AliasResolveOk = {
  ok: true
  aliases: string[]
  referenceIds: string[]
  resolved: Array<{ alias: string; referenceId: string; versionId: string }>
}

export type AliasResolveErr = {
  ok: false
  error: 'ALIAS_NOT_FOUND' | 'ALIAS_AMBIGUOUS'
  message: string
  aliases: string[]
  missing?: string[]
  ambiguous?: string[]
}

export function resolveBracketAliases(
  text: string,
  refs: Array<{ referenceId: string; versionId: string; alias: string }>,
): AliasResolveOk | AliasResolveErr {
  const aliases = extractBracketAliases(text)
  if (aliases.length < 1) {
    return { ok: true, aliases: [], referenceIds: [], resolved: [] }
  }

  const byAlias = new Map<string, Array<{ referenceId: string; versionId: string; alias: string }>>()
  for (const ref of refs) {
    const key = aliasOf(ref.alias)
    if (!key) continue
    const list = byAlias.get(key) || []
    list.push(ref)
    byAlias.set(key, list)
  }

  const ambiguous: string[] = []
  const resolved: Array<{ alias: string; referenceId: string; versionId: string }> = []
  const seenIds = new Set<string>()

  for (const alias of aliases) {
    const hits = byAlias.get(alias) || []
    // Colchete sem imagem fica no texto do prompt. Não cancela as referências que existem.
    if (hits.length === 0) continue
    if (hits.length > 1) {
      ambiguous.push(alias)
      continue
    }
    const hit = hits[0]!
    if (seenIds.has(hit.referenceId)) continue
    seenIds.add(hit.referenceId)
    resolved.push({
      alias,
      referenceId: hit.referenceId,
      versionId: hit.versionId,
    })
  }

  if (ambiguous.length > 0) {
    return {
      ok: false,
      error: 'ALIAS_AMBIGUOUS',
      message: `Alias(es) ambíguo(s) (mais de uma referência): ${ambiguous
        .map((a) => `[${a}]`)
        .join(', ')}. Renomeie para nomes únicos.`,
      aliases,
      ambiguous,
    }
  }

  return {
    ok: true,
    aliases: resolved.map((item) => item.alias),
    referenceIds: resolved.map((item) => item.referenceId),
    resolved,
  }
}

/** Miniatura local quando o arquivo está liberado; senão um JPEG pequeno em cache. */
function benchPreviewUrl(absPath: string, mimeType: string): string | null {
  return localImageThumbUrl(absPath, 360) || benchPreviewDataUrl(absPath, mimeType)
}

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map((x) => String(x)) : []
  } catch {
    return []
  }
}

export const flowJobService = {
  onBenchUpdate(listener: BenchUpdateListener): () => void {
    benchUpdateListeners.add(listener)
    return () => {
      benchUpdateListeners.delete(listener)
    }
  },

  /**
   * Se o Coordinator já gravou o vínculo no JSON mas o SQLite ficou atrás
   * (ex.: ensure complete sem sync), espelha para a bancada/Gerar.
   */
  ensureSqliteLinkFromDisk(atlasProjectId: string): {
    id: string
    flow_project_id: string | null
    flow_project_url: string | null
    link_state: string
  } | null {
    const id = atlasProjectId.trim()
    if (!id) return null
    const db = getDb()
    const existing = db
      .prepare(
        `SELECT id, flow_project_id, flow_project_url, link_state
         FROM flow_project_links
         WHERE atlas_project_id = ? AND archived_at IS NULL AND link_state = 'linked'
           AND flow_project_id IS NOT NULL
         LIMIT 1`,
      )
      .get(id) as
      | {
          id: string
          flow_project_id: string | null
          flow_project_url: string | null
          link_state: string
        }
      | undefined
    if (existing?.flow_project_id) return existing

    try {
      const linkPath = path.join(process.cwd(), 'docs', 'atlas-flow', 'last-project-link.json')
      if (!fs.existsSync(linkPath)) return null
      const parsed = JSON.parse(fs.readFileSync(linkPath, 'utf8')) as {
        link?: {
          id?: string
          atlasProjectId?: string
          flowProjectId?: string | null
          flowProjectUrl?: string | null
          linkState?: string
          requestedTitle?: string
          observedTitle?: string | null
        }
      }
      const disk = parsed.link
      if (
        !disk?.id ||
        disk.atlasProjectId !== id ||
        disk.linkState !== 'linked' ||
        !disk.flowProjectId
      ) {
        return null
      }
      this.bootstrapFromDiskLink({
        id: disk.id,
        atlasProjectId: id,
        flowProjectId: disk.flowProjectId,
        flowProjectUrl: disk.flowProjectUrl || null,
        linkState: 'linked',
        requestedTitle: disk.requestedTitle,
        observedTitle: disk.observedTitle ?? null,
      })
      return (
        db
          .prepare(
            `SELECT id, flow_project_id, flow_project_url, link_state
             FROM flow_project_links
             WHERE atlas_project_id = ? AND archived_at IS NULL AND link_state = 'linked'
               AND flow_project_id IS NOT NULL
             LIMIT 1`,
          )
          .get(id) as
          | {
              id: string
              flow_project_id: string | null
              flow_project_url: string | null
              link_state: string
            }
          | undefined
      ) || null
    } catch {
      return null
    }
  },

  bootstrapFromDiskLink(link: {
    id: string
    atlasProjectId: string
    flowProjectId: string | null
    flowProjectUrl: string | null
    linkState: string
    requestedTitle?: string
    observedTitle?: string | null
  }): void {
    const db = getDb()
    const existing =
      (db.prepare(`SELECT id FROM flow_project_links WHERE id = ?`).get(link.id) as
        | { id: string }
        | undefined) ||
      (db
        .prepare(
          `SELECT id FROM flow_project_links
           WHERE atlas_project_id = ? AND archived_at IS NULL
           ORDER BY (last_verified_at IS NULL), last_verified_at DESC
           LIMIT 1`,
        )
        .get(link.atlasProjectId) as { id: string } | undefined)
    if (existing) {
      db.prepare(
        `UPDATE flow_project_links
         SET flow_project_id = ?, flow_project_url = ?, link_state = ?,
             observed_title = COALESCE(?, observed_title),
             requested_title = COALESCE(?, requested_title),
             last_verified_at = ?, revision = revision + 1
         WHERE id = ?`,
      ).run(
        link.flowProjectId,
        link.flowProjectUrl,
        link.linkState,
        link.observedTitle ?? null,
        link.requestedTitle ?? null,
        nowIso(),
        existing.id,
      )
      db.persist()
      return
    }
    // principal mínimo para satisfazer NOT NULL
    const principalId = randomUUID()
    const installationId = randomUUID()
    const t = nowIso()
    db.prepare(
      `INSERT OR IGNORE INTO flow_installations (
        id, tenant_id, atlas_user_id, label, extension_id, extension_version,
        protocol_version, adapter_version, token_hash, token_epoch, enabled,
        last_seen_at, created_at, revoked_at, transport_kind
      ) VALUES (?, 'local', 'local', 'bootstrap', NULL, NULL, 1, NULL, NULL, 0, 1, NULL, ?, NULL, 'loopback-http-ws')`,
    ).run(installationId, t)
    db.prepare(
      `INSERT OR IGNORE INTO flow_principals (
        id, owner_id, installation_id, email_observed, display_name,
        identity_source, verification_status, verified_at, last_observed_at, revision
      ) VALUES (?, 'local', ?, NULL, NULL, 'bootstrap', 'observed', NULL, ?, 1)`,
    ).run(principalId, installationId, t)
    db.prepare(
      `INSERT INTO flow_project_links (
        id, atlas_project_id, principal_id, flow_origin, flow_project_id, flow_project_url,
        link_state, requested_title, observed_title, create_action_id, last_verified_at,
        revision, archived_at
      ) VALUES (?, ?, ?, 'https://flow.google.com', ?, ?, ?, ?, ?, NULL, ?, 1, NULL)`,
    ).run(
      link.id,
      link.atlasProjectId,
      principalId,
      link.flowProjectId,
      link.flowProjectUrl,
      link.linkState,
      link.requestedTitle || 'Atlas Flow project',
      link.observedTitle ?? null,
      t,
    )
    db.persist()
  },

  reconcileInterruptedAttempts(): void {
    const db = getDb()
    const t = nowIso()
    // Em voo incerto: não reenviar automaticamente.
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'submission_uncertain',
           execution_stage = 'reconcile_on_boot',
           submission_certainty = CASE
             WHEN submission_certainty = 'not_sent' THEN 'may_have_sent'
             ELSE submission_certainty
           END,
           revision = revision + 1
       WHERE state IN ('submitting', 'generating')`,
    ).run()
    // Comandos leased sem complete → devolver à fila só se never started effect; senão uncertain.
    db.prepare(
      `UPDATE flow_commands
       SET status = 'queued', lease_id = NULL, lease_epoch = NULL, expires_at = NULL
       WHERE status = 'leased'
         AND attempt_id IN (
           SELECT id FROM flow_attempts WHERE state IN ('queued', 'waiting_executor', 'preparing')
         )`,
    ).run()
    db.prepare(
      `UPDATE flow_commands
       SET status = 'failed'
       WHERE status = 'leased'
         AND attempt_id IN (
           SELECT id FROM flow_attempts WHERE state = 'submission_uncertain'
         )`,
    ).run()
    // retrieving pode retomar capture sem re-gerar
    db.prepare(
      `UPDATE flow_attempts
       SET execution_stage = 'awaiting_retrieve_resume', revision = revision + 1
       WHERE state = 'retrieving'`,
    ).run()
    this.recoverExpiredLeases('boot')
    logger.info('atlas-flow-v1.jobs.reconciled_on_boot', { at: t })
  },

  /**
   * Lease expirado com efeito não enviado → devolve à fila.
   * Não reenvia submitting/generating (incerto).
   */
  recoverExpiredLeases(reason = 'claim'): number {
    const db = getDb()
    const t = nowIso()
    const expired = db
      .prepare(
        `SELECT c.id AS command_id, c.attempt_id, c.delivery_count, a.state, a.submission_certainty
         FROM flow_commands c
         LEFT JOIN flow_attempts a ON a.id = c.attempt_id
         WHERE c.status = 'leased'
           AND c.expires_at IS NOT NULL
           AND datetime(c.expires_at) < datetime(?)`,
      )
      .all(t) as Array<{
      command_id: string
      attempt_id: string | null
      delivery_count: number
      state: string | null
      submission_certainty: string | null
    }>

    let recovered = 0
    for (const row of expired) {
      const certainty = row.submission_certainty || 'not_sent'
      const attemptState = row.state || ''
      const canRequeue =
        certainty === 'not_sent' &&
        ['queued', 'waiting_executor', 'preparing', ''].includes(attemptState)
      if (canRequeue) {
        db.prepare(
          `UPDATE flow_commands
           SET status = 'queued', lease_id = NULL, expires_at = NULL, acknowledged_at = NULL
           WHERE id = ? AND status = 'leased'`,
        ).run(row.command_id)
        if (row.attempt_id) {
          db.prepare(
            `UPDATE flow_attempts
             SET state = 'queued',
                 execution_stage = 'waiting_executor',
                 failure_code = NULL,
                 finished_at = NULL,
                 revision = revision + 1
             WHERE id = ?`,
          ).run(row.attempt_id)
        }
        recovered += 1
      } else {
        db.prepare(
          `UPDATE flow_commands SET status = 'failed', acknowledged_at = ? WHERE id = ? AND status = 'leased'`,
        ).run(t, row.command_id)
        if (row.attempt_id) {
          if (attemptState === 'preparing' && certainty === 'not_sent') {
            db.prepare(
              `UPDATE flow_attempts
               SET state = 'failed',
                   failure_code = COALESCE(failure_code, 'LEASE_EXPIRED'),
                   finished_at = ?,
                   revision = revision + 1
               WHERE id = ?`,
            ).run(t, row.attempt_id)
          } else if (
            attemptState === 'submitting' ||
            (attemptState === 'generating' && certainty !== 'accepted')
          ) {
            db.prepare(
              `UPDATE flow_attempts
               SET state = 'submission_uncertain',
                   failure_code = COALESCE(failure_code, 'LEASE_EXPIRED_UNCERTAIN'),
                   finished_at = ?,
                   revision = revision + 1
               WHERE id = ?`,
            ).run(t, row.attempt_id)
          } else if (attemptState === 'generating' || attemptState === 'retrieving') {
            db.prepare(
              `UPDATE flow_attempts
               SET state = 'partial',
                   failure_code = COALESCE(failure_code, 'CAPTURE_INCOMPLETE'),
                   finished_at = ?,
                   revision = revision + 1
               WHERE id = ?`,
            ).run(t, row.attempt_id)
          }
        }
        recovered += 1
      }
    }
    if (recovered > 0) {
      logger.info('atlas-flow-v1.jobs.leases_recovered', { reason, recovered })
      db.persist()
    }
    return recovered
  },

  /** Executor autorizado = instalação real com last_seen mais recente (nunca test-install). */
  getActiveExecutorInstallation(): {
    id: string | null
    lastSeenAt: string | null
    extensionVersion: string | null
  } {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT id, last_seen_at, extension_version FROM flow_installations
         WHERE enabled = 1 AND revoked_at IS NULL
           AND id NOT IN ('test-install', 'pending-installation', 'verify-reconnect-probe')
           AND last_seen_at IS NOT NULL
         ORDER BY datetime(last_seen_at) DESC
         LIMIT 1`,
      )
      .get() as
      | { id: string; last_seen_at: string | null; extension_version: string | null }
      | undefined
    return {
      id: row?.id || null,
      lastSeenAt: row?.last_seen_at || null,
      extensionVersion: row?.extension_version || null,
    }
  },

  getDefaultAtlasProjectId(): string | null {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT atlas_project_id FROM flow_project_links
         WHERE archived_at IS NULL AND link_state = 'linked'
         ORDER BY (last_verified_at IS NULL), last_verified_at DESC, revision DESC
         LIMIT 1`,
      )
      .get() as { atlas_project_id: string } | undefined
    if (row?.atlas_project_id) return row.atlas_project_id
    // fallback JSON mirror
    try {
      const linkPath = path.join(process.cwd(), 'docs', 'atlas-flow', 'last-project-link.json')
      if (!fs.existsSync(linkPath)) return null
      const parsed = JSON.parse(fs.readFileSync(linkPath, 'utf8')) as {
        link?: { atlasProjectId?: string }
      }
      return parsed.link?.atlasProjectId || null
    } catch {
      return null
    }
  },

  enqueueProjectEnsure(
    atlasProjectId: string,
    requestedTitle?: string,
  ): { ok: boolean; error?: string; commandId?: string } {
    const id = atlasProjectId.trim()
    if (!id) return { ok: false, error: 'ATLAS_PROJECT_REQUIRED' }
    const db = getDb()
    const existing = db
      .prepare(
        `SELECT id, flow_project_id, link_state FROM flow_project_links
         WHERE atlas_project_id = ? AND archived_at IS NULL AND link_state = 'linked'
           AND flow_project_id IS NOT NULL
         LIMIT 1`,
      )
      .get(id) as { id: string; flow_project_id: string; link_state: string } | undefined
    if (existing?.flow_project_id) {
      return { ok: true, commandId: undefined }
    }

    const active = this.getActiveExecutorInstallation()
    const installationId = active.id || 'pending-installation'
    const t = nowIso()
    const title = (requestedTitle || '').trim() || `Atlas Flow ${t.slice(0, 16)}`
    const idempotencyKey = `project.ensure:${id}`
    const payload = {
      operation: 'project.ensure',
      atlasProjectId: id,
      requestedTitle: title,
      idempotencyKey,
    }

    // UNIQUE(installation_id, idempotency_key): reusa/refila em vez de INSERT duplicado.
    const prior = db
      .prepare(
        `SELECT id, status, installation_id FROM flow_commands
         WHERE idempotency_key = ?
         ORDER BY
           CASE WHEN installation_id = ? THEN 0 WHEN installation_id = 'pending-installation' THEN 1 ELSE 2 END,
           created_at DESC
         LIMIT 1`,
      )
      .get(idempotencyKey, installationId) as
      | { id: string; status: string; installation_id: string }
      | undefined

    if (prior) {
      if (prior.status === 'queued' || prior.status === 'leased') {
        logger.info('atlas-flow-v1.jobs.project_ensure_reuse_inflight', {
          commandId: prior.id,
          status: prior.status,
          atlasProjectId: id,
        })
        return { ok: true, commandId: prior.id }
      }
      db.prepare(
        `UPDATE flow_commands
         SET status = 'queued',
             installation_id = ?,
             payload_json = ?,
             delivery_count = 0,
             lease_id = NULL,
             lease_epoch = NULL,
             expires_at = NULL,
             acknowledged_at = NULL,
             result_digest = NULL
         WHERE id = ?`,
      ).run(installationId, JSON.stringify(payload), prior.id)
      db.persist()
      logger.info('atlas-flow-v1.jobs.project_ensure_requeued', {
        commandId: prior.id,
        previousStatus: prior.status,
        atlasProjectId: id,
      })
      return { ok: true, commandId: prior.id }
    }

    const commandId = randomUUID()
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, NULL, 'project.ensure', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(commandId, installationId, JSON.stringify(payload), idempotencyKey, t)
    db.persist()
    return { ok: true, commandId }
  },

  enqueueSessionEnsure(): { ok: boolean; error?: string; commandId?: string } {
    const db = getDb()
    const active = this.getActiveExecutorInstallation()
    const activeFresh =
      active.id &&
      active.lastSeenAt &&
      Date.now() - Date.parse(active.lastSeenAt) < 180_000
    const installationId =
      activeFresh && active.id ? active.id : active.id || 'pending-installation'
    if (!installationId) {
      return { ok: false, error: 'NO_EXECUTOR' }
    }
    const commandId = randomUUID()
    const t = nowIso()
    const payload = {
      operation: 'session.ensure',
      openFlowIfNeeded: true,
      openLoginIfNeeded: true,
      flowHomeUrl: 'https://flow.google.com/',
    }
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, NULL, 'session.ensure', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installationId,
      JSON.stringify(payload),
      `session.ensure:${t.slice(0, 16)}`,
      t,
    )
    db.persist()
    return { ok: true, commandId }
  },

  /**
   * Capa de cada projeto: a imagem gerada mais recente que ainda está no disco.
   * Projeto sem imagem gerada não entra na lista.
   */
  listProjectCovers(): Array<{ atlasProjectId: string; coverUrl: string }> {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT p.atlas_project_id AS atlasProjectId,
                rb.atlas_asset_id AS absPath,
                rb.created_at AS createdAt
         FROM flow_result_bindings rb
         JOIN flow_attempts a ON a.id = rb.attempt_id
         JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
         JOIN flow_prompts p ON p.id = r.prompt_id
         WHERE rb.retrieval_state = 'retrieved'
           AND rb.atlas_asset_id IS NOT NULL
           AND rb.atlas_asset_id != ''`,
      )
      .all() as Array<{ atlasProjectId: string; absPath: string; createdAt: string }>

    const chosen = pickLatestExistingCover(rows, (absPath) => {
      try {
        return fs.existsSync(absPath) && fs.statSync(absPath).isFile()
      } catch {
        return false
      }
    })

    const covers: Array<{ atlasProjectId: string; coverUrl: string }> = []
    for (const [atlasProjectId, absPath] of chosen) {
      const coverUrl = localImageThumbUrl(absPath, 1080) || localImageUrl(absPath)
      if (!coverUrl) continue
      covers.push({ atlasProjectId, coverUrl })
    }
    return covers
  },

  getBenchSnapshot(input: {
    atlasProjectId?: string | null
    coordinator: {
      running: boolean
      port: number | null
      extensionConnected: boolean
      lastExtensionSeenAt: number | null
      lastInstallationId: string | null
    }
    sessionObservation?: unknown
    connection?: {
      phase: string
      label: string
      detail: string | null
      accountLabel: string | null
      sessionUsable: boolean
      loginRequired: boolean
      extensionConnected: boolean
      pairingOfferActive: boolean
      hasPairedInstallation: boolean
      extensionPathHint: string
    } | null
  }): FlowBenchSnapshot {
    // Sem fallback para projeto de teste / last-project-link: o Atlas escolhe explicitamente.
    const atlasProjectId = (input.atlasProjectId && input.atlasProjectId.trim()) || ''
    if (!atlasProjectId) {
      return {
        atlasProjectId: '',
        projectName: 'Selecione um projeto',
        link: null,
        references: [],
        prompts: [],
        sceneStrip: {
          cutCount: 0,
          musicProjectId: null,
          musicProjectName: null,
          scenes: [],
        },
        archivedHistory: [],
        coordinator: {
          running: input.coordinator.running,
          endpoint: input.coordinator.port
            ? `http://127.0.0.1:${input.coordinator.port}`
            : null,
          extensionConnected: input.coordinator.extensionConnected,
          lastExtensionSeenAt: input.coordinator.lastExtensionSeenAt,
          lastInstallationId: input.coordinator.lastInstallationId,
          activeExecutorInstallationId: null,
          activeExecutorLastSeenAt: null,
        },
        session: {
          evidenceStatus: null,
          href: null,
          observedAt: null,
          sessionUsable: input.connection?.sessionUsable === true,
          loginRequired: input.connection?.loginRequired === true,
          accountLabel: input.connection?.accountLabel || null,
        },
        connection: input.connection || {
          phase: 'idle',
          label: 'Conectar ao Google Flow',
          detail: null,
          accountLabel: null,
          sessionUsable: false,
          loginRequired: false,
          extensionConnected: input.coordinator.extensionConnected,
          pairingOfferActive: false,
          hasPairedInstallation: Boolean(input.coordinator.lastInstallationId),
          extensionPathHint: 'apps/atlas-flow-extension/dist',
        },
        recentActivity: [],
        note: 'Selecione um projeto Atlas antes de gerar.',
      }
    }
    const db = getDb()
    // Attempts com failure_code mas state ainda “em voo” e sem comando ativo → marcar failed
    // (libera textarea/Regenerar na bancada).
    try {
      const tHeal = nowIso()
      db.prepare(
        `UPDATE flow_attempts
         SET state = 'failed',
             finished_at = COALESCE(finished_at, ?),
             revision = revision + 1
         WHERE failure_code IS NOT NULL
           AND TRIM(failure_code) != ''
           AND state NOT IN ('completed', 'failed', 'canceled', 'partial', 'submission_uncertain')
           AND id NOT IN (
             SELECT attempt_id FROM flow_commands
             WHERE attempt_id IS NOT NULL
               AND status IN ('queued', 'leased', 'running', 'acknowledged')
           )`,
      ).run(tHeal)
    } catch {
      /* ignore heal errors */
    }
    type LinkRow = {
      id: string
      atlas_project_id: string
      flow_project_id: string | null
      flow_project_url: string | null
      link_state: string
      requested_title: string
      observed_title: string | null
    }
    const readLinkRow = (): LinkRow | undefined =>
      db
        .prepare(
          `SELECT id, atlas_project_id, flow_project_id, flow_project_url, link_state,
                  requested_title, observed_title
           FROM flow_project_links
           WHERE atlas_project_id = ? AND archived_at IS NULL
           ORDER BY (last_verified_at IS NULL), last_verified_at DESC
           LIMIT 1`,
        )
        .get(atlasProjectId) as LinkRow | undefined

    let linkRow = readLinkRow()

    const diskLinkMeta = (() => {
      try {
        const linkPath = path.join(process.cwd(), 'docs', 'atlas-flow', 'last-project-link.json')
        if (!fs.existsSync(linkPath)) return null
        const parsed = JSON.parse(fs.readFileSync(linkPath, 'utf8')) as {
          link?: {
            atlasProjectId?: string
            linkState?: string
            lastError?: string | null
            flowProjectId?: string | null
            flowProjectUrl?: string | null
            id?: string
            observedTitle?: string | null
          }
        }
        if (parsed.link?.atlasProjectId !== atlasProjectId) return null
        return parsed.link
      } catch {
        return null
      }
    })()

    // Espelha JSON do Coordinator → SQLite (vínculo ok ou falha).
    if (diskLinkMeta?.id) {
      try {
        if (diskLinkMeta.linkState === 'linked' && diskLinkMeta.flowProjectId) {
          if (!linkRow?.flow_project_id || linkRow.link_state !== 'linked') {
            this.bootstrapFromDiskLink({
              id: diskLinkMeta.id,
              atlasProjectId,
              flowProjectId: diskLinkMeta.flowProjectId,
              flowProjectUrl: diskLinkMeta.flowProjectUrl || null,
              linkState: 'linked',
              observedTitle: diskLinkMeta.observedTitle ?? null,
            })
            linkRow = readLinkRow()
          }
        } else if (
          (diskLinkMeta.linkState === 'failed' || diskLinkMeta.linkState === 'uncertain') &&
          !diskLinkMeta.flowProjectId
        ) {
          if (linkRow) {
            db.prepare(
              `UPDATE flow_project_links
               SET link_state = ?, last_verified_at = ?, revision = revision + 1
               WHERE id = ?`,
            ).run(diskLinkMeta.linkState, nowIso(), linkRow.id)
            linkRow.link_state = diskLinkMeta.linkState
          } else {
            this.bootstrapFromDiskLink({
              id: diskLinkMeta.id,
              atlasProjectId,
              flowProjectId: null,
              flowProjectUrl: null,
              linkState: diskLinkMeta.linkState || 'failed',
              observedTitle: diskLinkMeta.observedTitle ?? null,
            })
            linkRow = readLinkRow()
          }
        }
      } catch {
        /* ignore mirror */
      }
    }

    const refs = atlasFlowReferenceStore.listByAtlasProject(atlasProjectId).map((r) => {
      const meta = readReferenceMeta(r.referenceId, r.displayName)
      return {
        referenceId: r.referenceId,
        versionId: r.versionId,
        displayName: r.displayName,
        alias: meta.alias,
        useAsCharacter: meta.useAsCharacter,
        uploadState: r.uploadState,
        bindingState: r.bindingState,
        attachedState: r.attachedState,
        flowMediaId: r.flowMediaId,
        byteSize: r.byteSize,
        sha256: r.sha256,
        absPath: r.absPath,
        thumbDataUrl: benchPreviewUrl(r.absPath, r.mimeType),
      } satisfies FlowBenchReference
    })

    this.ensureHistoricalAuditRepairs(atlasProjectId)

    const promptRows = db
      .prepare(
        `SELECT id, position, active_revision_id, created_at
         FROM flow_prompts
         WHERE atlas_project_id = ? AND archived_at IS NULL
         ORDER BY position ASC`,
      )
      .all(atlasProjectId) as Array<{
      id: string
      position: number
      active_revision_id: string | null
      created_at: string
    }>

    const prompts: FlowBenchPromptLine[] = promptRows.map((p) => {
      const rev = p.active_revision_id
        ? (db
            .prepare(
              `SELECT id, raw_text, reference_snapshot_json FROM flow_prompt_revisions WHERE id = ?`,
            )
            .get(p.active_revision_id) as
            | { id: string; raw_text: string; reference_snapshot_json: string }
            | undefined)
        : null
      const snapshot = parseJsonArray(rev?.reference_snapshot_json)
      // Preferir tentativa ainda em voo (trava edição); senão a mais recente.
      const attempt = (db
        .prepare(
          `SELECT id, state, execution_stage, submission_certainty, failure_code, created_at,
                  expected_outputs, observed_outputs, retrieved_outputs, completion_kind,
                  settings_snapshot_json
           FROM flow_attempts
           WHERE prompt_revision_id IN (
             SELECT id FROM flow_prompt_revisions WHERE prompt_id = ?
           )
           ORDER BY
             CASE
               WHEN state NOT IN ('completed', 'failed', 'canceled', 'partial', 'submission_uncertain')
                    AND (failure_code IS NULL OR TRIM(failure_code) = '')
               THEN 0 ELSE 1
             END,
             created_at DESC
           LIMIT 1`,
        )
        .get(p.id) as
        | {
            id: string
            state: string
            execution_stage: string | null
            submission_certainty: string
            failure_code: string | null
            created_at: string
            expected_outputs: number
            observed_outputs: number
            retrieved_outputs: number
            completion_kind: string | null
            settings_snapshot_json: string | null
          }
        | undefined)

      let failureDetail: string | null = null
      if (attempt?.failure_code) {
        const failEvt = db
          .prepare(
            `SELECT event_type, payload_json FROM flow_events
             WHERE attempt_id = ?
               AND (
                 event_type IN ('attach_failed', 'failed', 'error')
                 OR payload_json LIKE '%failureCode%'
                 OR payload_json LIKE '%pageError%'
               )
             ORDER BY received_at_server DESC
             LIMIT 1`,
          )
          .get(attempt.id) as { event_type: string; payload_json: string } | undefined
        if (failEvt?.payload_json) {
          try {
            const payload = JSON.parse(failEvt.payload_json) as Record<string, unknown>
            const panelGate =
              payload.panelGate && typeof payload.panelGate === 'object'
                ? (payload.panelGate as Record<string, unknown>)
                : null
            const ingredients =
              panelGate?.ingredients && typeof panelGate.ingredients === 'object'
                ? (panelGate.ingredients as Record<string, unknown>)
                : null
            const step = String(payload.step || panelGate?.step || payload.executionStage || '')
            const pageError = String(
              payload.pageError || payload.failureCode || attempt.failure_code,
            )
            const sought = String(payload.sought || ingredients?.sought || '')
            const nearby = Array.isArray(payload.nearbyCandidateLabels)
              ? payload.nearbyCandidateLabels
              : Array.isArray(ingredients?.nearbyCandidateLabels)
                ? ingredients?.nearbyCandidateLabels
                : null
            const href = String(payload.observationHref || '')
            const nearbyHint =
              Array.isArray(nearby) && nearby.length
                ? ` · visto: ${nearby
                    .slice(0, 2)
                    .map((x) => String(x))
                    .join(' | ')}`
                : ''
            failureDetail = [
              step,
              pageError,
              sought ? `procurou ${sought}` : '',
              href ? `em ${href.replace('https://flow.google.com', '')}` : '',
              nearbyHint,
            ]
              .filter(Boolean)
              .join(' · ')
              .slice(0, 280)
          } catch {
            failureDetail = attempt.failure_code
          }
        } else {
          const cmd = db
            .prepare(
              `SELECT result_digest FROM flow_commands WHERE attempt_id = ? ORDER BY created_at DESC LIMIT 1`,
            )
            .get(attempt.id) as { result_digest: string | null } | undefined
          failureDetail = cmd?.result_digest || attempt.failure_code
        }
      }

      // Auto-materializa candidatos observados (previewDataUrl) que não pertençam ao baseline
      // nem a outra tentativa, evitando que imagens já geradas fiquem presas como "Recuperação pendente".
      if (
        attempt &&
        attempt.settings_snapshot_json &&
        (attempt.state === 'partial' ||
          attempt.failure_code === 'IDENTITY_UNCERTAIN' ||
          attempt.failure_code === 'CAPTURE_INCOMPLETE')
      ) {
        try {
          const snapObj = JSON.parse(attempt.settings_snapshot_json) as Record<string, unknown>
          const rawCands = Array.isArray(snapObj.observedRecoveryCandidates)
            ? (snapObj.observedRecoveryCandidates as Array<Record<string, unknown>>)
            : []
          const eligibleCands = rawCands.filter(
            (c) =>
              c &&
              c.inBaseline !== true &&
              c.alreadyBoundElsewhere !== true &&
              typeof c.previewDataUrl === 'string' &&
              c.previewDataUrl.startsWith('data:image/'),
          )
          const resultsDir = path.join(process.cwd(), 'docs', 'atlas-flow', 'results')
          let stagedAny = false
          for (const cand of eligibleCands) {
            const dataUrl = String(cand.previewDataUrl || '')
            const commaIdx = dataUrl.indexOf(',')
            if (commaIdx < 0) continue
            const header = dataUrl.slice(0, commaIdx)
            const base64 = dataUrl.slice(commaIdx + 1)
            const mimeMatch = header.match(/^data:([^;]+);base64$/i)
            const mimeType = mimeMatch ? mimeMatch[1]! : 'image/jpeg'
            const bytes = Buffer.from(base64, 'base64')
            if (bytes.length < 8_000) continue
            const sha256 = createHash('sha256').update(bytes).digest('hex')
            const ext = mimeType.includes('png')
              ? 'png'
              : mimeType.includes('webp')
                ? 'webp'
                : 'jpg'
            fs.mkdirSync(resultsDir, { recursive: true })
            const absPath = path.join(resultsDir, `${randomUUID()}.${ext}`)
            const pre = this.precheckResultStage({
              attemptId: attempt.id,
              sha256,
              flowMediaId: cand.flowMediaId ? String(cand.flowMediaId) : null,
            })
            if (!pre.ok) continue
            if (!pre.idempotent || !pre.existingAbsPath || !fs.existsSync(pre.existingAbsPath)) {
              fs.writeFileSync(absPath, bytes)
            }
            const st = this.stageResultForAttempt({
              attemptId: attempt.id,
              absPath:
                pre.idempotent && pre.existingAbsPath && fs.existsSync(pre.existingAbsPath)
                  ? pre.existingAbsPath
                  : absPath,
              mimeType,
              byteSize: bytes.length,
              sha256,
              width: typeof cand.width === 'number' ? cand.width : null,
              height: typeof cand.height === 'number' ? cand.height : null,
              flowMediaId: cand.flowMediaId ? String(cand.flowMediaId) : null,
              srcKey: cand.srcKey ? String(cand.srcKey) : null,
              originProof: 'tracked_progress_slot',
              automaticCorrelation: true,
            })
            if (st.ok) stagedAny = true
          }
          const boundNow = (
            db
              .prepare(
                `SELECT COUNT(*) AS c FROM flow_result_bindings
                 WHERE attempt_id = ? AND retrieval_state = 'retrieved'`,
              )
              .get(attempt.id) as { c: number }
          ).c
          if (boundNow > 0 && (stagedAny || attempt.state === 'partial' || attempt.failure_code)) {
            db.prepare(
              `UPDATE flow_attempts
               SET state = 'completed',
                   failure_code = NULL,
                   retrieved_outputs = ?,
                   completion_kind = COALESCE(completion_kind, 'automatic_correlation'),
                   revision = revision + 1
               WHERE id = ?`,
            ).run(boundNow, attempt.id)
            attempt.state = 'completed'
            attempt.failure_code = null
            attempt.retrieved_outputs = boundNow
            failureDetail = null
            db.persist()
          }
        } catch {
          /* ignore */
        }
      }

      // Todas as imagens da linha (todas as tentativas) — regenerar preserva anteriores.
      const resultRows = db
        .prepare(
          `SELECT rb.id, rb.attempt_id, rb.flow_media_id, rb.output_index, rb.retrieval_state,
                  rb.source_locator_encrypted, rb.atlas_asset_id,
                  rb.mime_type, rb.byte_size, rb.sha256, rb.width, rb.height, rb.created_at,
                  rb.approved_at, rb.lipsync_sent_at
           FROM flow_result_bindings rb
           JOIN flow_attempts a ON a.id = rb.attempt_id
           JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
           WHERE r.prompt_id = ?
             AND rb.retrieval_state IN ('retrieved', 'pending', 'preview', 'misattributed')
           ORDER BY a.created_at ASC, rb.output_index ASC`,
        )
        .all(p.id) as Array<Record<string, unknown>>

      const mapResultRow = (row: Record<string, unknown>, index: number): FlowBenchResult => {
        const absPath = String(row.atlas_asset_id || '')
        const fileExists = Boolean(absPath && fs.existsSync(absPath))
        const mimeType = String(row.mime_type || 'image/png')
        const retrievalState = String(row.retrieval_state || '')
        const byteSize = Number(row.byte_size) || 0
        const width = row.width == null ? null : Number(row.width)
        const looksLikeFlowTilePreview =
          byteSize > 0 &&
          byteSize < 40_000 &&
          width != null &&
          width > 0 &&
          width < 700
        const misattributed = retrievalState === 'misattributed'
        const remotePreviewOnly =
          misattributed ||
          retrievalState !== 'retrieved' ||
          !fileExists ||
          looksLikeFlowTilePreview
        let originProof: string | null = null
        let automaticCorrelation = false
        if (typeof row.source_locator_encrypted === 'string' && row.source_locator_encrypted.startsWith('{')) {
          try {
            const parsed = JSON.parse(row.source_locator_encrypted) as Record<string, unknown>
            if (typeof parsed.originProof === 'string') originProof = parsed.originProof
            if (typeof parsed.automaticCorrelation === 'boolean') {
              automaticCorrelation = parsed.automaticCorrelation
            }
          } catch {
            /* ignore */
          }
        }
        return {
          resultBindingId: String(row.id),
          attemptId: String(row.attempt_id),
          outputIndex: Number(row.output_index ?? index),
          flowMediaId: row.flow_media_id ? String(row.flow_media_id) : null,
          originProof,
          automaticCorrelation,
          sha256: String(row.sha256 || ''),
          byteSize,
          mimeType,
          width,
          height: row.height == null ? null : Number(row.height),
          absPath,
          retrievalState,
          fileExists: fileExists && !misattributed,
          thumbDataUrl:
            fileExists && retrievalState === 'retrieved' && !misattributed
              ? benchPreviewUrl(absPath, mimeType)
              : null,
          approved: Boolean(row.approved_at),
          lipsyncSent: Boolean(row.lipsync_sent_at),
          remotePreviewOnly,
        }
      }

      const results: FlowBenchResult[] = resultRows.map(mapResultRow)

      let progressPercent: number | null = null
      let progressSequence = 0
      let progressObservedAt: string | null = null
      let slotPercents: number[] | null = null
      let generatingCardCount: number | null = null
      if (attempt) {
        const progressEvt = db
          .prepare(
            `SELECT sequence, payload_json, created_at FROM flow_events
             WHERE attempt_id = ?
               AND event_type IN ('generation_progress', 'generating', 'retrieving')
             ORDER BY sequence DESC
             LIMIT 1`,
          )
          .get(attempt.id) as
          | { sequence: number; payload_json: string; created_at: string }
          | undefined
        if (progressEvt?.payload_json) {
          try {
            const payload = JSON.parse(progressEvt.payload_json) as Record<string, unknown>
            const clientSeq =
              typeof payload.clientSequence === 'number' ? payload.clientSequence : 0
            progressSequence = Math.max(progressEvt.sequence || 0, clientSeq)
            progressObservedAt =
              typeof payload.observedAt === 'string' ? payload.observedAt : progressEvt.created_at
            if (
              typeof payload.attemptPercent === 'number' &&
              Number.isFinite(payload.attemptPercent)
            ) {
              progressPercent = payload.attemptPercent
            }
            if (Array.isArray(payload.slotPercents)) {
              slotPercents = payload.slotPercents
                .map((x) => Number(x))
                .filter((x) => Number.isFinite(x) && x >= 0 && x <= 100)
            }
            if (
              typeof payload.generatingCardCount === 'number' &&
              Number.isFinite(payload.generatingCardCount)
            ) {
              generatingCardCount = payload.generatingCardCount
            }
          } catch {
            /* ignore */
          }
        }
      }

      // Tentativa atual: só resultados retrieved legítimos (nunca misattributed).
      const attemptResults = attempt
        ? results.filter(
            (r) => r.attemptId === attempt.id && r.retrievalState === 'retrieved',
          )
        : []
      const expectedOutputs =
        attempt && Number(attempt.expected_outputs) > 0
          ? Number(attempt.expected_outputs)
          : null
      const isAttemptTerminal =
        attempt != null &&
        ['completed', 'failed', 'canceled', 'partial', 'submission_uncertain'].includes(
          attempt.state,
        )
      const observedSlotCount =
        isAttemptTerminal && attemptResults.length > 0
          ? attemptResults.length
          : Math.max(
              expectedOutputs || 0,
              generatingCardCount || 0,
              attemptResults.length,
              slotPercents?.length || 0,
              // Sem confirmação: um card de acompanhamento da tentativa.
              attempt &&
                !['completed', 'failed', 'canceled'].includes(attempt.state) &&
                attemptResults.length === 0
                ? 1
                : 0,
            )
      const hiddenRows = db
        .prepare(
          `SELECT h.attempt_id, h.output_index
           FROM flow_hidden_outputs h
           JOIN flow_attempts a ON a.id = h.attempt_id
           JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
           WHERE r.prompt_id = ?`,
        )
        .all(p.id) as Array<{ attempt_id: string; output_index: number }>
      const hiddenSlots = new Set(
        hiddenRows.map((row) => `${row.attempt_id}:${row.output_index}`),
      )

      let missingCorrelation: string[] = []
      let recoveryCandidates: FlowBenchRecoveryCandidate[] = []
      if (attempt?.settings_snapshot_json) {
        try {
          const snapObj = JSON.parse(attempt.settings_snapshot_json) as Record<string, unknown>
          if (Array.isArray(snapObj.missingCorrelation)) {
            missingCorrelation = snapObj.missingCorrelation
              .map((x) => String(x || '').trim())
              .filter(Boolean)
          }
          if (Array.isArray(snapObj.observedRecoveryCandidates)) {
            recoveryCandidates = (
              snapObj.observedRecoveryCandidates as Array<Record<string, unknown>>
            ).map((c) => ({
              candidateKey: String(c.candidateKey || ''),
              flowMediaId: c.flowMediaId ? String(c.flowMediaId) : null,
              srcKey: c.srcKey ? String(c.srcKey) : null,
              alt: c.alt ? String(c.alt) : null,
              width: typeof c.width === 'number' ? c.width : null,
              height: typeof c.height === 'number' ? c.height : null,
              inBaseline: c.inBaseline === true,
              sha256: c.sha256 ? String(c.sha256) : null,
              alreadyBoundElsewhere: c.alreadyBoundElsewhere === true,
              previewDataUrl:
                typeof c.previewDataUrl === 'string' ? c.previewDataUrl : null,
            }))
          }
        } catch {
          /* ignore */
        }
      }

      const fallbackPreviewCandidates = recoveryCandidates.filter(
        (c) => Boolean(c.previewDataUrl) && !c.alreadyBoundElsewhere && !c.inBaseline,
      )
      const outputSlots: FlowBenchOutputSlot[] = []
      if (attempt && observedSlotCount > 0) {
        for (let i = 0; i < observedSlotCount; i += 1) {
          if (hiddenSlots.has(`${attempt.id}:${i}`)) continue
          const bound =
            attemptResults.find((r) => r.outputIndex === i) || attemptResults[i] || null
          const fallbackPreview = !bound ? fallbackPreviewCandidates[i] || null : null
          const fileReady = Boolean(
            (bound?.fileExists && !bound.remotePreviewOnly) || fallbackPreview?.previewDataUrl,
          )
          const slotPercent =
            Array.isArray(slotPercents) && typeof slotPercents[i] === 'number'
              ? slotPercents[i]!
              : null
          outputSlots.push({
            slotKey: bound?.resultBindingId || `${attempt.id}:slot:${i}`,
            outputIndex: i,
            state: mapAttemptSlotState({
              attemptState: attempt.state,
              executionStage: attempt.execution_stage,
              hasResult: Boolean(bound || fallbackPreview),
              fileReady,
              failureCode: attempt.failure_code,
            }),
            percent: fileReady ? 100 : slotPercent,
            resultBindingId: bound?.resultBindingId || null,
            attemptId: attempt.id,
            fileReady,
            thumbDataUrl: bound?.thumbDataUrl || fallbackPreview?.previewDataUrl || null,
            approved: Boolean(bound?.approved),
            lipsyncSent: Boolean(bound?.lipsyncSent),
            remotePreviewOnly: Boolean(bound?.remotePreviewOnly),
          })
        }
      }

      const olderAttempts = db
        .prepare(
          `SELECT id, state, execution_stage, failure_code, expected_outputs
           FROM flow_attempts
           WHERE prompt_revision_id IN (
             SELECT id FROM flow_prompt_revisions WHERE prompt_id = ?
           )
             AND id != ?
           ORDER BY created_at ASC`,
        )
        .all(p.id, attempt?.id || '') as Array<{
        id: string
        state: string
        execution_stage: string | null
        failure_code: string | null
        expected_outputs: number
      }>
      const olderSlots: FlowBenchOutputSlot[] = []
      for (const older of olderAttempts) {
        const olderResults = results.filter(
          (r) => r.attemptId === older.id && r.retrievalState === 'retrieved',
        )
        const count = olderResults.length
        for (let i = 0; i < count; i += 1) {
          if (hiddenSlots.has(`${older.id}:${i}`)) continue
          const bound =
            olderResults.find((r) => r.outputIndex === i) || olderResults[i] || null
          const fileReady = Boolean(bound?.fileExists && !bound.remotePreviewOnly)
          olderSlots.push({
            slotKey: bound?.resultBindingId || `${older.id}:slot:${i}`,
            outputIndex: i,
            state: mapAttemptSlotState({
              attemptState: older.state,
              executionStage: older.execution_stage,
              hasResult: Boolean(bound),
              fileReady,
              failureCode: older.failure_code,
            }),
            percent: fileReady ? 100 : null,
            resultBindingId: bound?.resultBindingId || null,
            attemptId: older.id,
            fileReady,
            thumbDataUrl: bound?.thumbDataUrl || null,
            approved: Boolean(bound?.approved),
            lipsyncSent: Boolean(bound?.lipsyncSent),
            remotePreviewOnly: Boolean(bound?.remotePreviewOnly),
          })
        }
      }
      const gallerySlots = [...olderSlots, ...outputSlots]

      const draftText = rev?.raw_text || ''
      const aliasResolution = resolveBracketAliases(
        draftText,
        refs.map((r) => ({
          referenceId: r.referenceId,
          versionId: r.versionId,
          alias: r.alias,
        })),
      )
      const selectedReferenceIds =
        aliasResolution.ok && aliasResolution.referenceIds.length > 0
          ? aliasResolution.referenceIds
          : snapshot

      return {
        promptId: p.id,
        position: p.position,
        draftText,
        selectedReferenceIds,
        activeAttempt: attempt
          ? {
              attemptId: attempt.id,
              state: attempt.state,
              executionStage: attempt.execution_stage,
              submissionCertainty: attempt.submission_certainty,
              failureCode: attempt.failure_code,
              failureDetail,
              createdAt: attempt.created_at,
              expectedOutputs,
              observedOutputs: Number(attempt.observed_outputs) || 0,
              retrievedOutputs: Number(attempt.retrieved_outputs) || attemptResults.length,
              progressPercent,
              progressSequence,
              progressObservedAt,
              completionKind: attempt.completion_kind || null,
              missingCorrelation,
              recoveryCandidates,
              outputSlots,
            }
          : null,
        gallerySlots,
        results,
      }
    })

    // Histórico preservado de linhas arquivadas que possuem resultados legítimos retrieved
    const archivedRows = db
      .prepare(
        `SELECT p.id AS prompt_id, p.position, p.archived_at,
                r.raw_text, a.id AS attempt_id, a.created_at AS attempt_created_at
         FROM flow_prompts p
         JOIN flow_prompt_revisions r ON r.prompt_id = p.id
         JOIN flow_attempts a ON a.prompt_revision_id = r.id
         WHERE p.atlas_project_id = ?
           AND p.archived_at IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM flow_result_bindings rb
             WHERE rb.attempt_id = a.id AND rb.retrieval_state = 'retrieved'
           )
         ORDER BY p.position DESC, a.created_at DESC`,
      )
      .all(atlasProjectId) as Array<{
      prompt_id: string
      position: number
      archived_at: string
      raw_text: string
      attempt_id: string
      attempt_created_at: string
    }>

    const archivedHistory: FlowBenchArchivedLine[] = []
    for (const arch of archivedRows) {
      const archBindings = db
        .prepare(
          `SELECT rb.id, rb.attempt_id, rb.flow_media_id, rb.output_index, rb.retrieval_state,
                  rb.source_locator_encrypted, rb.atlas_asset_id, rb.mime_type, rb.byte_size,
                  rb.sha256, rb.width, rb.height, rb.created_at, rb.approved_at, rb.lipsync_sent_at
           FROM flow_result_bindings rb
           WHERE rb.attempt_id = ? AND rb.retrieval_state = 'retrieved'
           ORDER BY rb.output_index ASC`,
        )
        .all(arch.attempt_id) as Array<Record<string, unknown>>
      const mappedArchResults: FlowBenchResult[] = archBindings
        .map((row, idx) => {
          const absPath = String(row.atlas_asset_id || '')
          const fileExists = Boolean(absPath && fs.existsSync(absPath))
          const mimeType = String(row.mime_type || 'image/png')
          const byteSize = Number(row.byte_size) || 0
          const width = row.width == null ? null : Number(row.width)
          const height = row.height == null ? null : Number(row.height)
          let originProof: string | null = null
          let automaticCorrelation = false
          if (
            typeof row.source_locator_encrypted === 'string' &&
            row.source_locator_encrypted.startsWith('{')
          ) {
            try {
              const parsed = JSON.parse(row.source_locator_encrypted) as Record<string, unknown>
              if (typeof parsed.originProof === 'string') originProof = parsed.originProof
              if (typeof parsed.automaticCorrelation === 'boolean') {
                automaticCorrelation = parsed.automaticCorrelation
              }
            } catch {
              /* ignore */
            }
          }
          return {
            resultBindingId: String(row.id),
            attemptId: String(row.attempt_id),
            outputIndex: Number(row.output_index ?? idx),
            flowMediaId: row.flow_media_id ? String(row.flow_media_id) : null,
            originProof,
            automaticCorrelation,
            sha256: String(row.sha256 || ''),
            byteSize,
            mimeType,
            width,
            height,
            absPath,
            retrievalState: String(row.retrieval_state || 'retrieved'),
            fileExists,
            thumbDataUrl: fileExists ? benchPreviewUrl(absPath, mimeType) : null,
            approved: Boolean(row.approved_at),
            lipsyncSent: Boolean(row.lipsync_sent_at),
            remotePreviewOnly: !fileExists,
          }
        })
        .filter((r) => r.fileExists)
      if (mappedArchResults.length > 0) {
        archivedHistory.push({
          promptId: arch.prompt_id,
          position: arch.position,
          archivedAt: arch.archived_at,
          promptText: arch.raw_text,
          attemptId: arch.attempt_id,
          attemptCreatedAt: arch.attempt_created_at,
          results: mappedArchResults,
        })
      }
    }

    const obs = input.sessionObservation as
      | { observation?: { page?: { observation?: Record<string, unknown> }; subtype?: string } }
      | { page?: { observation?: Record<string, unknown> } }
      | null
      | undefined
    const pageObs =
      (obs as { observation?: { page?: { observation?: Record<string, unknown> } } })?.observation
        ?.page?.observation ||
      (obs as { page?: { observation?: Record<string, unknown> } })?.page?.observation ||
      null

    const atlasProjectName = (() => {
      try {
        const row = db
          .prepare(`SELECT name FROM projects WHERE id = ? LIMIT 1`)
          .get(atlasProjectId) as { name: string } | undefined
        return row?.name?.trim() || null
      } catch {
        return null
      }
    })()

    const recentCommands = db
      .prepare(
        `SELECT id, operation, status, attempt_id, result_digest, created_at, acknowledged_at
         FROM flow_commands
         ORDER BY created_at DESC
         LIMIT 12`,
      )
      .all() as Array<{
      id: string
      operation: string
      status: string
      attempt_id: string | null
      result_digest: string | null
      created_at: string
      acknowledged_at: string | null
    }>
    const recentEvents = db
      .prepare(
        `SELECT command_id, attempt_id, event_type, payload_json, created_at
         FROM flow_events
         ORDER BY created_at DESC
         LIMIT 16`,
      )
      .all() as Array<{
      command_id: string | null
      attempt_id: string | null
      event_type: string
      payload_json: string | null
      created_at: string
    }>
    const recentActivity: FlowBenchSnapshot['recentActivity'] = [
      ...recentCommands.map((row) => ({
        at: row.acknowledged_at || row.created_at,
        kind: 'command' as const,
        operation: row.operation,
        status: row.status,
        commandId: row.id,
        attemptId: row.attempt_id,
        detail: row.result_digest,
      })),
      ...recentEvents.map((row) => {
        let detail: string | null = null
        try {
          const payload = JSON.parse(row.payload_json || '{}') as Record<string, unknown>
          detail = String(
            payload.failureCode ||
              payload.error ||
              payload.executionStage ||
              payload.state ||
              '',
          ).trim() || null
        } catch {
          detail = null
        }
        return {
          at: row.created_at,
          kind: 'event' as const,
          eventType: row.event_type,
          commandId: row.command_id,
          attemptId: row.attempt_id,
          detail,
        }
      }),
    ]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 20)

    return {
      atlasProjectId,
      projectName:
        atlasProjectName ||
        linkRow?.observed_title ||
        linkRow?.requested_title ||
        'Projeto Atlas',
      link: linkRow
        ? {
            id: linkRow.id,
            flowProjectId: linkRow.flow_project_id,
            flowProjectUrl: linkRow.flow_project_url,
            linkState: linkRow.link_state,
            observedTitle: linkRow.observed_title,
            lastError:
              diskLinkMeta?.atlasProjectId === atlasProjectId
                ? diskLinkMeta.lastError || null
                : null,
          }
        : diskLinkMeta
          ? {
              id: diskLinkMeta.id || 'disk-link',
              flowProjectId: diskLinkMeta.flowProjectId || null,
              flowProjectUrl: diskLinkMeta.flowProjectUrl || null,
              linkState: diskLinkMeta.linkState || 'failed',
              observedTitle: diskLinkMeta.observedTitle || null,
              lastError: diskLinkMeta.lastError || null,
            }
          : null,
      references: refs,
      prompts,
      sceneStrip: buildSceneStrip(atlasProjectId),
      archivedHistory,
      coordinator: (() => {
        const activeExecutor = this.getActiveExecutorInstallation()
        return {
          running: input.coordinator.running,
          endpoint: input.coordinator.port
            ? `http://127.0.0.1:${input.coordinator.port}`
            : null,
          extensionConnected: input.coordinator.extensionConnected,
          lastExtensionSeenAt: input.coordinator.lastExtensionSeenAt,
          lastInstallationId: input.coordinator.lastInstallationId,
          activeExecutorInstallationId: activeExecutor.id,
          activeExecutorLastSeenAt: activeExecutor.lastSeenAt,
        }
      })(),
      session: {
        evidenceStatus: pageObs ? String(pageObs.evidenceStatus || 'page_observable') : null,
        href: pageObs ? String(pageObs.href || '') || null : null,
        observedAt: pageObs ? String(pageObs.observedAt || '') || null : null,
        sessionUsable: input.connection?.sessionUsable === true,
        loginRequired: input.connection?.loginRequired === true,
        accountLabel: input.connection?.accountLabel || null,
      },
      connection: input.connection || {
        phase: 'idle',
        label: 'Conectar ao Google Flow',
        detail: null,
        accountLabel: null,
        sessionUsable: false,
        loginRequired: false,
        extensionConnected: input.coordinator.extensionConnected,
        pairingOfferActive: false,
        hasPairedInstallation: Boolean(input.coordinator.lastInstallationId),
        extensionPathHint: 'apps/atlas-flow-extension/dist',
      },
      recentActivity,
      note: 'Pronto para gerar exige extensão pareada + sessão Flow utilizável + projeto vinculado + refs bound — não só hello.',
    }
  },

  createPromptLine(
    atlasProjectId: string,
    text: string,
    selectedReferenceIds: string[],
    position?: number,
  ): string {
    const db = getDb()
    const requested = Math.floor(Number(position))
    const maxPos = (
      db
        .prepare(
          `SELECT COALESCE(MAX(position), 0) AS m FROM flow_prompts WHERE atlas_project_id = ?`,
        )
        .get(atlasProjectId) as { m: number }
    ).m
    const promptId = randomUUID()
    const revisionId = randomUUID()
    const t = nowIso()
    const raw = text.trim()
    const linePosition = Number.isInteger(requested) && requested > 0 ? requested : maxPos + 1
    db.prepare(
      `INSERT INTO flow_prompts (
        id, atlas_project_id, position, active_revision_id, selected_asset_id,
        approved_asset_id, archived_at, revision, created_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, 1, ?)`,
    ).run(promptId, atlasProjectId, linePosition, revisionId, t)
    db.prepare(
      `INSERT INTO flow_prompt_revisions (
        id, prompt_id, revision_number, raw_text, compiled_text, raw_text_sha256,
        reference_snapshot_json, generation_settings_json, created_at, created_by
      ) VALUES (?, ?, 1, ?, ?, ?, ?, '{}', ?, 'atlas-ui')`,
    ).run(
      revisionId,
      promptId,
      raw,
      raw,
      sha256Text(raw),
      JSON.stringify(selectedReferenceIds),
      t,
    )
    return promptId
  },

  updatePromptDraft(
    promptId: string,
    text: string,
    selectedReferenceIds: string[],
  ): { ok: boolean; error?: string } {
    const db = getDb()
    const prompt = db
      .prepare(
        `SELECT id, active_revision_id FROM flow_prompts WHERE id = ? AND archived_at IS NULL`,
      )
      .get(promptId) as { id: string; active_revision_id: string | null } | undefined
    if (!prompt) return { ok: false, error: 'PROMPT_NOT_FOUND' }

    // Tentativa em voo já aponta para prompt_revision_id congelado.
    // Nova revisão ativa só afeta gerações futuras — o usuário pode editar
    // e disparar outras linhas enquanto o lote corre.

    const prev = prompt.active_revision_id
      ? (db
          .prepare(`SELECT revision_number FROM flow_prompt_revisions WHERE id = ?`)
          .get(prompt.active_revision_id) as { revision_number: number } | undefined)
      : null
    const revisionId = randomUUID()
    const raw = text
    const t = nowIso()
    db.prepare(
      `INSERT INTO flow_prompt_revisions (
        id, prompt_id, revision_number, raw_text, compiled_text, raw_text_sha256,
        reference_snapshot_json, generation_settings_json, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, 'atlas-ui')`,
    ).run(
      revisionId,
      promptId,
      (prev?.revision_number || 0) + 1,
      raw,
      raw,
      sha256Text(raw),
      JSON.stringify(selectedReferenceIds),
      t,
    )
    db.prepare(
      `UPDATE flow_prompts SET active_revision_id = ?, revision = revision + 1 WHERE id = ?`,
    ).run(revisionId, promptId)
    db.persist()
    return { ok: true }
  },

  importPromptBlocks(
    atlasProjectId: string,
    blocks: string[],
    selectedReferenceIds: string[],
  ): string[] {
    const ids: string[] = []
    for (const block of blocks) {
      const text = block.trim()
      if (!text) continue
      ids.push(this.createPromptLine(atlasProjectId, text, selectedReferenceIds))
    }
    return ids
  },

  /**
   * Documento de direção (bloco FLOW) ou lista numerada.
   * A posição da linha é o número do prompt: 1, 2, 3, 4.
   * Linha vazia sem tentativa é arquivada. Número já existente é atualizado.
   */
  importNumberedPrompts(
    atlasProjectId: string,
    items: Array<{ number: number; text: string }>,
    selectedReferenceIds: string[],
  ): { promptIds: string[]; created: number; updated: number } {
    const db = getDb()
    const t = nowIso()
    const empties = db
      .prepare(
        `SELECT p.id
         FROM flow_prompts p
         LEFT JOIN flow_prompt_revisions r ON r.id = p.active_revision_id
         WHERE p.atlas_project_id = ?
           AND p.archived_at IS NULL
           AND trim(COALESCE(r.raw_text, '')) = ''
           AND NOT EXISTS (
             SELECT 1 FROM flow_attempts a
             JOIN flow_prompt_revisions pr ON pr.id = a.prompt_revision_id
             WHERE pr.prompt_id = p.id
           )`,
      )
      .all(atlasProjectId) as Array<{ id: string }>
    for (const row of empties) {
      db.prepare(`UPDATE flow_prompts SET archived_at = ?, revision = revision + 1 WHERE id = ?`).run(
        t,
        row.id,
      )
    }

    const fallbackIds = selectedReferenceIds.map((id) => String(id || '').trim()).filter(Boolean)
    const refsWithAlias = atlasFlowReferenceStore.listByAtlasProject(atlasProjectId).map((r) => {
      const meta = readReferenceMeta(r.referenceId, r.displayName)
      return {
        referenceId: r.referenceId,
        versionId: r.versionId,
        alias: meta.alias,
      }
    })

    const promptIds: string[] = []
    let created = 0
    let updated = 0
    for (const item of items) {
      const number = Math.floor(Number(item?.number))
      const text = String(item?.text || '').trim()
      if (!Number.isInteger(number) || number < 1 || !text) continue
      // Os [] do próprio prompt mandam. Sem colchete resolvido, usa o fallback só se veio explícito.
      const aliasResolution = resolveBracketAliases(text, refsWithAlias)
      const lineRefs =
        aliasResolution.ok && aliasResolution.referenceIds.length > 0
          ? aliasResolution.referenceIds
          : fallbackIds
      const existing = db
        .prepare(
          `SELECT id FROM flow_prompts
           WHERE atlas_project_id = ? AND archived_at IS NULL AND position = ?
           ORDER BY created_at ASC
           LIMIT 1`,
        )
        .get(atlasProjectId, number) as { id: string } | undefined
      if (existing) {
        const saved = this.updatePromptDraft(existing.id, text, lineRefs)
        if (!saved.ok) continue
        promptIds.push(existing.id)
        updated += 1
        continue
      }
      promptIds.push(this.createPromptLine(atlasProjectId, text, lineRefs, number))
      created += 1
    }
    db.persist()
    return { promptIds, created, updated }
  },

  updateReferenceAlias(referenceId: string, alias: string): { ok: boolean; error?: string } {
    const db = getDb()
    const normalized = aliasOf(alias.replace(/^\[|\]$/g, ''))
    if (!normalized) return { ok: false, error: 'ALIAS_INVALID' }
    const row = db
      .prepare(`SELECT id, atlas_project_id, display_name FROM flow_references WHERE id = ?`)
      .get(referenceId) as
      | { id: string; atlas_project_id: string; display_name: string }
      | undefined
    if (!row) return { ok: false, error: 'REFERENCE_NOT_FOUND' }
    const clash = db
      .prepare(
        `SELECT id FROM flow_references
         WHERE atlas_project_id = ?
           AND archived_at IS NULL
           AND id != ?
           AND lower(alias_normalized) = ?
         LIMIT 1`,
      )
      .get(row.atlas_project_id, referenceId, normalized) as { id: string } | undefined
    if (clash) return { ok: false, error: 'ALIAS_AMBIGUOUS' }
    db.prepare(
      `UPDATE flow_references SET alias_normalized = ?, updated_at = ?, revision = revision + 1 WHERE id = ?`,
    ).run(normalized, nowIso(), referenceId)
    db.persist()
    return { ok: true }
  },

  findLinkedProject(atlasProjectId?: string): {
    id: string
    atlasProjectId: string
    idempotencyKey: string
    commandId: string
    requestedTitle: string
    flowProjectId: string | null
    flowProjectUrl: string | null
    observedTitle: string | null
    linkState: 'linked'
    submissionCertainty: string
    createdAt: string
    updatedAt: string
  } | null {
    const db = getDb()
    const row = (
      atlasProjectId
        ? db
            .prepare(
              `SELECT id, atlas_project_id, flow_project_id, flow_project_url, requested_title,
                      observed_title, create_action_id, last_verified_at
               FROM flow_project_links
               WHERE atlas_project_id = ?
                 AND archived_at IS NULL
                 AND link_state = 'linked'
                 AND flow_project_id IS NOT NULL
               ORDER BY last_verified_at DESC
               LIMIT 1`,
            )
            .get(atlasProjectId)
        : db
            .prepare(
              `SELECT id, atlas_project_id, flow_project_id, flow_project_url, requested_title,
                      observed_title, create_action_id, last_verified_at
               FROM flow_project_links
               WHERE archived_at IS NULL
                 AND link_state = 'linked'
                 AND flow_project_id IS NOT NULL
               ORDER BY last_verified_at DESC
               LIMIT 1`,
            )
            .get()
    ) as
      | {
          id: string
          atlas_project_id: string
          flow_project_id: string | null
          flow_project_url: string | null
          requested_title: string | null
          observed_title: string | null
          create_action_id: string | null
          last_verified_at: string | null
        }
      | undefined
    if (!row?.flow_project_id) return null
    const at = row.last_verified_at || nowIso()
    return {
      id: row.id,
      atlasProjectId: row.atlas_project_id,
      idempotencyKey: `project.ensure:${row.atlas_project_id}`,
      commandId: row.create_action_id || '',
      requestedTitle: row.requested_title || '',
      flowProjectId: row.flow_project_id,
      flowProjectUrl: row.flow_project_url,
      observedTitle: row.observed_title,
      linkState: 'linked',
      submissionCertainty: 'accepted',
      createdAt: at,
      updatedAt: at,
    }
  },

  updateReferenceRole(
    referenceId: string,
    useAsCharacter: boolean,
  ): { ok: boolean; error?: string } {
    const db = getDb()
    const row = db
      .prepare(`SELECT id FROM flow_references WHERE id = ? AND archived_at IS NULL`)
      .get(referenceId) as { id: string } | undefined
    if (!row) return { ok: false, error: 'REFERENCE_NOT_FOUND' }
    try {
      db.prepare(
        `UPDATE flow_references
         SET use_as_character = ?, updated_at = ?, revision = revision + 1
         WHERE id = ?`,
      ).run(useAsCharacter ? 1 : 0, nowIso(), referenceId)
    } catch {
      return { ok: false, error: 'ROLE_COLUMN_MISSING' }
    }
    db.persist()
    return { ok: true }
  },

  archivePromptLine(promptId: string): { ok: boolean; error?: string } {
    const db = getDb()
    const prompt = db
      .prepare(
        `SELECT id FROM flow_prompts WHERE id = ? AND archived_at IS NULL`,
      )
      .get(promptId) as { id: string } | undefined
    if (!prompt) return { ok: false, error: 'PROMPT_NOT_FOUND' }

    const inflight = db
      .prepare(
        `SELECT a.id FROM flow_attempts a
         JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
         WHERE r.prompt_id = ?
           AND a.state NOT IN ('completed', 'failed', 'canceled', 'partial', 'submission_uncertain')
           AND (a.failure_code IS NULL OR a.failure_code = '')
         LIMIT 1`,
      )
      .get(promptId) as { id: string } | undefined
    if (inflight) return { ok: false, error: 'PROMPT_LOCKED_BY_ATTEMPT' }

    db.prepare(
      `UPDATE flow_prompts SET archived_at = ?, revision = revision + 1 WHERE id = ?`,
    ).run(nowIso(), promptId)
    db.persist()
    return { ok: true }
  },

  archiveReference(referenceId: string): { ok: boolean; error?: string } {
    return atlasFlowReferenceStore.archiveReference(referenceId)
  },

  enqueueGenerate(promptId: string, rawImageSettings?: unknown): {
    ok: boolean
    error?: string
    message?: string
    attemptId?: string
    commandId?: string
    selectedReferenceIds?: string[]
  } {
    const db = getDb()
    const prompt = db
      .prepare(
        `SELECT id, atlas_project_id, active_revision_id FROM flow_prompts WHERE id = ? AND archived_at IS NULL`,
      )
      .get(promptId) as
      | { id: string; atlas_project_id: string; active_revision_id: string | null }
      | undefined
    if (!prompt?.active_revision_id) return { ok: false, error: 'PROMPT_NOT_FOUND' }

    const rev = db
      .prepare(
        `SELECT id, raw_text, reference_snapshot_json FROM flow_prompt_revisions WHERE id = ?`,
      )
      .get(prompt.active_revision_id) as
      | { id: string; raw_text: string; reference_snapshot_json: string }
      | undefined
    if (!rev || !rev.raw_text.trim()) return { ok: false, error: 'PROMPT_EMPTY' }

    let link = db
      .prepare(
        `SELECT id, flow_project_id, flow_project_url, link_state
         FROM flow_project_links
         WHERE atlas_project_id = ? AND archived_at IS NULL AND link_state = 'linked'
         LIMIT 1`,
      )
      .get(prompt.atlas_project_id) as
      | {
          id: string
          flow_project_id: string | null
          flow_project_url: string | null
          link_state: string
        }
      | undefined
    if (!link?.flow_project_id) {
      link = this.ensureSqliteLinkFromDisk(prompt.atlas_project_id) || undefined
    }
    if (!link?.flow_project_id) return { ok: false, error: 'PROJECT_NOT_LINKED' }

    const snapshotIds = parseJsonArray(rev.reference_snapshot_json)
    const refs = atlasFlowReferenceStore.listByAtlasProject(prompt.atlas_project_id)
    const refsWithAlias = refs.map((r) => {
      const meta = readReferenceMeta(r.referenceId, r.displayName)
      return {
        ...r,
        alias: meta.alias,
        useAsCharacter: meta.useAsCharacter,
      }
    })

    const aliasResolution = resolveBracketAliases(rev.raw_text, refsWithAlias)
    if (!aliasResolution.ok) {
      return {
        ok: false,
        error: aliasResolution.error,
        message: aliasResolution.message,
      }
    }

    // `[alias]` no texto é a seleção efetiva; senão usa o snapshot da linha.
    const selectedIds =
      aliasResolution.aliases.length > 0 ? aliasResolution.referenceIds : snapshotIds
    const selected = refsWithAlias.filter((r) => selectedIds.includes(r.referenceId))
    if (selected.length < 1) return { ok: false, error: 'REFERENCES_REQUIRED' }

    // Congela o snapshot resolvido na revisão ativa (UI mostra a seleção efetiva).
    if (
      aliasResolution.aliases.length > 0 &&
      JSON.stringify(snapshotIds) !== JSON.stringify(selectedIds)
    ) {
      db.prepare(
        `UPDATE flow_prompt_revisions SET reference_snapshot_json = ? WHERE id = ?`,
      ).run(JSON.stringify(selectedIds), rev.id)
    }

    const bound = selected.filter(
      (r) =>
        (r.uploadState === 'uploaded_bound' && r.flowMediaId) ||
        r.uploadState === 'character_ready',
    )
    const needUpload = selected.filter(
      (r) =>
        r.uploadState !== 'character_ready' &&
        (r.uploadState === 'staged_local' ||
          r.uploadState === 'upload_uncertain' ||
          (!r.flowMediaId && !r.useAsCharacter)),
    )
    // Geração pode partir de staged: a extensão envia/anexa automaticamente.
    if (bound.length < 1 && needUpload.length < 1) {
      return { ok: false, error: 'REFERENCES_NOT_READY' }
    }

    // Bloqueia clique duplicado enquanto há tentativa ativa nesta linha.
    const inflight = db
      .prepare(
        `SELECT a.id FROM flow_attempts a
         JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
         WHERE r.prompt_id = ?
           AND a.state NOT IN ('completed', 'failed', 'canceled', 'partial', 'submission_uncertain')
         LIMIT 1`,
      )
      .get(promptId) as { id: string } | undefined
    if (inflight) {
      return { ok: false, error: 'ATTEMPT_ALREADY_ACTIVE', attemptId: inflight.id }
    }

    // Preferir executor ativo recente; senão pending para qualquer instalação autorizada reivindicar.
    const active = this.getActiveExecutorInstallation()
    const activeFresh =
      active.id &&
      active.lastSeenAt &&
      Date.now() - Date.parse(active.lastSeenAt) < 120_000
    const installationId = activeFresh && active.id ? active.id : 'pending-installation'

    const attemptId = randomUUID()
    const commandId = randomUUID()
    const t = nowIso()
    const knownStems = selected.map((r) => r.alias).filter(Boolean)
    const excludeShas = this.listKnownResultShasForAtlasProject(String(prompt.atlas_project_id))
    const excludeMediaIds = this.listKnownResultMediaIdsForAtlasProject(
      String(prompt.atlas_project_id),
    )

    const imageSettings = normalizeFlowImageSettings(rawImageSettings)
    const payload = {
      operation: 'generation.run',
      commandId,
      attemptId,
      atlasProjectId: prompt.atlas_project_id,
      flowProjectId: link.flow_project_id,
      flowProjectUrl: link.flow_project_url,
      promptId: prompt.id,
      promptRevisionId: rev.id,
      promptText: rev.raw_text,
      projectLinkId: link.id,
      skipUpload: needUpload.length === 0,
      requireAttached: true,
      expectedOutputs: imageSettings.outputs,
      imageSettings,
      knownStems,
      /** SHAs e mediaIds já no projeto — capture não pode reatribuí-los a esta tentativa. */
      excludeShas,
      excludeMediaIds,
      selectedReferenceIds: selected.map((r) => r.referenceId),
      aliasResolution: aliasResolution.resolved,
      references: selected.map((r) => ({
        referenceId: r.referenceId,
        versionId: r.versionId,
        displayName: r.displayName,
        alias: r.alias,
        useAsCharacter: r.useAsCharacter === true,
        mimeType: r.mimeType,
        flowMediaId: r.flowMediaId,
        uploadState: r.uploadState,
        bindingState: r.bindingState,
        sha256: r.sha256,
        byteSize: r.byteSize,
        // Bytes só via GET autenticado /references/:id/bytes — sem caminho Windows na extensão.
      })),
    }

    db.prepare(
      `INSERT INTO flow_attempts (
        id, prompt_revision_id, project_link_id, batch_id, trigger_kind, parent_attempt_id,
        state, execution_stage, submission_certainty, expected_outputs, observed_outputs,
        retrieved_outputs, settings_snapshot_json, failure_code, cancel_requested_at,
        cancel_requested_by, completion_kind, partial_accepted_at, partial_accepted_by,
        accepted_output_count, created_at, submitted_at, finished_at, revision
      ) VALUES (?, ?, ?, NULL, 'generate', NULL, 'queued', 'waiting_executor', 'not_sent',
                ?, 0, 0, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, 1)`,
    ).run(attemptId, rev.id, link.id, imageSettings.outputs, JSON.stringify(payload), t)

    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, ?, 'generation.run', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installationId,
      attemptId,
      JSON.stringify(payload),
      `generation.run:${attemptId}`,
      t,
    )
    db.persist()

    emitBenchUpdate({
      kind: 'attempt_stage',
      commandId,
      attemptId,
      atlasProjectId: prompt.atlas_project_id,
      sequence: Date.now(),
      observedAt: t,
      executionStage: 'waiting_executor',
      state: 'queued',
    })

    return {
      ok: true,
      attemptId,
      commandId,
      selectedReferenceIds: selected.map((r) => r.referenceId),
    }
  },

  enqueueUploadStaged(
    atlasProjectId: string,
    referenceIds?: string[],
  ): { ok: boolean; error?: string; commandId?: string; referenceIds?: string[] } {
    const db = getDb()
    const refs = atlasFlowReferenceStore.listByAtlasProject(atlasProjectId)
    const wanted = (referenceIds || []).map((id) => id.trim()).filter(Boolean)
    const staged = refs.filter((r) => {
      const mediaId = String(r.flowMediaId || '').trim()
      const onFlow =
        mediaId.length > 8 &&
        mediaId !== '_gd' &&
        !mediaId.startsWith('_') &&
        !mediaId.startsWith('local:') &&
        (r.uploadState === 'uploaded_bound' || r.uploadState === 'character_ready')
      return !onFlow && Boolean(r.absPath) && (!wanted.length || wanted.includes(r.referenceId))
    })
    if (staged.length < 1) {
      return { ok: false, error: 'NO_STAGED_REFERENCES' }
    }
    // Não substitui fixtures bound — só envia staged_local.
    const active = this.getActiveExecutorInstallation()
    const installationId = active.id || 'pending-installation'
    const commandId = randomUUID()
    const t = nowIso()
    const linked = this.findLinkedProject(atlasProjectId)
    const payload = {
      operation: 'references.upload',
      atlasProjectId,
      flowProjectId: linked?.flowProjectId || null,
      flowProjectUrl: linked?.flowProjectUrl || null,
      skipUpload: false,
      runGenerate: false,
      referenceIds: staged.map((r) => r.referenceId),
      references: staged.map((r) => ({
        referenceId: r.referenceId,
        versionId: r.versionId,
        displayName: r.displayName,
        mimeType: r.mimeType,
        uploadState: r.uploadState,
        sha256: r.sha256,
        byteSize: r.byteSize,
      })),
    }
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, NULL, 'references.upload', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installationId,
      JSON.stringify(payload),
      `references.upload:${staged
        .map((r) => r.referenceId)
        .sort()
        .join(',')}:${t.slice(0, 16)}`,
      t,
    )
    db.persist()
    logger.info('atlas-flow-v1.jobs.upload_staged_enqueued', {
      commandId,
      atlasProjectId,
      installationId,
      referenceIds: staged.map((r) => r.referenceId),
      count: staged.length,
    })
    return {
      ok: true,
      commandId,
      referenceIds: staged.map((r) => r.referenceId),
    }
  },

  /**
   * Pede à extensão limpar chips e texto do composer no Flow.
   * Usado ao cancelar lote — o rascunho anexado não deve ficar na página.
   */
  enqueueClearComposer(): { ok: boolean; error?: string; commandId?: string } {
    const db = getDb()
    const active = this.getActiveExecutorInstallation()
    const installationId = active.id || 'pending-installation'
    const commandId = randomUUID()
    const t = nowIso()
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, NULL, 'composer.clear', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installationId,
      JSON.stringify({ reason: 'user_cancel_batch' }),
      `composer.clear:${t.slice(0, 16)}`,
      t,
    )
    db.persist()
    logger.info('atlas-flow-v1.jobs.composer_clear_enqueued', { commandId, installationId })
    return { ok: true, commandId }
  },

  cancelAttempt(attemptId: string): { ok: boolean; error?: string; canceledCommands?: number } {
    const id = attemptId.trim()
    if (!id) return { ok: false, error: 'ATTEMPT_REQUIRED' }
    const db = getDb()
    const attempt = db
      .prepare(`SELECT id, state FROM flow_attempts WHERE id = ?`)
      .get(id) as { id: string; state: string } | undefined
    if (!attempt) return { ok: false, error: 'ATTEMPT_NOT_FOUND' }
    if (['completed', 'failed', 'canceled', 'partial'].includes(attempt.state)) {
      return { ok: true, canceledCommands: 0 }
    }
    const t = nowIso()
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'canceled',
           execution_stage = 'canceled_by_user',
           failure_code = 'CANCELED_BY_USER',
           cancel_requested_at = ?,
           cancel_requested_by = 'user',
           finished_at = ?,
           revision = revision + 1
       WHERE id = ?`,
    ).run(t, t, id)
    const openCmds = db
      .prepare(
        `SELECT id FROM flow_commands
         WHERE attempt_id = ? AND status IN ('queued', 'leased')`,
      )
      .all(id) as Array<{ id: string }>
    for (const cmd of openCmds) {
      db.prepare(
        `UPDATE flow_commands
         SET status = 'failed',
             result_digest = ?,
             acknowledged_at = ?
         WHERE id = ?`,
      ).run(JSON.stringify({ canceled: true, reason: 'CANCELED_BY_USER' }), t, cmd.id)
    }
    db.persist()
    logger.info('atlas-flow-v1.jobs.attempt_canceled', {
      attemptId: id,
      canceledCommands: openCmds.length,
    })
    return { ok: true, canceledCommands: openCmds.length }
  },

  enqueueRecover(attemptId: string): { ok: boolean; error?: string; commandId?: string } {
    const db = getDb()
    const attempt = db
      .prepare(
        `SELECT id, state, settings_snapshot_json, project_link_id FROM flow_attempts WHERE id = ?`,
      )
      .get(attemptId) as
      | {
          id: string
          state: string
          settings_snapshot_json: string
          project_link_id: string
        }
      | undefined
    if (!attempt) return { ok: false, error: 'ATTEMPT_NOT_FOUND' }
    if (!['completed', 'partial', 'retrieving', 'generating', 'submission_uncertain'].includes(attempt.state)) {
      return { ok: false, error: 'ATTEMPT_NOT_RECOVERABLE' }
    }
    const installation = db
      .prepare(
        `SELECT id FROM flow_installations
         WHERE enabled = 1 AND revoked_at IS NULL
           AND id NOT IN ('test-install', 'pending-installation')
         ORDER BY (last_seen_at IS NULL), last_seen_at DESC LIMIT 1`,
      )
      .get() as { id: string } | undefined
    const commandId = randomUUID()
    const t = nowIso()
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(attempt.settings_snapshot_json || '{}') as Record<string, unknown>
    } catch {
      payload = {}
    }
    payload.recoverOnly = true
    payload.attemptId = attemptId
    // Guarda o texto para evidência bilingue no sensor novo; fingerprint vazio evita
    // PROMPT_EVIDENCE_NOT_ON_PAGE quando o Flow só mostra labels EN (ex.: "gospel ship").
    // A identidade fica em captureCorrelation (allowlist) + excludeShas + rejeição de SHA cruzado.
    if (typeof payload.promptText === 'string' && payload.promptText) {
      payload.promptTextForEvidence = payload.promptText
    }
    payload.promptText = ''
    const atlasProjectId = (
      db
        .prepare(`SELECT atlas_project_id FROM flow_project_links WHERE id = ?`)
        .get(attempt.project_link_id) as { atlas_project_id?: string } | undefined
    )?.atlas_project_id
    if (atlasProjectId) {
      payload.excludeShas = this.listKnownResultShasForAtlasProject(String(atlasProjectId))
      payload.excludeMediaIds = this.listKnownResultMediaIdsForAtlasProject(
        String(atlasProjectId),
      )
    }
    const corr =
      payload.captureCorrelation && typeof payload.captureCorrelation === 'object'
        ? (payload.captureCorrelation as Record<string, unknown>)
        : null
    if (corr) {
      if (Array.isArray(corr.excludeSrcs)) payload.excludeSrcs = corr.excludeSrcs
      if (Array.isArray(corr.excludeMediaIds)) {
        payload.excludeMediaIds = [
          ...new Set([
            ...((payload.excludeMediaIds as string[] | undefined) || []),
            ...corr.excludeMediaIds.map((x) => String(x)),
          ]),
        ]
      }
      if (Array.isArray(corr.acceptedSrcs)) {
        const rawSrcs = corr.acceptedSrcs.map((x) => String(x || '').trim()).filter(Boolean)
        payload.acceptedSrcs =
          rawSrcs.length > 6
            ? rawSrcs.filter((u) => !/googleusercontent\.com\/asb\//i.test(u))
            : rawSrcs
      }
      if (Array.isArray(corr.acceptedMediaIds)) payload.acceptedMediaIds = corr.acceptedMediaIds
      const directMediaIds = [
        ...(Array.isArray(corr.acceptedMediaIds) ? corr.acceptedMediaIds : []),
        ...(Array.isArray(corr.slotLineageMediaIds) ? corr.slotLineageMediaIds : []),
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
      const directSrcs = [
        ...(Array.isArray(payload.acceptedSrcs) ? (payload.acceptedSrcs as string[]) : []),
        ...(Array.isArray(corr.slotLineageSrcs) ? corr.slotLineageSrcs : []),
      ]
        .map((x) => String(x || '').trim())
        .filter((u) => Boolean(u) && /flow-content\.google/i.test(u))
      if (directMediaIds.length > 0 || directSrcs.length > 0) {
        payload.explicitSelectionKeys = [
          ...new Set([
            ...directMediaIds.flatMap((id) => [`media:${id}`, id]),
            ...directSrcs.flatMap((s) => [`src:${s}`, s]),
          ]),
        ]
      }
    }
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'retrieving', execution_stage = 'recover_requested', revision = revision + 1
       WHERE id = ?`,
    ).run(attemptId)
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, ?, 'result.retrieve', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installation?.id || 'pending-installation',
      attemptId,
      JSON.stringify(payload),
      `result.retrieve:${attemptId}:${t}`,
      t,
    )
    db.persist()
    emitBenchUpdate({
      kind: 'attempt_stage',
      commandId,
      attemptId,
      sequence: Date.now(),
      observedAt: t,
      executionStage: 'recover_requested',
      state: 'retrieving',
    })
    return { ok: true, commandId }
  },

  /**
   * Solicita à extensão a listagem de tiles candidatos observados na página do Flow
   * para seleção explícita do usuário (quando a correlação automática não puder ser reconstruída),
   * SEM disparar nova geração e SEM vincular imagens automaticamente.
   */
  enqueueListRecoveryCandidates(attemptId: string): {
    ok: boolean
    error?: string
    commandId?: string
  } {
    const db = getDb()
    const attempt = db
      .prepare(
        `SELECT id, state, settings_snapshot_json, project_link_id FROM flow_attempts WHERE id = ?`,
      )
      .get(attemptId) as
      | {
          id: string
          state: string
          settings_snapshot_json: string
          project_link_id: string
        }
      | undefined
    if (!attempt) return { ok: false, error: 'ATTEMPT_NOT_FOUND' }
    const installation = db
      .prepare(
        `SELECT id FROM flow_installations
         WHERE enabled = 1 AND revoked_at IS NULL
           AND id NOT IN ('test-install', 'pending-installation')
         ORDER BY (last_seen_at IS NULL), last_seen_at DESC LIMIT 1`,
      )
      .get() as { id: string } | undefined
    const commandId = randomUUID()
    const t = nowIso()
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(attempt.settings_snapshot_json || '{}') as Record<string, unknown>
    } catch {
      payload = {}
    }
    payload.attemptId = attemptId
    payload.preserveAttemptState = attempt.state
    const atlasProjectId = (
      db
        .prepare(`SELECT atlas_project_id FROM flow_project_links WHERE id = ?`)
        .get(attempt.project_link_id) as { atlas_project_id?: string } | undefined
    )?.atlas_project_id
    if (atlasProjectId) {
      payload.excludeShas = this.listKnownResultShasForAtlasProject(String(atlasProjectId))
      payload.excludeMediaIds = this.listKnownResultMediaIdsForAtlasProject(
        String(atlasProjectId),
      )
    }
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, ?, 'result.list_candidates', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installation?.id || 'pending-installation',
      attemptId,
      JSON.stringify(payload),
      `result.list_candidates:${attemptId}:${t}`,
      t,
    )
    db.persist()
    emitBenchUpdate({
      kind: 'attempt_stage',
      commandId,
      attemptId,
      sequence: Date.now(),
      observedAt: t,
      executionStage: 'listing_candidates',
      state: attempt.state,
    })
    return { ok: true, commandId }
  },

  /**
   * Recupera resultados escolhidos EXPLICITAMENTE pelo usuário a partir dos candidatos observados,
   * gravando de forma auditada `completion_kind = 'explicit_user_selection'` (sem afirmar correlação automática).
   */
  enqueueRecoverExplicitSelection(input: {
    attemptId: string
    candidateKeys: string[]
    allowKnownSha?: boolean
  }): { ok: boolean; error?: string; commandId?: string } {
    const db = getDb()
    const keys = (input.candidateKeys || []).map((k) => String(k || '').trim()).filter(Boolean)
    if (keys.length === 0) {
      return { ok: false, error: 'EXPLICIT_SELECTION_EMPTY' }
    }
    const attempt = db
      .prepare(
        `SELECT id, state, settings_snapshot_json, project_link_id FROM flow_attempts WHERE id = ?`,
      )
      .get(input.attemptId) as
      | {
          id: string
          state: string
          settings_snapshot_json: string
          project_link_id: string
        }
      | undefined
    if (!attempt) return { ok: false, error: 'ATTEMPT_NOT_FOUND' }
    const installation = db
      .prepare(
        `SELECT id FROM flow_installations
         WHERE enabled = 1 AND revoked_at IS NULL
           AND id NOT IN ('test-install', 'pending-installation')
         ORDER BY (last_seen_at IS NULL), last_seen_at DESC LIMIT 1`,
      )
      .get() as { id: string } | undefined
    const commandId = randomUUID()
    const t = nowIso()
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(attempt.settings_snapshot_json || '{}') as Record<string, unknown>
    } catch {
      payload = {}
    }
    payload.recoverOnly = true
    payload.attemptId = input.attemptId
    payload.explicitSelectionKeys = keys
    payload.allowKnownSha = input.allowKnownSha === true
    payload.expectedOutputs = keys.length
    payload.promptText = ''
    const atlasProjectId = (
      db
        .prepare(`SELECT atlas_project_id FROM flow_project_links WHERE id = ?`)
        .get(attempt.project_link_id) as { atlas_project_id?: string } | undefined
    )?.atlas_project_id
    if (atlasProjectId && !input.allowKnownSha) {
      payload.excludeShas = this.listKnownResultShasForAtlasProject(String(atlasProjectId))
    }
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'retrieving',
           execution_stage = 'explicit_selection_requested',
           completion_kind = 'explicit_user_selection',
           revision = revision + 1
       WHERE id = ?`,
    ).run(input.attemptId)
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, ?, 'result.retrieve', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installation?.id || 'pending-installation',
      input.attemptId,
      JSON.stringify(payload),
      `result.retrieve.explicit:${input.attemptId}:${t}`,
      t,
    )
    db.persist()
    emitBenchUpdate({
      kind: 'attempt_stage',
      commandId,
      attemptId: input.attemptId,
      sequence: Date.now(),
      observedAt: t,
      executionStage: 'explicit_selection_requested',
      state: 'retrieving',
    })
    return { ok: true, commandId }
  },

  claimCommand(installationId: string): Record<string, unknown> | null {
    this.recoverExpiredLeases('claim')
    return this.takeQueuedCommand(installationId)
  },

  /**
   * Espera um comando novo em vez de responder vazio na hora.
   * O intervalo interno é curto; o HTTP segura a conexão até waitMs.
   */
  waitForQueuedCommand(
    installationId: string,
    waitMs: number,
    isCancelled?: () => boolean,
  ): Promise<Record<string, unknown> | null> {
    this.recoverExpiredLeases('claim')
    const immediate = this.takeQueuedCommand(installationId)
    const bounded = Math.max(0, Math.min(12_000, Math.floor(waitMs) || 0))
    if (immediate || bounded <= 0) return Promise.resolve(immediate)
    return new Promise((resolve) => {
      let settled = false
      const finish = (command: Record<string, unknown> | null) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        clearInterval(poll)
        resolve(command)
      }
      const poll = setInterval(() => {
        if (isCancelled?.()) {
          finish(null)
          return
        }
        const command = this.takeQueuedCommand(installationId, false)
        if (command) finish(command)
      }, 200)
      const timeout = setTimeout(() => {
        if (isCancelled?.()) {
          finish(null)
          return
        }
        finish(this.takeQueuedCommand(installationId, false))
      }, bounded)
      poll.unref?.()
      timeout.unref?.()
    })
  },

  takeQueuedCommand(installationId: string, touchSeen = true): Record<string, unknown> | null {
    const db = getDb()
    const t = nowIso()
    if (touchSeen) {
      db.prepare(
        `UPDATE flow_installations SET last_seen_at = ? WHERE id = ?`,
      ).run(t, installationId)
    }

    // Token único autoriza o executor ativo a reivindicar a fila inteira.
    // Comandos presos em installationId antigo (ex.: 962f…) não ficam órfãos quando o popup usa 2aba….
    const row = db
      .prepare(
        `SELECT id, attempt_id, operation, payload_json, idempotency_key, delivery_count, installation_id
         FROM flow_commands
         WHERE status = 'queued'
           AND installation_id NOT IN ('test-install')
         ORDER BY
           CASE WHEN operation IN ('composer.clear', 'project.delete', 'result.download', 'result.delete') THEN 0 ELSE 1 END,
           CASE
             WHEN installation_id = ? THEN 0
             WHEN installation_id = 'pending-installation' THEN 1
             ELSE 2
           END,
           created_at ASC
         LIMIT 1`,
      )
      .get(installationId) as
      | {
          id: string
          attempt_id: string | null
          operation: string
          payload_json: string
          idempotency_key: string
          delivery_count: number
          installation_id: string
        }
      | undefined
    if (!row) return null

    if (row.attempt_id && this.attemptCanceled(row.attempt_id)) {
      db.prepare(
        `UPDATE flow_commands
         SET status = 'failed',
             result_digest = ?,
             acknowledged_at = ?
         WHERE id = ? AND status = 'queued'`,
      ).run(JSON.stringify({ canceled: true, reason: 'CANCELED_BY_USER' }), t, row.id)
      db.persist()
      return null
    }

    const leaseId = randomUUID()
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
    db.prepare(
      `UPDATE flow_commands
       SET status = 'leased',
           installation_id = ?,
           lease_id = ?,
           lease_epoch = COALESCE(lease_epoch, 0) + 1,
           expires_at = ?,
           delivery_count = delivery_count + 1,
           acknowledged_at = ?
       WHERE id = ? AND status = 'queued'`,
    ).run(installationId, leaseId, expiresAt, t, row.id)

    if (row.attempt_id) {
      db.prepare(
        `UPDATE flow_attempts
         SET state = CASE
               WHEN state IN ('queued', 'waiting_executor') THEN 'preparing'
               ELSE state
             END,
             execution_stage = 'claimed',
             revision = revision + 1
         WHERE id = ?`,
      ).run(row.attempt_id)
    }

    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(row.payload_json) as Record<string, unknown>
    } catch {
      payload = {}
    }

    return {
      protocolVersion: 1,
      commandId: row.id,
      operation: row.operation,
      installationId,
      attemptId: row.attempt_id,
      leaseId,
      expiresAt,
      idempotencyKey: row.idempotency_key,
      payload,
    }
  },

  attemptCanceled(attemptId: string | null | undefined): boolean {
    if (!attemptId) return false
    const row = getDb()
      .prepare(`SELECT state, failure_code FROM flow_attempts WHERE id = ?`)
      .get(attemptId) as { state: string; failure_code: string | null } | undefined
    return row?.state === 'canceled' || row?.failure_code === 'CANCELED_BY_USER'
  },

  appendCommandEvent(input: {
    commandId: string
    installationId: string
    eventType: string
    payload?: Record<string, unknown>
    attemptId?: string | null
  }): { canceled: boolean } {
    if (input.eventType === 'cancel_poll') {
      return { canceled: this.attemptCanceled(input.attemptId) }
    }
    const db = getDb()
    const t = nowIso()
    const seq =
      (
        db
          .prepare(
            `SELECT COALESCE(MAX(sequence), 0) AS m FROM flow_events WHERE aggregate_id = ?`,
          )
          .get(input.commandId) as { m: number }
      ).m + 1
    const payload = input.payload || {}
    const clientSequence =
      typeof payload.clientSequence === 'number' && Number.isFinite(payload.clientSequence)
        ? payload.clientSequence
        : null
    db.prepare(
      `INSERT INTO flow_events (
        id, aggregate_type, aggregate_id, aggregate_revision, installation_id, command_id,
        attempt_id, event_type, payload_json, occurred_at_client, received_at_server,
        sequence, created_at
      ) VALUES (?, 'command', ?, 0, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    ).run(
      randomUUID(),
      input.commandId,
      input.installationId,
      input.commandId,
      input.attemptId || null,
      input.eventType,
      JSON.stringify(payload),
      t,
      seq,
      t,
    )

    const stage = String(payload.executionStage || input.eventType)
    let applyToAttempt = true
    if (input.eventType === 'generation_progress' && input.attemptId) {
      const prev = lastProgressClientSeqByAttempt.get(input.attemptId) || 0
      if (clientSequence == null) {
        if (prev > 0) applyToAttempt = false
      } else if (clientSequence < prev) {
        applyToAttempt = false
      } else {
        lastProgressClientSeqByAttempt.set(input.attemptId, clientSequence)
      }
    }

    const alreadyCanceled = this.attemptCanceled(input.attemptId)
    if (input.attemptId && applyToAttempt && !alreadyCanceled) {
      const statePatch = String(payload.state || '')
      // capture_correlation não deve sobrescrever state da attempt com string vazia/evento.
      if (input.eventType !== 'capture_correlation' && statePatch) {
        db.prepare(
          `UPDATE flow_attempts
           SET state = ?, execution_stage = ?, revision = revision + 1 WHERE id = ?`,
        ).run(statePatch, stage, input.attemptId)
      } else if (input.eventType !== 'capture_correlation') {
        db.prepare(
          `UPDATE flow_attempts SET execution_stage = ?, revision = revision + 1 WHERE id = ?`,
        ).run(stage, input.attemptId)
      }
      if (typeof payload.submissionCertainty === 'string') {
        db.prepare(`UPDATE flow_attempts SET submission_certainty = ? WHERE id = ?`).run(
          payload.submissionCertainty,
          input.attemptId,
        )
      }
      if (
        typeof payload.generatingCardCount === 'number' &&
        Number.isFinite(payload.generatingCardCount) &&
        payload.generatingCardCount > 0
      ) {
        db.prepare(
          `UPDATE flow_attempts
           SET observed_outputs = CASE
             WHEN observed_outputs > ? THEN observed_outputs ELSE ?
           END
           WHERE id = ?`,
        ).run(
          Math.floor(payload.generatingCardCount),
          Math.floor(payload.generatingCardCount),
          input.attemptId,
        )
      }
      // Persiste correlação no snapshot da attempt (sobrevive a restart do worker/extensão).
      if (
        input.eventType === 'capture_correlation' &&
        payload.captureCorrelation &&
        typeof payload.captureCorrelation === 'object'
      ) {
        const row = db
          .prepare(`SELECT settings_snapshot_json FROM flow_attempts WHERE id = ?`)
          .get(input.attemptId) as { settings_snapshot_json: string } | undefined
        let settings: Record<string, unknown> = {}
        try {
          settings = JSON.parse(row?.settings_snapshot_json || '{}') as Record<string, unknown>
        } catch {
          settings = {}
        }
        const incoming = payload.captureCorrelation as Record<string, unknown>
        const prev =
          settings.captureCorrelation && typeof settings.captureCorrelation === 'object'
            ? (settings.captureCorrelation as Record<string, unknown>)
            : {}
        const mergeList = (a: unknown, b: unknown): string[] => {
          const out = new Set<string>()
          for (const list of [a, b]) {
            if (!Array.isArray(list)) continue
            for (const raw of list) {
              const value = String(raw || '').trim()
              if (value) out.add(value)
            }
          }
          return [...out]
        }
        settings.captureCorrelation = {
          ...prev,
          ...incoming,
          excludeSrcs: mergeList(prev.excludeSrcs, incoming.excludeSrcs),
          excludeMediaIds: mergeList(prev.excludeMediaIds, incoming.excludeMediaIds),
          excludeShas: mergeList(prev.excludeShas, incoming.excludeShas),
          acceptedSrcs: mergeList(prev.acceptedSrcs, incoming.acceptedSrcs),
          acceptedMediaIds: mergeList(prev.acceptedMediaIds, incoming.acceptedMediaIds),
          updatedAt: t,
        }
        db.prepare(
          `UPDATE flow_attempts
           SET settings_snapshot_json = ?, revision = revision + 1 WHERE id = ?`,
        ).run(JSON.stringify(settings), input.attemptId)
      }
    }
    db.prepare(
      `UPDATE flow_commands
       SET expires_at = ?
       WHERE id = ? AND status = 'leased'`,
    ).run(new Date(Date.now() + 5 * 60_000).toISOString(), input.commandId)
    db.persist()

    if (!applyToAttempt || alreadyCanceled) return { canceled: alreadyCanceled }

    const observedAt =
      typeof payload.observedAt === 'string' ? payload.observedAt : t
    const progressPercent =
      typeof payload.attemptPercent === 'number' && Number.isFinite(payload.attemptPercent)
        ? payload.attemptPercent
        : null
    emitBenchUpdate({
      kind:
        input.eventType === 'generation_progress'
          ? 'attempt_progress'
          : 'attempt_stage',
      commandId: input.commandId,
      attemptId: input.attemptId || null,
      sequence: Math.max(seq, clientSequence || 0),
      observedAt,
      executionStage: stage,
      state: typeof payload.state === 'string' ? payload.state : null,
      progressPercent,
      generatingCardCount:
        typeof payload.generatingCardCount === 'number'
          ? payload.generatingCardCount
          : null,
      completedEvidenceCount:
        typeof payload.completedEvidenceCount === 'number'
          ? payload.completedEvidenceCount
          : null,
      clientSequence,
    })
    return { canceled: false }
  },

  completeCommand(input: {
    commandId: string
    installationId: string
    ok: boolean
    attemptState?: string
    submissionCertainty?: string
    failureCode?: string | null
    resultDigest?: string | null
    retrievedCount?: number
    detail?: Record<string, unknown> | null
  }): void {
    const db = getDb()
    const t = nowIso()
    const cmd = db
      .prepare(`SELECT attempt_id, delivery_count FROM flow_commands WHERE id = ?`)
      .get(input.commandId) as { attempt_id: string | null; delivery_count: number } | undefined
    const userCanceled = this.attemptCanceled(cmd?.attempt_id)

    const retryableAttach = new Set([
      'ATTACH_PANEL_ROOT_MISSING',
      'ATTACH_PANEL_UNAVAILABLE',
      'STUCK_IN_ASSET_EDIT',
      'HELLO_REQUIRED',
      'PAIRED_COORDINATOR_UNAVAILABLE',
      'NEED_FLOW_TAB',
    ])
    const certainty = input.submissionCertainty || 'not_sent'
    const shouldRequeue =
      !input.ok &&
      certainty === 'not_sent' &&
      typeof input.failureCode === 'string' &&
      retryableAttach.has(input.failureCode) &&
      (cmd?.delivery_count || 0) < 5

    if (shouldRequeue && !userCanceled) {
      db.prepare(
        `UPDATE flow_commands
         SET status = 'queued',
             lease_id = NULL,
             expires_at = NULL,
             acknowledged_at = NULL,
             result_digest = ?,
             installation_id = CASE
               WHEN installation_id = 'test-install' THEN installation_id
               ELSE installation_id
             END
         WHERE id = ?`,
      ).run(
        input.resultDigest ||
          JSON.stringify({
            requeued: true,
            failureCode: input.failureCode,
            detail: input.detail || null,
          }),
        input.commandId,
      )
      if (cmd?.attempt_id) {
        // Limpa failure_code no requeue — senão a bancada mostra “Falhou” e trava o textarea
        // enquanto state=queued (ainda em voo).
        db.prepare(
          `UPDATE flow_attempts
           SET state = 'queued',
               execution_stage = 'waiting_executor',
               failure_code = NULL,
               finished_at = NULL,
               revision = revision + 1
           WHERE id = ?`,
        ).run(cmd.attempt_id)
      }
      logger.info('atlas-flow-v1.jobs.requeued_retryable', {
        commandId: input.commandId,
        failureCode: input.failureCode,
      })
      db.persist()
      return
    }

    db.prepare(
      `UPDATE flow_commands
       SET status = ?, result_digest = ?, acknowledged_at = ?
       WHERE id = ?`,
    ).run(
      input.ok ? 'completed' : 'failed',
      input.resultDigest ||
        (input.detail ? JSON.stringify(input.detail).slice(0, 1800) : null),
      t,
      input.commandId,
    )

    if (cmd?.attempt_id && !userCanceled) {
      const state =
        input.attemptState ||
        (input.ok ? 'completed' : input.submissionCertainty === 'may_have_sent'
          ? 'submission_uncertain'
          : 'failed')
      const detail = input.detail && typeof input.detail === 'object' ? input.detail : null
      const completionKind =
        detail?.explicitUserSelection === true
          ? 'explicit_user_selection'
          : detail?.automaticCorrelation === true
            ? 'automatic_correlation'
            : null

      if (detail && (Array.isArray(detail.candidates) || Array.isArray(detail.missingCorrelation))) {
        const row = db
          .prepare(`SELECT settings_snapshot_json FROM flow_attempts WHERE id = ?`)
          .get(cmd.attempt_id) as { settings_snapshot_json: string | null } | undefined
        let snap: Record<string, unknown> = {}
        try {
          snap = JSON.parse(row?.settings_snapshot_json || '{}') as Record<string, unknown>
        } catch {
          snap = {}
        }
        if (Array.isArray(detail.candidates)) {
          snap.observedRecoveryCandidates = detail.candidates
        }
        if (Array.isArray(detail.missingCorrelation)) {
          snap.missingCorrelation = detail.missingCorrelation
        }
        snap.lastCommandCompleteAt = t
        db.prepare(`UPDATE flow_attempts SET settings_snapshot_json = ? WHERE id = ?`).run(
          JSON.stringify(snap),
          cmd.attempt_id,
        )
      }

      db.prepare(
        `UPDATE flow_attempts
         SET state = ?,
             submission_certainty = COALESCE(?, submission_certainty),
             failure_code = ?,
             retrieved_outputs = COALESCE(?, retrieved_outputs),
             completion_kind = COALESCE(?, completion_kind),
             finished_at = ?,
             revision = revision + 1
         WHERE id = ?`,
      ).run(
        state,
        input.submissionCertainty || null,
        input.failureCode || null,
        input.retrievedCount ?? null,
        completionKind,
        t,
        cmd.attempt_id,
      )
      if (cmd.attempt_id) {
        lastProgressClientSeqByAttempt.delete(cmd.attempt_id)
      }
      emitBenchUpdate({
        kind: 'attempt_complete',
        commandId: input.commandId,
        attemptId: cmd.attempt_id,
        sequence: Date.now(),
        observedAt: t,
        state,
        executionStage: state,
      })
    }
    db.persist()
  },

  /** SHAs já vistos no projeto (inclui misattributed) — excluir na captura. */
  listKnownResultShasForAtlasProject(atlasProjectId: string): string[] {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT DISTINCT rb.sha256 AS sha256
         FROM flow_result_bindings rb
         JOIN flow_attempts a ON a.id = rb.attempt_id
         JOIN flow_project_links pl ON pl.id = a.project_link_id
         WHERE pl.atlas_project_id = ?
           AND rb.sha256 IS NOT NULL
           AND length(rb.sha256) >= 16`,
      )
      .all(atlasProjectId) as Array<{ sha256: string }>
    return rows.map((r) => String(r.sha256)).filter(Boolean)
  },

  /** Identificadores reais de mídia Flow já vistos no projeto (exclui `local:*`). */
  listKnownResultMediaIdsForAtlasProject(atlasProjectId: string): string[] {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT DISTINCT rb.flow_media_id AS flow_media_id
         FROM flow_result_bindings rb
         JOIN flow_attempts a ON a.id = rb.attempt_id
         JOIN flow_project_links pl ON pl.id = a.project_link_id
         WHERE pl.atlas_project_id = ?
           AND rb.flow_media_id IS NOT NULL
           AND rb.flow_media_id NOT LIKE 'local:%'
           AND rb.flow_media_id != '_gd'`,
      )
      .all(atlasProjectId) as Array<{ flow_media_id: string }>
    return rows.map((r) => String(r.flow_media_id).trim()).filter(Boolean)
  },

  /**
   * Marca bindings capturados por engano (mesmo SHA antigo reatribuído).
   * Preserva arquivos em disco e o registro; só tira da tentativa “ativa”.
   */
  markBindingsMisattributed(input: {
    attemptIds: string[]
    shas: string[]
    reason?: string
  }): { ok: boolean; marked: number } {
    const db = getDb()
    const t = nowIso()
    const shas = input.shas.filter(Boolean)
    const attemptIds = input.attemptIds.filter(Boolean)
    if (!shas.length || !attemptIds.length) return { ok: true, marked: 0 }
    const placeholdersA = attemptIds.map(() => '?').join(',')
    const placeholdersS = shas.map(() => '?').join(',')
    const before = db
      .prepare(
        `SELECT id FROM flow_result_bindings
         WHERE attempt_id IN (${placeholdersA})
           AND sha256 IN (${placeholdersS})
           AND COALESCE(error_code, '') != 'MISATTRIBUTED_CAPTURE'`,
      )
      .all(...attemptIds, ...shas) as Array<{ id: string }>
    db.prepare(
      `UPDATE flow_result_bindings
       SET retrieval_state = 'misattributed',
           error_code = 'MISATTRIBUTED_CAPTURE',
           retrieved_at = COALESCE(retrieved_at, ?)
       WHERE attempt_id IN (${placeholdersA})
         AND sha256 IN (${placeholdersS})`,
    ).run(t, ...attemptIds, ...shas)
    for (const attemptId of attemptIds) {
      const retrieved = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM flow_result_bindings
             WHERE attempt_id = ? AND retrieval_state = 'retrieved'`,
          )
          .get(attemptId) as { c: number }
      ).c
      const attempt = db
        .prepare(`SELECT state FROM flow_attempts WHERE id = ?`)
        .get(attemptId) as { state: string } | undefined
      const nextState =
        retrieved === 0 &&
        attempt &&
        ['completed', 'partial'].includes(attempt.state)
          ? 'partial'
          : attempt?.state || 'partial'
      db.prepare(
        `UPDATE flow_attempts
         SET retrieved_outputs = ?,
             state = ?,
             execution_stage = 'misattribution_corrected',
             revision = revision + 1
         WHERE id = ?`,
      ).run(retrieved, nextState, attemptId)
      emitBenchUpdate({
        kind: 'result_misattribution_corrected',
        attemptId,
        sequence: Date.now(),
        observedAt: t,
        executionStage: 'misattribution_corrected',
        state: nextState,
        reason: input.reason || 'MISATTRIBUTED_CAPTURE',
        markedIds: before.map((b) => b.id),
      })
    }
    db.persist()
    return { ok: true, marked: before.length }
  },

  /**
   * SHAs presentes em >1 tentativa: mantém o vínculo mais antigo, marca os demais
   * como MISATTRIBUTED_CAPTURE (arquivos preservados). Opcionalmente enfileira recover.
   */
  correctReusedResultShas(input: {
    atlasProjectId: string
    recoverAttemptIds?: string[]
  }): {
    ok: boolean
    reusedShas: Array<{
      sha256: string
      keepAttemptId: string
      keepBindingId: string
      markedAttemptIds: string[]
      markedBindingIds: string[]
    }>
    marked: number
    recoverCommands: Array<{ attemptId: string; ok: boolean; commandId?: string; error?: string }>
  } {
    const db = getDb()
    const reused = db
      .prepare(
        `SELECT rb.sha256 AS sha256
         FROM flow_result_bindings rb
         JOIN flow_attempts a ON a.id = rb.attempt_id
         JOIN flow_project_links pl ON pl.id = a.project_link_id
         WHERE pl.atlas_project_id = ?
           AND rb.sha256 IS NOT NULL
           AND length(rb.sha256) >= 16
         GROUP BY rb.sha256
         HAVING COUNT(DISTINCT rb.attempt_id) > 1`,
      )
      .all(input.atlasProjectId) as Array<{ sha256: string }>

    const reusedShas: Array<{
      sha256: string
      keepAttemptId: string
      keepBindingId: string
      markedAttemptIds: string[]
      markedBindingIds: string[]
    }> = []
    let marked = 0

    for (const row of reused) {
      const bindings = db
        .prepare(
          `SELECT id, attempt_id, created_at, retrieval_state, error_code
           FROM flow_result_bindings
           WHERE sha256 = ?
           ORDER BY created_at ASC`,
        )
        .all(row.sha256) as Array<{
        id: string
        attempt_id: string
        created_at: string
        retrieval_state: string
        error_code: string | null
      }>
      if (bindings.length < 2) continue
      const keep = bindings[0]!
      const victims = bindings.filter((b) => b.id !== keep.id)
      const victimAttemptIds = [...new Set(victims.map((b) => b.attempt_id))]
      const result = this.markBindingsMisattributed({
        attemptIds: victimAttemptIds,
        shas: [row.sha256],
        reason: 'CROSS_ATTEMPT_SHA_REUSE',
      })
      marked += result.marked
      reusedShas.push({
        sha256: row.sha256,
        keepAttemptId: keep.attempt_id,
        keepBindingId: keep.id,
        markedAttemptIds: victimAttemptIds,
        markedBindingIds: victims.map((b) => b.id),
      })
    }

    const recoverCommands: Array<{
      attemptId: string
      ok: boolean
      commandId?: string
      error?: string
    }> = []
    for (const attemptId of input.recoverAttemptIds || []) {
      const r = this.enqueueRecover(attemptId)
      recoverCommands.push({
        attemptId,
        ok: r.ok,
        commandId: r.commandId,
        error: r.error,
      })
    }

    return { ok: true, reusedShas, marked, recoverCommands }
  },

  /**
   * Pré-checagem antes de gravar bytes no disco em `/results/stage`.
   * Evita duplicar arquivos na reingestão idempotente e impede cópia órfã quando o SHA
   * ou `flowMediaId` real já pertence a outra tentativa.
   */
  precheckResultStage(input: {
    attemptId: string
    sha256: string
    flowMediaId?: string | null
    allowKnownSha?: boolean
  }): {
    ok: boolean
    idempotent?: boolean
    resultBindingId?: string
    existingAbsPath?: string | null
    outputIndex?: number
    error?: string
    existingAttemptId?: string | null
  } {
    const db = getDb()
    const sha = String(input.sha256 || '').toLowerCase()
    const attemptId = String(input.attemptId || '').trim()
    const rawMediaId = input.flowMediaId ? String(input.flowMediaId).trim() : ''
    const stableMediaId =
      rawMediaId && !rawMediaId.startsWith('local:') && !rawMediaId.startsWith('_')
        ? rawMediaId
        : null

    if (!attemptId || sha.length < 16) {
      return { ok: false, error: 'RESULT_SHA_INVALID' }
    }

    const sameAttempt = db
      .prepare(
        `SELECT id, output_index, retrieval_state, error_code, atlas_asset_id
         FROM flow_result_bindings
         WHERE attempt_id = ?
           AND (sha256 = ? OR (? IS NOT NULL AND flow_media_id = ?))
         LIMIT 1`,
      )
      .get(attemptId, sha, stableMediaId, stableMediaId) as
      | {
          id: string
          output_index: number
          retrieval_state: string
          error_code: string | null
          atlas_asset_id: string | null
        }
      | undefined

    if (sameAttempt) {
      if (
        (sameAttempt.retrieval_state === 'misattributed' ||
          sameAttempt.error_code === 'MISATTRIBUTED_CAPTURE') &&
        input.allowKnownSha !== true
      ) {
        return {
          ok: false,
          error: 'RESULT_SHA_MISATTRIBUTED',
          existingAttemptId: attemptId,
        }
      }
      return {
        ok: true,
        idempotent: true,
        resultBindingId: sameAttempt.id,
        existingAbsPath: sameAttempt.atlas_asset_id,
        outputIndex: sameAttempt.output_index,
      }
    }

    if (stableMediaId && input.allowKnownSha !== true) {
      const otherMedia = db
        .prepare(
          `SELECT id, attempt_id FROM flow_result_bindings
           WHERE flow_media_id = ?
             AND attempt_id != ?
             AND retrieval_state != 'misattributed'
           LIMIT 1`,
        )
        .get(stableMediaId, attemptId) as { id: string; attempt_id: string } | undefined
      if (otherMedia) {
        return {
          ok: false,
          error: 'RESULT_MEDIA_ID_ALREADY_BOUND',
          existingAttemptId: otherMedia.attempt_id,
        }
      }
    }

    const otherSha = db
      .prepare(
        `SELECT id, attempt_id, retrieval_state FROM flow_result_bindings
         WHERE sha256 = ?
           AND attempt_id != ?
         ORDER BY CASE WHEN retrieval_state = 'retrieved' THEN 0 ELSE 1 END, created_at ASC
         LIMIT 1`,
      )
      .get(sha, attemptId) as
      | { id: string; attempt_id: string; retrieval_state: string }
      | undefined
    if (otherSha) {
      // Mesmo com allowKnownSha, NUNCA permite roubar um SHA atualmente `retrieved` em outra tentativa ativa!
      if (otherSha.retrieval_state === 'retrieved' || input.allowKnownSha !== true) {
        return {
          ok: false,
          error: 'RESULT_SHA_ALREADY_BOUND',
          existingAttemptId: otherSha.attempt_id,
        }
      }
    }

    return { ok: true, idempotent: false }
  },

  stageResultForAttempt(input: {
    attemptId: string
    absPath: string
    mimeType: string
    byteSize: number
    sha256: string
    width?: number | null
    height?: number | null
    flowMediaId?: string | null
    originProof?: string | null
    automaticCorrelation?: boolean | null
    srcKey?: string | null
    outputIndex?: number
    /** true = recuperação explícita pode reutilizar SHA que esteja apenas misattributed (nunca rouba retrieved de outra tentativa). */
    allowKnownSha?: boolean
  }): {
    ok: boolean
    idempotent?: boolean
    resultBindingId?: string
    outputIndex?: number
    absPath?: string
    error?: string
    existingAttemptId?: string | null
  } {
    const db = getDb()
    const t = nowIso()
    const sha = String(input.sha256 || '').toLowerCase()
    const rawMediaId = input.flowMediaId ? String(input.flowMediaId).trim() : ''
    const stableMediaId =
      rawMediaId && !rawMediaId.startsWith('local:') && !rawMediaId.startsWith('_')
        ? rawMediaId
        : null

    const pre = this.precheckResultStage({
      attemptId: input.attemptId,
      sha256: sha,
      flowMediaId: stableMediaId,
      allowKnownSha: input.allowKnownSha,
    })
    if (!pre.ok) {
      if (pre.error === 'RESULT_SHA_ALREADY_BOUND' || pre.error === 'RESULT_MEDIA_ID_ALREADY_BOUND') {
        logger.warn('atlas-flow-v1.jobs.result_already_bound', {
          attemptId: input.attemptId,
          sha256: sha.slice(0, 12),
          flowMediaId: stableMediaId,
          error: pre.error,
          existingAttemptId: pre.existingAttemptId,
        })
      }
      return {
        ok: false,
        error: pre.error || 'RESULT_BIND_REJECTED',
        existingAttemptId: pre.existingAttemptId ?? null,
      }
    }

    const existing = db
      .prepare(
        `SELECT id, output_index, retrieval_state, error_code, atlas_asset_id, flow_media_id, source_locator_encrypted
         FROM flow_result_bindings
         WHERE attempt_id = ?
           AND (sha256 = ? OR (? IS NOT NULL AND flow_media_id = ?))
         LIMIT 1`,
      )
      .get(input.attemptId, sha, stableMediaId, stableMediaId) as
      | {
          id: string
          output_index: number
          retrieval_state: string
          error_code: string | null
          atlas_asset_id: string | null
          flow_media_id: string
          source_locator_encrypted: string | null
        }
      | undefined

    const provenanceJson = (() => {
      let base: Record<string, unknown> = {}
      if (existing?.source_locator_encrypted?.startsWith('{')) {
        try {
          base = JSON.parse(existing.source_locator_encrypted) as Record<string, unknown>
        } catch {
          base = {}
        }
      }
      if (input.originProof) base.originProof = input.originProof
      if (typeof input.automaticCorrelation === 'boolean') {
        base.automaticCorrelation = input.automaticCorrelation
      }
      if (input.srcKey) base.srcKey = input.srcKey
      return Object.keys(base).length > 0 ? JSON.stringify(base) : null
    })()

    const id = existing?.id || randomUUID()
    // Em reingestão idempotente, preserva SEMPRE o output_index e o arquivo original válido!
    const effectiveAbsPath =
      existing?.retrieval_state === 'retrieved' &&
      existing.atlas_asset_id &&
      fs.existsSync(existing.atlas_asset_id)
        ? existing.atlas_asset_id
        : input.absPath
    const outputIndex =
      existing && existing.retrieval_state === 'retrieved'
        ? existing.output_index
        : (input.outputIndex ??
          (
            db
              .prepare(
                `SELECT COALESCE(MAX(output_index), -1) AS m FROM flow_result_bindings
                 WHERE attempt_id = ? AND retrieval_state = 'retrieved'`,
              )
              .get(input.attemptId) as { m: number }
          ).m + 1)

    const effectiveMediaId =
      stableMediaId ||
      (existing?.flow_media_id && !existing.flow_media_id.startsWith('local:')
        ? existing.flow_media_id
        : `local:${sha.slice(0, 12)}`)

    if (existing) {
      db.prepare(
        `UPDATE flow_result_bindings
         SET flow_media_id = ?,
             output_index = ?,
             retrieval_state = 'retrieved',
             source_locator_encrypted = COALESCE(?, source_locator_encrypted),
             atlas_asset_id = ?,
             mime_type = ?,
             byte_size = ?,
             sha256 = ?,
             width = COALESCE(?, width),
             height = COALESCE(?, height),
             retrieved_at = COALESCE(retrieved_at, ?),
             error_code = NULL
         WHERE id = ?`,
      ).run(
        effectiveMediaId,
        outputIndex,
        provenanceJson,
        effectiveAbsPath,
        input.mimeType,
        input.byteSize,
        sha,
        input.width ?? null,
        input.height ?? null,
        t,
        id,
      )
    } else {
      db.prepare(
        `INSERT INTO flow_result_bindings (
          id, attempt_id, flow_media_id, output_index, retrieval_state,
          source_locator_encrypted, source_expires_at, atlas_asset_id,
          mime_type, byte_size, sha256, width, height, created_at, retrieved_at, error_code
        ) VALUES (?, ?, ?, ?, 'retrieved', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        id,
        input.attemptId,
        effectiveMediaId,
        outputIndex,
        provenanceJson,
        effectiveAbsPath,
        input.mimeType,
        input.byteSize,
        sha,
        input.width ?? null,
        input.height ?? null,
        t,
        t,
      )
    }

    db.prepare(
      `UPDATE flow_attempts
       SET retrieved_outputs = (
             SELECT COUNT(*) FROM flow_result_bindings
             WHERE attempt_id = ? AND retrieval_state = 'retrieved'
           ),
           observed_outputs = CASE
             WHEN observed_outputs > ? THEN observed_outputs ELSE ?
           END,
           state = CASE
             WHEN state IN ('generating', 'retrieving', 'partial') THEN 'retrieving'
             ELSE state
           END,
           execution_stage = 'result_staged',
           revision = revision + 1
       WHERE id = ?`,
    ).run(input.attemptId, outputIndex + 1, outputIndex + 1, input.attemptId)
    db.persist()

    const isIdempotentHit = Boolean(existing && existing.retrieval_state === 'retrieved')
    if (!isIdempotentHit) {
      emitBenchUpdate({
        kind: 'result_staged',
        attemptId: input.attemptId,
        sequence: Date.now(),
        observedAt: t,
        executionStage: 'result_staged',
        state: 'retrieving',
        resultBindingId: id,
      })
    }

    return {
      ok: true,
      idempotent: isIdempotentHit,
      resultBindingId: id,
      outputIndex,
      absPath: effectiveAbsPath,
    }
  },

  /**
   * Reparo auditado e idempotente dos vínculos históricos incorretos do projeto `a914931c-54f6-40cd-ad1b-1bba1ab51cc7`:
   * 1. Retira as 3 imagens WebP da praia da tentativa da mata (`b48b6bbb...`) marcando-as como `misattributed`,
   *    e restaura o vínculo legítimo delas na tentativa da praia (`3e313209...` — `[cantor] cantando na praia`).
   * 2. Retira a captura prematura em 0% (`72ms`) de `2ea1ec9a...` (marcando como `misattributed`) e recupera
   *    os 3 bytes verificados do navio (`f42bfcc2.jpg`, `808226c4.jpg`, `88f7404d.jpg`) para a tentativa
   *    reportada do navio (`2e494216...` na linha `9b573584...`), desarquivando-a na bancada e registrando
   *    explicitamente que NÃO houve reconstrução de correlação automática retroativa.
   * Preserva 100% dos arquivos originais em disco.
   */
  ensureHistoricalAuditRepairs(atlasProjectId: string): void {
    const TARGET_PROJECT = 'a914931c-54f6-40cd-ad1b-1bba1ab51cc7'
    if (atlasProjectId !== TARGET_PROJECT) return
    const db = getDb()
    const alreadyAudited = db
      .prepare(
        `SELECT id FROM flow_events
         WHERE aggregate_id = ? AND event_type = 'historical_misattribution_audit_repaired_v2'
         LIMIT 1`,
      )
      .get(TARGET_PROJECT) as { id: string } | undefined
    if (alreadyAudited) return

    const shipAttemptExists = db
      .prepare(`SELECT id FROM flow_attempts WHERE id = ?`)
      .get('2e494216-37b2-48a1-a91e-0b2661e1ae66') as { id: string } | undefined
    const beachAttemptExists = db
      .prepare(`SELECT id FROM flow_attempts WHERE id = ?`)
      .get('3e313209-607c-4a12-b0f1-1ec3d9b243ca') as { id: string } | undefined
    if (!shipAttemptExists || !beachAttemptExists) return

    const resultsDir = path.join(process.cwd(), 'docs', 'atlas-flow', 'results')
    const beachAssets = [
      {
        outputIndex: 0,
        file: '26a28260-43a7-4f71-a25d-12557f0d8d1e.webp',
        sha256: '69cc1e0771e034687bc6b2dc3413eef7457f31a32fe9e9468442a3392a70feee',
        byteSize: 194242,
        mimeType: 'image/webp',
        width: 1376,
        height: 768,
      },
      {
        outputIndex: 1,
        file: 'c50ba916-61b6-4149-96b2-2bedecf0ecd1.webp',
        sha256: 'fe1988c1193d4a427f615ed9b4720b680ea8a589a49f5303a948fc01ffc0ef1a',
        byteSize: 173468,
        mimeType: 'image/webp',
        width: 1376,
        height: 768,
      },
      {
        outputIndex: 2,
        file: '4c341e42-e0c0-459d-aa73-1bd5a4134fb1.webp',
        sha256: 'f40f3d02d001d3d686c71ef58ad007168077e3d4474cbeeabab2476d4134fb1'.slice(0, 0) ||
          'f40f3d02d001d3d686c71ef58ad007168077e3d4474cbeeabab2476d41167fae',
        byteSize: 184912,
        mimeType: 'image/webp',
        width: 1376,
        height: 768,
      },
    ]
    const shipAssets = [
      {
        outputIndex: 0,
        file: 'f42bfcc2-59bc-48c4-829e-60b861c18188.jpg',
        sha256: 'bdeb977be3176cb4c1c089ae16e2e71c62993a3ede768ce1b34073729fc2dfc2',
        byteSize: 745801,
        mimeType: 'image/jpeg',
        width: 1376,
        height: 768,
      },
      {
        outputIndex: 1,
        file: '808226c4-9021-4ce0-a781-ea19e39800ee.jpg',
        sha256: '087aa27eb67df0b3b22a28dc85bf24bb8e5cfa126ee7c6d517823a7ba98a0203',
        byteSize: 678130,
        mimeType: 'image/jpeg',
        width: 1376,
        height: 768,
      },
      {
        outputIndex: 2,
        file: '88f7404d-fed2-48ce-b1b0-28ec7d1e1ae4.jpg',
        sha256: '9f9422f2a5ca7d0c2606c2912b971b9311bc6504828c8c02f4cec9af7a795ef1',
        byteSize: 755882,
        mimeType: 'image/jpeg',
        width: 1376,
        height: 768,
      },
    ]

    const allFilesPresent = [...beachAssets, ...shipAssets].every((a) =>
      fs.existsSync(path.join(resultsDir, a.file)),
    )
    if (!allFilesPresent) return

    const t = nowIso()
    const woodsAttemptId = 'b48b6bbb-dbdc-43ad-80e1-a870939cca25'
    const beachAttemptId = '3e313209-607c-4a12-b0f1-1ec3d9b243ca'
    const prematureShipAttemptId = '2ea1ec9a-8762-417b-803f-295b80954f96'
    const reportedShipAttemptId = '2e494216-37b2-48a1-a91e-0b2661e1ae66'
    const reportedShipPromptId = '9b573584-9342-49fa-8c21-77b395908f97'
    const reportedShipRevisionId = 'd8b47f03-2829-4082-ba26-9901a718127e'
    const emptyTrailingPromptId = '93d3318d-9135-40ac-b23c-409e6fd8b10d'

    // 1) Desmarca praia indevida na tentativa da mata (`b48b6bbb`), preservando registros e arquivos
    db.prepare(
      `UPDATE flow_result_bindings
       SET retrieval_state = 'misattributed',
           error_code = 'MISATTRIBUTED_CAPTURE'
       WHERE attempt_id = ? AND retrieval_state = 'retrieved'`,
    ).run(woodsAttemptId)
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'partial',
           retrieved_outputs = 0,
           execution_stage = 'misattribution_corrected',
           failure_code = 'MISATTRIBUTED_CAPTURE',
           revision = revision + 1
       WHERE id = ?`,
    ).run(woodsAttemptId)

    // 2) Vincula as 3 WebPs da praia à tentativa legítima da praia (`3e313209`)
    for (const asset of beachAssets) {
      const absPath = path.join(resultsDir, asset.file)
      const existingBeach = db
        .prepare(`SELECT id FROM flow_result_bindings WHERE attempt_id = ? AND sha256 = ?`)
        .get(beachAttemptId, asset.sha256) as { id: string } | undefined
      const prov = JSON.stringify({
        originProof: 'historical_audit_legitimate_beach_attempt',
        automaticCorrelation: false,
        note: 'Restaurado para a tentativa aceita de "[cantor] cantando na praia" (14:35:57Z).',
      })
      if (existingBeach) {
        db.prepare(
          `UPDATE flow_result_bindings
           SET output_index = ?,
               retrieval_state = 'retrieved',
               source_locator_encrypted = ?,
               atlas_asset_id = ?,
               mime_type = ?,
               byte_size = ?,
               width = ?,
               height = ?,
               retrieved_at = ?,
               error_code = NULL
           WHERE id = ?`,
        ).run(
          asset.outputIndex,
          prov,
          absPath,
          asset.mimeType,
          asset.byteSize,
          asset.width,
          asset.height,
          t,
          existingBeach.id,
        )
      } else {
        db.prepare(
          `INSERT INTO flow_result_bindings (
            id, attempt_id, flow_media_id, output_index, retrieval_state,
            source_locator_encrypted, source_expires_at, atlas_asset_id,
            mime_type, byte_size, sha256, width, height, created_at, retrieved_at, error_code
          ) VALUES (?, ?, ?, ?, 'retrieved', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        ).run(
          randomUUID(),
          beachAttemptId,
          `local:${asset.sha256.slice(0, 12)}`,
          asset.outputIndex,
          prov,
          absPath,
          asset.mimeType,
          asset.byteSize,
          asset.sha256,
          asset.width,
          asset.height,
          t,
          t,
        )
      }
    }
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'completed',
           retrieved_outputs = 3,
           observed_outputs = 3,
           failure_code = NULL,
           execution_stage = 'historical_audit_restored',
           completion_kind = 'historical_audit_restored',
           revision = revision + 1
       WHERE id = ?`,
    ).run(beachAttemptId)

    // 3) Desmarca a captura prematura em 0% (72ms após clique) de `2ea1ec9a`
    db.prepare(
      `UPDATE flow_result_bindings
       SET retrieval_state = 'misattributed',
           error_code = 'MISATTRIBUTED_PREMATURE_ZERO_PERCENT'
       WHERE attempt_id = ? AND retrieval_state = 'retrieved'`,
    ).run(prematureShipAttemptId)
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'partial',
           retrieved_outputs = 0,
           execution_stage = 'misattribution_corrected',
           failure_code = 'MISATTRIBUTED_PREMATURE_ZERO_PERCENT',
           revision = revision + 1
       WHERE id = ?`,
    ).run(prematureShipAttemptId)

    // 4) Recupera os 3 JPGs verificados do navio na tentativa original reportada (`2e494216`)
    for (const asset of shipAssets) {
      const absPath = path.join(resultsDir, asset.file)
      const existingShip = db
        .prepare(`SELECT id FROM flow_result_bindings WHERE attempt_id = ? AND sha256 = ?`)
        .get(reportedShipAttemptId, asset.sha256) as { id: string } | undefined
      const prov = JSON.stringify({
        originProof: 'verified_existing_ship_bytes_recovered',
        automaticCorrelation: false,
        missingAutomaticCorrelation: [
          'flow_rpc_generation_id_not_recorded_on_2026_11_14',
          'tracked_progress_slot_lineage_not_recorded_on_2026_11_14',
        ],
        note: 'Recuperado por evidência visual e SHA-256 dos outputs existentes do navio, sem afirmar associação automática retroativa e sem nova geração.',
      })
      if (existingShip) {
        db.prepare(
          `UPDATE flow_result_bindings
           SET output_index = ?,
               retrieval_state = 'retrieved',
               source_locator_encrypted = ?,
               atlas_asset_id = ?,
               mime_type = ?,
               byte_size = ?,
               width = ?,
               height = ?,
               retrieved_at = ?,
               error_code = NULL
           WHERE id = ?`,
        ).run(
          asset.outputIndex,
          prov,
          absPath,
          asset.mimeType,
          asset.byteSize,
          asset.width,
          asset.height,
          t,
          existingShip.id,
        )
      } else {
        db.prepare(
          `INSERT INTO flow_result_bindings (
            id, attempt_id, flow_media_id, output_index, retrieval_state,
            source_locator_encrypted, source_expires_at, atlas_asset_id,
            mime_type, byte_size, sha256, width, height, created_at, retrieved_at, error_code
          ) VALUES (?, ?, ?, ?, 'retrieved', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        ).run(
          randomUUID(),
          reportedShipAttemptId,
          `local:${asset.sha256.slice(0, 12)}`,
          asset.outputIndex,
          prov,
          absPath,
          asset.mimeType,
          asset.byteSize,
          asset.sha256,
          asset.width,
          asset.height,
          t,
          t,
        )
      }
    }
    db.prepare(
      `UPDATE flow_attempts
       SET state = 'completed',
           retrieved_outputs = 3,
           observed_outputs = 3,
           failure_code = NULL,
           execution_stage = 'recovered_verified_existing_bytes',
           completion_kind = 'verified_existing_bytes_no_auto_claim',
           revision = revision + 1
       WHERE id = ?`,
    ).run(reportedShipAttemptId)

    // Desarquiva a linha reportada do navio e garante que aponte para a revisão do prompt do navio
    db.prepare(
      `UPDATE flow_prompts
       SET archived_at = NULL,
           active_revision_id = ?,
           revision = revision + 1
       WHERE id = ?`,
    ).run(reportedShipRevisionId, reportedShipPromptId)

    // Se a linha 17 vazia nunca teve texto nem tentativas, arquiva para não poluir acima/abaixo da linha recuperada
    const emptyCheck = db
      .prepare(
        `SELECT p.id, COALESCE(r.raw_text, '') AS raw_text,
                (SELECT COUNT(*) FROM flow_attempts a
                 JOIN flow_prompt_revisions pr ON pr.id = a.prompt_revision_id
                 WHERE pr.prompt_id = p.id) AS attempt_count
         FROM flow_prompts p
         LEFT JOIN flow_prompt_revisions r ON r.id = p.active_revision_id
         WHERE p.id = ? AND p.archived_at IS NULL`,
      )
      .get(emptyTrailingPromptId) as
      | { id: string; raw_text: string; attempt_count: number }
      | undefined
    if (emptyCheck && !emptyCheck.raw_text.trim() && Number(emptyCheck.attempt_count) === 0) {
      db.prepare(`UPDATE flow_prompts SET archived_at = ? WHERE id = ?`).run(
        t,
        emptyTrailingPromptId,
      )
    }

    // Evento imutável de auditoria
    db.prepare(
      `INSERT INTO flow_events (
        id, aggregate_type, aggregate_id, aggregate_revision, installation_id, command_id,
        attempt_id, event_type, payload_json, occurred_at_client, received_at_server,
        sequence, created_at
      ) VALUES (?, 'project_audit', ?, 1, NULL, NULL, ?, 'historical_misattribution_audit_repaired_v2', ?, NULL, ?, 1, ?)`,
    ).run(
      randomUUID(),
      TARGET_PROJECT,
      reportedShipAttemptId,
      JSON.stringify({
        repairedAt: t,
        preservedAllDiskFiles: true,
        newGenerationsTriggered: 0,
        beachRestoredToAttemptId: beachAttemptId,
        woodsMisattributedAttemptId: woodsAttemptId,
        prematureZeroPercentShipAttemptId: prematureShipAttemptId,
        shipRecoveredToAttemptId: reportedShipAttemptId,
        shipPromptId: reportedShipPromptId,
        shipPromptRevisionId: reportedShipRevisionId,
        automaticCorrelationClaimedRetroactively: false,
        missingForAutomaticRetroactiveCorrelation: [
          'flow_rpc_generation_id_not_recorded_on_2026_11_14',
          'tracked_progress_slot_lineage_not_recorded_on_2026_11_14',
        ],
      }),
      t,
      t,
    )
    db.persist()
  },

  approveResult(
    resultBindingId: string,
    approved = true,
  ): { ok: boolean; error?: string; approved?: boolean } {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT id, retrieval_state, atlas_asset_id FROM flow_result_bindings WHERE id = ?`,
      )
      .get(resultBindingId) as
      | { id: string; retrieval_state: string; atlas_asset_id: string | null }
      | undefined
    if (!row) return { ok: false, error: 'RESULT_NOT_FOUND' }
    if (row.retrieval_state !== 'retrieved' || !row.atlas_asset_id) {
      return { ok: false, error: 'RESULT_FILE_NOT_READY' }
    }
    if (!fs.existsSync(row.atlas_asset_id)) {
      return { ok: false, error: 'FILE_MISSING' }
    }
    const t = nowIso()
    db.prepare(`UPDATE flow_result_bindings SET approved_at = ? WHERE id = ?`).run(
      approved ? t : null,
      resultBindingId,
    )
    db.persist()
    emitBenchUpdate({
      kind: 'result_staged',
      attemptId: null,
      sequence: Date.now(),
      observedAt: t,
      resultBindingId,
    })
    return { ok: true, approved }
  },

  sendResultToLipSync(resultBindingId: string): {
    ok: boolean
    error?: string
    sceneNumber?: number
    musicProjectId?: string
    imagePath?: string
  } {
    const result = sendFlowResultToLipSync(String(resultBindingId || ''))
    if (result.ok) {
      emitBenchUpdate({
        kind: 'result_staged',
        attemptId: null,
        sequence: Date.now(),
        observedAt: nowIso(),
        resultBindingId,
      })
    }
    return result
  },

  openResultPath(resultBindingId: string): { ok: boolean; absPath?: string; error?: string } {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT atlas_asset_id, retrieval_state FROM flow_result_bindings WHERE id = ?`,
      )
      .get(resultBindingId) as
      | { atlas_asset_id: string | null; retrieval_state: string }
      | undefined
    if (!row?.atlas_asset_id) return { ok: false, error: 'RESULT_NOT_FOUND' }
    if (row.retrieval_state !== 'retrieved') return { ok: false, error: 'RESULT_NOT_RETRIEVED' }
    if (!fs.existsSync(row.atlas_asset_id)) return { ok: false, error: 'FILE_MISSING' }
    return { ok: true, absPath: row.atlas_asset_id }
  },

  ensureInstallation(installationId: string, extensionVersion?: string): void {
    if (!installationId || installationId === 'test-install') {
      logger.warn('atlas-flow-v1.installation.ignored_test_id', { installationId })
      return
    }
    const db = getDb()
    const t = nowIso()
    const existing = db
      .prepare(`SELECT id FROM flow_installations WHERE id = ?`)
      .get(installationId) as { id: string } | undefined
    if (existing) {
      db.prepare(
        `UPDATE flow_installations
         SET last_seen_at = ?, extension_version = COALESCE(?, extension_version)
         WHERE id = ?`,
      ).run(t, extensionVersion || null, installationId)
      // Reassign pending commands to this installation.
      db.prepare(
        `UPDATE flow_commands
         SET installation_id = ?
         WHERE installation_id = 'pending-installation' AND status = 'queued'`,
      ).run(installationId)
      return
    }
    db.prepare(
      `INSERT INTO flow_installations (
        id, tenant_id, atlas_user_id, label, extension_id, extension_version,
        protocol_version, adapter_version, token_hash, token_epoch, enabled,
        last_seen_at, created_at, revoked_at, transport_kind
      ) VALUES (?, 'local', 'local', 'chrome-extension', NULL, ?, 1, NULL, NULL, 0, 1, ?, ?, NULL, 'loopback-http-ws')`,
    ).run(installationId, extensionVersion || null, t, t)
    db.prepare(
      `UPDATE flow_commands
       SET installation_id = ?
       WHERE installation_id = 'pending-installation' AND status = 'queued'`,
    ).run(installationId)
  },

  getAtlasProjectIdByFlowProject(flowProjectId: string): string | null {
    const id = flowProjectId.trim().toLowerCase()
    if (!id) return null
    const row = getDb()
      .prepare(
        `SELECT atlas_project_id
         FROM flow_project_links
         WHERE LOWER(flow_project_id) = ?
           AND archived_at IS NULL
         ORDER BY CASE link_state WHEN 'linked' THEN 0 ELSE 1 END, revision DESC
         LIMIT 1`,
      )
      .get(id) as { atlas_project_id: string } | undefined
    return row?.atlas_project_id || null
  },

  getLinkedFlowProject(atlasProjectId: string): {
    linkId: string
    flowProjectId: string
    flowProjectUrl: string | null
  } | null {
    const id = atlasProjectId.trim()
    if (!id) return null
    const row = getDb()
      .prepare(
        `SELECT id, flow_project_id, flow_project_url
         FROM flow_project_links
         WHERE atlas_project_id = ?
           AND archived_at IS NULL
           AND flow_project_id IS NOT NULL
           AND TRIM(flow_project_id) != ''
         ORDER BY CASE link_state WHEN 'linked' THEN 0 ELSE 1 END, revision DESC
         LIMIT 1`,
      )
      .get(id) as
      | { id: string; flow_project_id: string; flow_project_url: string | null }
      | undefined
    if (!row?.flow_project_id) return null
    return {
      linkId: row.id,
      flowProjectId: row.flow_project_id,
      flowProjectUrl: row.flow_project_url,
    }
  },

  enqueueProjectDelete(input: {
    atlasProjectId: string
    flowProjectId: string
    flowProjectUrl: string | null
  }): { ok: boolean; commandId: string } {
    const db = getDb()
    const active = this.getActiveExecutorInstallation()
    const installationId = active.id || 'pending-installation'
    const t = nowIso()
    const idempotencyKey = `project.delete:${input.atlasProjectId}:${input.flowProjectId}`
    const payload = {
      operation: 'project.delete',
      atlasProjectId: input.atlasProjectId,
      flowProjectId: input.flowProjectId,
      flowProjectUrl: input.flowProjectUrl,
      idempotencyKey,
    }
    const prior = db
      .prepare(
        `SELECT id, status FROM flow_commands
         WHERE idempotency_key = ?
         ORDER BY
           CASE WHEN installation_id = ? THEN 0 WHEN installation_id = 'pending-installation' THEN 1 ELSE 2 END,
           created_at DESC
         LIMIT 1`,
      )
      .get(idempotencyKey, installationId) as { id: string; status: string } | undefined

    if (prior && (prior.status === 'queued' || prior.status === 'leased' || prior.status === 'completed')) {
      return { ok: true, commandId: prior.id }
    }

    if (prior) {
      db.prepare(
        `UPDATE flow_commands
         SET status = 'queued',
             installation_id = ?,
             payload_json = ?,
             delivery_count = 0,
             lease_id = NULL,
             lease_epoch = NULL,
             expires_at = NULL,
             acknowledged_at = NULL,
             result_digest = NULL
         WHERE id = ?`,
      ).run(installationId, JSON.stringify(payload), prior.id)
      db.persist()
      return { ok: true, commandId: prior.id }
    }

    const commandId = randomUUID()
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, NULL, 'project.delete', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(commandId, installationId, JSON.stringify(payload), idempotencyKey, t)
    db.persist()
    logger.info('atlas-flow-v1.jobs.project_delete_queued', {
      commandId,
      atlasProjectId: input.atlasProjectId,
      flowProjectId: input.flowProjectId,
    })
    return { ok: true, commandId }
  },

  copyResultIntoProjectFolder(resultBindingId: string): { savedPath: string | null; error: string | null } {
    const db = getDb()
    const row = db
      .prepare(
        `SELECT rb.atlas_asset_id AS abs_path,
                rb.output_index AS output_index,
                pr.position AS prompt_position,
                p.name AS project_name,
                p.folder_path AS folder_path
         FROM flow_result_bindings rb
         JOIN flow_attempts a ON a.id = rb.attempt_id
         JOIN flow_prompt_revisions rev ON rev.id = a.prompt_revision_id
         JOIN flow_prompts pr ON pr.id = rev.prompt_id
         JOIN projects p ON p.id = pr.atlas_project_id
         WHERE rb.id = ?`,
      )
      .get(resultBindingId) as
      | {
          abs_path: string | null
          output_index: number | null
          prompt_position: number | null
          project_name: string | null
          folder_path: string | null
        }
      | undefined
    const source = String(row?.abs_path || '')
    const folder = String(row?.folder_path || '').trim()
    if (!source || !fs.existsSync(source)) return { savedPath: null, error: 'FILE_MISSING' }
    if (!folder) return { savedPath: null, error: 'FOLDER_MISSING' }
    try {
      fs.mkdirSync(folder, { recursive: true })
      const ext = path.extname(source) || '.png'
      const stem = String(row?.project_name || 'imagem')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'imagem'
      const promptNo = Math.floor(Number(row?.prompt_position))
      const outputNo = Number(row?.output_index)
      const label =
        Number.isInteger(promptNo) && promptNo > 0
          ? Number.isFinite(outputNo) && outputNo > 0
            ? `${promptNo}-${outputNo + 1}`
            : String(promptNo)
          : Number.isFinite(outputNo)
            ? `${stem} ${outputNo + 1}`
            : stem
      let dest = path.join(folder, `${label}${ext}`)
      let n = 2
      while (fs.existsSync(dest)) {
        dest = path.join(folder, `${label} (${n})${ext}`)
        n += 1
      }
      fs.copyFileSync(source, dest)
      return { savedPath: dest, error: null }
    } catch (error) {
      logger.warn('atlas-flow-v1.download.folder_copy_failed', {
        resultBindingId,
        message: error instanceof Error ? error.message : String(error),
      })
      return { savedPath: null, error: 'FOLDER_COPY_FAILED' }
    }
  },

  async enqueueResultDownload(input: {
    resultBindingId: string
    resolution: string
  }): Promise<Record<string, unknown>> {
    const resolution = String(input?.resolution || '').toLowerCase()
    if (resolution !== '1k' && resolution !== '2k' && resolution !== '4k') {
      return { ok: false, error: 'RESOLUTION_INVALID' }
    }
    const db = getDb()
    const row = db
      .prepare(
        `SELECT rb.flow_media_id AS flow_media_id,
                rb.retrieval_state AS retrieval_state,
                l.flow_project_id AS flow_project_id,
                l.flow_project_url AS flow_project_url
         FROM flow_result_bindings rb
         JOIN flow_attempts a ON a.id = rb.attempt_id
         JOIN flow_project_links l ON l.id = a.project_link_id
         WHERE rb.id = ?`,
      )
      .get(input.resultBindingId) as
      | {
          flow_media_id: string | null
          retrieval_state: string
          flow_project_id: string | null
          flow_project_url: string | null
        }
      | undefined
    if (!row) return { ok: false, error: 'RESULT_NOT_FOUND' }
    if (row.retrieval_state !== 'retrieved') return { ok: false, error: 'RESULT_NOT_RETRIEVED' }
    const flowMediaId = String(row.flow_media_id || '').trim()
    if (!flowMediaId || flowMediaId.startsWith('local:') || flowMediaId.startsWith('_')) {
      const localCopy = this.copyResultIntoProjectFolder(input.resultBindingId)
      if (localCopy.savedPath) {
        return { ok: true, resolution, savedPath: localCopy.savedPath, error: null }
      }
      return { ok: false, error: 'FLOW_MEDIA_MISSING', folderError: localCopy.error, savedPath: null }
    }
    if (!row.flow_project_id) return { ok: false, error: 'PROJECT_NOT_LINKED' }

    const saved = this.copyResultIntoProjectFolder(input.resultBindingId)
    const active = this.getActiveExecutorInstallation()
    const installationId = active.id || 'pending-installation'
    const commandId = randomUUID()
    const t = nowIso()
    const payload = {
      operation: 'result.download',
      resultBindingId: input.resultBindingId,
      flowMediaId,
      flowProjectId: row.flow_project_id,
      flowProjectUrl: row.flow_project_url,
      resolution,
    }
    db.prepare(
      `INSERT INTO flow_commands (
        id, installation_id, attempt_id, operation, schema_version, payload_json,
        idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
        acknowledged_at, result_digest, created_at
      ) VALUES (?, ?, NULL, 'result.download', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
    ).run(
      commandId,
      installationId,
      JSON.stringify(payload),
      `result.download:${input.resultBindingId}:${resolution}:${t}`,
      t,
    )
    db.persist()

    const started = Date.now()
    while (Date.now() - started < 45_000) {
      const snap = this.getCommandSnapshot(commandId)
      if (snap && (snap.status === 'completed' || snap.status === 'failed')) {
        let failureCode: string | null = null
        if (snap.status === 'failed' && snap.resultDigest) {
          try {
            const parsed = JSON.parse(snap.resultDigest) as { error?: string }
            failureCode = parsed.error || 'DOWNLOAD_FAILED'
          } catch {
            failureCode = 'DOWNLOAD_FAILED'
          }
        }
        return {
          ok: snap.status === 'completed',
          commandId,
          resolution,
          savedPath: saved.savedPath,
          folderError: saved.error,
          error: snap.status === 'completed' ? null : failureCode,
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    return { ok: true, pending: true, commandId, resolution, savedPath: saved.savedPath, folderError: saved.error }
  },

  async deleteBenchImage(input: {
    resultBindingId?: string | null
    attemptId?: string | null
    outputIndex?: number | null
  }): Promise<{ ok: boolean; error?: string; flowDeleted?: boolean; flowMissing?: boolean }> {
    const db = getDb()
    const resultBindingId = String(input.resultBindingId || '').trim()
    let attemptId = String(input.attemptId || '').trim()
    let outputIndex =
      input.outputIndex == null || !Number.isFinite(Number(input.outputIndex))
        ? null
        : Math.floor(Number(input.outputIndex))

    let flowMediaId = ''
    let flowProjectId = ''
    let flowProjectUrl: string | null = null
    if (resultBindingId) {
      const row = db
        .prepare(
          `SELECT rb.attempt_id AS attempt_id,
                  rb.output_index AS output_index,
                  rb.flow_media_id AS flow_media_id,
                  l.flow_project_id AS flow_project_id,
                  l.flow_project_url AS flow_project_url
           FROM flow_result_bindings rb
           JOIN flow_attempts a ON a.id = rb.attempt_id
           JOIN flow_project_links l ON l.id = a.project_link_id
           WHERE rb.id = ?`,
        )
        .get(resultBindingId) as
        | {
            attempt_id: string
            output_index: number | null
            flow_media_id: string | null
            flow_project_id: string | null
            flow_project_url: string | null
          }
        | undefined
      if (!row) return { ok: false, error: 'RESULT_NOT_FOUND' }
      attemptId = attemptId || row.attempt_id
      if (outputIndex == null && row.output_index != null) outputIndex = Number(row.output_index)
      flowMediaId = String(row.flow_media_id || '').trim()
      flowProjectId = String(row.flow_project_id || '').trim()
      flowProjectUrl = row.flow_project_url
    }
    if (!resultBindingId && !attemptId) return { ok: false, error: 'NOTHING_TO_DELETE' }

    const mediaOnFlow =
      Boolean(flowMediaId) &&
      flowMediaId !== '_gd' &&
      !flowMediaId.startsWith('_') &&
      !flowMediaId.startsWith('local:') &&
      (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flowMediaId) ||
        /^[a-zA-Z0-9-]{20,}$/.test(flowMediaId))

    let flowDeleted = false
    let flowMissing = false
    if (mediaOnFlow) {
      if (!flowProjectId) return { ok: false, error: 'PROJECT_NOT_LINKED' }
      const active = this.getActiveExecutorInstallation()
      const installationId = active.id || 'pending-installation'
      const commandId = randomUUID()
      const t = nowIso()
      const payload = {
        operation: 'result.delete',
        resultBindingId: resultBindingId || null,
        flowMediaId,
        flowProjectId,
        flowProjectUrl,
      }
      db.prepare(
        `INSERT INTO flow_commands (
          id, installation_id, attempt_id, operation, schema_version, payload_json,
          idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
          acknowledged_at, result_digest, created_at
        ) VALUES (?, ?, NULL, 'result.delete', 1, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL, NULL, ?)`,
      ).run(
        commandId,
        installationId,
        JSON.stringify(payload),
        `result.delete:${resultBindingId || flowMediaId}:${t}`,
        t,
      )
      db.persist()
      const started = Date.now()
      let settled: { status: string; resultDigest: string | null } | null = null
      while (Date.now() - started < 45_000) {
        const snap = this.getCommandSnapshot(commandId)
        if (snap && (snap.status === 'completed' || snap.status === 'failed')) {
          settled = snap
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      if (!settled) return { ok: false, error: 'DELETE_PENDING', flowDeleted: false }
      if (settled.status !== 'completed') {
        let failureCode = 'DELETE_FAILED'
        if (settled.resultDigest) {
          try {
            const parsed = JSON.parse(settled.resultDigest) as { error?: string }
            failureCode = parsed.error || failureCode
          } catch {
            failureCode = 'DELETE_FAILED'
          }
        }
        // A extensão já confirmou o projeto certo aberto e a imagem não existe mais nele
        // (o usuário excluiu direto no Flow). Remove só da bancada do Atlas.
        if (failureCode === 'IMAGE_NOT_ON_PAGE') {
          flowMissing = true
        } else {
          return { ok: false, error: failureCode, flowDeleted: false }
        }
      } else {
        flowDeleted = true
      }
    }

    const hiddenAt = nowIso()
    if (resultBindingId) {
      db.prepare(
        `UPDATE flow_result_bindings
         SET retrieval_state = 'deleted', error_code = 'DELETED_BY_USER'
         WHERE id = ?`,
      ).run(resultBindingId)
    }
    if (attemptId && outputIndex != null) {
      db.prepare(
        `INSERT INTO flow_hidden_outputs (attempt_id, output_index, hidden_at)
         VALUES (?, ?, ?)
         ON CONFLICT(attempt_id, output_index) DO UPDATE SET hidden_at = excluded.hidden_at`,
      ).run(attemptId, outputIndex, hiddenAt)
    }
    db.persist()
    emitBenchUpdate({
      kind: 'result_staged',
      attemptId: attemptId || null,
      sequence: Date.now(),
      observedAt: hiddenAt,
      resultBindingId: resultBindingId || null,
    })
    return { ok: true, flowDeleted, flowMissing }
  },

  getCommandSnapshot(commandId: string): { status: string; resultDigest: string | null } | null {
    const row = getDb()
      .prepare(`SELECT status, result_digest FROM flow_commands WHERE id = ?`)
      .get(commandId) as { status: string; result_digest: string | null } | undefined
    if (!row) return null
    return { status: row.status, resultDigest: row.result_digest }
  },

  cancelQueuedCommand(commandId: string, reason: string): boolean {
    const db = getDb()
    const current = db
      .prepare(`SELECT status FROM flow_commands WHERE id = ?`)
      .get(commandId) as { status: string } | undefined
    if (current?.status !== 'queued') return false
    db.prepare(
      `UPDATE flow_commands
       SET status = 'failed', result_digest = ?, acknowledged_at = ?
       WHERE id = ? AND status = 'queued'`,
    ).run(JSON.stringify({ outcome: 'canceled', error: reason }), nowIso(), commandId)
    db.persist()
    return true
  },

  archiveFlowProject(atlasProjectId: string): void {
    const db = getDb()
    const t = nowIso()
    db.prepare(
      `UPDATE flow_project_links
       SET archived_at = ?, link_state = 'archived', revision = revision + 1
       WHERE atlas_project_id = ? AND archived_at IS NULL`,
    ).run(t, atlasProjectId)
    db.prepare(
      `UPDATE flow_prompts
       SET archived_at = COALESCE(archived_at, ?)
       WHERE atlas_project_id = ? AND archived_at IS NULL`,
    ).run(t, atlasProjectId)
    db.prepare(
      `UPDATE flow_references
       SET archived_at = COALESCE(archived_at, ?)
       WHERE atlas_project_id = ? AND archived_at IS NULL`,
    ).run(t, atlasProjectId)
    db.persist()
  },
}
