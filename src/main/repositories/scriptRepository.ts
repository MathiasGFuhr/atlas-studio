import { getDb } from '../db/database'
import type { ScriptRecord, ScriptStatus, ScriptVersion } from '../../shared/types'
import { randomUUID } from 'node:crypto'
import { assertCanCreateScript } from '../services/scripts/scriptMutationGuard'

type ScriptRow = {
  id: string
  niche_id: string
  niche_name?: string
  project_id: string | null
  project_name?: string | null
  title: string
  topic: string
  language: string
  content: string
  status: ScriptStatus
  duration_minutes: number | null
  output_style: string | null
  originality_score: number | null
  retention_score: number | null
  naturalness_score: number | null
  similarity_score: number | null
  folder_path: string | null
  created_at: string
  updated_at: string
}

type VersionRow = {
  id: string
  script_id: string
  version_number: number
  content: string
  adjustment_prompt: string | null
  created_at: string
}

function mapScript(row: ScriptRow): ScriptRecord {
  return {
    id: row.id,
    nicheId: row.niche_id,
    nicheName: row.niche_name,
    projectId: row.project_id ?? null,
    projectName: row.project_name ?? null,
    title: row.title,
    topic: row.topic,
    language: row.language,
    content: row.content,
    status: row.status,
    durationMinutes: row.duration_minutes,
    outputStyle: row.output_style as ScriptRecord['outputStyle'],
    originalityScore: row.originality_score,
    retentionScore: row.retention_score,
    naturalnessScore: row.naturalness_score,
    similarityScore: row.similarity_score,
    folderPath: row.folder_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapVersion(row: VersionRow): ScriptVersion {
  return {
    id: row.id,
    scriptId: row.script_id,
    versionNumber: row.version_number,
    content: row.content,
    adjustmentPrompt: row.adjustment_prompt,
    createdAt: row.created_at,
  }
}

const SELECT_SCRIPT = `
  SELECT s.*, n.name as niche_name, p.name as project_name
  FROM scripts s
  JOIN niches n ON n.id = s.niche_id
  LEFT JOIN projects p ON p.id = s.project_id
`

export const scriptRepository = {
  list(filters?: {
    query?: string
    nicheId?: string
    language?: string
    projectId?: string
  }): ScriptRecord[] {
    const db = getDb()
    let sql = `${SELECT_SCRIPT} WHERE 1=1`
    const params: unknown[] = []

    if (filters?.projectId) {
      sql += ' AND s.project_id = ?'
      params.push(filters.projectId)
    }
    if (filters?.query) {
      sql += ' AND (s.title LIKE ? OR s.topic LIKE ?)'
      params.push(`%${filters.query}%`, `%${filters.query}%`)
    }
    if (filters?.nicheId && filters.nicheId !== 'Todos') {
      sql += ' AND s.niche_id = ?'
      params.push(filters.nicheId)
    }
    if (filters?.language && filters.language !== 'Todos') {
      sql += ' AND s.language = ?'
      params.push(filters.language)
    }

    sql += ' ORDER BY s.created_at DESC'
    return (db.prepare(sql).all(...params) as ScriptRow[]).map(mapScript)
  },

  recent(limit = 3): ScriptRecord[] {
    const rows = getDb()
      .prepare(`${SELECT_SCRIPT} ORDER BY s.created_at DESC LIMIT ?`)
      .all(limit) as ScriptRow[]
    return rows.map(mapScript)
  },

  get(id: string): ScriptRecord | null {
    const row = getDb().prepare(`${SELECT_SCRIPT} WHERE s.id = ?`).get(id) as ScriptRow | undefined
    return row ? mapScript(row) : null
  },

  summary() {
    const rows = getDb()
      .prepare(`SELECT status, COUNT(*) as c FROM scripts GROUP BY status`)
      .all() as Array<{ status: ScriptStatus; c: number }>

    const summary = { total: 0, prontos: 0, rascunhos: 0, emRevisao: 0, erros: 0 }
    for (const row of rows) {
      summary.total += Number(row.c)
      if (row.status === 'pronto') summary.prontos = Number(row.c)
      if (row.status === 'rascunho') summary.rascunhos = Number(row.c)
      if (row.status === 'em_revisao') summary.emRevisao = Number(row.c)
      if (row.status === 'erro') summary.erros = Number(row.c)
    }
    return summary
  },

  create(input: {
    nicheId: string
    projectId?: string | null
    title: string
    topic: string
    language: string
    content: string
    status: ScriptStatus
    durationMinutes?: number
    outputStyle?: string
    folderPath?: string
    originalityScore?: number | null
    retentionScore?: number | null
    naturalnessScore?: number | null
    similarityScore?: number | null
  }): ScriptRecord {
    assertCanCreateScript()
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO scripts (
          id, niche_id, project_id, title, topic, language, content, status, duration_minutes, output_style,
          originality_score, retention_score, naturalness_score, similarity_score, folder_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.nicheId,
        input.projectId ?? null,
        input.title,
        input.topic,
        input.language,
        input.content,
        input.status,
        input.durationMinutes ?? null,
        input.outputStyle ?? null,
        input.originalityScore ?? null,
        input.retentionScore ?? null,
        input.naturalnessScore ?? null,
        input.similarityScore ?? null,
        input.folderPath ?? null,
        timestamp,
        timestamp,
      )

    this.addVersion(id, input.content, null)
    return this.get(id)!
  },

  updateContent(
    id: string,
    content: string,
    options?: {
      status?: ScriptStatus
      adjustmentPrompt?: string
      scores?: {
        originality?: number | null
        retention?: number | null
        naturalness?: number | null
        similarity?: number | null
      }
    },
  ): ScriptRecord | null {
    const current = this.get(id)
    if (!current) return null
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `UPDATE scripts SET content = ?, status = ?, originality_score = ?, retention_score = ?,
         naturalness_score = ?, similarity_score = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        content,
        options?.status ?? current.status,
        options?.scores?.originality ?? current.originalityScore ?? null,
        options?.scores?.retention ?? current.retentionScore ?? null,
        options?.scores?.naturalness ?? current.naturalnessScore ?? null,
        options?.scores?.similarity ?? current.similarityScore ?? null,
        timestamp,
        id,
      )
    this.addVersion(id, content, options?.adjustmentPrompt ?? null)
    return this.get(id)
  },

  addVersion(scriptId: string, content: string, adjustmentPrompt: string | null): ScriptVersion {
    const latest = getDb()
      .prepare('SELECT MAX(version_number) as v FROM script_versions WHERE script_id = ?')
      .get(scriptId) as { v: number | null }
    const versionNumber = (latest.v ?? 0) + 1
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO script_versions (id, script_id, version_number, content, adjustment_prompt, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, scriptId, versionNumber, content, adjustmentPrompt, createdAt)
    return {
      id,
      scriptId,
      versionNumber,
      content,
      adjustmentPrompt,
      createdAt,
    }
  },

  getVersion(scriptId: string, versionId: string): ScriptVersion | null {
    const row = getDb()
      .prepare('SELECT * FROM script_versions WHERE script_id = ? AND id = ?')
      .get(scriptId, versionId) as VersionRow | undefined
    return row ? mapVersion(row) : null
  },

  latestVersion(scriptId: string): ScriptVersion | null {
    const row = getDb()
      .prepare(
        'SELECT * FROM script_versions WHERE script_id = ? ORDER BY version_number DESC LIMIT 1',
      )
      .get(scriptId) as VersionRow | undefined
    return row ? mapVersion(row) : null
  },

  count(): number {
    const row = getDb().prepare('SELECT COUNT(*) as c FROM scripts').get() as { c: number }
    return Number(row.c)
  },

  versions(scriptId: string): ScriptVersion[] {
    const rows = getDb()
      .prepare('SELECT * FROM script_versions WHERE script_id = ? ORDER BY version_number DESC')
      .all(scriptId) as VersionRow[]
    return rows.map(mapVersion)
  },

  listByNiche(nicheId: string, limit = 8): ScriptRecord[] {
    const rows = getDb()
      .prepare(
        `${SELECT_SCRIPT}
         WHERE s.niche_id = ? AND s.content != ''
         ORDER BY s.created_at DESC LIMIT ?`,
      )
      .all(nicheId, limit) as ScriptRow[]
    return rows.map(mapScript)
  },
}
