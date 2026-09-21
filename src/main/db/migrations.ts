import { randomUUID } from 'node:crypto'
import type { AppDatabase } from './database'
import { backupSqliteFile, isBackupSettingEnabled } from './backup'
import { shortsProjectNameFromFileName } from '../../shared/shortsProject'
import { normalizeShortsClip, type ShortsClip, type ShortsJobStatus, type TranscriptCue, type VideoProbeInfo } from '../../shared/shorts'
import {
  mergeSameSourceSnapshots,
  planShortsProjectConsolidation,
  type ShortsProjectSnapshot,
} from '../../shared/shortsProjectIdentity'
import {
  languageFieldsFromResolution,
  resolveContentLanguage,
} from '../../shared/shortsLanguage'
import {
  findUnequivocalMusicProject,
  resolveMusicProjectName,
  type MusicProjectMatchCandidate,
} from '../../shared/musicVideoProject'

/** Versão lógica do schema. Incremente ao adicionar um passo em SCHEMA_STEPS. */
export const CURRENT_SCHEMA_VERSION = 13

type SchemaStepResult = {
  historyCreated: number
  musicCreated: number
  musicVideosLinked?: number
  musicProjectsFromVideos?: number
  shortsDuplicatesFound?: number
  shortsDuplicatesRemoved?: number
}

type SchemaStep = {
  version: number
  name: string
  /** Só copiar o .db quando o passo muda estrutura de forma relevante. */
  backup: boolean
  up: (database: AppDatabase) => SchemaStepResult
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
  {
    version: 3,
    name: 'channel-video-project-folder',
    backup: false,
    up: applyChannelVideoProjectFolder,
  },
  {
    version: 4,
    name: 'shorts-studio-jobs',
    backup: false,
    up: applyShortsJobs,
  },
  {
    version: 5,
    name: 'shorts-custom-duration',
    backup: false,
    up: applyShortsCustomDuration,
  },
  {
    version: 6,
    name: 'chat-agent-model-overrides',
    backup: false,
    up: applyChatAgentModelOverrides,
  },
  {
    version: 7,
    name: 'shorts-project-name',
    backup: false,
    up: applyShortsProjectName,
  },
  {
    version: 8,
    name: 'music-video-project-link',
    backup: false,
    up: applyMusicVideoProjectLink,
  },
  {
    version: 9,
    name: 'shorts-content-language',
    backup: false,
    up: applyShortsContentLanguage,
  },
  {
    version: 10,
    name: 'shorts-project-source-dedup',
    backup: true,
    up: applyShortsProjectDedup,
  },
  {
    version: 11,
    name: 'shorts-audiovisual-analysis-mode',
    backup: false,
    up: applyShortsAnalysisMode,
  },
  {
    version: 12,
    name: 'shorts-vertical-framing',
    backup: false,
    up: applyShortsVerticalFraming,
  },
  {
    version: 13,
    name: 'quick-prompt-tabs',
    backup: false,
    up: applyQuickPromptTabs,
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
  musicVideosLinked: number
  musicProjectsFromVideos: number
  shortsDuplicatesFound: number
  shortsDuplicatesRemoved: number
  schemaVersion: number
  backedUp: boolean
} {
  ensureMigrationsTable(database)
  const from = getAppliedSchemaVersion(database)
  let historyCreated = 0
  let musicCreated = 0
  let musicVideosLinked = 0
  let musicProjectsFromVideos = 0
  let shortsDuplicatesFound = 0
  let shortsDuplicatesRemoved = 0
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
    musicVideosLinked += created.musicVideosLinked ?? 0
    musicProjectsFromVideos += created.musicProjectsFromVideos ?? 0
    shortsDuplicatesFound += created.shortsDuplicatesFound ?? 0
    shortsDuplicatesRemoved += created.shortsDuplicatesRemoved ?? 0
    recordSchemaVersion(database, step.version, step.name)
  }

  return {
    historyCreated,
    musicCreated,
    musicVideosLinked,
    musicProjectsFromVideos,
    shortsDuplicatesFound,
    shortsDuplicatesRemoved,
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

function applyShortsAnalysisMode(database: AppDatabase): SchemaStepResult {
  ensureColumn(database, 'shorts_jobs', 'analysis_mode', 'TEXT')
  return { historyCreated: 0, musicCreated: 0 }
}

function applyShortsVerticalFraming(database: AppDatabase): SchemaStepResult {
  ensureColumn(database, 'shorts_jobs', 'framing_track_json', "TEXT NOT NULL DEFAULT '[]'")
  ensureColumn(database, 'shorts_jobs', 'framing_settings_json', "TEXT NOT NULL DEFAULT '{}'")
  return { historyCreated: 0, musicCreated: 0 }
}

function applyQuickPromptTabs(database: AppDatabase): SchemaStepResult {
  database.exec(`
    CREATE TABLE IF NOT EXISTS quick_prompt_tabs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  database.exec(
    'CREATE INDEX IF NOT EXISTS idx_quick_prompt_tabs_sort ON quick_prompt_tabs(sort_order, name)',
  )

  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name: string
  }>
  if (!tables.some((item) => item.name === 'quick_prompts')) {
    return { historyCreated: 0, musicCreated: 0 }
  }

  ensureColumn(database, 'quick_prompts', 'tab_id', 'TEXT')
  database.exec('CREATE INDEX IF NOT EXISTS idx_quick_prompts_tab ON quick_prompts(tab_id)')
  backfillQuickPromptTabs(database)
  return { historyCreated: 0, musicCreated: 0 }
}

/** Categorias já usadas viram sub-abas; 'custom' continua sem aba. */
function backfillQuickPromptTabs(database: AppDatabase) {
  const rows = database
    .prepare(
      `SELECT id, category, tab_id FROM quick_prompts
       WHERE tab_id IS NULL OR TRIM(tab_id) = ''`,
    )
    .all() as Array<{ id: string; category: string; tab_id: string | null }>

  const insertTab = database.prepare(
    `INSERT INTO quick_prompt_tabs (id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const assign = database.prepare('UPDATE quick_prompts SET tab_id = ? WHERE id = ?')
  const existing = database.prepare('SELECT id, name FROM quick_prompt_tabs').all() as Array<{
    id: string
    name: string
  }>
  const byName = new Map(existing.map((tab) => [tab.name.trim().toLowerCase(), tab.id]))
  let sortOrder = existing.length
  const now = new Date().toISOString()

  for (const row of rows) {
    const name = String(row.category ?? '').trim()
    if (!name || name.toLowerCase() === 'custom') continue
    const key = name.toLowerCase()
    let tabId = byName.get(key)
    if (!tabId) {
      tabId = randomUUID()
      insertTab.run(tabId, name, sortOrder, now, now)
      byName.set(key, tabId)
      sortOrder += 1
    }
    assign.run(tabId, row.id)
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

function applyChannelVideoProjectFolder(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
} {
  ensureColumn(database, 'channel_videos', 'project_folder_path', 'TEXT')
  return { historyCreated: 0, musicCreated: 0 }
}

function applyShortsJobs(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
} {
  database.exec(`
    CREATE TABLE IF NOT EXISTS shorts_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      source_path TEXT NOT NULL,
      source_name TEXT NOT NULL,
      profile TEXT NOT NULL DEFAULT 'history',
      clip_count INTEGER NOT NULL DEFAULT 5,
      duration_preset TEXT NOT NULL DEFAULT '20-45',
      aspect_mode TEXT NOT NULL DEFAULT 'center_9_16',
      captions_enabled INTEGER NOT NULL DEFAULT 1,
      probe_json TEXT,
      clips_json TEXT NOT NULL DEFAULT '[]',
      transcript_json TEXT NOT NULL DEFAULT '[]',
      transcript_source TEXT NOT NULL DEFAULT 'none',
      analysis_notes TEXT,
      error_message TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  database.exec('CREATE INDEX IF NOT EXISTS idx_shorts_jobs_updated ON shorts_jobs(updated_at DESC)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_shorts_jobs_project ON shorts_jobs(project_id)')
  return { historyCreated: 0, musicCreated: 0 }
}

function applyShortsCustomDuration(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
} {
  ensureColumn(database, 'shorts_jobs', 'requested_duration', 'REAL NOT NULL DEFAULT 30')
  ensureColumn(database, 'shorts_jobs', 'duration_mode', "TEXT NOT NULL DEFAULT 'approximate'")
  database.exec(`
    UPDATE shorts_jobs SET requested_duration = 30
    WHERE duration_preset IN ('15-30', '20-45') AND (requested_duration IS NULL OR requested_duration <= 0 OR requested_duration = 30);
    UPDATE shorts_jobs SET requested_duration = 45
    WHERE duration_preset = '30-60';
    UPDATE shorts_jobs SET duration_mode = 'approximate'
    WHERE duration_mode IS NULL OR duration_mode = '';
  `)
  return { historyCreated: 0, musicCreated: 0 }
}

function applyChatAgentModelOverrides(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
} {
  ensureChatTables(database)
  ensureColumn(database, 'chat_conversations', 'model_override', 'TEXT')
  ensureColumn(database, 'chat_conversations', 'effort_override', 'TEXT')
  return { historyCreated: 0, musicCreated: 0 }
}

function applyShortsProjectName(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
} {
  ensureColumn(database, 'shorts_jobs', 'name', "TEXT NOT NULL DEFAULT ''")
  const rows = database.prepare('SELECT id, source_name, name FROM shorts_jobs').all() as Array<{
    id: string
    source_name: string
    name: string
  }>
  const update = database.prepare('UPDATE shorts_jobs SET name = ? WHERE id = ?')
  for (const row of rows) {
    const current = String(row.name ?? '').trim()
    if (current) continue
    update.run(shortsProjectNameFromFileName(row.source_name), row.id)
  }
  return { historyCreated: 0, musicCreated: 0 }
}

function applyShortsContentLanguage(database: AppDatabase): SchemaStepResult {
  ensureColumn(database, 'shorts_jobs', 'content_language', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(database, 'shorts_jobs', 'language_source', "TEXT NOT NULL DEFAULT 'fallback'")
  ensureColumn(database, 'shorts_jobs', 'language_confidence', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(database, 'shorts_jobs', 'language_override', 'TEXT')
  ensureColumn(database, 'shorts_jobs', 'detected_language', 'TEXT')
  ensureColumn(database, 'shorts_jobs', 'transcript_language', 'TEXT')
  backfillShortsContentLanguage(database)
  return { historyCreated: 0, musicCreated: 0 }
}

function backfillShortsContentLanguage(database: AppDatabase) {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name: string
  }>
  const names = new Set(tables.map((item) => item.name))
  if (!names.has('shorts_jobs')) return

  const hasProjects = names.has('projects')
  const hasChannels = names.has('channels')
  const hasNiches = names.has('niches')
  const hasScripts = names.has('scripts')

  const rows = database
    .prepare(
      `SELECT
        j.id,
        j.source_name,
        j.name,
        j.transcript_json,
        j.project_id,
        j.content_language,
        j.language_override,
        j.transcript_language
        ${hasChannels && hasProjects ? ', c.description AS channel_description' : ''}
        ${hasNiches && hasChannels && hasProjects ? ', n.default_language AS niche_language' : ''}
       FROM shorts_jobs j
       ${hasProjects ? 'LEFT JOIN projects p ON p.id = j.project_id' : ''}
       ${hasChannels && hasProjects ? 'LEFT JOIN channels c ON c.id = p.channel_id' : ''}
       ${hasNiches && hasChannels && hasProjects ? 'LEFT JOIN niches n ON n.id = c.niche_id' : ''}`,
    )
    .all() as Array<{
    id: string
    source_name: string
    name: string | null
    transcript_json: string | null
    project_id: string | null
    content_language: string | null
    language_override: string | null
    transcript_language: string | null
    channel_description?: string | null
    niche_language?: string | null
  }>

  const scriptStmt = hasScripts
    ? database.prepare(
        `SELECT language FROM scripts
         WHERE project_id = ? AND language IS NOT NULL AND TRIM(language) != ''
         LIMIT 1`,
      )
    : null
  const update = database.prepare(
    `UPDATE shorts_jobs SET
      content_language = ?,
      language_source = ?,
      language_confidence = ?,
      detected_language = ?,
      transcript_language = ?
     WHERE id = ?`,
  )

  for (const row of rows) {
    if (String(row.content_language ?? '').trim()) continue
    let transcriptText = ''
    try {
      const parsed = JSON.parse(String(row.transcript_json || '[]')) as unknown
      if (Array.isArray(parsed)) {
        transcriptText = parsed
          .map((item) => {
            if (!item || typeof item !== 'object') return ''
            return String((item as { text?: unknown }).text ?? '').trim()
          })
          .filter(Boolean)
          .join(' ')
      }
    } catch {
      transcriptText = ''
    }
    const script =
      row.project_id && scriptStmt ? (scriptStmt.get(row.project_id) as { language?: string } | undefined) : null
    const resolved = resolveContentLanguage({
      languageOverride: row.language_override,
      transcriptLanguage: row.transcript_language,
      transcriptText,
      channelLanguage: row.channel_description ?? null,
      projectLanguage: script?.language ?? null,
      nicheLanguage: row.niche_language ?? null,
      filename: row.source_name,
      title: row.name ?? '',
    })
    const fields = languageFieldsFromResolution(resolved, {
      languageOverride: row.language_override,
      transcriptLanguage: row.transcript_language,
    })
    update.run(
      fields.contentLanguage,
      fields.languageSource,
      fields.languageConfidence,
      fields.detectedLanguage,
      fields.transcriptLanguage,
      row.id,
    )
  }
}

function parseMigrationJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapShortsSnapshot(row: {
  id: string
  project_id: string | null
  name: string | null
  source_path: string
  source_name: string
  profile: string
  status: string
  created_at: string
  updated_at: string
  probe_json: string | null
  clips_json: string | null
  transcript_json: string | null
  transcript_source: string | null
  analysis_notes: string | null
}): ShortsProjectSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    name: String(row.name ?? '').trim() || shortsProjectNameFromFileName(row.source_name),
    sourcePath: row.source_path,
    sourceName: row.source_name,
    profile: row.profile === 'music' ? 'music' : 'history',
    status: (row.status as ShortsJobStatus) || 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    probe: parseMigrationJson<VideoProbeInfo | null>(row.probe_json, null),
    clips: parseMigrationJson<unknown[]>(row.clips_json, [])
      .map((item, index) => normalizeShortsClip(item, index + 1))
      .filter((item): item is ShortsClip => Boolean(item)),
    transcript: parseMigrationJson<TranscriptCue[]>(row.transcript_json, []),
    transcriptSource: (row.transcript_source as ShortsProjectSnapshot['transcriptSource']) || 'none',
    analysisNotes: row.analysis_notes,
  }
}

function applyShortsProjectDedup(database: AppDatabase): SchemaStepResult {
  return backfillShortsProjectDedup(database)
}

/**
 * Une ShortsProjects do mesmo vídeo-fonte e absorve cards criados a partir de export/preview.
 * Não mescla só por nome. Não apaga MP4 original nem exports.
 */
export function backfillShortsProjectDedup(database: AppDatabase): SchemaStepResult {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name: string
  }>
  if (!tables.some((item) => item.name === 'shorts_jobs')) {
    return { historyCreated: 0, musicCreated: 0, shortsDuplicatesFound: 0, shortsDuplicatesRemoved: 0 }
  }

  const rows = database.prepare('SELECT * FROM shorts_jobs').all() as Array<{
    id: string
    project_id: string | null
    name: string | null
    source_path: string
    source_name: string
    profile: string
    status: string
    created_at: string
    updated_at: string
    probe_json: string | null
    clips_json: string | null
    transcript_json: string | null
    transcript_source: string | null
    analysis_notes: string | null
  }>
  const snapshots = rows.map(mapShortsSnapshot)
  const plan = planShortsProjectConsolidation(snapshots)
  if (plan.length === 0) {
    return { historyCreated: 0, musicCreated: 0, shortsDuplicatesFound: 0, shortsDuplicatesRemoved: 0 }
  }

  const byId = new Map(snapshots.map((item) => [item.id, item]))
  const update = database.prepare(
    `UPDATE shorts_jobs SET
      name = ?, project_id = ?, probe_json = ?, clips_json = ?, transcript_json = ?,
      transcript_source = ?, analysis_notes = ?, status = ?, updated_at = ?
     WHERE id = ?`,
  )
  const remove = database.prepare('DELETE FROM shorts_jobs WHERE id = ?')
  const now = new Date().toISOString()
  let removed = 0

  for (const action of plan) {
    if (action.type === 'absorb_export') {
      const parent = byId.get(action.parentId)
      const derived = byId.get(action.derivedId)
      if (!parent || !derived) continue
      const clips = parent.clips.map((clip) =>
        clip.id === action.clipId
          ? { ...clip, exportedPath: clip.exportedPath || action.exportPath, accepted: true }
          : clip,
      )
      const next: ShortsProjectSnapshot = { ...parent, clips }
      byId.set(parent.id, next)
      update.run(
        next.name,
        next.projectId,
        next.probe ? JSON.stringify(next.probe) : null,
        JSON.stringify(next.clips),
        JSON.stringify(next.transcript ?? []),
        next.transcriptSource,
        next.analysisNotes,
        next.status,
        now,
        next.id,
      )
      remove.run(derived.id)
      byId.delete(derived.id)
      removed += 1
      continue
    }

    const keeper = byId.get(action.keeperId)
    if (!keeper) continue
    const duplicates = action.duplicateIds
      .map((id) => byId.get(id))
      .filter((item): item is ShortsProjectSnapshot => Boolean(item))
    if (!duplicates.length) continue
    const next = mergeSameSourceSnapshots(keeper, duplicates)
    byId.set(keeper.id, next)
    update.run(
      next.name,
      next.projectId,
      next.probe ? JSON.stringify(next.probe) : null,
      JSON.stringify(next.clips),
      JSON.stringify(next.transcript ?? []),
      next.transcriptSource,
      next.analysisNotes,
      next.status,
      now,
      next.id,
    )
    for (const duplicate of duplicates) {
      remove.run(duplicate.id)
      byId.delete(duplicate.id)
      removed += 1
    }
  }

  return {
    historyCreated: 0,
    musicCreated: 0,
    shortsDuplicatesFound: removed,
    shortsDuplicatesRemoved: removed,
  }
}

function applyMusicVideoProjectLink(database: AppDatabase): SchemaStepResult {
  ensureColumn(database, 'channels', 'channel_type', "TEXT NOT NULL DEFAULT 'history'")
  ensureColumn(database, 'projects', 'channel_id', 'TEXT')
  ensureColumn(database, 'channel_videos', 'project_folder_path', 'TEXT')
  ensureColumn(database, 'channel_videos', 'project_id', 'TEXT')
  database.exec(`UPDATE channel_videos SET project_id = NULL WHERE project_id = ''`)
  const result = backfillMusicChannelVideos(database)
  database.exec('CREATE INDEX IF NOT EXISTS idx_videos_project ON channel_videos(project_id)')
  database.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_project_unique ON channel_videos(project_id) WHERE project_id IS NOT NULL',
  )
  return result
}

/**
 * Vídeos musicais sem project_id: vincula a um projeto inequívoco ou cria um novo.
 * Não casa por título parcial. Não cria pasta física. Não toca em História/Shorts.
 */
export function backfillMusicChannelVideos(database: AppDatabase): {
  historyCreated: number
  musicCreated: number
  musicVideosLinked: number
  musicProjectsFromVideos: number
} {
  const videos = database
    .prepare(
      `SELECT v.id, v.channel_id, v.title, v.project_folder_path, v.created_at, v.updated_at
       FROM channel_videos v
       JOIN channels c ON c.id = v.channel_id
       WHERE c.channel_type = 'music'
         AND (v.project_id IS NULL OR v.project_id = '')
       ORDER BY v.created_at ASC, v.id ASC`,
    )
    .all() as Array<{
    id: string
    channel_id: string
    title: string
    project_folder_path: string | null
    created_at: string
    updated_at: string
  }>

  if (videos.length === 0) {
    return { historyCreated: 0, musicCreated: 0, musicVideosLinked: 0, musicProjectsFromVideos: 0 }
  }

  const candidates = loadMusicProjectCandidates(database)
  let musicVideosLinked = 0
  let musicProjectsFromVideos = 0

  const insertProject = database.prepare(
    `INSERT INTO projects (id, name, description, project_type, folder_path, channel_id, created_at, updated_at)
     VALUES (?, ?, '', 'music', ?, ?, ?, ?)`,
  )
  const updateVideo = database.prepare('UPDATE channel_videos SET project_id = ? WHERE id = ?')
  const updateProjectChannel = database.prepare(
    'UPDATE projects SET channel_id = ?, updated_at = ? WHERE id = ? AND (channel_id IS NULL OR channel_id = \'\')',
  )

  for (const video of videos) {
    const matched = findUnequivocalMusicProject(
      {
        title: video.title,
        channelId: video.channel_id,
        folderPath: video.project_folder_path,
      },
      candidates,
    )

    if (matched) {
      updateVideo.run(matched.id, video.id)
      if (!matched.channelId) {
        updateProjectChannel.run(video.channel_id, video.updated_at, matched.id)
        matched.channelId = video.channel_id
      }
      matched.linkedVideoId = video.id
      musicVideosLinked += 1
      continue
    }

    const projectId = randomUUID()
    const name = resolveMusicProjectName({ title: video.title })
    const folderTaken = Boolean(
      video.project_folder_path?.trim() &&
        candidates.some(
          (candidate) =>
            candidate.folderPath &&
            candidate.folderPath.trim().toLowerCase() === video.project_folder_path?.trim().toLowerCase(),
        ),
    )
    const folderPath = !folderTaken && video.project_folder_path?.trim() ? video.project_folder_path : null
    insertProject.run(
      projectId,
      name,
      folderPath,
      video.channel_id,
      video.created_at,
      video.updated_at,
    )
    updateVideo.run(projectId, video.id)
    candidates.push({
      id: projectId,
      name,
      channelId: video.channel_id,
      folderPath,
      linkedVideoId: video.id,
    })
    musicProjectsFromVideos += 1
  }

  return {
    historyCreated: 0,
    musicCreated: musicProjectsFromVideos,
    musicVideosLinked,
    musicProjectsFromVideos,
  }
}

function loadMusicProjectCandidates(database: AppDatabase): MusicProjectMatchCandidate[] {
  return (
    database
      .prepare(
        `SELECT p.id, p.name, p.channel_id, p.folder_path,
        (SELECT v.id FROM channel_videos v WHERE v.project_id = p.id LIMIT 1) AS linked_video_id
       FROM projects p
       WHERE p.project_type = 'music'`,
      )
      .all() as Array<{
      id: string
      name: string
      channel_id: string | null
      folder_path: string | null
      linked_video_id: string | null
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    channelId: row.channel_id?.trim() || null,
    folderPath: row.folder_path?.trim() || null,
    linkedVideoId: row.linked_video_id?.trim() || null,
  }))
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
      model_override TEXT,
      effort_override TEXT,
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
  ensureColumn(database, 'chat_conversations', 'model_override', 'TEXT')
  ensureColumn(database, 'chat_conversations', 'effort_override', 'TEXT')
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
