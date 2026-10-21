import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileIcon,
  MessageSquarePlus,
  MessagesSquare,
  MoreVertical,
  Paperclip,
  SendHorizontal,
  Smile,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type {
  AtlasAccount,
  TeamChatAttachment,
  TeamChatMember,
  TeamChatMessage,
  TeamChatPeer,
  TeamChatRoom,
} from '@shared/account'
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

function peerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function formatRoomTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatMessageClock(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const TYPING_TTL_MS = 4500
/** Mesmo teto do carregamento inicial da sala no processo principal. */
const MAX_ROOM_MESSAGES = 200

function appendTeamMessage(current: TeamChatMessage[], message: TeamChatMessage): TeamChatMessage[] {
  if (current.some((item) => item.id === message.id)) return current
  const next = [...current, message]
  return next.length > MAX_ROOM_MESSAGES ? next.slice(-MAX_ROOM_MESSAGES) : next
}

type TypingPeer = {
  userId: string
  name: string
  until: number
}

function typingLabel(peers: TypingPeer[], kind: 'dm' | 'group'): string | null {
  if (peers.length === 0) return null
  if (kind === 'dm') return 'digitando'
  if (peers.length === 1) return `${peers[0]?.name ?? 'Alguém'} está digitando`
  if (peers.length === 2) {
    return `${peers[0]?.name ?? 'Alguém'} e ${peers[1]?.name ?? 'alguém'} estão digitando`
  }
  return `${peers[0]?.name ?? 'Alguém'} e mais ${peers.length - 1} estão digitando`
}

function withoutTypingPeer(
  current: Record<string, TypingPeer[]>,
  roomId: string,
  userId: string,
): Record<string, TypingPeer[]> {
  const list = current[roomId]
  if (!list) return current
  const nextList = list.filter((peer) => peer.userId !== userId)
  const next = { ...current }
  if (nextList.length === 0) delete next[roomId]
  else next[roomId] = nextList
  return next
}

function TypingStatus({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-border-soft bg-elevated px-3 py-2">
        <span className="flex items-center gap-1" aria-hidden>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
        </span>
        <span className="text-xs italic text-accent">{label}</span>
      </div>
    </div>
  )
}

function ChatAvatar({
  name,
  size = 'md',
  online,
  tone = 'neutral',
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  online?: boolean
  tone?: 'neutral' | 'accent' | 'group'
}) {
  const sizeClass =
    size === 'sm' ? 'h-9 w-9 text-[10px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-10 w-10 text-xs'
  return (
    <div className={cn('relative shrink-0', sizeClass)}>
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-full border font-semibold',
          tone === 'accent' && 'border-accent/25 bg-accent/15 text-accent',
          tone === 'group' && 'border-border-soft bg-hover text-muted',
          tone === 'neutral' &&
            'border-border-soft bg-elevated text-text',
        )}
      >
        {tone === 'group' ? <Users className="h-4 w-4" /> : peerInitials(name)}
      </div>
      {online ? (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
      ) : null}
    </div>
  )
}

type ComposerMode = 'dm' | 'group' | 'add' | null

export function TeamChatPage({ account }: { account: AtlasAccount }) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [searchParams] = useSearchParams()
  const requestedRoomId = searchParams.get('sala')?.trim() || null
  const [rooms, setRooms] = useState<TeamChatRoom[]>([])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TeamChatMessage[]>([])
  const [members, setMembers] = useState<TeamChatMember[]>([])
  const [directory, setDirectory] = useState<TeamChatPeer[]>([])
  const [online, setOnline] = useState<TeamChatPeer[]>([])
  const [draft, setDraft] = useState('')
  const [typingByRoom, setTypingByRoom] = useState<Record<string, TypingPeer[]>>({})
  const [sending, setSending] = useState(false)
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [roomMenuOpen, setRoomMenuOpen] = useState(false)
  const [lightbox, setLightbox] = useState<TeamChatAttachment | null>(null)
  const [composer, setComposer] = useState<ComposerMode>(null)
  const [groupName, setGroupName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busyAction, setBusyAction] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const roomMenuRef = useRef<HTMLDivElement>(null)
  const activeRoomIdRef = useRef<string | null>(null)
  const requestedRoomIdRef = useRef(requestedRoomId)
  requestedRoomIdRef.current = requestedRoomId

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [activeRoomId, rooms],
  )
  const activeTypingLabel = activeRoom
    ? typingLabel(typingByRoom[activeRoom.id] ?? [], activeRoom.kind)
    : null

  const refreshRooms = useCallback(async () => {
    const next = await api.teamChat.listRooms()
    setRooms(next)
    return next
  }, [api])

  const loadRoom = useCallback(
    async (roomId: string) => {
      activeRoomIdRef.current = roomId
      setActiveRoomId(roomId)
      void api.teamChat.setActiveRoom(roomId)
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
    return () => {
      void api.teamChat.setActiveRoom(null)
    }
  }, [api])

  useEffect(() => {
    void Promise.all([
      refreshRooms(),
      api.teamChat.listDirectory(),
      api.teamChat.listOnline(),
    ]).then(([nextRooms, nextDirectory, nextOnline]) => {
      setDirectory(nextDirectory)
      setOnline(nextOnline)
      const requested = requestedRoomIdRef.current
      const preferred =
        (requested && nextRooms.find((room) => room.id === requested)?.id) || nextRooms[0]?.id
      if (preferred) void loadRoom(preferred)
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
        setMessages((current) => appendTeamMessage(current, message))
      }
      setTypingByRoom((current) => withoutTypingPeer(current, message.roomId, message.authorId))
    })
    const offTyping = api.teamChat.onTyping((event) => {
      if (event.userId === account.id) return
      setTypingByRoom((current) => {
        if (!event.typing) return withoutTypingPeer(current, event.roomId, event.userId)
        const list = (current[event.roomId] ?? []).filter((peer) => peer.userId !== event.userId)
        return {
          ...current,
          [event.roomId]: [
            ...list,
            { userId: event.userId, name: event.name, until: Date.now() + TYPING_TTL_MS },
          ],
        }
      })
    })
    const offPresence = api.teamChat.onPresence(setOnline)
    return () => {
      offMessage()
      offTyping()
      offPresence()
    }
  }, [account.id, api, loadRoom, pushError, refreshRooms])

  useEffect(() => {
    if (!requestedRoomId || requestedRoomId === activeRoomIdRef.current) return
    void loadRoom(requestedRoomId)
  }, [loadRoom, requestedRoomId])

  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, activeTypingLabel])

  const composing = Boolean(activeRoomId && draft.trim())

  useEffect(() => {
    if (!activeRoomId || !composing) return
    const roomId = activeRoomId
    const ping = () => {
      void api.teamChat.setTyping(roomId, true)
    }
    ping()
    const interval = window.setInterval(ping, 2000)
    return () => {
      window.clearInterval(interval)
      void api.teamChat.setTyping(roomId, false)
    }
  }, [activeRoomId, api, composing])

  const hasTypingPeers = Object.keys(typingByRoom).length > 0
  useEffect(() => {
    if (!hasTypingPeers) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      setTypingByRoom((current) => {
        let changed = false
        const next: Record<string, TypingPeer[]> = {}
        for (const [roomId, peers] of Object.entries(current)) {
          const alive = peers.filter((peer) => peer.until > now)
          if (alive.length !== peers.length) changed = true
          if (alive.length > 0) next[roomId] = alive
        }
        return changed ? next : current
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [hasTypingPeers])

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
    if (!roomMenuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!roomMenuRef.current?.contains(event.target as Node)) setRoomMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setRoomMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [roomMenuOpen])

  useEffect(() => {
    setRoomMenuOpen(false)
  }, [activeRoomId])

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

  async function hideConversation(roomId: string) {
    const room = rooms.find((item) => item.id === roomId)
    const title = room?.title || 'esta conversa'
    const confirmed = window.confirm(
      `Apagar a conversa com ${title} só para você?\n\nO outro usuário continua vendo o histórico normalmente.`,
    )
    if (!confirmed || busyAction) return

    setBusyAction(true)
    setRoomMenuOpen(false)
    try {
      await api.teamChat.hideForMe(roomId)
      const nextRooms = await refreshRooms()
      if (activeRoomIdRef.current === roomId) {
        activeRoomIdRef.current = null
        setActiveRoomId(null)
        setMessages([])
        setMembers([])
        void api.teamChat.setActiveRoom(null)
        const fallback = nextRooms.find((item) => item.id !== roomId)?.id
        if (fallback) void loadRoom(fallback)
      }
      push('Conversa apagada só para você.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível apagar a conversa.')
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
      // A sala pode ter mudado durante o envio; só anexa na lista da sala certa.
      if (activeRoomIdRef.current === message.roomId) {
        setMessages((current) => appendTeamMessage(current, message))
      }
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

  const onlineIds = useMemo(() => new Set(onlineOthers.map((peer) => peer.id)), [onlineOthers])
  const activePeerOnline =
    activeRoom?.kind === 'dm' && activeRoom.peer ? onlineIds.has(activeRoom.peer.id) : false

  const panelClass =
    'overflow-hidden rounded-2xl border border-border-soft/90 bg-card shadow-card'

  return (
    <PageShell scroll={false} className="flex min-w-0 flex-col !px-3 !py-3 sm:!px-5 sm:!py-4 lg:!px-6">
      <header className="mb-3 flex min-w-0 shrink-0 items-end justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-2">Equipe</p>
          <h1 className="mt-1 text-[1.45rem] font-semibold tracking-tight text-text sm:text-[1.7rem]">
            Chat
          </h1>
          <p className="mt-0.5 text-sm text-muted">Conversas privadas e grupos em tempo real.</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-elevated px-2.5 py-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {onlineOthers.length} online
          </span>
        </div>
      </header>

      <div className="@container min-h-0 min-w-0 flex-1">
        <div className="grid h-full min-h-0 min-w-0 grid-cols-1 gap-3 @[720px]:grid-cols-[minmax(0,280px)_minmax(0,1fr)] @[1100px]:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,240px)]">
          {/* Lista de conversas */}
          <aside className={cn(panelClass, 'flex max-h-[38%] min-h-0 flex-col @[720px]:max-h-none')}>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-soft px-3 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
                  Conversas
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {rooms.length === 0
                    ? 'Nenhuma ainda'
                    : `${rooms.length} sala${rooms.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-soft bg-elevated text-muted transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-accent"
                  title="Nova conversa"
                  aria-label="Nova conversa"
                  onClick={() => {
                    setComposer('dm')
                    setSelectedIds([])
                    setGroupName('')
                  }}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-soft bg-elevated text-muted transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-accent"
                  title="Novo grupo"
                  aria-label="Novo grupo"
                  onClick={() => {
                    setComposer('group')
                    setSelectedIds([])
                    setGroupName('')
                  }}
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
              {rooms.length === 0 ? (
                <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-4 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-elevated text-muted-2">
                    <MessagesSquare className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-text">Comece uma conversa</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-2">
                    Abra um DM ou crie um grupo com a equipe.
                  </p>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {rooms.map((room) => {
                    const active = room.id === activeRoomId
                    const peerOnline =
                      room.kind === 'dm' && room.peer ? onlineIds.has(room.peer.id) : false
                    const roomTyping = typingLabel(typingByRoom[room.id] ?? [], room.kind)
                    return (
                      <li key={room.id} className="group/room min-w-0">
                        <div
                          className={cn(
                            'flex min-w-0 items-stretch rounded-xl transition-colors',
                            active
                              ? 'bg-accent/12 ring-1 ring-accent/20'
                              : 'hover:bg-hover/60',
                          )}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2.5 text-left"
                            onClick={() => void loadRoom(room.id)}
                          >
                            <ChatAvatar
                              name={room.title}
                              size="md"
                              online={peerOnline}
                              tone={room.kind === 'group' ? 'group' : 'neutral'}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center justify-between gap-2">
                                <span className="truncate text-[13px] font-semibold text-text">
                                  {room.title}
                                </span>
                                <span className="shrink-0 text-[10px] tabular-nums text-muted-2">
                                  {formatRoomTime(room.updatedAt)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                                <p
                                  className={cn(
                                    'min-w-0 flex-1 truncate text-xs',
                                    roomTyping ? 'italic text-accent' : 'text-muted',
                                  )}
                                >
                                  {roomTyping ||
                                    room.lastMessagePreview ||
                                    (room.kind === 'dm' ? 'Conversa privada' : 'Grupo')}
                                </p>
                                <span className="shrink-0 rounded-md border border-border-soft bg-elevated px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-2">
                                  {room.kind === 'dm' ? 'DM' : 'Grupo'}
                                </span>
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="mr-1.5 hidden shrink-0 self-center rounded-lg p-1.5 text-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover/room:inline-flex group-hover/room:opacity-100"
                            aria-label={`Apagar conversa ${room.title} só para mim`}
                            title="Apagar só para mim"
                            disabled={busyAction}
                            onClick={(event) => {
                              event.stopPropagation()
                              void hideConversation(room.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="shrink-0 border-t border-border-soft p-3 @[1100px]:hidden">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
                Online · {onlineOthers.length}
              </p>
              {onlineOthers.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Ninguém online no momento</p>
              ) : (
                <ul className="mt-2.5 max-h-28 space-y-1 overflow-y-auto">
                  {onlineOthers.map((peer) => (
                    <li key={peer.id} className="min-w-0">
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-hover"
                        onClick={() => void openDmWith(peer.id)}
                        title="Abrir conversa privada"
                      >
                        <ChatAvatar name={peer.name} size="sm" online />
                        <span className="truncate text-xs font-medium text-text">{peer.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* Painel principal */}
          <section className={cn(panelClass, 'flex min-h-0 min-w-0 flex-col')}>
            {activeRoom ? (
              <>
                <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <ChatAvatar
                      name={activeRoom.title}
                      size="lg"
                      online={activePeerOnline}
                      tone={activeRoom.kind === 'group' ? 'group' : 'neutral'}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold tracking-tight text-text">
                        {activeRoom.title}
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 truncate text-xs',
                          activeTypingLabel ? 'italic text-accent' : 'text-muted',
                        )}
                      >
                        {activeTypingLabel ??
                          (activeRoom.kind === 'dm'
                            ? activePeerOnline
                              ? 'Online agora · conversa privada'
                              : 'Conversa privada · só vocês dois'
                            : `${members.length} membro${members.length === 1 ? '' : 's'} no grupo`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {activeRoom.kind === 'group' && activeRoom.myRole === 'admin' ? (
                      <button
                        type="button"
                        className="rounded-xl border border-border-soft bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10 @[1100px]:hidden"
                        onClick={() => {
                          setComposer('add')
                          setSelectedIds([])
                          setGroupName('')
                        }}
                      >
                        Adicionar
                      </button>
                    ) : null}
                    <div ref={roomMenuRef} className="relative">
                      <button
                        type="button"
                        className="rounded-xl p-2 text-muted transition-colors hover:bg-hover hover:text-text"
                        aria-label="Mais opções da conversa"
                        aria-expanded={roomMenuOpen}
                        disabled={busyAction}
                        onClick={() => setRoomMenuOpen((open) => !open)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {roomMenuOpen ? (
                        <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[13rem] overflow-hidden rounded-xl border border-border-soft/90 bg-elevated py-1 shadow-popover">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-danger hover:bg-danger/10"
                            onClick={() => void hideConversation(activeRoom.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                            Apagar conversa pra mim
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div
                  ref={scroller}
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
                >
                  {messages.length === 0 ? (
                    <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border-soft bg-elevated text-muted-2">
                        <MessagesSquare className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium text-text">Nenhuma mensagem ainda</p>
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-2">
                        Envie a primeira mensagem para começar a conversa.
                      </p>
                    </div>
                  ) : (
                    messages.map((message, index) => {
                      const mine = message.authorId === account.id
                      const attachment = message.attachment
                      const showBody =
                        Boolean(message.body.trim()) &&
                        !(attachment && message.body.trim() === attachment.name)
                      const previous = messages[index - 1]
                      const stacked =
                        previous &&
                        previous.authorId === message.authorId &&
                        Math.abs(
                          new Date(message.createdAt).getTime() -
                            new Date(previous.createdAt).getTime(),
                        ) < 5 * 60 * 1000
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            'flex gap-2.5',
                            mine ? 'justify-end' : 'justify-start',
                            index === 0 ? '' : stacked ? 'mt-1' : 'mt-3.5',
                          )}
                        >
                          {!mine && !stacked ? (
                            <ChatAvatar name={message.authorName} size="sm" />
                          ) : !mine ? (
                            <div className="w-9 shrink-0" />
                          ) : null}
                          <div
                            className={cn(
                              'max-w-[min(78%,34rem)] rounded-2xl px-3.5 py-2.5 text-sm shadow-card',
                              mine
                                ? 'rounded-br-md border border-accent/20 bg-accent/14 text-text'
                                : 'rounded-bl-md border border-border-soft bg-elevated text-text',
                            )}
                          >
                            {!mine && !stacked ? (
                              <p className="mb-1 text-[11px] font-semibold text-muted">
                                {message.authorName}
                              </p>
                            ) : null}
                            {attachment?.kind === 'image' ? (
                              <button
                                type="button"
                                className="mb-1.5 block overflow-hidden rounded-xl border border-border bg-bg/25 text-left"
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
                                className="mb-1.5 inline-flex max-w-full items-center gap-2 rounded-xl border border-border-soft bg-bg/20 px-2.5 py-2 text-[12px] text-text transition-colors hover:border-accent/40"
                              >
                                <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                                <span className="truncate">{attachment.name}</span>
                              </a>
                            ) : null}
                            {showBody ? (
                              <p className="whitespace-pre-wrap break-words leading-relaxed">
                                {message.body}
                              </p>
                            ) : null}
                            <p
                              className={cn(
                                'mt-1.5 text-[10px] tabular-nums',
                                mine ? 'text-right text-muted' : 'text-muted-2',
                              )}
                            >
                              {formatMessageClock(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {activeTypingLabel ? (
                  <div className="border-t border-border-soft bg-bg/10 px-4 py-2.5">
                    <TypingStatus label={activeTypingLabel} />
                  </div>
                ) : null}

                <form
                  className="min-w-0 border-t border-border-soft bg-bg/15 px-3 py-3 sm:px-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void send()
                  }}
                >
                  {attachmentPath ? (
                    <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-border-soft bg-elevated px-2.5 py-2">
                      {attachmentPreview ? (
                        <img
                          src={attachmentPreview}
                          alt=""
                          className="h-11 w-11 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-soft bg-elevated">
                          <FileIcon className="h-4 w-4 text-muted" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-text">
                        {fileNameFromPath(attachmentPath)}
                      </span>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-text"
                        aria-label="Remover anexo"
                        onClick={clearAttachment}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <div className="relative flex min-w-0 flex-1 items-center gap-0.5 rounded-2xl border border-border-soft bg-elevated px-1.5 focus-within:border-accent/45">
                      <button
                        type="button"
                        className="shrink-0 rounded-xl p-2.5 text-muted transition-colors hover:bg-hover hover:text-text"
                        title="Anexar imagem ou arquivo"
                        onClick={() => void pickAttachment()}
                        disabled={sending}
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <div className="relative shrink-0" ref={emojiRef}>
                        <button
                          type="button"
                          className="rounded-xl p-2.5 text-muted transition-colors hover:bg-hover hover:text-text"
                          title="Emoji"
                          onClick={() => setEmojiOpen((open) => !open)}
                          disabled={sending}
                        >
                          <Smile className="h-4 w-4" />
                        </button>
                        {emojiOpen ? (
                          <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 grid w-[232px] grid-cols-6 gap-1 rounded-2xl border border-border-soft/90 bg-card p-2 shadow-modal">
                            {EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className="rounded-lg p-1.5 text-lg leading-none transition-colors hover:bg-hover"
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
                        className="h-12 min-w-0 flex-1 bg-transparent px-1.5 text-sm text-text placeholder:text-muted-2 focus:outline-none"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={sending || !canSend}
                      className="h-12 w-12 !rounded-2xl !px-0"
                      aria-label="Enviar mensagem"
                    >
                      <SendHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border-soft bg-elevated text-muted-2">
                  <MessagesSquare className="h-6 w-6" />
                </div>
                <p className="text-base font-semibold text-text">Selecione uma conversa</p>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
                  Escolha alguém na lista ou inicie um DM / grupo para começar a falar com a equipe.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10"
                    onClick={() => {
                      setComposer('dm')
                      setSelectedIds([])
                      setGroupName('')
                    }}
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                    Nova conversa
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10"
                    onClick={() => {
                      setComposer('group')
                      setSelectedIds([])
                      setGroupName('')
                    }}
                  >
                    <Users className="h-4 w-4" />
                    Novo grupo
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Painel lateral */}
          <aside className="hidden min-h-0 min-w-0 flex-col gap-3 overflow-hidden @[1100px]:flex">
            <div className={cn(panelClass, 'shrink-0 p-4')}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
                  Online
                </p>
                <span className="rounded-md border border-border-soft bg-elevated px-1.5 py-0.5 text-[11px] tabular-nums text-muted">
                  {onlineOthers.length}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted">
                {onlineOthers.length === 0
                  ? 'Ninguém online no momento'
                  : onlineOthers.length === 1
                    ? '1 pessoa no Atlas'
                    : `${onlineOthers.length} pessoas no Atlas`}
              </p>
              {onlineOthers.length > 0 ? (
                <ul className="mt-3.5 max-h-44 space-y-1 overflow-y-auto">
                  {onlineOthers.map((peer) => (
                    <li key={peer.id} className="min-w-0">
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-hover"
                        onClick={() => void openDmWith(peer.id)}
                        title="Abrir conversa privada"
                      >
                        <ChatAvatar name={peer.name} size="sm" online />
                        <span className="truncate text-sm font-medium text-text">{peer.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {activeRoom ? (
              <div className={cn(panelClass, 'min-h-0 flex-1 overflow-y-auto p-4')}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
                    {activeRoom.kind === 'dm' ? 'Participantes' : 'Membros'}
                  </p>
                  {activeRoom.kind === 'group' && activeRoom.myRole === 'admin' ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
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
                <ul className="mt-3.5 space-y-1">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-2"
                    >
                      <ChatAvatar
                        name={member.name}
                        size="sm"
                        online={onlineIds.has(member.id)}
                        tone={member.id === account.id ? 'accent' : 'neutral'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">
                          {member.id === account.id ? `${member.name} · você` : member.name}
                        </p>
                        {member.role === 'admin' ? (
                          <p className="text-[10px] uppercase tracking-wider text-muted-2">Admin</p>
                        ) : (
                          <p className="truncate text-[11px] text-muted-2">{member.email}</p>
                        )}
                      </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-sm"
          onClick={closeComposer}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border-soft/90 bg-card p-5 shadow-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
                  {composer === 'dm' ? 'DM' : composer === 'group' ? 'Grupo' : 'Membros'}
                </p>
                <p className="mt-0.5 text-base font-semibold text-text">
                  {composer === 'dm'
                    ? 'Nova conversa privada'
                    : composer === 'group'
                      ? 'Novo grupo'
                      : 'Adicionar ao grupo'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-1.5 text-muted hover:bg-hover hover:text-text"
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
                className="mt-4 h-11 w-full rounded-xl border border-border-soft bg-elevated px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
              />
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {composer === 'dm'
                ? 'Só vocês dois terão acesso a esta conversa.'
                : 'Selecione as pessoas. Em grupos, só o admin pode adicionar depois.'}
            </p>
            <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              {pickerPeople.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted">Nenhuma pessoa disponível.</li>
              ) : (
                pickerPeople.map((peer) => {
                  const checked = selectedIds.includes(peer.id)
                  return (
                    <li key={peer.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                          checked ? 'bg-accent/12 ring-1 ring-accent/20' : 'hover:bg-hover',
                        )}
                        onClick={() => {
                          if (composer === 'dm') setSelectedIds([peer.id])
                          else toggleSelected(peer.id)
                        }}
                      >
                        <ChatAvatar name={peer.name} size="sm" online={onlineIds.has(peer.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text">
                            {peer.name}
                          </span>
                          <span className="block truncate text-xs text-muted">{peer.email}</span>
                        </span>
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                            checked
                              ? 'border-accent bg-accent text-on-accent'
                              : 'border-border text-transparent',
                          )}
                        >
                          ✓
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/85 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-xl border border-border bg-overlay/50 p-2 text-text hover:bg-overlay/70"
            aria-label="Fechar"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-[90vh] max-w-[min(96vw,1100px)] rounded-xl object-contain shadow-modal"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </PageShell>
  )
}
