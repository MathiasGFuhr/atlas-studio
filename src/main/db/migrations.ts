import { randomUUID } from 'node:crypto'
import type { AppDatabase } from './database'
import { backupSqliteFile, isBackupSettingEnabled } from './backup'

/** Versão lógica do schema. Incremente ao adicionar um passo em SCHEMA_STEPS. */
export const CURRENT_SCHEMA_VERSION = 2

type SchemaStep = {
  version: number
  name: string
  /** Só copiar o .db quando o passo muda estrutura de forma relevante. */
  backup: boolean
  up: (database: AppDatabase) => { historyCreated: number; musicCreated: number }
}

/**
 * Passos incrementais. Nunca recriar o banco só porque a versão do app mudou.
 * Passos já aplicados (schema_migrations) não rodam de novo.
 */
const SCHEMA_STEPS: SchemaStep[] = [
  {
    version: 1,
    name: 'incremental-base',
    backup: false,
    up: applyIncrementalBase,
  },
  {
    version: 2,
    name: 'channel-video-pipeline-status',
    backup: false,
    up: applyChannelVideoPipelineStatus,
  },
]

/**
 * Migrações incrementais do schema. Sempre aditivas: nenhuma tabela,
 * coluna ou linha existente é removida.
 */
export function migrateSchema(
  database: AppDatabase,
  options: { dbFilePath?: string } = {},
): {
  historyCreated: number
  musicCreated: number
  schemaVersion: number
  backedUp: boolean
} {
  ensureMigrationsTable(database)
  const from = getAppliedSchemaVersion(database)
  let historyCreated = 0
  let musicCreated = 0
  let backedUp = false

  for (const step of SCHEMA_STEPS) {
    if (step.version <= from) continue
    if (step.backup && options.dbFilePath) {
      const copied = backupSqliteFile({
        dbFilePath: options.dbFilePath,
        enabled: readBackupEnabled(database),
        reason: `schema-${from}-to-${step.version}`,
      })
      if (copied) backedUp = true
    }
    const created = step.up(database)
    historyCreated += created.historyCreated
    musicCreated += created.musicCreated
    recordSchemaVersion(database, step.version, step.name)
  }

  return {
    historyCreated,
    musicCreated,
    schemaVersion: getAppliedSchemaVersion(database),
    backedUp,
  }
}

export function getAppliedSchemaVersion(database: AppDatabase): number {
  ensureMigrationsTable(database)
  const row = database.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as
    | { v: number | null }
    | undefined
  return Number(row?.v ?? 0)
}

function ensureMigrationsTable(database: AppDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)
}

function recordSchemaVersion(database: AppDatabase, version: number, name: string) {
  database
    .prepare(
      'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    )
    .run(version, name, new Date().toISOString())
}

function readBackupEnabled(database: AppDatabase): boolean {
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get('backupEnabled') as
    | { value: string }
    | undefined
  if (!row) return true
  try {
    return isBackupSettingEnabled(JSON.parse(row.value))
  } catch {
    return isBackupSettingEnabled(row.value)
  }
}

function applyChannelVideoPipelineStatus(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
} {
  database.exec(`
    UPDATE channel_videos SET status = 'colocando' WHERE status = 'planejado';
    UPDATE channel_videos SET status = 'editando' WHERE status = 'gravado';
  `)
  return { historyCreated: 0, musicCreated: 0 }
}

function applyIncrementalBase(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
} {
  ensureColumn(database, 'niches', 'scripts_path', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(database, 'channel_videos', 'title_score', 'REAL')
  ensureColumn(database, 'channel_videos', 'title_analysis', 'TEXT')
  ensureColumn(database, 'channel_videos', 'title_analyzed_at', 'TEXT')
  ensureColumn(database, 'channel_videos', 'project_folder_path', 'TEXT')
  // Backfill só quando a coluna nasce: depois disso, project_id NULL significa
  // “desvinculado de propósito” (ex.: exclusão do projeto no Atlas).
  const addedScriptProjectId = ensureColumn(database, 'scripts', 'project_id', 'TEXT')
  const addedTrackProjectId = ensureColumn(database, 'music_tracks', 'project_id', 'TEXT')
  ensureColumn(database, 'channels', 'channel_type', "TEXT NOT NULL DEFAULT 'history'")
  ensureColumn(database, 'projects', 'channel_id', 'TEXT')
  database.exec('CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_music_project ON music_tracks(project_id)')
  // Bancos antigos só recebem channel_id no ensureColumn acima. Criar o índice
  // no bootstrap do CREATE TABLE IF NOT EXISTS derruba o app (coluna ainda não existe).
  database.exec('CREATE INDEX IF NOT EXISTS idx_projects_channel ON projects(channel_id)')
  ensureTasksTable(database)
  ensureChatTables(database)
  const created = backfillProjects(database, {
    scripts: addedScriptProjectId,
    tracks: addedTrackProjectId,
  })
  normalizeProjectTypes(database)
  return created
}

function ensureTasksTable(database: AppDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      category TEXT NOT NULL DEFAULT 'general',
      due_date TEXT,
      related_type TEXT,
      related_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `)
  database.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)')
}

function ensureChatTables(database: AppDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Nova conversa',
      project_id TEXT,
      use_project_context INTEGER NOT NULL DEFAULT 0,
      last_agent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      agent TEXT,
      content TEXT NOT NULL DEFAULT '',
      actions_json TEXT NOT NULL DEFAULT '[]',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      pending_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
    )
  `)
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_action_logs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT,
      agent TEXT NOT NULL,
      action_name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
    )
  `)
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC)',
  )
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at)',
  )
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_chat_logs_conversation ON chat_action_logs(conversation_id, created_at)',
  )
  ensureColumn(database, 'chat_messages', 'attachments_json', "TEXT NOT NULL DEFAULT '[]'")
}

export function ensureColumn(
  database: AppDatabase,
  table: string,
  column: string,
  definition: string,
): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === column)) return false
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  return true
}

/**
 * Converte o acervo anterior à coluna `project_id` em projetos.
 * Roda só na primeira vez em que a coluna é criada — não no boot seguinte.
 * Fonte de verdade da lista de projetos: a tabela `projects`.
 * Roteiros/faixas com `project_id` nulo não voltam a virar projeto.
 */
export function backfillProjects(
  database: AppDatabase,
  scope: { scripts: boolean; tracks: boolean } = { scripts: true, tracks: true },
): {
  historyCreated: number
  musicCreated: number
} {
  const historyCreated = scope.scripts ? backfillOrphanScripts(database) : 0
  const musicCreated = scope.tracks ? backfillOrphanTracks(database) : 0
  return { historyCreated, musicCreated }
}

function backfillOrphanScripts(database: AppDatabase): number {
  const orphanScripts = database
    .prepare(
      `SELECT id, title, topic, folder_path, created_at, updated_at
       FROM scripts WHERE project_id IS NULL OR project_id = ''
       ORDER BY created_at ASC`,
    )
    .all() as Array<{
    id: string
    title: string
    topic: string
    folder_path: string | null
    created_at: string
    updated_at: string
  }>

  for (const script of orphanScripts) {
    const projectId = randomUUID()
    database
      .prepare(
        `INSERT INTO projects (id, name, description, project_type, folder_path, created_at, updated_at)
         VALUES (?, ?, ?, 'history', ?, ?, ?)`,
      )
      .run(
        projectId,
        nonEmpty(script.title, 'Projeto de História'),
        nonEmpty(script.topic, ''),
        script.folder_path || null,
        script.created_at,
        script.updated_at,
      )
    database.prepare('UPDATE scripts SET project_id = ? WHERE id = ?').run(projectId, script.id)
  }

  return orphanScripts.length
}

function backfillOrphanTracks(database: AppDatabase): number {
  const orphanTracks = database
    .prepare(
      `SELECT id, name, created_at, updated_at
       FROM music_tracks WHERE project_id IS NULL OR project_id = ''
       ORDER BY created_at ASC`,
    )
    .all() as Array<{ id: string; name: string; created_at: string; updated_at: string }>

  for (const track of orphanTracks) {
    const projectId = randomUUID()
    database
      .prepare(
        `INSERT INTO projects (id, name, description, project_type, folder_path, created_at, updated_at)
         VALUES (?, ?, '', 'music', NULL, ?, ?)`,
      )
      .run(projectId, nonEmpty(track.name, 'Projeto de Música'), track.created_at, track.updated_at)
    database.prepare('UPDATE music_tracks SET project_id = ? WHERE id = ?').run(projectId, track.id)
  }

  return orphanTracks.length
}

function normalizeProjectTypes(database: AppDatabase) {
  database.exec(
    `UPDATE projects SET project_type = 'history'
     WHERE project_type IS NULL OR project_type NOT IN ('history', 'music')`,
  )
}

function nonEmpty(raw: unknown, fallback: string): string {
  const value = String(raw ?? '').trim()
  return value || fallback
}
