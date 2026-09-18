import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { IPC } from '../../../shared/types'
import { ATLAS_ACTION_CATALOG, actionRequiresConfirmation, formatActionCatalogForPrompt } from '../../../shared/chat/actionCatalog'
import { chatAreasPromptNote, filterChatActions } from '../../../shared/workspaceCapabilities'
import { getWorkspaceCapabilities } from '../workspace/getWorkspaceCapabilities'
import { parseAgentResponse, titleFromFirstMessage } from '../../../shared/chat/parseAgentResponse'
import type {
  ChatActionCall,
  ChatActionLog,
  ChatActionResult,
  ChatAgentId,
  ChatAgentStatusSnapshot,
  ChatClientContext,
  ChatConversation,
  ChatConversationDetail,
  ChatMessage,
  ChatPendingConfirmation,
  ChatProgressEvent,
  ChatSendMessageRequest,
  ChatSendMessageResult,
} from '../../../shared/chat/types'
import { chatRepository } from '../../repositories/chatRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import type { CodexService } from '../codex/CodexService'
import type { CodexRuntimeManager } from '../codex/CodexRuntimeManager'
import type { AntigravityService } from '../antigravity/AntigravityService'
import type { AtlasActionRegistry } from '../actions/AtlasActionRegistry'
import {
  attachmentParentDirs,
  formatAttachmentsForPrompt,
  prepareChatAttachments,
} from './attachments'

const MAX_HISTORY = 12

function agentLabel(agent: ChatAgentId): string {
  return agent === 'codex' ? 'Codex' : 'Antigravity'
}

function runningLabel(name: string): string {
  const map: Record<string, string> = {
    create_channel: 'Criando canal...',
    create_project: 'Criando projeto...',
    create_task: 'Criando tarefa...',
    save_quick_prompt: 'Salvando prompt...',
    create_quick_prompt: 'Salvando prompt...',
    delete_project: 'Excluindo projeto...',
    delete_channel: 'Excluindo canal...',
    delete_task: 'Excluindo tarefa...',
    open_project: 'Abrindo projeto...',
    list_tasks: 'Consultando tarefas...',
    list_projects: 'Consultando projetos...',
    create_script: 'Criando roteiro...',
    adjust_script: 'Revisando roteiro...',
  }
  return map[name] ?? 'Executando ação...'
}

function confirmationCopy(actions: ChatActionCall[]): ChatPendingConfirmation {
  const names = actions.map((item) => item.name)
  const hasFiles = names.includes('delete_project_files')
  const hasProject = names.includes('delete_project')
  const hasChannel = names.includes('delete_channel')
  const hasTask = names.includes('delete_task')
  const title = hasFiles
    ? 'Apagar arquivos físicos?'
    : hasProject
      ? 'Excluir projeto do Atlas?'
      : hasChannel
        ? 'Excluir canal?'
        : hasTask
          ? 'Excluir tarefa?'
          : 'Confirmar ação destrutiva?'
  const message = hasFiles
    ? 'Isso apaga a pasta do projeto no disco e não pode ser desfeito. O cadastro no Atlas não é o mesmo que apagar arquivos.'
    : hasProject
      ? 'O cadastro será removido do Atlas. A pasta física NÃO será apagada.'
      : 'Esta ação não pode ser desfeita facilmente. Confirme para continuar.'
  const confirmLabel = hasFiles
    ? 'Apagar arquivos'
    : hasProject
      ? 'Excluir projeto'
      : hasChannel
        ? 'Excluir canal'
        : hasTask
          ? 'Excluir tarefa'
          : 'Confirmar'
  return { id: randomUUID(), title, message, confirmLabel, actions }
}

function buildSystemPrompt(ctx: ChatClientContext, today: string): string {
  const capabilities = getWorkspaceCapabilities()
  const contextLines: string[] = [
    `Hoje é ${today}.`,
    'Você é o assistente do Atlas Studio. Pode conversar normalmente OU solicitar ações oficiais.',
    'Não invente SQL, shell ou acesso a arquivos. Só use as ações listadas.',
    'Não diga que executou uma ação se ela não estiver em "actions".',
    'Ações destrutivas (delete_*) exigem confirmação do usuário — ainda assim inclua-as em actions.',
    'delete_project NUNCA apaga pasta física. Só use delete_project_files se o usuário pedir explicitamente para apagar arquivos do disco.',
    'Canais não têm campo de idioma: se o usuário informar idioma, passe em language na create_channel.',
    'Responda em JSON com: message (texto para o usuário), actions (array de {name, input}), conversationTitle opcional.',
    'Se for só conversa (ideias, títulos, rascunhos), actions deve ser [].',
    'Se o usuário pedir para salvar, guardar, criar ou cadastrar um prompt, use save_quick_prompt com name e o texto completo. O item aparece em Prompts → Meus prompts. Não deixe o prompt só no chat.',
    'Não misture agentes: você é um único agente nesta resposta.',
    chatAreasPromptNote(capabilities),
    '',
    'Ações:',
    formatActionCatalogForPrompt(filterChatActions(ATLAS_ACTION_CATALOG, capabilities)),
  ]
  if (ctx.useProjectContext && ctx.projectId) {
    contextLines.push(
      '',
      `Contexto do projeto atual (já selecionado, não pergunte de novo): ${ctx.projectName ?? ctx.projectId} (${ctx.projectType ?? ''}) id=${ctx.projectId}`,
    )
  }
  if (ctx.viewPath) contextLines.push(`Tela atual: ${ctx.viewPath}`)
  return contextLines.join('\n')
}

function historyForPrompt(messages: ChatMessage[]): string {
  return messages
    .slice(-MAX_HISTORY)
    .map((item) => {
      const who =
        item.role === 'user' ? 'Usuário' : item.agent ? agentLabel(item.agent) : 'Assistente'
      const body = item.content.slice(0, 2000)
      const attach =
        item.attachments?.length > 0
          ? `\n[Anexos: ${item.attachments.map((file) => `${file.kind}:${file.name}`).join(', ')}]`
          : ''
      return `${who}: ${body}${attach}`
    })
    .join('\n\n')
}

function honestMessage(agentText: string, results: ChatActionResult[]): string {
  const failures = results.filter((item) => item.status === 'error')
  const pending = results.filter((item) => item.status === 'pending')
  if (failures.length > 0) {
    const details = failures.map((item) => item.error || item.title).join(' ')
    return `Não foi possível concluir tudo. ${details}`
  }
  if (pending.length > 0) return agentText.trim() || 'Confirme para continuar.'
  return agentText.trim() || results.map((item) => item.title).filter(Boolean).join(' ')
}

export class ChatService {
  private abort: AbortController | null = null

  constructor(
    private readonly deps: {
      registry: AtlasActionRegistry
      codexService: CodexService
      runtimeManager: CodexRuntimeManager
      antigravityService: AntigravityService
      getMainWindow: () => BrowserWindow | null
    },
  ) {}

  listConversations(): ChatConversation[] {
    return chatRepository.listConversations()
  }

  getConversation(id: string): ChatConversationDetail | null {
    return chatRepository.getDetail(id)
  }

  createConversation(input?: {
    title?: string
    projectId?: string | null
    useProjectContext?: boolean
    lastAgent?: ChatAgentId | null
    modelOverride?: string | null
    effortOverride?: string | null
  }): ChatConversation {
    return chatRepository.createConversation(input)
  }

  renameConversation(id: string, title: string): ChatConversation | null {
    return chatRepository.updateConversation(id, { title })
  }

  setConversationContext(
    id: string,
    patch: {
      projectId?: string | null
      useProjectContext?: boolean
      lastAgent?: ChatAgentId | null
      modelOverride?: string | null
      effortOverride?: string | null
    },
  ): ChatConversation | null {
    return chatRepository.updateConversation(id, patch)
  }

  removeConversation(id: string): boolean {
    return chatRepository.removeConversation(id)
  }

  agentStatus(): ChatAgentStatusSnapshot {
    const codex = this.deps.runtimeManager.getStatus()
    const antigravity = this.deps.antigravityService.getStatus()
    return {
      agents: [
        {
          id: 'codex',
          label: 'Codex',
          ready: Boolean(codex.connected && codex.authenticated),
          connected: Boolean(codex.connected),
          message: codex.message || (codex.connected ? 'Pronto' : 'Desconectado'),
        },
        {
          id: 'antigravity',
          label: 'Antigravity',
          ready: Boolean(antigravity.connected && antigravity.authenticated),
          connected: Boolean(antigravity.connected),
          message: antigravity.message || (antigravity.connected ? 'Pronto' : 'Desconectado'),
        },
      ],
    }
  }

  prepareAttachments(paths: string[]) {
    return prepareChatAttachments(paths)
  }

  async sendMessage(request: ChatSendMessageRequest): Promise<ChatSendMessageResult> {
    const text = request.text?.trim()
    const attachments = request.attachments ?? []
    if (!text && attachments.length === 0) throw new Error('Escreva uma mensagem ou anexe um arquivo.')
    const agent = request.agent
    this.assertAgentReady(agent)

    const client = this.resolveClientContext(request)
    const displayText = text || attachments.map((item) => item.name).join(', ')
    let conversation = request.conversationId
      ? chatRepository.getConversation(request.conversationId)
      : null
    if (!conversation) {
      conversation = chatRepository.createConversation({
        title: titleFromFirstMessage(displayText),
        projectId: client.projectId ?? null,
        useProjectContext: client.useProjectContext,
        lastAgent: agent,
        modelOverride: request.modelOverride ?? null,
        effortOverride: request.effortOverride ?? null,
      })
    } else {
      chatRepository.updateConversation(conversation.id, {
        lastAgent: agent,
        projectId: client.projectId ?? conversation.projectId,
        useProjectContext: client.useProjectContext,
        modelOverride:
          request.modelOverride !== undefined ? request.modelOverride : conversation.modelOverride,
        effortOverride:
          request.effortOverride !== undefined ? request.effortOverride : conversation.effortOverride,
      })
      conversation = chatRepository.getConversation(conversation.id)!
    }

    chatRepository.clearPending(conversation.id)
    const userMessage = chatRepository.addMessage({
      conversationId: conversation.id,
      role: 'user',
      agent: null,
      content: displayText,
      attachments,
    })

    const assistant = await this.runAgentTurn({
      conversationId: conversation.id,
      agent,
      client,
      confirmed: false,
      readableDirs: attachmentParentDirs(attachments),
      attachmentPrompt: formatAttachmentsForPrompt(attachments),
      model: conversation.modelOverride,
      effort: conversation.effortOverride,
    })

    if (conversation.title === 'Nova conversa') {
      conversation =
        chatRepository.updateConversation(conversation.id, {
          title: titleFromFirstMessage(displayText),
        }) ?? conversation
    }

    return {
      conversation: chatRepository.getConversation(conversation.id)!,
      userMessage,
      assistantMessage: assistant.message,
      actionLogs: assistant.logs,
    }
  }

  async confirmActions(conversationId: string, accepted: boolean): Promise<ChatSendMessageResult> {
    const detail = chatRepository.getDetail(conversationId)
    if (!detail) throw new Error('Conversa não encontrada.')
    const pendingMessage = [...detail.messages].reverse().find((item) => item.pendingConfirmation)
    if (!pendingMessage?.pendingConfirmation) {
      throw new Error('Não há ação aguardando confirmação.')
    }
    const pending = pendingMessage.pendingConfirmation
    const agent = pendingMessage.agent ?? detail.conversation.lastAgent ?? 'codex'
    chatRepository.clearPending(conversationId)

    if (!accepted) {
      const updated =
        chatRepository.updateMessage(pendingMessage.id, {
          content: `${pendingMessage.content}\n\nAção cancelada.`,
          pendingConfirmation: null,
        }) ?? pendingMessage
      return {
        conversation: chatRepository.getConversation(conversationId)!,
        userMessage: detail.messages.filter((item) => item.role === 'user').slice(-1)[0] ?? updated,
        assistantMessage: updated,
        actionLogs: chatRepository.listLogs(conversationId),
      }
    }

    this.emitProgress({
      conversationId,
      phase: 'acting',
      label: `${agentLabel(agent)} está executando...`,
    })

    const client: ChatClientContext = {
      useProjectContext: detail.conversation.useProjectContext,
      projectId: detail.conversation.projectId,
      projectName: detail.conversation.projectName,
      viewPath: '',
    }
    const results = await this.executeCalls(pending.actions, {
      conversationId,
      agent,
      confirmed: true,
      client,
    })
    const content = honestMessage(pendingMessage.content, results)
    const updated =
      chatRepository.updateMessage(pendingMessage.id, {
        content,
        actions: results,
        pendingConfirmation: null,
      }) ?? pendingMessage
    const logs = this.persistLogs(conversationId, updated.id, agent, results)
    this.emitProgress({ conversationId, phase: 'done', label: 'Concluído.' })
    return {
      conversation: chatRepository.getConversation(conversationId)!,
      userMessage: detail.messages.filter((item) => item.role === 'user').slice(-1)[0] ?? updated,
      assistantMessage: { ...updated, content, actions: results, pendingConfirmation: null },
      actionLogs: logs,
    }
  }

  private assertAgentReady(agent: ChatAgentId) {
    const status = this.agentStatus().agents.find((item) => item.id === agent)
    if (!status?.ready) {
      throw new Error(
        `${agentLabel(agent)} está indisponível. ${status?.message ?? 'Configure o agente em Configurações.'}`,
      )
    }
  }

  private resolveClientContext(request: ChatSendMessageRequest): ChatClientContext {
    const ctx = request.context ?? { useProjectContext: false }
    let projectName = ctx.projectName ?? null
    let projectType = ctx.projectType ?? null
    if (ctx.useProjectContext && ctx.projectId) {
      const project = projectRepository.get(ctx.projectId)
      if (project) {
        projectName = project.name
        projectType = project.projectType
      }
    }
    return {
      useProjectContext: Boolean(ctx.useProjectContext && ctx.projectId),
      projectId: ctx.projectId ?? null,
      projectName,
      projectType,
      viewPath: ctx.viewPath,
    }
  }

  private async runAgentTurn(opts: {
    conversationId: string
    agent: ChatAgentId
    client: ChatClientContext
    confirmed: boolean
    extra?: string
    readableDirs?: string[]
    attachmentPrompt?: string
    model?: string | null
    effort?: string | null
  }): Promise<{ message: ChatMessage; logs: ChatActionLog[] }> {
    this.abort?.abort()
    this.abort = new AbortController()
    const { conversationId, agent, client } = opts

    this.emitProgress({
      conversationId,
      phase: 'thinking',
      label: `${agentLabel(agent)} está pensando...`,
    })

    const messages = chatRepository.listMessages(conversationId)
    const today = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    const settings = settingsRepository.get()
    const prompt = [
      buildSystemPrompt(client, today),
      settings.accountName ? `Usuário do Atlas: ${settings.accountName}` : '',
      '',
      'Histórico:',
      historyForPrompt(messages),
      opts.attachmentPrompt ?? '',
      opts.extra ? `\nResultados das ações:\n${opts.extra}` : '',
      '',
      'Responda agora em JSON.',
    ]
      .filter((line) => line !== '')
      .join('\n')

    const raw = await this.callAgent(agent, prompt, opts.readableDirs, {
      model: opts.model,
      effort: opts.effort,
    })
    let parsed = parseAgentResponse(raw)

    let results: ChatActionResult[] = []
    let pending: ChatPendingConfirmation | null = null

    if (parsed.actions.length > 0) {
      const destructive = parsed.actions.filter((call) => actionRequiresConfirmation(call.name))
      const safe = parsed.actions.filter((call) => !actionRequiresConfirmation(call.name))

      if (destructive.length > 0 && !opts.confirmed) {
        pending = confirmationCopy(destructive)
        results = [
          ...(await this.executeCalls(safe, { conversationId, agent, confirmed: false, client })),
          ...destructive.map((call) => ({
            name: call.name,
            status: 'pending' as const,
            title: 'Aguardando confirmação',
            subtitle: call.name,
          })),
        ]
      } else {
        results = await this.executeCalls(parsed.actions, {
          conversationId,
          agent,
          confirmed: opts.confirmed,
          client,
        })
      }
    }

    const lookups = results.filter(
      (item) =>
        item.status === 'success' &&
        (item.name.startsWith('list_') || item.name.startsWith('get_')),
    )
    if (!pending && lookups.length > 0 && parsed.actions.length > 0 && !opts.extra) {
      const extra = JSON.stringify(
        lookups.map((item) => ({ name: item.name, data: item.data, title: item.title })),
      ).slice(0, 8000)
      try {
        const followRaw = await this.callAgent(
          agent,
          `${prompt}\n\nResultados já executados (use para responder com precisão, sem repetir as ações):\n${extra}\n\nJSON final com message e actions vazio, a menos que falte uma ação de escrita.`,
          opts.readableDirs,
          { model: opts.model, effort: opts.effort },
        )
        const follow = parseAgentResponse(followRaw)
        if (follow.message) parsed = { ...parsed, message: follow.message }
        if (follow.actions.length > 0) {
          const extraResults = await this.executeCalls(follow.actions, {
            conversationId,
            agent,
            confirmed: false,
            client,
          })
          results = [...results, ...extraResults]
        }
      } catch {
        /* mantém a primeira resposta */
      }
    }

    const content = honestMessage(parsed.message, results)
    const assistantMessage = chatRepository.addMessage({
      conversationId,
      role: 'assistant',
      agent,
      content,
      actions: results,
      pendingConfirmation: pending,
    })
    const logs = this.persistLogs(conversationId, assistantMessage.id, agent, results)
    this.emitProgress({ conversationId, phase: 'done', label: 'Concluído.' })
    return { message: assistantMessage, logs }
  }

  private async executeCalls(
    calls: ChatActionCall[],
    ctx: {
      conversationId: string
      agent: ChatAgentId
      confirmed: boolean
      client: ChatClientContext
    },
  ): Promise<ChatActionResult[]> {
    const results: ChatActionResult[] = []
    for (const call of calls) {
      this.emitProgress({
        conversationId: ctx.conversationId,
        phase: 'acting',
        label: `${agentLabel(ctx.agent)} está ${runningLabel(call.name).toLowerCase()}`,
        actionName: call.name,
      })
      const result = await this.deps.registry.execute(call, {
        conversationId: ctx.conversationId,
        agent: ctx.agent,
        confirmed: ctx.confirmed,
        client: ctx.client,
      })
      results.push(result)
    }
    return results
  }

  private persistLogs(
    conversationId: string,
    messageId: string,
    agent: ChatAgentId,
    results: ChatActionResult[],
  ): ChatActionLog[] {
    const logs: ChatActionLog[] = []
    for (const result of results) {
      if (result.status !== 'success' && result.status !== 'error') continue
      logs.push(
        chatRepository.addLog({
          conversationId,
          messageId,
          agent,
          actionName: result.name,
          summary: `${agentLabel(agent)} ${result.title}${result.subtitle ? ` ${result.subtitle}` : ''}`,
          status: result.status,
        }),
      )
    }
    return chatRepository.listLogs(conversationId)
  }

  private async callAgent(
    agent: ChatAgentId,
    prompt: string,
    readableDirs?: string[],
    override?: { model?: string | null; effort?: string | null },
  ): Promise<string> {
    if (agent === 'codex') {
      return this.deps.codexService.runChatPrompt(prompt, this.abort?.signal, readableDirs, override)
    }
    const structured = await this.deps.antigravityService.runChatPrompt(prompt, override)
    return JSON.stringify(structured)
  }

  private emitProgress(event: ChatProgressEvent) {
    const win = this.deps.getMainWindow()
    win?.webContents.send(IPC.chat.progress, event)
  }
}
