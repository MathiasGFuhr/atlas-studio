import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getDatabasePath } from '../paths'
import { seedIfEmpty } from './seed'
import { migrateSchema } from './migrations'

const require = createRequire(import.meta.url)
// sql.js is CommonJS — load at runtime to avoid ESM __dirname breakage when bundled
const initSqlJs = require('sql.js') as typeof import('sql.js')

type SqlJsDatabase = import('sql.js').Database

export type Stmt = {
  run: (...params: unknown[]) => void
  get: (...params: unknown[]) => Record<string, unknown> | undefined
  all: (...params: unknown[]) => Record<string, unknown>[]
}

export type AppDatabase = {
  exec: (sql: string) => void
  prepare: (sql: string) => Stmt
  persist: () => void
}

let db: AppDatabase | null = null
let raw: SqlJsDatabase | null = null
let dbFilePath = ''

function resolveWasmPath(): string {
  let sqlJsDist = ''
  try {
    sqlJsDist = path.join(path.dirname(require.resolve('sql.js/package.json')), 'dist', 'sql-wasm.wasm')
  } catch {
    /* ignore — fallbacks below */
  }

  const candidates = [
    // Empacotado (extraResources)
    path.join(process.resourcesPath ?? '', 'sql-wasm.wasm'),
    // Dev / cwd
    path.join(process.cwd(), 'resources', 'sql-wasm.wasm'),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    // Resolução via package sql.js (asar ou node_modules)
    sqlJsDist,
    path.join(app.getAppPath(), 'resources', 'sql-wasm.wasm'),
    path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return candidates[0] || sqlJsDist
}

export function getDb(): AppDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

export async function initDatabase(workspaceRoot: string): Promise<AppDatabase> {
  dbFilePath = getDatabasePath()
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true })

  const wasmPath = resolveWasmPath()
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  })

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath)
    raw = new SQL.Database(fileBuffer)
  } else {
    raw = new SQL.Database()
  }

  db = wrapDatabase(raw)
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      project_type TEXT NOT NULL DEFAULT 'history',
      folder_path TEXT,
      channel_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);
    CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);

    CREATE TABLE IF NOT EXISTS niches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      default_language TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      skill_path TEXT NOT NULL,
      scripts_path TEXT NOT NULL DEFAULT '',
      memory_path TEXT NOT NULL,
      thumbnail TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      modified_at TEXT,
      has_references INTEGER NOT NULL DEFAULT 0,
      has_scripts INTEGER NOT NULL DEFAULT 0,
      has_templates INTEGER NOT NULL DEFAULT 0,
      has_tests INTEGER NOT NULL DEFAULT 0,
      has_agents INTEGER NOT NULL DEFAULT 0,
      validation_status TEXT NOT NULL DEFAULT 'valid',
      validation_message TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      niche_id TEXT NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      language TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      duration_minutes INTEGER,
      output_style TEXT,
      originality_score REAL,
      retention_score REAL,
      naturalness_score REAL,
      similarity_score REAL,
      folder_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (niche_id) REFERENCES niches(id)
    );

    CREATE TABLE IF NOT EXISTS script_versions (
      id TEXT PRIMARY KEY,
      script_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      adjustment_prompt TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
      UNIQUE(script_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS generation_runs (
      id TEXT PRIMARY KEY,
      script_id TEXT,
      niche_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (script_id) REFERENCES scripts(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      avatar_path TEXT NOT NULL DEFAULT '',
      niche_id TEXT,
      youtube_url TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#35e58b',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (niche_id) REFERENCES niches(id)
    );

    CREATE TABLE IF NOT EXISTS channel_videos (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      thumbnail_path TEXT NOT NULL DEFAULT '',
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'colocando',
      script_id TEXT,
      title_score REAL,
      title_analysis TEXT,
      title_analyzed_at TEXT,
      project_folder_path TEXT,
      project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (script_id) REFERENCES scripts(id)
    );

    CREATE TABLE IF NOT EXISTS channel_prompts (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scripts_niche ON scripts(niche_id);
    CREATE INDEX IF NOT EXISTS idx_scripts_created ON scripts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_versions_script ON script_versions(script_id);
    CREATE INDEX IF NOT EXISTS idx_skills_path ON skills(path);
    CREATE INDEX IF NOT EXISTS idx_skills_active ON skills(active);
    CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);
    CREATE INDEX IF NOT EXISTS idx_videos_channel ON channel_videos(channel_id);
    CREATE INDEX IF NOT EXISTS idx_videos_date ON channel_videos(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_prompts_channel ON channel_prompts(channel_id);

    CREATE TABLE IF NOT EXISTS music_tracks (
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

    CREATE INDEX IF NOT EXISTS idx_music_created ON music_tracks(created_at);

    CREATE TABLE IF NOT EXISTS quick_prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      text TEXT NOT NULL,
      project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quick_prompt_favorites (
      item_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_quick_prompts_project ON quick_prompts(project_id);
    CREATE INDEX IF NOT EXISTS idx_quick_prompts_updated ON quick_prompts(updated_at DESC);

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
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Nova conversa',
      project_id TEXT,
      use_project_context INTEGER NOT NULL DEFAULT 0,
      last_agent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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
    );

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
    );

    CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_logs_conversation ON chat_action_logs(conversation_id, created_at);
  `)

  const migrated = migrateSchema(db, { dbFilePath })
  if (migrated.historyCreated > 0 || migrated.musicCreated > 0) {
    console.log(
      `[atlas][db] migração de projetos: ${migrated.historyCreated} roteiro(s) → História, ${migrated.musicCreated} faixa(s) → Música`,
    )
  }
  if (migrated.musicProjectsFromVideos > 0 || migrated.musicVideosLinked > 0) {
    console.log(
      `[atlas][db] vídeos musicais: ${migrated.musicVideosLinked} vinculado(s) a projeto existente, ${migrated.musicProjectsFromVideos} projeto(s) criado(s)`,
    )
  }
  ensureWorkspaceDirs(workspaceRoot)
  seedIfEmpty(db, workspaceRoot)
  ensureDefaultSkillLibrary(db)
  db.persist()
  return db
}

const DEFAULT_SKILL_LIBRARY = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'Documents',
  'ChatGPT',
)

function ensureDefaultSkillLibrary(database: AppDatabase) {
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get('skillLibraryRoot') as
    | { value: string }
    | undefined
  if (row) return

  const legacy = database.prepare('SELECT value FROM settings WHERE key = ?').get('skillsPath') as
    | { value: string }
    | undefined
  let value = DEFAULT_SKILL_LIBRARY
  if (legacy?.value) {
    try {
      const parsed = JSON.parse(legacy.value) as string
      if (parsed?.trim()) value = parsed
    } catch {
      /* keep default */
    }
  }
  database
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('skillLibraryRoot', JSON.stringify(value))
}

function wrapDatabase(database: SqlJsDatabase): AppDatabase {
  const persist = () => {
    const data = database.export()
    fs.writeFileSync(dbFilePath, Buffer.from(data))
  }

  return {
    exec(sql: string) {
      database.run(sql)
      persist()
    },
    prepare(sql: string): Stmt {
      return {
        run(...params: unknown[]) {
          database.run(sql, params as never[])
          persist()
        },
        get(...params: unknown[]) {
          const stmt = database.prepare(sql)
          stmt.bind(params as never[])
          if (stmt.step()) {
            const row = stmt.getAsObject()
            stmt.free()
            return row as Record<string, unknown>
          }
          stmt.free()
          return undefined
        },
        all(...params: unknown[]) {
          const stmt = database.prepare(sql)
          stmt.bind(params as never[])
          const rows: Record<string, unknown>[] = []
          while (stmt.step()) {
            rows.push(stmt.getAsObject() as Record<string, unknown>)
          }
          stmt.free()
          return rows
        },
      }
    },
    persist,
  }
}

function ensureWorkspaceDirs(workspaceRoot: string) {
  const dirs = [
    workspaceRoot,
    path.join(workspaceRoot, 'skills'),
    path.join(workspaceRoot, 'projects'),
    path.join(workspaceRoot, 'memory'),
  ]
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true })
}
