import { getDb } from '../db/database'
import type { Niche } from '../../shared/types'
import { randomUUID } from 'node:crypto'

type NicheRow = {
  id: string
  name: string
  default_language: string
  description: string
  skill_path: string
  scripts_path: string | null
  memory_path: string
  thumbnail: string | null
  active: number
  created_at: string
  updated_at: string
}

function mapNiche(row: NicheRow): Niche {
  return {
    id: row.id,
    name: row.name,
    defaultLanguage: row.default_language,
    description: row.description,
    skillPath: row.skill_path,
    scriptsPath: row.scripts_path ?? '',
    memoryPath: row.memory_path,
    thumbnail: row.thumbnail,
    active: Number(row.active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const nicheRepository = {
  list(filters?: { query?: string; language?: string }): Niche[] {
    const db = getDb()
    let sql = 'SELECT * FROM niches WHERE 1=1'
    const params: unknown[] = []

    if (filters?.query) {
      sql += ' AND (name LIKE ? OR description LIKE ?)'
      params.push(`%${filters.query}%`, `%${filters.query}%`)
    }
    if (filters?.language && filters.language !== 'Todos') {
      sql += ' AND default_language = ?'
      params.push(filters.language)
    }

    sql += ' ORDER BY name ASC'
    return (db.prepare(sql).all(...params) as NicheRow[]).map(mapNiche)
  },

  get(id: string): Niche | null {
    const row = getDb().prepare('SELECT * FROM niches WHERE id = ?').get(id) as NicheRow | undefined
    return row ? mapNiche(row) : null
  },

  create(input: Omit<Niche, 'id' | 'createdAt' | 'updatedAt'>): Niche {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO niches (id, name, default_language, description, skill_path, scripts_path, memory_path, thumbnail, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.defaultLanguage,
        input.description,
        input.skillPath,
        input.scriptsPath ?? '',
        input.memoryPath,
        input.thumbnail ?? null,
        input.active ? 1 : 0,
        timestamp,
        timestamp,
      )
    return this.get(id)!
  },

  update(id: string, patch: Partial<Omit<Niche, 'id' | 'createdAt'>>): Niche | null {
    const current = this.get(id)
    if (!current) return null
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
    getDb()
      .prepare(
        `UPDATE niches SET
          name = ?, default_language = ?, description = ?, skill_path = ?, scripts_path = ?, memory_path = ?,
          thumbnail = ?, active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.name,
        next.defaultLanguage,
        next.description,
        next.skillPath,
        next.scriptsPath ?? '',
        next.memoryPath,
        next.thumbnail ?? null,
        next.active ? 1 : 0,
        next.updatedAt,
        id,
      )
    return this.get(id)
  },
}
