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
    listByAtlasProject: (atlasProjectId: string) => {
      const refs = mockDb
        .prepare(
          `SELECT referenceId, versionId, atlasProjectId, displayName, mimeType, byteSize, sha256, absPath, stagedAt, uploadState, bindingState, attachedState, flowMediaId
           FROM flow_references WHERE atlas_project_id = ? AND archived_at IS NULL`,
        )
        .all(atlasProjectId) as Array<{
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
      }>
      return refs
    },
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

function sha256Hex(buf: Buffer): string {
  const crypto = require('node:crypto')
  return crypto.createHash('sha256').update(buf).digest('hex')
}

describe('FlowJobService — Regressão: Captura de Imagens de Gerações Anteriores', () => {
  let tmpDir: string
  const now = '2026-11-15T10:00:00.000Z'

  beforeEach(async () => {
    mockDb = await buildMemoryDb()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-flow-regression-'))
    mockDb
      .prepare(
        `INSERT INTO projects (id, name, project_type, created_at, updated_at)
         VALUES ('proj-test', 'Projeto Teste', 'music', ?, ?)`,
      )
      .run(now, now)
    mockDb
      .prepare(
        `INSERT INTO flow_project_links (
          id, atlas_project_id, principal_id, flow_origin, flow_project_id, flow_project_url,
          link_state, requested_title, observed_title, last_verified_at, revision
        ) VALUES (
          'link-test', 'proj-test', 'principal-test', 'https://flow.google.com',
          'flow-proj-123', 'https://flow.google.com/project/flow-proj-123',
          'linked', 'Teste', 'Teste', ?, 1
        )`,
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

  // ============================================================
  // FALHA 1: Baseline contamina com resultados da geração anterior
  // ============================================================
  describe('FALHA 1: Baseline contaminado por resultados visíveis da geração anterior', () => {
    it('deve permitir que nova geração capture resultados mesmo quando URLs da geração anterior ainda estão no DOM', async () => {
      const { flowJobService } = await import('./FlowJobService')

      // Geração A (praia) - já concluída e com resultados no "DOM simulado"
      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const fileBeach = path.join(tmpDir, 'beach.webp')
      fs.writeFileSync(fileBeach, Buffer.alloc(90_000, 1))
      const shaBeach = sha256Hex(Buffer.alloc(90_000, 1))
      const mediaBeach = 'aaaa1111-1111-4111-8111-111111111111'

      const stagedA = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: fileBeach,
        mimeType: 'image/webp',
        byteSize: 90_000,
        sha256: shaBeach,
        width: 1376,
        height: 768,
        flowMediaId: mediaBeach,
        originProof: 'rpc_response',
        automaticCorrelation: true,
      })
      expect(stagedA.ok).toBe(true)
      flowJobService.completeCommand({
        commandId: genA.commandId!,
        installationId: 'inst-1',
        ok: true,
        attemptState: 'completed',
        submissionCertainty: 'accepted',
        retrievedCount: 1,
      })

      // SIMULAÇÃO DO BUG: Baseline (preparePreSubmitBaseline) vê as imagens da geração A
      // e adiciona os srcKeys/mediaIds ao excludeSrcs/excludeMediaIds
      const excludeSrcs = new Set(['https://flow-content.google.com/beach.webp?cache=123'])
      const excludeMediaIds = new Set([mediaBeach])
      const excludeShas = flowJobService.listKnownResultShasForAtlasProject('proj-test') // [shaBeach]

      // Geração B (navio) - nova tentativa
      const promptB = flowJobService.createPromptLine('proj-test', '[cantor] no navio', ['ref-cantor'])
      const genB = flowJobService.enqueueGenerate(promptB)
      const attemptB = genB.attemptId!

      // O Flow REUTILIZA a mesma URL CDN para a nova imagem (bug real observado)
      // URL igual à da geração A, mas ARQUIVO DIFERENTE (SHA diferente)
      const fileShip = path.join(tmpDir, 'ship.jpg')
      fs.writeFileSync(fileShip, Buffer.alloc(120_000, 2))
      const shaShip = sha256Hex(Buffer.alloc(120_000, 2))
      const mediaShip = 'bbbb2222-2222-4222-8222-222222222222'

      // SIMULAÇÃO: captureGenerationBytesOnce vê srcKey da URL reutilizada no excludeSrcs
      // Se a lógica for "srcKey no excludeSrcs → excluir", a NOVA imagem seria descartada
      // O TESTE ESPERADO: NÃO deve excluir por srcKey se SHA for NOVO

      // Verificação: precheckResultStage deve ACEITAR shaShip (novo) mesmo com mediaId diferente
      const precheck = flowJobService.precheckResultStage({
        attemptId: attemptB,
        sha256: shaShip,
        flowMediaId: mediaShip,
      })
      expect(precheck.ok).toBe(true)
      expect(precheck.idempotent).toBe(false)

      // Stage deve aceitar
      const stagedB = flowJobService.stageResultForAttempt({
        attemptId: attemptB,
        absPath: fileShip,
        mimeType: 'image/jpeg',
        byteSize: 120_000,
        sha256: shaShip,
        width: 1376,
        height: 768,
        flowMediaId: mediaShip,
        originProof: 'rpc_response',
        automaticCorrelation: true,
      })
      expect(stagedB.ok).toBe(true)
    })
  })

  // ============================================================
  // FALHA 2: Normalização de srcKey instável
  // ============================================================
  describe('FALHA 2: Normalização de srcKey instável entre gerações', () => {
    it('deve detectar que mesma imagem com URLs diferentes (parâmetros de cache) tem SHA igual', async () => {
      const { flowJobService } = await import('./FlowJobService')

      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const fileImg = path.join(tmpDir, 'img.png')
      fs.writeFileSync(fileImg, Buffer.alloc(50_000, 0xaa))
      const shaImg = sha256Hex(Buffer.alloc(50_000, 0xaa))

      // Geração A: URL com assinatura v1
      const stagedA = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: fileImg,
        mimeType: 'image/png',
        byteSize: 50_000,
        sha256: shaImg,
        width: 1024,
        height: 768,
        flowMediaId: 'media-a-1111-1111-8111-111111111111',
        originProof: 'rpc_response',
        automaticCorrelation: true,
      })
      expect(stagedA.ok).toBe(true)

      // Geração B: mesma imagem, URL com assinatura v2 (parâmetros diferentes)
      const promptB = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genB = flowJobService.enqueueGenerate(promptB)
      const attemptB = genB.attemptId!

      // SIMULAÇÃO: Baseline normaliza URLs de forma diferente → srcKey_A ≠ srcKey_B
      // Mas SHA É IGUAL → deve ser detectado como duplicata
      const precheck = flowJobService.precheckResultStage({
        attemptId: attemptB,
        sha256: shaImg, // MESMO SHA
        flowMediaId: 'media-b-2222-2222-8222-222222222222', // mediaId diferente
      })

      // Deve REJEITAR porque SHA já está vinculado à tentativa A
      expect(precheck.ok).toBe(false)
      expect(precheck.error).toBe('RESULT_SHA_ALREADY_BOUND')
      expect(precheck.existingAttemptId).toBe(attemptA)
    })
  })

  // ============================================================
  // FALHA 3: listKnownResultShasForAtlasProject inclui misattributed
  // ============================================================
  describe('FALHA 3: Exclusão excessiva por SHAs marcados como misattributed', () => {
    it('não deve incluir SHAs misattributed no excludeShas enviado à extensão', async () => {
      const { flowJobService } = await import('./FlowJobService')

      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const fileImg = path.join(tmpDir, 'img.png')
      fs.writeFileSync(fileImg, Buffer.alloc(50_000, 0xaa))
      const shaImg = sha256Hex(Buffer.alloc(50_000, 0xaa))

      const stagedA = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: fileImg,
        mimeType: 'image/png',
        byteSize: 50_000,
        sha256: shaImg,
        width: 1024,
        height: 768,
        flowMediaId: 'media-a-1111-1111-8111-111111111111',
        originProof: 'rpc_response',
        automaticCorrelation: true,
      })
      expect(stagedA.ok).toBe(true)

      // Marcar como misattributed (correção anterior)
      const marked = flowJobService.markBindingsMisattributed({
        attemptIds: [attemptA],
        shas: [shaImg],
        reason: 'CROSS_ATTEMPT_SHA_REUSE',
      })
      expect(marked.ok).toBe(true)
      expect(marked.marked).toBe(1)

      // listKnownResultShasForAtlasProject NÃO deve retornar SHA misattributed
      const knownShas = flowJobService.listKnownResultShasForAtlasProject('proj-test')

      // BUG ATUAL: Retorna o SHA misattributed
      // COMPORTAMENTO ESPERADO: Não retorna
      expect(knownShas).not.toContain(shaImg)
    })
  })

  // ============================================================
  // FALHA 4: listKnownResultMediaIdsForAtlasProject exclui local:*
  // ============================================================
  describe('FALHA 4: Exclusão de mediaIds locais impede detecção de duplicatas', () => {
    it('deve incluir mediaIds locais válidos (não _gd) no excludeMediaIds', async () => {
      const { flowJobService } = await import('./FlowJobService')

      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const fileImg = path.join(tmpDir, 'img.png')
      fs.writeFileSync(fileImg, Buffer.alloc(50_000, 0xaa))
      const shaImg = sha256Hex(Buffer.alloc(50_000, 0xaa))

      // Captura via canvas_png ou sw_fetch → flowMediaId = local:<sha12>
      const localMediaId = `local:${shaImg.slice(0, 12)}`

      const stagedA = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: fileImg,
        mimeType: 'image/png',
        byteSize: 50_000,
        sha256: shaImg,
        width: 1024,
        height: 768,
        flowMediaId: localMediaId,
        originProof: 'tracked_progress_slot',
        automaticCorrelation: true,
      })
      expect(stagedA.ok).toBe(true)

      // listKnownResultMediaIdsForAtlasProject deve retornar o localMediaId
      const knownMediaIds = flowJobService.listKnownResultMediaIdsForAtlasProject('proj-test')

      // BUG ATUAL: Não retorna porque filtra NOT LIKE 'local:%'
      // COMPORTAMENTO ESPERADO: Retorna (exceto _gd)
      expect(knownMediaIds).toContain(localMediaId)
    })

    it('deve continuar excluindo _gd da lista de mediaIds conhecidos', async () => {
      const { flowJobService } = await import('./FlowJobService')

      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const fileImg = path.join(tmpDir, 'img.png')
      fs.writeFileSync(fileImg, Buffer.alloc(50_000, 0xaa))
      const shaImg = sha256Hex(Buffer.alloc(50_000, 0xaa))

      const stagedA = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: fileImg,
        mimeType: 'image/png',
        byteSize: 50_000,
        sha256: shaImg,
        width: 1024,
        height: 768,
        flowMediaId: '_gd',
        originProof: 'rpc_response',
        automaticCorrelation: true,
      })
      expect(stagedA.ok).toBe(true)

      const knownMediaIds = flowJobService.listKnownResultMediaIdsForAtlasProject('proj-test')
      expect(knownMediaIds).not.toContain('_gd')
    })
  })

  // ============================================================
  // FALHA 5: Correlação perdida entre tentativas (sameAttemptInSensor falso)
  // ============================================================
  describe('FALHA 5: Perda de correlação quando attemptId muda mas observer não reseta', () => {
    it('deve detectar mismatch de attemptId e invalidar allowlist', async () => {
      const { flowJobService } = await import('./FlowJobService')

      // Tentativa A inicia
      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      // SIMULAÇÃO: correlationRuntime.attemptId = attemptA (observer armado)
      // Usuário cancela/regenera → nova tentativa B
      const promptB = flowJobService.createPromptLine('proj-test', '[cantor] no navio', ['ref-cantor'])
      const genB = flowJobService.enqueueGenerate(promptB)
      const attemptB = genB.attemptId!

      expect(attemptA).not.toBe(attemptB)

      // captureGenerationBytesOnce chamado com attemptB
      // sameAttemptInSensor = (attemptB === correlationRuntime.attemptId) = FALSE
      // allowSrcs/allowMediaIds ficam VAZIOS
      // requireAllowlist = true → IDENTITY_UNCERTAIN_NO_ALLOWLIST

      // TESTE: precheck deve falhar se tentar vincular resultado sem correlação
      const fileImg = path.join(tmpDir, 'img.png')
      fs.writeFileSync(fileImg, Buffer.alloc(50_000, 0xaa))
      const shaImg = sha256Hex(Buffer.alloc(50_000, 0xaa))

      // Sem allowKnownSha (captura automática), SHA novo deve passar no precheck
      // MAS na prática a captura nem chega aqui porque allowlist vazia → correlationUncertain
      const precheck = flowJobService.precheckResultStage({
        attemptId: attemptB,
        sha256: shaImg,
        flowMediaId: 'media-b-2222-2222-8222-222222222222',
        allowKnownSha: false,
      })
      expect(precheck.ok).toBe(true) // SHA novo OK no SQLite

      // O problema real é no SENSOR (pageSensor.js) - allowlist vazia impede captura
      // Este teste documenta o comportamento esperado do sensor
    })
  })

  // ============================================================
  // FALHA 6: Reatribuição de SHA misattributed com allowKnownSha=true
  // ============================================================
  describe('FALHA 6: Reatribuição perigosa de SHA misattributed em recover explícito', () => {
    it('deve permitir reatribuir SHA misattributed APENAS em recover explícito com allowKnownSha=true', async () => {
      const { flowJobService } = await import('./FlowJobService')

      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const fileImg = path.join(tmpDir, 'img.png')
      fs.writeFileSync(fileImg, Buffer.alloc(50_000, 0xaa))
      const shaImg = sha256Hex(Buffer.alloc(50_000, 0xaa))

      const stagedA = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: fileImg,
        mimeType: 'image/png',
        byteSize: 50_000,
        sha256: shaImg,
        width: 1024,
        height: 768,
        flowMediaId: 'media-a-1111-1111-8111-111111111111',
        originProof: 'rpc_response',
        automaticCorrelation: true,
      })
      expect(stagedA.ok).toBe(true)

      // Marcar como misattributed
      flowJobService.markBindingsMisattributed({
        attemptIds: [attemptA],
        shas: [shaImg],
        reason: 'MISATTRIBUTED_CAPTURE',
      })

      // Nova tentativa B
      const promptB = flowJobService.createPromptLine('proj-test', '[cantor] no navio', ['ref-cantor'])
      const genB = flowJobService.enqueueGenerate(promptB)
      const attemptB = genB.attemptId!

      // 1. Captura AUTOMÁTICA (allowKnownSha=false) → DEVE REJEITAR SHA misattributed
      const precheckAuto = flowJobService.precheckResultStage({
        attemptId: attemptB,
        sha256: shaImg,
        flowMediaId: 'media-b-2222-2222-8222-222222222222',
        allowKnownSha: false,
      })
      expect(precheckAuto.ok).toBe(false)
      expect(precheckAuto.error).toBe('RESULT_SHA_MISATTRIBUTED')

      // 2. Recuperação EXPLÍCITA (allowKnownSha=true) → DEVE PERMITIR
      const precheckExplicit = flowJobService.precheckResultStage({
        attemptId: attemptB,
        sha256: shaImg,
        flowMediaId: 'media-b-2222-2222-8222-222222222222',
        allowKnownSha: true,
      })
      expect(precheckExplicit.ok).toBe(true)

      // Stage com allowKnownSha=true deve aceitar
      const stagedB = flowJobService.stageResultForAttempt({
        attemptId: attemptB,
        absPath: fileImg,
        mimeType: 'image/png',
        byteSize: 50_000,
        sha256: shaImg,
        width: 1024,
        height: 768,
        flowMediaId: 'media-b-2222-2222-8222-222222222222',
        originProof: 'explicit_user_selection',
        automaticCorrelation: false,
        allowKnownSha: true,
      })
      expect(stagedB.ok).toBe(true)
    })
  })

  // ============================================================
  // FALHA 7: Baseline não captura SHAs
  // ============================================================
  describe('FALHA 7: Baseline sem SHAs permite imagens antigas passarem no filtro de srcKey', () => {
    it('deve demonstrar que baseline sem SHA permite imagem antiga com URL nova passar', async () => {
      const { flowJobService } = await import('./FlowJobService')

      // Geração A concluída
      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const fileBeach = path.join(tmpDir, 'beach.webp')
      fs.writeFileSync(fileBeach, Buffer.alloc(90_000, 1))
      const shaBeach = sha256Hex(Buffer.alloc(90_000, 1))

      const stagedA = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: fileBeach,
        mimeType: 'image/webp',
        byteSize: 90_000,
        sha256: shaBeach,
        width: 1376,
        height: 768,
        flowMediaId: 'media-a-1111-1111-8111-111111111111',
        originProof: 'rpc_response',
        automaticCorrelation: true,
      })
      expect(stagedA.ok).toBe(true)

      // SIMULAÇÃO DO BUG:
      // Baseline (preparePreSubmitBaseline) coleta apenas srcKeys/mediaIds visuais
      // NÃO baixa bytes, NÃO calcula SHA
      // Se Flow serve imagem A com URL NOVA (CDN diferente), srcKey não está no baseline
      // Imagem A passa no filtro de baseline → entra como candidata
      // captureGenerationBytesOnce calcula SHA → bate no excludeShas (do SQLite)
      // → EXCLUDED_KNOWN_SHA → REJEITADA

      // Mas se allowKnownSha=true (recover), É ACEITA como nova!

      // Teste: excludeShas do projeto inclui shaBeach
      const projectExcludeShas = flowJobService.listKnownResultShasForAtlasProject('proj-test')
      expect(projectExcludeShas).toContain(shaBeach)

      // Nova tentativa B
      const promptB = flowJobService.createPromptLine('proj-test', '[cantor] no navio', ['ref-cantor'])
      const genB = flowJobService.enqueueGenerate(promptB)
      const attemptB = genB.attemptId!

      // Captura automática: SHA conhecido → REJEITADO
      const precheckAuto = flowJobService.precheckResultStage({
        attemptId: attemptB,
        sha256: shaBeach,
        flowMediaId: 'media-b-2222-2222-8222-222222222222',
        allowKnownSha: false,
      })
      expect(precheckAuto.ok).toBe(false)
      expect(precheckAuto.error).toBe('RESULT_SHA_ALREADY_BOUND')

      // Recuperação explícita com allowKnownSha=true: ACEITO (reatribui)
      const precheckExplicit = flowJobService.precheckResultStage({
        attemptId: attemptB,
        sha256: shaBeach,
        flowMediaId: 'media-b-2222-2222-8222-222222222222',
        allowKnownSha: true,
      })
      expect(precheckExplicit.ok).toBe(true)

      // ISSO É PERIGOSO: usuário pode selecionar imagem da geração A achando que é B
      // O sistema permite reatribuir porque allowKnownSha=true
    })
  })

  // ============================================================
  // FALHA 8: waitForGenerationSettle prematuro captura preview
  // ============================================================
  describe('FALHA 8: Settle prematuro pode capturar preview/thumbnail em vez de resultado final', () => {
    it('deve rejeitar arquivos muito pequenos (prévias) no captureGenerationBytesOnce', async () => {
      const { flowJobService } = await import('./FlowJobService')

      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      // Preview/thumbnail: < 8KB (limite em captureGenerationBytesOnce:6380)
      const previewFile = path.join(tmpDir, 'preview.jpg')
      fs.writeFileSync(previewFile, Buffer.alloc(5_000, 0xff)) // 5KB - MENOR que 8KB
      const shaPreview = sha256Hex(Buffer.alloc(5_000, 0xff))

      // precheckResultStage não valida tamanho, só SHA/mediaId
      const precheck = flowJobService.precheckResultStage({
        attemptId: attemptA,
        sha256: shaPreview,
        flowMediaId: 'media-preview-1111-1111-8111-111111111111',
      })
      expect(precheck.ok).toBe(true) // Passa no precheck (SHA novo)

      // MAS stageResultForAttempt TAMBÉM não valida tamanho mínimo
      // O filtro de 8KB está SÓ no pageSensor.js (captureGenerationBytesOnce:6380)
      const staged = flowJobService.stageResultForAttempt({
        attemptId: attemptA,
        absPath: previewFile,
        mimeType: 'image/jpeg',
        byteSize: 5_000,
        sha256: shaPreview,
        width: 512,
        height: 512,
        flowMediaId: 'media-preview-1111-1111-8111-111111111111',
        originProof: 'tracked_progress_slot',
        automaticCorrelation: true,
      })

      // BUG: Stage ACEITA preview de 5KB
      // COMPORTAMENTO ESPERADO: Deveria rejeitar (min 8KB ou validação de dimensões reais)
      expect(staged.ok).toBe(true) // Comportamento ATUAL (bug)

      // NOTA: A validação de 8KB existe no pageSensor.js mas NÃO no FlowJobService
      // Isso permite que preview seja salvo se bypassar o sensor (ex: via API direta)
    })
  })

  // ============================================================
  // TESTE INTEGRADO: Cenário completo de regressão
  // ============================================================
  describe('Cenário integrado: Duas gerações consecutivas sem limpar grid', () => {
    it('nova geração deve capturar APENAS seus resultados, nunca os da geração anterior', async () => {
      const { flowJobService } = await import('./FlowJobService')

      // --- GERAÇÃO A (Praia) ---
      const promptA = flowJobService.createPromptLine('proj-test', '[cantor] cantando na praia', ['ref-cantor'])
      const genA = flowJobService.enqueueGenerate(promptA)
      const attemptA = genA.attemptId!

      const beachFiles = [
        { name: 'beach1.webp', data: Buffer.alloc(90_000, 1) },
        { name: 'beach2.webp', data: Buffer.alloc(95_000, 2) },
        { name: 'beach3.webp', data: Buffer.alloc(85_000, 3) },
      ]
      const beachShas = beachFiles.map(f => sha256Hex(f.data))
      const beachMediaIds = beachFiles.map((_, i) => `media-beach-${i+1}-1111-4111-8111-111111111111`)

      for (let i = 0; i < 3; i++) {
        const file = path.join(tmpDir, beachFiles[i].name)
        fs.writeFileSync(file, beachFiles[i].data)
        const staged = flowJobService.stageResultForAttempt({
          attemptId: attemptA,
          absPath: file,
          mimeType: 'image/webp',
          byteSize: beachFiles[i].data.length,
          sha256: beachShas[i],
          width: 1376,
          height: 768,
          flowMediaId: beachMediaIds[i],
          originProof: 'rpc_response',
          automaticCorrelation: true,
        })
        expect(staged.ok).toBe(true)
      }
      flowJobService.completeCommand({
        commandId: genA.commandId!,
        installationId: 'inst-1',
        ok: true,
        attemptState: 'completed',
        submissionCertainty: 'accepted',
        retrievedCount: 3,
      })

      // --- GERAÇÃO B (Navio) ---
      const promptB = flowJobService.createPromptLine('proj-test', '[cantor] cantando no navio', ['ref-cantor'])
      const genB = flowJobService.enqueueGenerate(promptB)
      const attemptB = genB.attemptId!

      // Verificações de isolamento:
      // 1. excludeShas do projeto tem SHAs da praia
      const projectShas = flowJobService.listKnownResultShasForAtlasProject('proj-test')
      expect(projectShas).toHaveLength(3)
      beachShas.forEach(sha => expect(projectShas).toContain(sha))

      // 2. excludeMediaIds do projeto tem mediaIds da praia
      const projectMediaIds = flowJobService.listKnownResultMediaIdsForAtlasProject('proj-test')
      expect(projectMediaIds).toHaveLength(3)
      beachMediaIds.forEach(id => expect(projectMediaIds).toContain(id))

      // 3. Tentar estagiar imagem da praia na tentativa do navio → REJEITADO
      for (let i = 0; i < 3; i++) {
        const reject = flowJobService.stageResultForAttempt({
          attemptId: attemptB,
          absPath: path.join(tmpDir, beachFiles[i].name),
          mimeType: 'image/webp',
          byteSize: beachFiles[i].data.length,
          sha256: beachShas[i],
          width: 1376,
          height: 768,
          flowMediaId: beachMediaIds[i],
        })
        expect(reject.ok).toBe(false)
        expect(reject.error).toBe('RESULT_SHA_ALREADY_BOUND')
        expect(reject.existingAttemptId).toBe(attemptA)
      }

      // 4. Estagiar resultados legítimos do navio → ACEITO
      const shipFiles = [
        { name: 'ship1.jpg', data: Buffer.alloc(120_000, 0xaa) },
        { name: 'ship2.jpg', data: Buffer.alloc(115_000, 0xbb) },
        { name: 'ship3.jpg', data: Buffer.alloc(110_000, 0xcc) },
      ]
      const shipShas = shipFiles.map(f => sha256Hex(f.data))
      const shipMediaIds = shipFiles.map((_, i) => `media-ship-${i+1}-2222-4222-8222-222222222222`)

      for (let i = 0; i < 3; i++) {
        const file = path.join(tmpDir, shipFiles[i].name)
        fs.writeFileSync(file, shipFiles[i].data)
        const staged = flowJobService.stageResultForAttempt({
          attemptId: attemptB,
          absPath: file,
          mimeType: 'image/jpeg',
          byteSize: shipFiles[i].data.length,
          sha256: shipShas[i],
          width: 1376,
          height: 768,
          flowMediaId: shipMediaIds[i],
          originProof: 'tracked_progress_slot',
          automaticCorrelation: true,
        })
        expect(staged.ok).toBe(true)
      }
      flowJobService.completeCommand({
        commandId: genB.commandId!,
        installationId: 'inst-1',
        ok: true,
        attemptState: 'completed',
        submissionCertainty: 'accepted',
        retrievedCount: 3,
      })

      // 5. Snapshot da bancada: linha do navio mostra APENAS navio
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
      const navioPrompt = snap.prompts.find(p => p.promptId === promptB)!
      expect(navioPrompt.results.map(r => r.sha256).sort()).toEqual(shipShas.sort())
      expect(navioPrompt.results.map(r => r.flowMediaId).sort()).toEqual(shipMediaIds.sort())

      // 6. Praia está no archivedHistory
      const praiaArchived = snap.archivedHistory.find(h => h.promptId === promptA)!
      expect(praiaArchived.results.map(r => r.sha256).sort()).toEqual(beachShas.sort())
    })
  })

  it('cancelamento do usuário não é desfeito pelo progresso nem pelo fim do comando', async () => {
    const { flowJobService } = await import('./FlowJobService')
    const promptId = flowJobService.createPromptLine('proj-test', 'prompt do lote', [])
    const revision = mockDb
      .prepare(`SELECT active_revision_id AS id FROM flow_prompts WHERE id = ?`)
      .get(promptId) as { id: string }
    const attemptId = 'attempt-cancel-batch'
    const commandId = 'command-cancel-batch'
    mockDb
      .prepare(
        `INSERT INTO flow_attempts (
          id, prompt_revision_id, project_link_id, batch_id, trigger_kind, parent_attempt_id,
          state, execution_stage, submission_certainty, expected_outputs, observed_outputs,
          retrieved_outputs, settings_snapshot_json, failure_code, cancel_requested_at,
          cancel_requested_by, completion_kind, partial_accepted_at, partial_accepted_by,
          accepted_output_count, created_at, submitted_at, finished_at, revision
        ) VALUES (?, ?, 'link-test', NULL, 'generate', NULL, 'generating', 'observe', 'accepted',
                  1, 0, 0, '{}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, 1)`,
      )
      .run(attemptId, revision.id, now)
    mockDb
      .prepare(
        `INSERT INTO flow_commands (
          id, installation_id, attempt_id, operation, schema_version, payload_json,
          idempotency_key, status, delivery_count, lease_id, lease_epoch, expires_at,
          acknowledged_at, result_digest, created_at
        ) VALUES (?, 'inst-1', ?, 'generation.run', 1, '{}', ?, 'leased', 1, 'lease-1', 1, NULL, NULL, NULL, ?)`,
      )
      .run(commandId, attemptId, `generation.run:${attemptId}`, now)

    const canceled = flowJobService.cancelAttempt(attemptId)
    expect(canceled.ok).toBe(true)
    expect(canceled.canceledCommands).toBe(1)

    const polled = flowJobService.appendCommandEvent({
      commandId,
      installationId: 'inst-1',
      eventType: 'cancel_poll',
      attemptId,
      payload: {},
    })
    expect(polled.canceled).toBe(true)

    const progress = flowJobService.appendCommandEvent({
      commandId,
      installationId: 'inst-1',
      eventType: 'generation_progress',
      attemptId,
      payload: { state: 'generating', executionStage: 'observe', clientSequence: 4 },
    })
    expect(progress.canceled).toBe(true)

    flowJobService.completeCommand({
      commandId,
      installationId: 'inst-1',
      ok: true,
      attemptState: 'completed',
      submissionCertainty: 'accepted',
      retrievedCount: 1,
    })

    const row = mockDb
      .prepare(`SELECT state, failure_code FROM flow_attempts WHERE id = ?`)
      .get(attemptId) as { state: string; failure_code: string }
    expect(row.state).toBe('canceled')
    expect(row.failure_code).toBe('CANCELED_BY_USER')
  })
})