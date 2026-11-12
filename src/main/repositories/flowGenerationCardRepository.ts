import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import type {
  FlowGenerationCard,
  FlowGenerationCardStatus,
  FlowGenerationCardUpdateInput,
} from '../../shared/flowProjects'
import {
  normalizeFlowGenerationCardStatus,
  normalizeFlowProjectPrompt,
} from '../../shared/flowProjects'
import { flowProjectRepository } from './flowProjectRepository'

type Row = {
  id: string
  project_id: string
  number: number
  prompt: string
  status: string
  last_error: string | null
  prep_log_json: string | null
  created_at: string
  updated_at: string
}

const SELECT = `
  SELECT
    id,
    project_id,
    number,
    prompt,
    status,
    last_error,
    prep_log_json,
    created_at,
    updated_at
  FROM google_flow_generation_cards
`

function parsePrepLog(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 40)
  } catch {
    return []
  }
}

function mapRow(row: Row): FlowGenerationCard {
  return {
    id: row.id,
    projectId: row.project_id,
    number: Number(row.number) || 1,
    prompt: normalizeFlowProjectPrompt(row.prompt),
    status: normalizeFlowGenerationCardStatus(row.status),
    lastError: row.last_error?.trim() || null,
    prepLog: parsePrepLog(row.prep_log_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function assertProject(projectId: string) {
  const project = flowProjectRepository.get(projectId)
  if (!project) throw new Error('Projeto Flow não encontrado.')
  return project
}

export const flowGenerationCardRepository = {
  listByProject(projectId: string): FlowGenerationCard[] {
    const id = projectId.trim()
    if (!id) return []
    return (
      getDb()
        .prepare(`${SELECT} WHERE project_id = ? ORDER BY number ASC, created_at ASC`)
        .all(id) as Row[]
    ).map(mapRow)
  },

  get(id: string): FlowGenerationCard | null {
    const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined
    return row ? mapRow(row) : null
  },

  add(projectId: string, prompt: string, number?: number): FlowGenerationCard {
    const project = assertProject(projectId)
    const existing = this.listByProject(project.id)
    const nextNumber =
      Number.isFinite(number) && Number(number) > 0
        ? Math.floor(Number(number))
        : existing.reduce((max, item) => Math.max(max, item.number), 0) + 1
    const id = randomUUID()
    const now = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO google_flow_generation_cards (
          id, project_id, number, prompt, status, last_error, prep_log_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'draft', NULL, '[]', ?, ?)`,
      )
      .run(id, project.id, nextNumber, normalizeFlowProjectPrompt(prompt), now, now)
    const created = this.get(id)
    if (!created) throw new Error('Falha ao criar card de geração.')
    return created
  },

  importPrompts(projectId: string, prompts: Array<{ number: number; text: string }>): FlowGenerationCard[] {
    assertProject(projectId)
    const created: FlowGenerationCard[] = []
    for (const entry of prompts) {
      const text = normalizeFlowProjectPrompt(entry.text)
      if (!text.trim()) continue
      created.push(this.add(projectId, text, entry.number))
    }
    return created
  },

  update(id: string, patch: FlowGenerationCardUpdateInput): FlowGenerationCard | null {
    const current = this.get(id)
    if (!current) return null
    const nextPrompt =
      patch.prompt !== undefined ? normalizeFlowProjectPrompt(patch.prompt) : current.prompt
    const nextStatus: FlowGenerationCardStatus =
      patch.status !== undefined ? normalizeFlowGenerationCardStatus(patch.status) : current.status
    const nextError =
      patch.lastError !== undefined
        ? patch.lastError?.trim() || null
        : current.lastError
    const nextLog = patch.prepLog !== undefined ? patch.prepLog.slice(0, 40) : current.prepLog
    const updatedAt = new Date().toISOString()
    getDb()
      .prepare(
        `UPDATE google_flow_generation_cards SET
          prompt = ?,
          status = ?,
          last_error = ?,
          prep_log_json = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(nextPrompt, nextStatus, nextError, JSON.stringify(nextLog), updatedAt, id)
    return this.get(id)
  },

  remove(id: string): boolean {
    const current = this.get(id)
    if (!current) return false
    getDb().prepare('DELETE FROM google_flow_generation_cards WHERE id = ?').run(id)
    return true
  },

  removeByProject(projectId: string): number {
    const id = projectId.trim()
    if (!id) return 0
    const before = this.listByProject(id).length
    getDb().prepare('DELETE FROM google_flow_generation_cards WHERE project_id = ?').run(id)
    return before
  },
}
