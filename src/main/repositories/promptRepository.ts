import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type { ChannelPrompt } from '../../shared/types'
import { channelRepository } from './channelRepository'

type PromptRow = {
  id: string
  channel_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  channel_name?: string | null
}

function mapPrompt(row: PromptRow): ChannelPrompt {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelName: row.channel_name ?? null,
    title: row.title,
    content: row.content ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const promptRepository = {
  list(filters?: { channelId?: string; query?: string }): ChannelPrompt[] {
    const db = getDb()
    let sql = `
      SELECT p.*, c.name AS channel_name
      FROM channel_prompts p
      LEFT JOIN channels c ON c.id = p.channel_id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (filters?.channelId) {
      sql += ' AND p.channel_id = ?'
      params.push(filters.channelId)
    }
    if (filters?.query) {
      sql += ' AND (p.title LIKE ? OR p.content LIKE ?)'
      params.push(`%${filters.query}%`, `%${filters.query}%`)
    }
    sql += ' ORDER BY p.updated_at DESC'
    return (db.prepare(sql).all(...params) as PromptRow[]).map(mapPrompt)
  },

  get(id: string): ChannelPrompt | null {
    const row = getDb()
      .prepare(
        `SELECT p.*, c.name AS channel_name
         FROM channel_prompts p
         LEFT JOIN channels c ON c.id = p.channel_id
         WHERE p.id = ?`,
      )
      .get(id) as PromptRow | undefined
    return row ? mapPrompt(row) : null
  },

  create(input: { channelId: string; title: string; content: string }): ChannelPrompt {
    if (!channelRepository.get(input.channelId)) {
      throw new Error('Canal não encontrado')
    }
    const title = input.title.trim()
    if (!title) throw new Error('O título do prompt é obrigatório.')
    const content = input.content.trim()
    if (!content) throw new Error('O texto do prompt é obrigatório.')

    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO channel_prompts (id, channel_id, title, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.channelId, title, content, timestamp, timestamp)
    return this.get(id)!
  },

  update(
    id: string,
    patch: Partial<{ channelId: string; title: string; content: string }>,
  ): ChannelPrompt | null {
    const current = this.get(id)
    if (!current) return null

    const nextChannelId = patch.channelId ?? current.channelId
    if (!channelRepository.get(nextChannelId)) {
      throw new Error('Canal não encontrado')
    }

    const nextTitle = (patch.title ?? current.title).trim()
    if (!nextTitle) throw new Error('O título do prompt é obrigatório.')
    const nextContent = (patch.content ?? current.content).trim()
    if (!nextContent) throw new Error('O texto do prompt é obrigatório.')

    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `UPDATE channel_prompts SET channel_id = ?, title = ?, content = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(nextChannelId, nextTitle, nextContent, timestamp, id)
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM channel_prompts WHERE id = ?').run(id)
    return true
  },
}
