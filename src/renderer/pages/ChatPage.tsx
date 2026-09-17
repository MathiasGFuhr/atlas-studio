import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Image as ImageIcon,
  MessageSquarePlus,
  Music,
  Paperclip,
  MoreVertical,
  Pencil,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import type {
  ChatAgentId,
  ChatAgentStatusSnapshot,
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatProgressEvent,
} from '@shared/chat/types'
import type { Project } from '@shared/types'
import { getAtlasApi } from '../lib/api'
import { cn } from '../lib/utils'
import { Button } from '../components/Button'
import { ChatActionCards } from '../components/chat/ChatActionCards'
import { ChatAgentBar } from '../components/chat/ChatAgentBar'
import { useAgentModels } from '../hooks/useAgentModels'
import { notifyProjectsChanged } from '../lib/projectEvents'
import { notifyChannelsChanged } from '../lib/channelEvents'
import { notifyTasksChanged } from '../lib/taskEvents'
import { useToast } from '../components/Toast'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function agentLabel(agent: ChatAgentId | null) {
  if (agent === 'antigravity') return 'Antigravity'
  if (agent === 'codex') return 'Codex'
  return 'Você'
}

function attachmentIcon(kind: ChatAttachment['kind']) {
  if (kind === 'image') return ImageIcon
  if (kind === 'audio') return Music
  return FileText
}

export function ChatPage({
  variant = 'page',
  launchProjectId = null,
  onClose,
  onLaunchConsumed,
  onResetSize,
}: {
  variant?: 'page' | 'dock'
  launchProjectId?: string | null
  onClose?: () => void
  onLaunchConsumed?: () => void
  onResetSize?: () => void
}) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [actionLogs, setActionLogs] = useState<{ createdAt: string; summary: string }[]>([])
  const [agent, setAgent] = useState<ChatAgentId>('codex')
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const [effortOverride, setEffortOverride] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<ChatAgentStatusSnapshot | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState<ChatProgressEvent | null>(null)
  const [useProjectContext, setUseProjectContext] = useState(false)
  const [contextProject, setContextProject] = useState<Project | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false)
  const sizeMenuRef = useRef<HTMLDivElement>(null)
  const [renameValue, setRenameValue] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { bundle, loading } = useAgentModels()
  const bootstrapped = useRef(false)
  const consumedLaunch = useRef<string | null>(null)

  const loadList = useCallback(async () => {
    const list = await api.chat.listConversations()
    setConversations(list)
    return list
  }, [api])

  const loadConversation = useCallback(
    async (id: string) => {
      const detail = await api.chat.getConversation(id)
      if (!detail) return
      setActiveId(id)
      setMessages(detail.messages)
      setActionLogs(detail.actionLogs.map((item) => ({ createdAt: item.createdAt, summary: item.summary })))
      setUseProjectContext(detail.conversation.useProjectContext)
      if (detail.conversation.lastAgent) setAgent(detail.conversation.lastAgent)
      setModelOverride(detail.conversation.modelOverride)
      setEffortOverride(detail.conversation.effortOverride)
      if (detail.conversation.projectId) {
        const project = await api.projects.get(detail.conversation.projectId)
        setContextProject(project)
      } else {
        setContextProject(null)
      }
    },
    [api],
  )

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    void (async () => {
      const status = await api.chat.agentStatus()
      setAgentStatus(status)
      const ready = status.agents.find((item) => item.ready)
      if (ready) setAgent(ready.id)

      const list = await loadList()
      if (list[0]) await loadConversation(list[0].id)
    })()
  }, [api, loadConversation, loadList])

  useEffect(() => {
    if (!sizeMenuOpen) return
    function onPointer(event: MouseEvent) {
      if (sizeMenuRef.current && !sizeMenuRef.current.contains(event.target as Node)) {
        setSizeMenuOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSizeMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [sizeMenuOpen])

  useEffect(() => {
    if (!launchProjectId || consumedLaunch.current === launchProjectId) return
    consumedLaunch.current = launchProjectId
    void (async () => {
      const project = await api.projects.get(launchProjectId)
      const created = await api.chat.createConversation({
        title: project ? project.name : 'Projeto',
        projectId: launchProjectId,
        useProjectContext: true,
      })
      setContextProject(project)
      setUseProjectContext(true)
      await loadList()
      await loadConversation(created.id)
      onLaunchConsumed?.()
    })()
  }, [api, launchProjectId, loadConversation, loadList, onLaunchConsumed])

  useEffect(() => {
    return api.chat.onProgress((event) => {
      setProgress(event.phase === 'done' ? null : event)
    })
  }, [api])

  useEffect(() => {
    const refresh = () => {
      void api.chat.agentStatus().then(setAgentStatus)
    }
    const offCodex = api.codex.onAuthStateChanged(refresh)
    const offAgy = api.antigravity.onAuthStateChanged(refresh)
    return () => {
      offCodex()
      offAgy()
    }
  }, [api])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, progress, sending])

  const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant')

  const selectedStatus = agentStatus?.agents.find((item) => item.id === agent)
  const agentSnapshot = bundle[agent]

  async function persistConversationPatch(patch: {
    lastAgent?: ChatAgentId | null
    modelOverride?: string | null
    effortOverride?: string | null
  }) {
    if (!activeId) return
    await api.chat.setContext(activeId, patch)
    await loadList()
  }

  async function changeAgent(next: ChatAgentId) {
    setAgent(next)
    await persistConversationPatch({ lastAgent: next })
  }

  async function changeModelOverride(value: string) {
    const next = value.trim() || null
    setModelOverride(next)
    await persistConversationPatch({ modelOverride: next })
  }

  async function changeEffortOverride(value: string) {
    const next = value.trim() || null
    setEffortOverride(next)
    await persistConversationPatch({ effortOverride: next })
  }

  async function startNewConversation() {
    const created = await api.chat.createConversation({
      projectId: useProjectContext ? contextProject?.id ?? null : null,
      useProjectContext: Boolean(useProjectContext && contextProject),
      lastAgent: agent,
      modelOverride: null,
      effortOverride: null,
    })
    setModelOverride(null)
    setEffortOverride(null)
    await loadList()
    await loadConversation(created.id)
  }

  async function send() {
    const text = draft.trim()
    if ((!text && attachments.length === 0) || sending) return
    if (selectedStatus && !selectedStatus.ready) {
      push(`${selectedStatus.label} está indisponível.`, 'error')
      return
    }
    setSending(true)
    setDraft('')
    const pendingAttachments = attachments
    setAttachments([])
    try {
      const result = await api.chat.sendMessage({
        conversationId: activeId ?? undefined,
        agent,
        text,
        attachments: pendingAttachments,
        modelOverride,
        effortOverride,
        context: {
          useProjectContext: Boolean(useProjectContext && contextProject),
          projectId: contextProject?.id ?? null,
          projectName: contextProject?.name ?? null,
          projectType: contextProject?.projectType ?? null,
          viewPath: variant === 'dock' ? 'chat-dock' : '/chat',
        },
      })
      setActiveId(result.conversation.id)
      await loadList()
      await loadConversation(result.conversation.id)
      notifyFromActions(result.assistantMessage)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.', 'error')
      setAttachments(pendingAttachments)
    } finally {
      setSending(false)
      setProgress(null)
      textareaRef.current?.focus()
    }
  }

  async function confirmPending(accepted: boolean) {
    if (!activeId) return
    setConfirming(true)
    try {
      const result = await api.chat.confirmActions(activeId, accepted)
      await loadConversation(result.conversation.id)
      if (accepted) notifyFromActions(result.assistantMessage)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível confirmar.', 'error')
    } finally {
      setConfirming(false)
    }
  }

  function notifyFromActions(message: ChatMessage) {
    const names = message.actions.map((item) => item.name)
    if (names.some((name) => name.includes('project') || name.includes('script'))) {
      notifyProjectsChanged()
    }
    if (names.some((name) => name.includes('channel'))) {
      notifyChannelsChanged()
    }
    if (names.some((name) => name.includes('task'))) notifyTasksChanged()
  }

  async function saveRename(id: string) {
    const title = renameValue.trim()
    if (title) await api.chat.renameConversation(id, title)
    setRenamingId(null)
    await loadList()
  }

  async function removeConversation(id: string) {
    await api.chat.removeConversation(id)
    const list = await loadList()
    if (activeId === id) {
      if (list[0]) await loadConversation(list[0].id)
      else {
        setActiveId(null)
        setMessages([])
      }
    }
  }

  async function toggleContext(next: boolean) {
    setUseProjectContext(next)
    if (activeId) {
      await api.chat.setContext(activeId, {
        useProjectContext: next,
        projectId: contextProject?.id ?? null,
      })
      await loadList()
    }
  }

  async function attachFiles() {
    try {
      const paths = await api.dialog.selectFiles()
      if (!paths.length) return
      const prepared = await api.chat.prepareAttachments(paths)
      if (prepared.length === 0) {
        push('Não foi possível anexar os arquivos selecionados.', 'error')
        return
      }
      setAttachments((current) => {
        const byPath = new Map(current.map((item) => [item.path, item]))
        for (const item of prepared) byPath.set(item.path, item)
        return [...byPath.values()]
      })
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao anexar arquivo.', 'error')
    }
  }

  const grouped = useMemo(() => messages, [messages])
  const compact = variant === 'dock'

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      <aside
        className={cn(
          'flex shrink-0 flex-col overflow-hidden border-r border-border-soft bg-sidebar',
          compact ? 'w-[min(10.5rem,38%)] min-w-[8.75rem] max-w-[13.75rem]' : 'w-[240px]',
        )}
      >
        <div className="p-3">
          <Button fullWidth className="h-9 text-xs" icon={<MessageSquarePlus className="h-3.5 w-3.5" />} onClick={() => void startNewConversation()}>
            Nova conversa
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            Conversas recentes
          </p>
          {conversations.length === 0 ? (
            <p className="px-2 text-xs text-muted">Nenhuma conversa ainda.</p>
          ) : (
            conversations.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'group mb-1 flex items-center gap-1 rounded-xl px-2 py-2 text-sm',
                  item.id === activeId ? 'bg-accent-dark/55 text-accent' : 'text-muted hover:bg-white/[0.03] hover:text-text',
                )}
              >
                {renamingId === item.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void saveRename(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename(item.id)
                    }}
                    className="min-w-0 flex-1 rounded-md bg-black/20 px-1 py-0.5 text-xs text-text outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => void loadConversation(item.id)}
                  >
                    {item.title}
                  </button>
                )}
                <button
                  type="button"
                  className="hidden rounded p-1 text-muted hover:text-text group-hover:block"
                  aria-label="Renomear conversa"
                  onClick={() => {
                    setRenamingId(item.id)
                    setRenameValue(item.title)
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="hidden rounded p-1 text-muted hover:text-danger group-hover:block"
                  aria-label="Excluir conversa"
                  onClick={() => void removeConversation(item.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={cn('flex items-center justify-between gap-3 border-b border-border-soft', compact ? 'px-3 py-2.5' : 'px-6 py-4')}>
          <div>
            {compact ? null : <p className="text-xs text-muted-2">Atlas / Chat</p>}
            <h1 className={cn('font-semibold tracking-tight', compact ? 'text-base' : 'text-[22px]')}>CHAT</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ChatAgentBar
              agent={agent}
              snapshot={agentSnapshot}
              modelOverride={modelOverride}
              effortOverride={effortOverride}
              loading={loading[agent]}
              compact={compact}
              onAgentChange={(next) => void changeAgent(next)}
              onModelChange={(value) => void changeModelOverride(value)}
              onEffortChange={(value) => void changeEffortOverride(value)}
            />
            {selectedStatus ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    selectedStatus.ready ? 'bg-accent' : 'bg-muted-2',
                  )}
                />
                {selectedStatus.ready ? 'Pronto' : 'Desconectado'}
              </div>
            ) : null}
            {selectedStatus && !selectedStatus.ready ? (
              <Button variant="secondary" className="h-8 text-xs" onClick={() => navigate('/configuracoes')}>
                Configurar
              </Button>
            ) : null}
            {onResetSize ? (
              <div ref={sizeMenuRef} className="relative">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-text"
                  aria-label="Mais opções do chat"
                  aria-expanded={sizeMenuOpen}
                  onClick={() => setSizeMenuOpen((open) => !open)}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {sizeMenuOpen ? (
                  <div className="absolute right-0 top-full z-30 mt-1 min-w-[10.5rem] rounded-xl border border-border bg-card-2 py-1 shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs text-text hover:bg-white/5"
                      onClick={() => {
                        setSizeMenuOpen(false)
                        onResetSize()
                      }}
                    >
                      Restaurar tamanho
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {onClose ? (
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-text"
                aria-label="Fechar chat"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </header>

        {contextProject ? (
          <div className={cn('flex items-center gap-3 border-b border-border-soft text-sm', compact ? 'px-3 py-2' : 'px-6 py-2.5')}>
            <span className="text-muted">Contexto:</span>
            <span className="font-medium text-text">
              {contextProject.name}
              {contextProject.description ? ` — ${contextProject.description}` : ''}
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={useProjectContext}
                onChange={(e) => void toggleContext(e.target.checked)}
              />
              Usar contexto do projeto atual
            </label>
          </div>
        ) : null}

        <div ref={listRef} className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-3 py-3' : 'px-6 py-5')}>
          {grouped.length === 0 && !sending ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-muted">Peça qualquer coisa ao Atlas.</p>
              <p className="mt-1 max-w-md text-xs text-muted-2">
                Criar canais, projetos, tarefas ou prompts — o Chat usa as mesmas funções da interface.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {grouped.map((message, index) => {
                const prev = grouped[index - 1]
                const showAgent =
                  message.role === 'assistant' &&
                  (prev?.role !== 'assistant' || prev.agent !== message.agent)
                return (
                  <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[85%]', message.role === 'user' ? 'text-right' : 'text-left')}>
                      {showAgent ? (
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                          {agentLabel(message.agent)}
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          'whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed',
                          message.role === 'user'
                            ? 'bg-accent-dark/70 text-text'
                            : 'border border-border-soft bg-card text-text',
                        )}
                      >
                        {message.content}
                      </div>
                      {message.attachments?.length ? (
                        <div className={cn('mt-1.5 flex flex-wrap gap-1', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                          {message.attachments.map((file) => {
                            const Icon = attachmentIcon(file.kind)
                            return (
                              <span
                                key={file.path}
                                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-card-2 px-2 py-1 text-[11px] text-muted"
                              >
                                <Icon className="h-3 w-3 shrink-0" />
                                <span className="truncate">{file.name}</span>
                              </span>
                            )
                          })}
                        </div>
                      ) : null}
                      {message.role === 'assistant' ? (
                        <ChatActionCards
                          results={message.actions}
                          pending={message.pendingConfirmation}
                          confirming={confirming}
                          onConfirm={() => void confirmPending(true)}
                          onCancel={() => void confirmPending(false)}
                        />
                      ) : null}
                      <div className="mt-1 text-[10px] text-muted-2">{formatTime(message.createdAt)}</div>
                    </div>
                  </div>
                )
              })}

              {sending ? (
                <div className="text-sm text-muted">
                  {progress?.label || `${agentLabel(agent)} está pensando...`}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {actionLogs.length > 0 ? (
          <div className={cn('border-t border-border-soft text-[11px] text-muted', compact ? 'px-3 py-1.5' : 'px-6 py-2')}>
            {actionLogs.slice(-3).map((item) => (
              <div key={item.createdAt + item.summary}>
                {formatTime(item.createdAt)} · {item.summary}
              </div>
            ))}
          </div>
        ) : null}

        <footer className={cn('border-t border-border-soft', compact ? 'px-3 py-3' : 'px-6 py-4')}>
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((file) => {
                const Icon = attachmentIcon(file.kind)
                return (
                  <span
                    key={file.path}
                    className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-card-2 px-2 py-1 text-[11px] text-text"
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted hover:text-text"
                      aria-label={`Remover ${file.name}`}
                      onClick={() => setAttachments((current) => current.filter((item) => item.path !== file.path))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="mb-1 rounded-xl p-2 text-muted hover:bg-white/5 hover:text-text"
              title="Anexar arquivo"
              onClick={() => void attachFiles()}
              disabled={sending}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={compact ? 2 : 3}
              placeholder="Peça qualquer coisa ao Atlas..."
              className="min-h-[64px] flex-1 resize-none rounded-2xl border border-border bg-card-2 px-4 py-3 text-sm text-text outline-none placeholder:text-muted-2 focus:border-accent/40"
              disabled={sending}
            />
            <Button
              className="mb-1 h-11 px-4"
              icon={<SendHorizontal className="h-4 w-4" />}
              disabled={sending || (!draft.trim() && attachments.length === 0)}
              onClick={() => void send()}
            >
              Enviar
            </Button>
          </div>
          {lastAssistant?.pendingConfirmation ? null : (
            <p className="mx-auto mt-2 max-w-3xl text-[11px] text-muted-2">
              Enter envia · Shift + Enter nova linha · Agente ativo: {agentLabel(agent)}
            </p>
          )}
        </footer>
      </section>
    </div>
  )
}
