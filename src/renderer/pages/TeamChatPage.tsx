import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileIcon, MessageSquarePlus, Paperclip, Smile, Users, X } from 'lucide-react'
import type {
  AtlasAccount,
  TeamChatAttachment,
  TeamChatMember,
  TeamChatMessage,
  TeamChatPeer,
  TeamChatRoom,
} from '@shared/account'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { cn } from '../lib/utils'

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅',
  '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '🔥', '✨', '❤️',
  '💯', '🎉', '✅', '❌', '👀', '💪', '🤝', '🙌', '😴', '🤩',
]

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])

function isImagePath(filePath: string) {
  const ext = filePath.includes('.') ? `.${filePath.split('.').pop()?.toLowerCase()}` : ''
  return IMAGE_EXT.has(ext)
}

function fileNameFromPath(filePath: string) {
  return filePath.split(/[/\\]/).pop() || 'arquivo'
}

type ComposerMode = 'dm' | 'group' | 'add' | null

export function TeamChatPage({ account }: { account: AtlasAccount }) {
  const api = getAtlasApi()
  const { pushError } = useToast()
  const [rooms, setRooms] = useState<TeamChatRoom[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TeamChatMessage[]>([])
  const [members, setMembers] = useState<TeamChatMember[]>([])
  const [directory, setDirectory] = useState<TeamChatPeer[]>([])
  const [online, setOnline] = useState<TeamChatPeer[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [lightbox, setLightbox] = useState<TeamChatAttachment | null>(null)
  const [composer, setComposer] = useState<ComposerMode>(null)
  const [groupName, setGroupName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busyAction, setBusyAction] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const activeRoomIdRef = useRef<string | null>(null)

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [activeRoomId, rooms],
  )

  const refreshRooms = useCallback(async () => {
    const next = await api.teamChat.listRooms()
    setRooms(next)
    return next
  }, [api])

  const loadRoom = useCallback(
    async (roomId: string) => {
      activeRoomIdRef.current = roomId
      setActiveRoomId(roomId)
      const [nextMessages, nextMembers] = await Promise.all([
        api.teamChat.listMessages(roomId),
        api.teamChat.listMembers(roomId),
      ])
      if (activeRoomIdRef.current !== roomId) return
      setMessages(nextMessages)
      setMembers(nextMembers)
    },
    [api],
  )

  useEffect(() => {
    void Promise.all([
      refreshRooms(),
      api.teamChat.listDirectory(),
      api.teamChat.listOnline(),
    ]).then(([nextRooms, nextDirectory, nextOnline]) => {
      setDirectory(nextDirectory)
      setOnline(nextOnline)
      if (nextRooms[0]) void loadRoom(nextRooms[0].id)
    }).catch((error) => pushError(error, 'Não foi possível carregar o chat.'))

    const offMessage = api.teamChat.onMessage((message) => {
      setRooms((current) => {
        const index = current.findIndex((room) => room.id === message.roomId)
        if (index < 0) {
          void refreshRooms()
          return current
        }
        const next = [...current]
        const room = {
          ...next[index],
          lastMessagePreview: message.body,
          updatedAt: message.createdAt,
        }
        next.splice(index, 1)
        next.unshift(room)
        return next
      })
      if (activeRoomIdRef.current === message.roomId) {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current
          return [...current, message]
        })
      }
    })
    const offPresence = api.teamChat.onPresence(setOnline)
    return () => {
      offMessage()
      offPresence()
    }
  }, [api, loadRoom, pushError, refreshRooms])

  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!emojiOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!emojiRef.current?.contains(event.target as Node)) setEmojiOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setEmojiOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [emojiOpen])

  useEffect(() => {
    if (!lightbox) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightbox(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

  const onlineOthers = useMemo(
    () => online.filter((peer) => peer.id !== account.id),
    [account.id, online],
  )

  const pickerPeople = useMemo(() => {
    const byId = new Map<string, TeamChatPeer>()
    for (const peer of directory) byId.set(peer.id, peer)
    for (const peer of onlineOthers) {
      if (!byId.has(peer.id)) byId.set(peer.id, peer)
    }
    if (composer === 'add') {
      const memberIds = new Set(members.map((member) => member.id))
      return [...byId.values()].filter((peer) => !memberIds.has(peer.id))
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [composer, directory, members, onlineOthers])

  function closeComposer() {
    setComposer(null)
    setGroupName('')
    setSelectedIds([])
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  async function pickAttachment() {
    try {
      const paths = await api.dialog.selectFiles()
      const next = paths[0]
      if (!next) return
      setAttachmentPath(next)
      if (isImagePath(next)) {
        const dataUrl = await api.dialog.readImageDataUrl(next)
        setAttachmentPreview(dataUrl)
      } else {
        setAttachmentPreview(null)
      }
    } catch (error) {
      pushError(error, 'Não foi possível anexar o arquivo.')
    }
  }

  function clearAttachment() {
    setAttachmentPath(null)
    setAttachmentPreview(null)
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current
    if (!input) {
      setDraft((current) => `${current}${emoji}`)
      setEmojiOpen(false)
      return
    }
    const start = input.selectionStart ?? draft.length
    const end = input.selectionEnd ?? draft.length
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`
    setDraft(next)
    setEmojiOpen(false)
    requestAnimationFrame(() => {
      input.focus()
      const cursor = start + emoji.length
      input.setSelectionRange(cursor, cursor)
    })
  }

  async function openDmWith(userId: string) {
    setBusyAction(true)
    try {
      const room = await api.teamChat.openDm(userId)
      await refreshRooms()
      await loadRoom(room.id)
      closeComposer()
    } catch (error) {
      pushError(error, 'Não foi possível abrir a conversa.')
    } finally {
      setBusyAction(false)
    }
  }

  async function submitComposer() {
    if (!composer || busyAction) return
    setBusyAction(true)
    try {
      if (composer === 'dm') {
        const userId = selectedIds[0]
        if (!userId) throw new Error('Escolha uma pessoa.')
        await openDmWith(userId)
        return
      }
      if (composer === 'group') {
        const room = await api.teamChat.createGroup({
          name: groupName,
          memberIds: selectedIds,
        })
        await refreshRooms()
        await loadRoom(room.id)
        closeComposer()
        return
      }
      if (composer === 'add' && activeRoom) {
        const nextMembers = await api.teamChat.addGroupMembers(activeRoom.id, selectedIds)
        setMembers(nextMembers)
        await refreshRooms()
        closeComposer()
      }
    } catch (error) {
      pushError(error, 'Não foi possível concluir.')
    } finally {
      setBusyAction(false)
    }
  }

  async function send() {
    const body = draft.trim()
    if (!activeRoom || (!body && !attachmentPath) || sending) return
    setSending(true)
    try {
      const message = await api.teamChat.sendMessage({
        roomId: activeRoom.id,
        body,
        attachmentPath,
      })
      setDraft('')
      clearAttachment()
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current
        return [...current, message]
      })
      setRooms((current) => {
        const index = current.findIndex((room) => room.id === message.roomId)
        if (index < 0) return current
        const next = [...current]
        const room = {
          ...next[index],
          lastMessagePreview: message.body,
          updatedAt: message.createdAt,
        }
        next.splice(index, 1)
        next.unshift(room)
        return next
      })
    } catch (error) {
      pushError(error, 'Não foi possível enviar.')
    } finally {
      setSending(false)
    }
  }

  const canSend = Boolean(activeRoom && (draft.trim() || attachmentPath))
  const canSubmitComposer =
    composer === 'dm'
      ? selectedIds.length === 1
      : composer === 'group'
        ? Boolean(groupName.trim())
        : composer === 'add'
          ? selectedIds.length > 0
          : false

  return (
    <PageShell scroll={false} className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumb="Equipe"
        title="Chat"
        subtitle="Conversas privadas e grupos em tempo real."
      />
      <div className="@container min-h-0 min-w-0 flex-1">
        <div className="grid h-full min-h-0 min-w-0 grid-cols-1 gap-3 @[640px]:grid-cols-[minmax(0,220px)_minmax(0,1fr)] @[980px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,200px)]">
        <aside className="flex max-h-[42%] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card-2 @[640px]:max-h-none">
          <div className="flex shrink-0 flex-col gap-1 border-b border-border p-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full justify-start gap-2 px-2.5 text-xs"
              onClick={() => {
                setComposer('dm')
                setSelectedIds([])
                setGroupName('')
              }}
            >
              <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Nova conversa</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full justify-start gap-2 px-2.5 text-xs"
              onClick={() => {
                setComposer('group')
                setSelectedIds([])
                setGroupName('')
              }}
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Novo grupo</span>
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
            {rooms.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted">
                Nenhuma conversa ainda. Inicie um DM ou crie um grupo.
              </p>
            ) : (
              <ul className="space-y-1">
                {rooms.map((room) => (
                  <li key={room.id} className="min-w-0">
                    <button
                      type="button"
                      className={cn(
                        'w-full min-w-0 rounded-xl px-3 py-2.5 text-left transition-colors',
                        room.id === activeRoomId
                          ? 'bg-accent/15 text-text'
                          : 'hover:bg-white/5 text-text',
                      )}
                      onClick={() => void loadRoom(room.id)}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{room.title}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-2">
                          {room.kind === 'dm' ? 'DM' : 'Grupo'}
                        </span>
                      </div>
                      {room.lastMessagePreview ? (
                        <p className="mt-0.5 truncate text-xs text-muted">{room.lastMessagePreview}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="shrink-0 border-t border-border p-3 @[980px]:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
              Online · {online.length}
            </p>
            <ul className="mt-2 max-h-28 space-y-1.5 overflow-y-auto">
              <li className="truncate text-xs font-medium text-text">{account.name} · você</li>
              {onlineOthers.map((peer) => (
                <li key={peer.id} className="min-w-0">
                  <button
                    type="button"
                    className="w-full truncate text-left text-xs text-text hover:text-accent"
                    onClick={() => void openDmWith(peer.id)}
                    title="Abrir conversa privada"
                  >
                    {peer.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card-2">
          {activeRoom ? (
            <>
              <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{activeRoom.title}</p>
                  <p className="truncate text-xs text-muted">
                    {activeRoom.kind === 'dm'
                      ? 'Conversa privada — só vocês dois veem.'
                      : `${members.length} membro(s) no grupo`}
                  </p>
                </div>
                {activeRoom.kind === 'group' && activeRoom.myRole === 'admin' ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 @[980px]:hidden"
                    onClick={() => {
                      setComposer('add')
                      setSelectedIds([])
                      setGroupName('')
                    }}
                  >
                    Adicionar
                  </button>
                ) : null}
              </div>
              <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted">
                    Nenhuma mensagem ainda. Diga oi.
                  </p>
                ) : (
                  messages.map((message) => {
                    const mine = message.authorId === account.id
                    const attachment = message.attachment
                    const showBody =
                      Boolean(message.body.trim()) &&
                      !(attachment && message.body.trim() === attachment.name)
                    return (
                      <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                            mine ? 'bg-accent/15 text-text' : 'bg-bg text-text',
                          )}
                        >
                          <p className="text-[11px] font-medium text-muted">
                            {mine ? 'Você' : message.authorName}
                          </p>
                          {attachment?.kind === 'image' ? (
                            <button
                              type="button"
                              className="mt-1 block overflow-hidden rounded-xl border border-border/70 bg-black/20 text-left"
                              onClick={() => setLightbox(attachment)}
                              title="Ampliar imagem"
                            >
                              <img
                                src={attachment.url}
                                alt={attachment.name}
                                className="max-h-56 max-w-full object-contain"
                              />
                            </button>
                          ) : null}
                          {attachment && attachment.kind !== 'image' ? (
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-bg/60 px-2 py-1.5 text-[12px] text-text hover:border-accent/50"
                            >
                              <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                              <span className="truncate">{attachment.name}</span>
                            </a>
                          ) : null}
                          {showBody ? (
                            <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <form
                className="min-w-0 border-t border-border p-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void send()
                }}
              >
                {attachmentPath ? (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-bg px-2.5 py-2">
                    {attachmentPreview ? (
                      <img
                        src={attachmentPreview}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-card-2">
                        <FileIcon className="h-4 w-4 text-muted" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs text-text">
                      {fileNameFromPath(attachmentPath)}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-text"
                      aria-label="Remover anexo"
                      onClick={clearAttachment}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <div className="relative flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-border bg-bg px-1.5 focus-within:border-accent/60">
                    <button
                      type="button"
                      className="shrink-0 rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text"
                      title="Anexar imagem ou arquivo"
                      onClick={() => void pickAttachment()}
                      disabled={sending}
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <div className="relative shrink-0" ref={emojiRef}>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text"
                        title="Emoji"
                        onClick={() => setEmojiOpen((open) => !open)}
                        disabled={sending}
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                      {emojiOpen ? (
                        <div className="absolute bottom-[calc(100%+8px)] left-0 z-20 grid w-[220px] grid-cols-6 gap-1 rounded-xl border border-border bg-card p-2 shadow-xl">
                          {EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="rounded-lg p-1.5 text-lg leading-none hover:bg-white/5"
                              onClick={() => insertEmoji(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={
                        activeRoom.kind === 'dm'
                          ? `Mensagem para ${activeRoom.title}...`
                          : 'Escreva no grupo...'
                      }
                      className="h-11 min-w-0 flex-1 bg-transparent px-1.5 text-sm text-text placeholder:text-muted-2 focus:outline-none"
                    />
                  </div>
                  <Button type="submit" disabled={sending || !canSend} className="h-11">
                    Enviar
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex min-w-0 flex-1 items-center justify-center px-4 py-6 text-center text-sm text-muted">
              <p className="max-w-[22rem] text-balance">
                Selecione uma conversa ou inicie um DM / grupo.
              </p>
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 min-w-0 flex-col gap-3 overflow-hidden @[980px]:flex">
          <div className="min-w-0 shrink-0 overflow-hidden rounded-2xl border border-border bg-card-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-2">Online</p>
            <p className="mt-1 text-sm text-muted">{online.length} pessoa(s) no Atlas</p>
            <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              <li className="truncate text-sm font-medium text-text">{account.name} · você</li>
              {onlineOthers.map((peer) => (
                <li key={peer.id} className="min-w-0">
                  <button
                    type="button"
                    className="w-full truncate text-left text-sm text-text hover:text-accent"
                    onClick={() => void openDmWith(peer.id)}
                    title="Abrir conversa privada"
                  >
                    {peer.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {activeRoom ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-card-2 p-4">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-muted-2">
                  {activeRoom.kind === 'dm' ? 'Participantes' : 'Membros'}
                </p>
                {activeRoom.kind === 'group' && activeRoom.myRole === 'admin' ? (
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-medium text-accent hover:underline"
                    onClick={() => {
                      setComposer('add')
                      setSelectedIds([])
                      setGroupName('')
                    }}
                  >
                    Adicionar
                  </button>
                ) : null}
              </div>
              <ul className="mt-3 space-y-2">
                {members.map((member) => (
                  <li key={member.id} className="min-w-0 truncate text-sm text-text">
                    <span className="font-medium">
                      {member.id === account.id ? `${member.name} · você` : member.name}
                    </span>
                    {member.role === 'admin' ? (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-2">
                        admin
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
        </div>
      </div>

      {composer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeComposer}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text">
                {composer === 'dm'
                  ? 'Nova conversa privada'
                  : composer === 'group'
                    ? 'Novo grupo'
                    : 'Adicionar ao grupo'}
              </p>
              <button
                type="button"
                className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-text"
                onClick={closeComposer}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {composer === 'group' ? (
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Nome do grupo"
                className="mt-3 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
              />
            ) : null}
            <p className="mt-3 text-xs text-muted">
              {composer === 'dm'
                ? 'Só vocês dois terão acesso a esta conversa.'
                : 'Selecione as pessoas. Em grupos, só o admin pode adicionar depois.'}
            </p>
            <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              {pickerPeople.length === 0 ? (
                <li className="py-4 text-center text-sm text-muted">
                  Nenhuma pessoa disponível.
                </li>
              ) : (
                pickerPeople.map((peer) => {
                  const checked = selectedIds.includes(peer.id)
                  return (
                    <li key={peer.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm',
                          checked ? 'bg-accent/15 text-text' : 'hover:bg-white/5 text-text',
                        )}
                        onClick={() => {
                          if (composer === 'dm') setSelectedIds([peer.id])
                          else toggleSelected(peer.id)
                        }}
                      >
                        <span>
                          {peer.name}
                          <span className="ml-2 text-xs text-muted">{peer.email}</span>
                        </span>
                        <span className="text-xs text-muted-2">{checked ? 'Selecionado' : ''}</span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeComposer}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={busyAction || !canSubmitComposer}
                onClick={() => void submitComposer()}
              >
                {composer === 'dm' ? 'Abrir' : composer === 'group' ? 'Criar grupo' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-xl bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Fechar"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-[90vh] max-w-[min(96vw,1100px)] rounded-xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </PageShell>
  )
}
