import { randomUUID } from 'node:crypto'
import { getDb } from '../db/database'
import { projectRepository } from './projectRepository'
import type {
  ChatActionLog,
  ChatActionResult,
  ChatAgentId,
  ChatAttachment,
  ChatConversation,
  ChatConversationDetail,
  ChatMessage,
  ChatPendingConfirmation,
} from '../../shared/chat/types'

type ConversationRow = {
  id: string
  title: string
  project_id: string | null
  use_project_context: number
  last_agent: string | null
  created_at: string
  updated_at: string
}

type MessageRow = {
  id: string
  conversation_id: string
  role: string
  agent: string | null
  content: string
  actions_json: string | null
  attachments_json: string | null
  pending_json: string | null
  created_at: string
}

type LogRow = {
  id: string
  conversation_id: string
  message_id: string | null
  agent: string
  action_name: string
  summary: string
  status: string
  created_at: string
}

function asAgent(value: string | null): ChatAgentId | null {
  return value === 'codex' || value === 'antigravity' ? value : null
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw?.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function mapConversation(row: ConversationRow): ChatConversation {
  const projectId = row.project_id?.trim() || null
  const project = projectId ? projectRepository.get(projectId) : null
  return {
    id: row.id,
    title: row.title,
    projectId,
    projectName: project?.name ?? null,
    useProjectContext: Number(row.use_project_context) === 1,
    lastAgent: asAgent(row.last_agent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role === 'assistant' || row.role === 'system' ? row.role : 'user',
    agent: asAgent(row.agent),
    content: row.content ?? '',
    attachments: parseJson<ChatAttachment[]>(row.attachments_json, []),
    actions: parseJson<ChatActionResult[]>(row.actions_json, []),
    pendingConfirmation: parseJson<ChatPendingConfirmation | null>(row.pending_json, null),
    createdAt: row.created_at,
  }
}

function mapLog(row: LogRow): ChatActionLog {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    agent: asAgent(row.agent) ?? 'codex',
    actionName: row.action_name,
    summary: row.summary,
    status: row.status === 'error' ? 'error' : 'success',
    createdAt: row.created_at,
  }
}

export const chatRepository = {
  listConversations(): ChatConversation[] {
    const rows = getDb()
      .prepare('SELECT * FROM chat_conversations ORDER BY updated_at DESC')
      .all() as ConversationRow[]
    return rows.map(mapConversation)
  },

  getConversation(id: string): ChatConversation | null {
    const row = getDb()
      .prepare('SELECT * FROM chat_conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined
    return row ? mapConversation(row) : null
  },

  getDetail(id: string): ChatConversationDetail | null {
    const conversation = this.getConversation(id)
    if (!conversation) return null
    return {
      conversation,
      messages: this.listMessages(id),
      actionLogs: this.listLogs(id),
    }
  },

  createConversation(input?: {
    title?: string
    projectId?: string | null
    useProjectContext?: boolean
    lastAgent?: ChatAgentId | null
  }): ChatConversation {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO chat_conversations (id, title, project_id, use_project_context, last_agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input?.title?.trim() || 'Nova conversa',
        input?.projectId?.trim() || null,
        input?.useProjectContext ? 1 : 0,
        input?.lastAgent ?? null,
        timestamp,
        timestamp,
      )
    return this.getConversation(id)!
  },

  updateConversation(
    id: string,
    patch: Partial<{
      title: string
      projectId: string | null
      useProjectContext: boolean
      lastAgent: ChatAgentId | null
    }>,
  ): ChatConversation | null {
    const current = this.getConversation(id)
    if (!current) return null
    getDb()
      .prepare(
        `UPDATE chat_conversations
         SET title = ?, project_id = ?, use_project_context = ?, last_agent = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.title !== undefined ? patch.title.trim() || current.title : current.title,
        patch.projectId !== undefined ? patch.projectId : current.projectId,
        patch.useProjectContext !== undefined
          ? patch.useProjectContext
            ? 1
            : 0
          : current.useProjectContext
            ? 1
            : 0,
        patch.lastAgent !== undefined ? patch.lastAgent : current.lastAgent,
        new Date().toISOString(),
        id,
      )
    return this.getConversation(id)
  },

  touch(id: string): void {
    getDb()
      .prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
  },

  removeConversation(id: string): boolean {
    const current = this.getConversation(id)
    if (!current) return false
    getDb().prepare('DELETE FROM chat_action_logs WHERE conversation_id = ?').run(id)
    getDb().prepare('DELETE FROM chat_messages WHERE conversation_id = ?').run(id)
    getDb().prepare('DELETE FROM chat_conversations WHERE id = ?').run(id)
    return true
  },

  listMessages(conversationId: string): ChatMessage[] {
    const rows = getDb()
      .prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as MessageRow[]
    return rows.map(mapMessage)
  },

  addMessage(input: {
    conversationId: string
    role: ChatMessage['role']
    agent?: ChatAgentId | null
    content: string
    attachments?: ChatAttachment[]
    actions?: ChatActionResult[]
    pendingConfirmation?: ChatPendingConfirmation | null
  }): ChatMessage {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO chat_messages (id, conversation_id, role, agent, content, actions_json, attachments_json, pending_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.conversationId,
        input.role,
        input.agent ?? null,
        input.content,
        JSON.stringify(input.actions ?? []),
        JSON.stringify(input.attachments ?? []),
        input.pendingConfirmation ? JSON.stringify(input.pendingConfirmation) : null,
        timestamp,
      )
    this.touch(input.conversationId)
    return this.getMessage(id)!
  },

  getMessage(id: string): ChatMessage | null {
    const row = getDb()
      .prepare('SELECT * FROM chat_messages WHERE id = ?')
      .get(id) as MessageRow | undefined
    return row ? mapMessage(row) : null
  },

  updateMessage(
    id: string,
    patch: Partial<{
      content: string
      actions: ChatActionResult[]
      pendingConfirmation: ChatPendingConfirmation | null
    }>,
  ): ChatMessage | null {
    const current = this.getMessage(id)
    if (!current) return null
    getDb()
      .prepare('UPDATE chat_messages SET content = ?, actions_json = ?, pending_json = ? WHERE id = ?')
      .run(
        patch.content ?? current.content,
        JSON.stringify(patch.actions ?? current.actions),
        (patch.pendingConfirmation !== undefined
          ? patch.pendingConfirmation
          : current.pendingConfirmation)
          ? JSON.stringify(
              patch.pendingConfirmation !== undefined
                ? patch.pendingConfirmation
                : current.pendingConfirmation,
            )
          : null,
        id,
      )
    return this.getMessage(id)
  },

  clearPending(conversationId: string): void {
    getDb()
      .prepare('UPDATE chat_messages SET pending_json = NULL WHERE conversation_id = ?')
      .run(conversationId)
  },

  addLog(input: {
    conversationId: string
    messageId?: string | null
    agent: ChatAgentId
    actionName: string
    summary: string
    status: 'success' | 'error'
  }): ChatActionLog {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    getDb()
      .prepare(
        `INSERT INTO chat_action_logs (id, conversation_id, message_id, agent, action_name, summary, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.conversationId,
        input.messageId ?? null,
        input.agent,
        input.actionName,
        input.summary,
        input.status,
        timestamp,
      )
    return this.listLogs(input.conversationId).find((item) => item.id === id)!
  },

  listLogs(conversationId: string): ChatActionLog[] {
    const rows = getDb()
      .prepare('SELECT * FROM chat_action_logs WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as LogRow[]
    return rows.map(mapLog)
  },
}
