import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../db/database'
import { migrateSchema } from '../../db/migrations'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js') as typeof import('sql.js')

let mockDb: AppDatabase

vi.mock('../../db/database', () => ({
  getDb: () => mockDb,
}))

vi.mock('../logging/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('./atlasFlowReferenceStore', () => ({
  atlasFlowReferenceStore: {
    listByAtlasProject: () => [
      {
        referenceId: 'ref-cantor',
        versionId: 'ver-cantor',
        atlasProjectId: 'proj-test',
        displayName: 'cantor',
        mimeType: 'image/png',
        byteSize: 10000,
        sha256: 'aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000',
        absPath: '',
        stagedAt: '2026-11-15T00:00:00.000Z',
        uploadState: 'uploaded_bound',
        bindingState: 'bound',
        attachedState: 'attached',
        flowMediaId: '11111111-1111-4111-8111-111111111111',
      },
    ],
    archiveReference: () => ({ ok: true }),
  },
}))

const BASE_SCHEMA = `
  CREATE TABLE niches (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, default_language TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', skill_path TEXT NOT NULL, memory_path TEXT NOT NULL,
    thumbnail TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE scripts (
    id TEXT PRIMARY KEY, niche_id TEXT NOT NULL, title TEXT NOT NULL, topic TEXT NOT NULL,
    language TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
    folder_path TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE channels (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    avatar_path TEXT NOT NULL DEFAULT '', niche_id TEXT, youtube_url TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#35e58b', active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE channel_videos (
    id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    thumbnail_path TEXT NOT NULL DEFAULT '', scheduled_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planejado', script_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE music_tracks (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, original_path TEXT NOT NULL, preview_path TEXT NOT NULL,
    duration REAL NOT NULL DEFAULT 0, cut_mode TEXT NOT NULL DEFAULT 'automatico',
    cuts_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    project_type TEXT NOT NULL DEFAULT 'music', folder_path TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`

async function buildMemoryDb(): Promise<AppDatabase> {
  const SQL = await initSqlJs({
    locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
  })
  const raw = new SQL.Database()
  raw.run(BASE_SCHEMA)
  const db: AppDatabase = {
    exec(sql: string) {
      raw.run(sql)
    },
    prepare(sql: string) {
      return {
        run(...params: unknown[]) {
          raw.run(sql, params as never[])
        },
        get(...params: unknown[]) {
          const stmt = raw.prepare(sql)
          stmt.bind(params as never[])
          const row = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : undefined
          stmt.free()
          return row
        },
        all(...params: unknown[]) {
          const stmt = raw.prepare(sql)
          stmt.bind(params as never[])
          const rows: Record<string, unknown>[] = []
          while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>)
          stmt.free()
          return rows
        },
      }
    },
    persist() {},
  }
  migrateSchema(db)
  return db
}

describe('FlowJobService — Identidade, Persistência Idempotente e Separação de Histórico', () => {
  let tmpDir: string

  beforeEach(async () => {
    mockDb = await buildMemoryDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-flow-identity-'))
    const now = '2026-11-15T10:00:00.000Z'
    mockDb
      .prepare(
        `INSERT INTO projects (id, name, project_type, created_at, updated_at)
         VALUES ('proj-test', 'Projeto Teste', 'music', ?, ?)`,
      )
      .run(now, now)
    mockDb
      .prepare(
        `INSERT INTO flow_project_links (
          id, atlas_project_id, principal_id, flow_origin, flow_project_id, flow_project_url, link_state,
          requested_title, observed_title, last_verified_at, revision
        ) VALUES ('link-test', 'proj-test', 'p-test', 'https://flow.google.com', 'flow-proj-123', 'https://flow.google.com/project/flow-proj-123',
                  'linked', 'Teste', 'Teste', ?, 1)`,
      )
      .run(now)
  })

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('rejeita resultados antigos já presentes no projeto e preserva o histórico da praia separado da linha ativa do navio', async () => {
    const { flowJobService } = await import('./FlowJobService')
    const beachFile = path.join(tmpDir, 'beach-1.webp')
    const shipFile = path.join(tmpDir, 'ship-1.jpg')
    fs.writeFileSync(beachFile, Buffer.alloc(90_000, 1))
    fs.writeFileSync(shipFile, Buffer.alloc(120_000, 2))

    const beachSha = '69cc1e0771e034687bc6b2dc3413eef7457f31a32fe9e9468442a3392a70feee'
    const shipSha = 'bdeb977be3176cb4c1c089ae16e2e71c62993a3ede768ce1b34073729fc2dfc2'

    // 1. Linha da praia gera e arquiva no histórico
    const beachPromptId = flowJobService.createPromptLine(
      'proj-test',
      '[cantor] cantando na praia',
      ['ref-cantor'],
    )
    const beachGen = flowJobService.enqueueGenerate(beachPromptId)
    expect(beachGen.ok).toBe(true)
    const beachAttemptId = beachGen.attemptId!

    const stagedBeach = flowJobService.stageResultForAttempt({
      attemptId: beachAttemptId,
      absPath: beachFile,
      mimeType: 'image/webp',
      byteSize: 90_000,
      sha256: beachSha,
      width: 1376,
      height: 768,
      flowMediaId: 'aaaa1111-1111-4111-8111-111111111111',
      originProof: 'rpc_response',
      automaticCorrelation: true,
    })
    expect(stagedBeach.ok).toBe(true)
    flowJobService.completeCommand({
      commandId: beachGen.commandId!,
      installationId: 'inst-1',
      ok: true,
      attemptState: 'completed',
      submissionCertainty: 'accepted',
      retrievedCount: 1,
    })
    flowJobService.archivePromptLine(beachPromptId)

    // 2. Nova linha do navio dispara tentativa: payload já traz excludeShas e excludeMediaIds da praia
    const shipPromptId = flowJobService.createPromptLine(
      'proj-test',
      '[cantor] cantando no meio do mar em um navio luxoso e gospel, foco em lipsync',
      ['ref-cantor'],
    )
    const shipGen = flowJobService.enqueueGenerate(shipPromptId)
    expect(shipGen.ok).toBe(true)
    const shipAttemptId = shipGen.attemptId!
    expect(flowJobService.listKnownResultShasForAtlasProject('proj-test')).toContain(beachSha)
    expect(flowJobService.listKnownResultMediaIdsForAtlasProject('proj-test')).toContain(
      'aaaa1111-1111-4111-8111-111111111111',
    )

    // Tentativa de estagiar a imagem antiga da praia na tentativa do navio é BLOQUEADA no precheck e no stage!
    const preBeachOnShip = flowJobService.precheckResultStage({
      attemptId: shipAttemptId,
      sha256: beachSha,
      flowMediaId: 'aaaa1111-1111-4111-8111-111111111111',
    })
    expect(preBeachOnShip.ok).toBe(false)

    const rejectBeachOnShip = flowJobService.stageResultForAttempt({
      attemptId: shipAttemptId,
      absPath: beachFile,
      mimeType: 'image/webp',
      byteSize: 90_000,
      sha256: beachSha,
      width: 1376,
      height: 768,
    })
    expect(rejectBeachOnShip.ok).toBe(false)
    expect(rejectBeachOnShip.error).toBe('RESULT_SHA_ALREADY_BOUND')
    expect(rejectBeachOnShip.existingAttemptId).toBe(beachAttemptId)

    // Estagia o output legítimo do navio (e repete ingestão para testar idempotência)
    const stagedShip1 = flowJobService.stageResultForAttempt({
      attemptId: shipAttemptId,
      absPath: shipFile,
      mimeType: 'image/jpeg',
      byteSize: 120_000,
      sha256: shipSha,
      width: 1376,
      height: 768,
      flowMediaId: 'bbbb2222-2222-4222-8222-222222222222',
      originProof: 'tracked_progress_slot',
      automaticCorrelation: true,
    })
    expect(stagedShip1.ok).toBe(true)
    expect(stagedShip1.idempotent).toBe(false)
    expect(stagedShip1.outputIndex).toBe(0)

    const stagedShipRepeat = flowJobService.stageResultForAttempt({
      attemptId: shipAttemptId,
      absPath: path.join(tmpDir, 'duplicate-never-used.jpg'),
      mimeType: 'image/jpeg',
      byteSize: 120_000,
      sha256: shipSha,
      width: 1376,
      height: 768,
      flowMediaId: 'bbbb2222-2222-4222-8222-222222222222',
      outputIndex: 5, // reingestão não desloca output_index!
    })
    expect(stagedShipRepeat.ok).toBe(true)
    expect(stagedShipRepeat.idempotent).toBe(true)
    expect(stagedShipRepeat.resultBindingId).toBe(stagedShip1.resultBindingId)
    expect(stagedShipRepeat.outputIndex).toBe(0)
    expect(stagedShipRepeat.absPath).toBe(shipFile)

    flowJobService.completeCommand({
      commandId: shipGen.commandId!,
      installationId: 'inst-1',
      ok: true,
      attemptState: 'completed',
      submissionCertainty: 'accepted',
      retrievedCount: 1,
      detail: { automaticCorrelation: true },
    })

    // Verifica snapshot da bancada: linha do navio exibe APENAS navio, e praia está em archivedHistory!
    const snap = flowJobService.getBenchSnapshot({
      atlasProjectId: 'proj-test',
      coordinator: {
        running: true,
        port: 39301,
        extensionConnected: true,
        lastExtensionSeenAt: Date.now(),
        lastInstallationId: 'inst-1',
      },
    })
    expect(snap.prompts).toHaveLength(1)
    expect(snap.prompts[0]!.promptId).toBe(shipPromptId)
    expect(snap.prompts[0]!.results.map((r) => r.sha256)).toEqual([shipSha])
    expect(snap.archivedHistory).toHaveLength(1)
    expect(snap.archivedHistory[0]!.promptId).toBe(beachPromptId)
    expect(snap.archivedHistory[0]!.results.map((r) => r.sha256)).toEqual([beachSha])
  })

  it('isola duas tentativas com o MESMO prompt e conclusão FORA DE ORDEM (B termina antes de A)', async () => {
    const { flowJobService } = await import('./FlowJobService')
    const samePrompt =
      '[cantor] cantando no meio do mar em um navio luxoso e gospel, foco em lipsync'

    const lineA = flowJobService.createPromptLine('proj-test', samePrompt, ['ref-cantor'])
    const lineB = flowJobService.createPromptLine('proj-test', samePrompt, ['ref-cantor'])

    const fileA = path.join(tmpDir, 'out-A.jpg')
    const fileB = path.join(tmpDir, 'out-B.jpg')
    fs.writeFileSync(fileA, Buffer.alloc(100_000, 0xaa))
    fs.writeFileSync(fileB, Buffer.alloc(100_000, 0xbb))
    const shaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const shaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const mediaA = 'aaaa0000-1111-4111-8111-aaaaaaaaaaaa'
    const mediaB = 'bbbb0000-2222-4222-8222-bbbbbbbbbbbb'

    // A inicia primeiro, B inicia depois com o MESMO prompt
    const genA = flowJobService.enqueueGenerate(lineA)
    const genB = flowJobService.enqueueGenerate(lineB)
    expect(genA.ok && genB.ok).toBe(true)

    // B conclui PRIMEIRO (fora de ordem!)
    const stageB = flowJobService.stageResultForAttempt({
      attemptId: genB.attemptId!,
      absPath: fileB,
      mimeType: 'image/jpeg',
      byteSize: 100_000,
      sha256: shaB,
      width: 1376,
      height: 768,
      flowMediaId: mediaB,
      originProof: 'rpc_response',
      automaticCorrelation: true,
    })
    expect(stageB.ok).toBe(true)
    flowJobService.completeCommand({
      commandId: genB.commandId!,
      installationId: 'inst-1',
      ok: true,
      attemptState: 'completed',
      submissionCertainty: 'accepted',
      retrievedCount: 1,
    })

    // A tenta capturar acidentalmente o output já concluído de B (por SHA ou por flowMediaId) → REJEITADO!
    expect(
      flowJobService.stageResultForAttempt({
        attemptId: genA.attemptId!,
        absPath: fileB,
        mimeType: 'image/jpeg',
        byteSize: 100_000,
        sha256: shaB,
        flowMediaId: mediaB,
      }).ok,
    ).toBe(false)

    expect(
      flowJobService.precheckResultStage({
        attemptId: genA.attemptId!,
        sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        flowMediaId: mediaB,
      }).error,
    ).toBe('RESULT_MEDIA_ID_ALREADY_BOUND')

    // A conclui DEPOIS com seu próprio output correlacionado (shaA / mediaA) → ACEITO em A!
    const stageA = flowJobService.stageResultForAttempt({
      attemptId: genA.attemptId!,
      absPath: fileA,
      mimeType: 'image/jpeg',
      byteSize: 100_000,
      sha256: shaA,
      width: 1376,
      height: 768,
      flowMediaId: mediaA,
      originProof: 'tracked_progress_slot',
      automaticCorrelation: true,
    })
    expect(stageA.ok).toBe(true)
    flowJobService.completeCommand({
      commandId: genA.commandId!,
      installationId: 'inst-1',
      ok: true,
      attemptState: 'completed',
      submissionCertainty: 'accepted',
      retrievedCount: 1,
    })

    const snap = flowJobService.getBenchSnapshot({
      atlasProjectId: 'proj-test',
      coordinator: {
        running: true,
        port: 39301,
        extensionConnected: true,
        lastExtensionSeenAt: Date.now(),
        lastInstallationId: 'inst-1',
      },
    })
    const promptA = snap.prompts.find((p) => p.promptId === lineA)!
    const promptB = snap.prompts.find((p) => p.promptId === lineB)!
    expect(promptA.results.map((r) => r.sha256)).toEqual([shaA])
    expect(promptA.results[0]!.flowMediaId).toBe(mediaA)
    expect(promptB.results.map((r) => r.sha256)).toEqual([shaB])
    expect(promptB.results[0]!.flowMediaId).toBe(mediaB)
  })
})
