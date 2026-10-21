import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { SendHorizontal, X } from 'lucide-react'
import type { TeamChatMessage, TeamChatRoom } from '@shared/account'
import { getAtlasApi } from '../../lib/api'
import { useToast } from '../Toast'
import { Button } from '../Button'
import { cn } from '../../lib/utils'

const MAX_NOTICES = 3

type IncomingNotice = {
  roomId: string
  title: string
  authorName: string
  preview: string
  createdAt: string
  count: number
  kind: TeamChatRoom['kind'] | null
  latest: TeamChatMessage
}

function previewText(message: TeamChatMessage): string {
  const text = message.body.trim()
  const attachment = message.attachment
  if (text && !(attachment && text === attachment.name)) {
    return text.length > 140 ? `${text.slice(0, 137)}...` : text
  }
  if (attachment?.kind === 'image') return 'Enviou uma imagem'
  if (attachment) return `Enviou ${attachment.name}`
  return 'Nova mensagem'
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

function clock(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function upsertNotice(current: IncomingNotice[], message: TeamChatMessage): IncomingNotice[] {
  const preview = previewText(message)
  const index = current.findIndex((notice) => notice.roomId === message.roomId)
  if (index < 0) {
    return [
      {
        roomId: message.roomId,
        title: message.authorName.trim() || 'Equipe',
        authorName: message.authorName.trim() || 'Alguém',
        preview,
        createdAt: message.createdAt,
        count: 1,
        kind: null,
        latest: message,
      },
      ...current,
    ].slice(0, MAX_NOTICES)
  }
  const previous = current[index]
  const next = [...current]
  next.splice(index, 1)
  next.unshift({
    ...previous,
    authorName: message.authorName.trim() || previous.authorName,
    preview,
    createdAt: message.createdAt,
    count: previous.count + 1,
    latest: message,
  })
  return next
}

export function TeamChatIncoming({ accountId }: { accountId: string }) {
  const api = getAtlasApi()
  const { pushError } = useToast()
  const location = useLocation()
  const onChat = location.pathname === '/equipe'
  const [notices, setNotices] = useState<IncomingNotice[]>([])
  const [openRoomId, setOpenRoomId] = useState<string | null>(null)
  const [openRoom, setOpenRoom] = useState<TeamChatRoom | null>(null)
  const [messages, setMessages] = useState<TeamChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const onChatRef = useRef(onChat)
  const openRoomIdRef = useRef(openRoomId)
  const loadGen = useRef(0)
  const roomsById = useRef(new Map<string, TeamChatRoom>())
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  onChatRef.current = onChat
  openRoomIdRef.current = openRoomId

  useEffect(() => {
    if (location.pathname !== '/') {
      setSlot(null)
      return
    }
    const find = () => setSlot(document.getElementById('team-chat-incoming-slot'))
    find()
    const timer = window.setTimeout(find, 0)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  useEffect(() => {
    if (!onChat) return
    setNotices([])
    setOpenRoomId(null)
    setOpenRoom(null)
    setMessages([])
    setDraft('')
  }, [onChat])

  const onIncomingRef = useRef<(message: TeamChatMessage) => void>(() => {})
  onIncomingRef.current = (message) => {
    if (!message?.roomId || message.authorId === accountId) return
    if (onChatRef.current) return
    if (openRoomIdRef.current === message.roomId) {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current
        return [...current, message]
      })
      return
    }
    setNotices((current) => upsertNotice(current, message))
    void hydrateRoom(message.roomId)
  }

  useEffect(() => {
    return api.teamChat.onMessage((message) => onIncomingRef.current(message))
  }, [api])

  useEffect(() => {
    const node = scrollerRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, openRoomId])

  useEffect(() => {
    if (!openRoomId) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePanel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
    }
  }, [openRoomId])

  const composing = Boolean(openRoomId && draft.trim())

  useEffect(() => {
    if (!openRoomId || !composing) return
    const roomId = openRoomId
    const ping = () => {
      void api.teamChat.setTyping(roomId, true)
    }
    ping()
    const interval = window.setInterval(ping, 2000)
    return () => {
      window.clearInterval(interval)
      void api.teamChat.setTyping(roomId, false)
    }
  }, [api, composing, openRoomId])

  async function hydrateRoom(roomId: string) {
    if (roomsById.current.has(roomId)) {
      const room = roomsById.current.get(roomId)
      if (!room) return
      setNotices((current) =>
        current.map((notice) =>
          notice.roomId === roomId ? { ...notice, title: room.title, kind: room.kind } : notice,
        ),
      )
      return
    }
    try {
      const rooms = await api.teamChat.listRooms()
      for (const room of rooms) roomsById.current.set(room.id, room)
      const room = roomsById.current.get(roomId)
      if (!room) return
      setNotices((current) =>
        current.map((notice) =>
          notice.roomId === roomId ? { ...notice, title: room.title, kind: room.kind } : notice,
        ),
      )
      if (openRoomIdRef.current === roomId) setOpenRoom(room)
    } catch {
      // O card segue com o nome de quem enviou.
    }
  }

  function closePanel() {
    loadGen.current += 1
    const roomId = openRoomIdRef.current
    setOpenRoomId(null)
    setOpenRoom(null)
    setMessages([])
    setDraft('')
    if (roomId) void api.teamChat.setTyping(roomId, false)
  }

  async function openNotice(notice: IncomingNotice) {
    const roomId = notice.roomId
    const gen = ++loadGen.current
    setOpenRoomId(roomId)
    setNotices((current) => current.filter((item) => item.roomId !== roomId))
    setDraft('')
    setMessages([notice.latest])
    setLoading(true)
    const cached = roomsById.current.get(roomId) ?? null
    setOpenRoom(cached)
    try {
      const [rooms, history] = await Promise.all([
        api.teamChat.listRooms(),
        api.teamChat.listMessages(roomId),
      ])
      if (loadGen.current !== gen) return
      for (const room of rooms) roomsById.current.set(room.id, room)
      const room = roomsById.current.get(roomId) ?? null
      setOpenRoom(room)
      setMessages((current) => {
        const byId = new Map<string, TeamChatMessage>()
        for (const item of history) byId.set(item.id, item)
        for (const item of current) {
          if (item.roomId === roomId) byId.set(item.id, item)
        }
        return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      })
    } catch (error) {
      if (loadGen.current === gen) pushError(error, 'Não foi possível abrir a conversa.')
    } finally {
      if (loadGen.current === gen) setLoading(false)
    }
  }

  async function send() {
    const roomId = openRoomId
    const body = draft.trim()
    if (!roomId || !body || sending) return
    setSending(true)
    try {
      const message = await api.teamChat.sendMessage({ roomId, body })
      setDraft('')
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current
        return [...current, message]
      })
    } catch (error) {
      pushError(error, 'Não foi possível enviar.')
    } finally {
      setSending(false)
      inputRef.current?.focus({ preventScroll: true })
    }
  }

  if (onChat || (!openRoomId && notices.length === 0)) return null

  const panelTitle = openRoom?.title || messages.find((item) => item.authorId !== accountId)?.authorName || 'Conversa'
  const panelHint =
    openRoom?.kind === 'group'
      ? 'Grupo'
      : openRoom?.kind === 'dm'
        ? 'Conversa privada'
        : 'Resposta rápida'

  const stack = (
    <div
      className={
        slot
          ? 'flex min-w-0 flex-col gap-3'
          : 'pointer-events-none fixed right-6 top-[4.75rem] z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 sm:right-8 sm:top-[5.35rem]'
      }
    >
      {openRoomId ? (
        <section
          role="dialog"
          aria-label={`Responder ${panelTitle}`}
          className="atlas-toast-enter pointer-events-auto flex max-h-[min(26rem,calc(100vh-7.5rem))] w-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-popover"
        >
          <header className="flex items-center gap-2.5 border-b border-border-soft px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-soft bg-hover text-[10px] font-semibold text-text">
              {initials(panelTitle)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{panelTitle}</p>
              <p className="truncate text-[11px] text-muted">{panelHint}</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover hover:text-text"
              aria-label="Fechar resposta"
              onClick={closePanel}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {loading && messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">Carregando conversa...</p>
            ) : null}
            {!loading && messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted">Nenhuma mensagem ainda.</p>
            ) : null}
            {messages.map((message) => {
              const mine = message.authorId === accountId
              const text = message.body.trim()
              const attachment = message.attachment
              const showBody = Boolean(text) && !(attachment && text === attachment.name)
              return (
                <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed',
                      mine
                        ? 'rounded-br-md border border-accent/20 bg-accent/14 text-text'
                        : 'rounded-bl-md border border-border-soft bg-elevated text-text',
                    )}
                  >
                    {!mine && openRoom?.kind === 'group' ? (
                      <p className="mb-0.5 text-[10px] font-semibold text-muted">{message.authorName}</p>
                    ) : null}
                    {attachment?.kind === 'image' ? (
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="mb-1 max-h-28 rounded-lg object-cover"
                      />
                    ) : null}
                    {attachment && attachment.kind !== 'image' ? (
                      <p className="mb-1 truncate text-[11px] text-muted">{attachment.name}</p>
                    ) : null}
                    {showBody ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
                    <p className={cn('mt-1 text-[10px] tabular-nums text-muted-2', mine && 'text-right')}>
                      {clock(message.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border-soft bg-bg/20 px-2.5 py-2.5"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Mensagem para ${panelTitle}...`}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border-soft bg-elevated px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/45 focus:outline-none"
            />
            <Button
              type="submit"
              disabled={sending || !draft.trim()}
              className="h-10 w-10 !rounded-xl !px-0"
              aria-label="Enviar mensagem"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </form>
        </section>
      ) : null}

      {notices.map((notice) => (
        <article
          key={notice.roomId}
          className="atlas-toast-enter pointer-events-auto overflow-hidden rounded-2xl border border-border-soft/90 bg-card shadow-card"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">Mensagem</p>
            <div className="flex items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted-2">{clock(notice.createdAt)}</span>
              <button
                type="button"
                className="rounded-lg p-1 text-muted transition-colors hover:bg-hover hover:text-text"
                aria-label="Dispensar aviso"
                onClick={() => setNotices((current) => current.filter((item) => item.roomId !== notice.roomId))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="flex w-full min-w-0 items-start gap-3 px-4 pb-4 pt-2 text-left"
            onClick={() => void openNotice(notice)}
          >
            <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent/15 text-[10px] font-semibold text-accent">
              {initials(notice.authorName)}
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text">{notice.authorName}</span>
              {notice.kind === 'group' ? (
                <span className="mt-0.5 block truncate text-[11px] text-muted">{notice.title}</span>
              ) : null}
              <span className="mt-1 block text-sm leading-relaxed text-text/95">{notice.preview}</span>
              {notice.count > 1 ? (
                <span className="mt-1.5 block text-[10px] font-medium text-accent">{notice.count} novas</span>
              ) : null}
            </span>
          </button>
        </article>
      ))}
    </div>
  )

  if (slot) return createPortal(stack, slot)
  return stack
}
