export type ChatAgentId = 'codex' | 'antigravity'

export type ChatActionCategory =
  | 'projects'
  | 'channels'
  | 'tasks'
  | 'quick_prompts'
  | 'scripts'
  | 'context'

export type ChatActionStatus = 'running' | 'success' | 'error' | 'pending'

export interface ChatActionDefinition {
  name: string
  description: string
  category: ChatActionCategory
  confirmationRequired: boolean
  inputSchema: Record<string, unknown>
}

export interface ChatActionCall {
  name: string
  input: Record<string, unknown>
}

export interface ChatActionResult {
  name: string
  status: ChatActionStatus
  title: string
  subtitle?: string
  error?: string
  navigateTo?: string
  navigateLabel?: string
  entityType?: string
  entityId?: string
  /** Dados resumidos para o agente (nunca SQL cru). */
  data?: unknown
}

export interface ChatPendingConfirmation {
  id: string
  title: string
  message: string
  confirmLabel: string
  actions: ChatActionCall[]
}

export interface ChatConversation {
  id: string
  title: string
  projectId: string | null
  projectName?: string | null
  useProjectContext: boolean
  lastAgent: ChatAgentId | null
  modelOverride: string | null
  effortOverride: string | null
  createdAt: string
  updatedAt: string
}

export type ChatAttachmentKind = 'image' | 'audio' | 'text' | 'file'

export interface ChatAttachment {
  name: string
  path: string
  kind: ChatAttachmentKind
  size: number
  textExcerpt?: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  agent: ChatAgentId | null
  content: string
  attachments: ChatAttachment[]
  actions: ChatActionResult[]
  pendingConfirmation: ChatPendingConfirmation | null
  createdAt: string
}

export interface ChatActionLog {
  id: string
  conversationId: string
  messageId: string | null
  agent: ChatAgentId
  actionName: string
  summary: string
  status: 'success' | 'error'
  createdAt: string
}

export interface ChatConversationDetail {
  conversation: ChatConversation
  messages: ChatMessage[]
  actionLogs: ChatActionLog[]
}

export interface ChatClientContext {
  useProjectContext: boolean
  projectId?: string | null
  projectName?: string | null
  projectType?: 'history' | 'music' | null
  viewPath?: string
}

export interface ChatSendMessageRequest {
  conversationId?: string
  agent: ChatAgentId
  text: string
  attachments?: ChatAttachment[]
  context?: ChatClientContext
  modelOverride?: string | null
  effortOverride?: string | null
}

export interface ChatSendMessageResult {
  conversation: ChatConversation
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  actionLogs: ChatActionLog[]
}

export interface ChatProgressEvent {
  conversationId: string
  phase: 'thinking' | 'acting' | 'done'
  label: string
  actionName?: string
}

export interface ChatAgentAvailability {
  id: ChatAgentId
  label: string
  ready: boolean
  connected: boolean
  message: string
}

export interface ChatAgentStatusSnapshot {
  agents: ChatAgentAvailability[]
}
