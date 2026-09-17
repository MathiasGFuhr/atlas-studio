import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import type { AppDatabase } from './database'
import { migrateSchema } from './migrations'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js') as typeof import('sql.js')

/** Schema do Atlas anterior à separação História/Música. */
const LEGACY_SCHEMA = `
  CREATE TABLE niches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_language TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    skill_path TEXT NOT NULL,
    memory_path TEXT NOT NULL,
    thumbnail TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE scripts (
    id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    language TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    folder_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    avatar_path TEXT NOT NULL DEFAULT '',
    niche_id TEXT,
    youtube_url TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#35e58b',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE channel_videos (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    thumbnail_path TEXT NOT NULL DEFAULT '',
    scheduled_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planejado',
    script_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE music_tracks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    original_path TEXT NOT NULL,
    preview_path TEXT NOT NULL,
    duration REAL NOT NULL DEFAULT 0,
    cut_mode TEXT NOT NULL DEFAULT 'automatico',
    cuts_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    project_type TEXT NOT NULL DEFAULT 'history',
    folder_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`

async function createLegacyDatabase(): Promise<AppDatabase> {
  const SQL = await initSqlJs({
    locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
  })
  const raw = new SQL.Database()
  raw.run(LEGACY_SCHEMA)

  return {
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
}

function seedLegacyContent(db: AppDatabase) {
  const at = '2025-01-01T00:00:00.000Z'
  db.prepare(
    `INSERT INTO niches (id, name, default_language, skill_path, memory_path, created_at, updated_at)
     VALUES ('n1', 'História Antiga', 'Português', 'C:\\skills\\historia', 'C:\\mem', ?, ?)`,
  ).run(at, at)

  db.prepare(
    `INSERT INTO scripts (id, niche_id, title, topic, language, content, status, folder_path, created_at, updated_at)
     VALUES ('s1', 'n1', 'A Queda de Roma', 'Roma', 'Português', 'texto', 'pronto', 'C:\\roteiros\\001-roma', ?, ?)`,
  ).run(at, at)
  db.prepare(
    `INSERT INTO scripts (id, niche_id, title, topic, language, content, status, folder_path, created_at, updated_at)
     VALUES ('s2', 'n1', 'Prússia', 'Prússia', 'Alemão', 'texto', 'rascunho', NULL, ?, ?)`,
  ).run(at, at)

  db.prepare(
    `INSERT INTO music_tracks (id, name, original_path, preview_path, created_at, updated_at)
     VALUES ('m1', 'Trilha Épica', 'C:\\audio\\a.mp3', 'C:\\audio\\a.wav', ?, ?)`,
  ).run(at, at)

  db.prepare(
    `INSERT INTO channels (id, name, created_at, updated_at) VALUES ('c1', 'Canal Antigo', ?, ?)`,
  ).run(at, at)
}

describe('migração para projetos de História e Música', () => {
  it('converte roteiros e faixas existentes em projetos sem apagar dados', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)

    const result = migrateSchema(db)

    expect(result).toMatchObject({ historyCreated: 2, musicCreated: 1, schemaVersion: 5 })

    // Nenhum registro antigo foi perdido.
    expect(db.prepare('SELECT COUNT(*) AS c FROM scripts').get()).toEqual({ c: 2 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM music_tracks').get()).toEqual({ c: 1 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM niches').get()).toEqual({ c: 1 })

    const projects = db
      .prepare('SELECT name, project_type, folder_path FROM projects ORDER BY project_type, name')
      .all()
    expect(projects).toEqual([
      { name: 'A Queda de Roma', project_type: 'history', folder_path: 'C:\\roteiros\\001-roma' },
      { name: 'Prússia', project_type: 'history', folder_path: null },
      { name: 'Trilha Épica', project_type: 'music', folder_path: null },
    ])

    // Todo roteiro e toda faixa passam a apontar para um projeto do tipo certo.
    const scriptTypes = db
      .prepare(
        `SELECT s.id, p.project_type FROM scripts s JOIN projects p ON p.id = s.project_id
         ORDER BY s.id`,
      )
      .all()
    expect(scriptTypes).toEqual([
      { id: 's1', project_type: 'history' },
      { id: 's2', project_type: 'history' },
    ])

    const trackTypes = db
      .prepare('SELECT m.id, p.project_type FROM music_tracks m JOIN projects p ON p.id = m.project_id')
      .all()
    expect(trackTypes).toEqual([{ id: 'm1', project_type: 'music' }])
  })

  it('classifica canais antigos como História', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)

    migrateSchema(db)

    expect(db.prepare('SELECT channel_type FROM channels WHERE id = ?').get('c1')).toEqual({
      channel_type: 'history',
    })
  })

  it('adiciona canal opcional aos projetos existentes', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)

    migrateSchema(db)

    const cols = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>
    expect(cols.some((col) => col.name === 'channel_id')).toBe(true)
    expect(db.prepare('SELECT channel_id FROM projects LIMIT 1').get()).toEqual({ channel_id: null })
  })

  it('não cria índice de channel_id em projects antes da coluna existir', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)

    expect(() => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_projects_channel ON projects(channel_id)')
    }).toThrow(/no such column: channel_id/)

    migrateSchema(db)

    expect(() => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_projects_channel ON projects(channel_id)')
    }).not.toThrow()
  })

  it('é idempotente: rodar de novo não duplica projetos', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)

    migrateSchema(db)
    const afterFirst = db.prepare('SELECT COUNT(*) AS c FROM projects').get()

    const second = migrateSchema(db)

    expect(second).toMatchObject({ historyCreated: 0, musicCreated: 0, schemaVersion: 5 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toEqual(afterFirst)
  })

  it('não recria projeto de História após exclusão (roteiro órfão no boot)', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)
    migrateSchema(db)

    const script = db
      .prepare('SELECT id, project_id FROM scripts WHERE id = ?')
      .get('s1') as { id: string; project_id: string }
    expect(script.project_id).toBeTruthy()

    db.prepare('UPDATE scripts SET project_id = NULL WHERE project_id = ?').run(script.project_id)
    db.prepare('DELETE FROM projects WHERE id = ?').run(script.project_id)

    const afterDelete = db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }
    const remigrate = migrateSchema(db)

    expect(remigrate).toMatchObject({ historyCreated: 0, musicCreated: 0 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toEqual(afterDelete)
    expect(db.prepare('SELECT project_id FROM scripts WHERE id = ?').get('s1')).toEqual({
      project_id: null,
    })
  })

  it('não recria projeto de Música após exclusão (faixa órfã no boot)', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)
    migrateSchema(db)

    const track = db
      .prepare('SELECT id, project_id FROM music_tracks WHERE id = ?')
      .get('m1') as { id: string; project_id: string }
    expect(track.project_id).toBeTruthy()

    db.prepare('UPDATE music_tracks SET project_id = NULL WHERE project_id = ?').run(track.project_id)
    db.prepare('DELETE FROM projects WHERE id = ?').run(track.project_id)

    const afterDelete = db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }
    const remigrate = migrateSchema(db)

    expect(remigrate).toMatchObject({ historyCreated: 0, musicCreated: 0 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM projects').get()).toEqual(afterDelete)
    expect(db.prepare('SELECT project_id FROM music_tracks WHERE id = ?').get('m1')).toEqual({
      project_id: null,
    })
  })

  it('trata projeto sem tipo reconhecido como História', async () => {
    const db = await createLegacyDatabase()
    const at = '2025-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO projects (id, name, project_type, created_at, updated_at)
       VALUES ('p1', 'Sem tipo', 'desconhecido', ?, ?)`,
    ).run(at, at)

    migrateSchema(db)

    expect(db.prepare('SELECT project_type FROM projects WHERE id = ?').get('p1')).toEqual({
      project_type: 'history',
    })
  })

  it('adiciona pasta do projeto aos vídeos do calendário em bancos antigos', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)

    migrateSchema(db)

    const cols = db.prepare('PRAGMA table_info(channel_videos)').all() as Array<{ name: string }>
    expect(cols.some((col) => col.name === 'project_folder_path')).toBe(true)
  })

  it('cria a tabela de tarefas em bancos antigos sem apagar dados', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)

    migrateSchema(db)

    expect(db.prepare('SELECT COUNT(*) AS c FROM tasks').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) AS c FROM scripts').get()).toEqual({ c: 2 })
  })

  it('grava versão de schema e não zera dados no segundo boot', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)
    const first = migrateSchema(db)
    expect(first.schemaVersion).toBe(5)
    expect(first.backedUp).toBe(false)
    expect(migrateSchema(db).backedUp).toBe(false)
    expect(db.prepare('SELECT COUNT(*) AS c FROM scripts').get()).toEqual({ c: 2 })
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([
      expect.objectContaining({ version: 1 }),
      expect.objectContaining({ version: 2 }),
      expect.objectContaining({ version: 3 }),
      expect.objectContaining({ version: 4 }),
      expect.objectContaining({ version: 5 }),
    ])
  })

  it('adiciona pasta do projeto mesmo em banco já migrado até a versão 2', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `)
    const appliedAt = '2026-09-17T00:00:00.000Z'
    db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(1, 'incremental-base', appliedAt)
    db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(2, 'channel-video-pipeline-status', appliedAt)

    const before = db.prepare('PRAGMA table_info(channel_videos)').all() as Array<{ name: string }>
    expect(before.some((col) => col.name === 'project_folder_path')).toBe(false)

    const result = migrateSchema(db)

    expect(result.schemaVersion).toBe(5)
    const after = db.prepare('PRAGMA table_info(channel_videos)').all() as Array<{ name: string }>
    expect(after.some((col) => col.name === 'project_folder_path')).toBe(true)
    const shorts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shorts_jobs'").get() as
      | { name: string }
      | undefined
    expect(shorts?.name).toBe('shorts_jobs')
    const shortsCols = db.prepare('PRAGMA table_info(shorts_jobs)').all() as Array<{ name: string }>
    expect(shortsCols.some((col) => col.name === 'requested_duration')).toBe(true)
    expect(shortsCols.some((col) => col.name === 'duration_mode')).toBe(true)
  })

  it('converte status antigos de vídeo para o pipeline atual', async () => {
    const db = await createLegacyDatabase()
    seedLegacyContent(db)
    const at = '2025-01-01T00:00:00.000Z'
    db.prepare(
      `INSERT INTO channel_videos (id, channel_id, title, scheduled_date, status, created_at, updated_at)
       VALUES ('v1', 'c1', 'Antigo planejado', '2025-01-10', 'planejado', ?, ?)`,
    ).run(at, at)
    db.prepare(
      `INSERT INTO channel_videos (id, channel_id, title, scheduled_date, status, created_at, updated_at)
       VALUES ('v2', 'c1', 'Antigo gravado', '2025-01-11', 'gravado', ?, ?)`,
    ).run(at, at)
    db.prepare(
      `INSERT INTO channel_videos (id, channel_id, title, scheduled_date, status, created_at, updated_at)
       VALUES ('v3', 'c1', 'Já publicado', '2025-01-12', 'publicado', ?, ?)`,
    ).run(at, at)

    migrateSchema(db)

    expect(db.prepare('SELECT status FROM channel_videos WHERE id = ?').get('v1')).toEqual({
      status: 'colocando',
    })
    expect(db.prepare('SELECT status FROM channel_videos WHERE id = ?').get('v2')).toEqual({
      status: 'editando',
    })
    expect(db.prepare('SELECT status FROM channel_videos WHERE id = ?').get('v3')).toEqual({
      status: 'publicado',
    })
  })
})
