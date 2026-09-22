import { MessageSquare, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  CHAT_DOCK_DEFAULT_HEIGHT,
  CHAT_DOCK_DEFAULT_WIDTH,
  clampChatDockSize,
  normalizeChatDockSize,
  type ChatDockSize,
} from '@shared/chat/chatDockSize'
import { atlasAssistantCopy } from '@shared/assistant'
import { ChatPage } from '../../pages/ChatPage'
import { getAtlasApi } from '../../lib/api'
import { onAtlasChatOpen } from '../../lib/chatEvents'
import { cn } from '../../lib/utils'

type ResizeEdge = 'left' | 'top' | 'corner'

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function applyDrag(
  edge: ResizeEdge,
  origin: ChatDockSize & { x: number; y: number },
  clientX: number,
  clientY: number,
): ChatDockSize {
  const nextWidth =
    edge === 'top' ? origin.width : origin.width + (origin.x - clientX)
  const nextHeight =
    edge === 'left' ? origin.height : origin.height + (origin.y - clientY)
  return clampChatDockSize(nextWidth, nextHeight, viewportSize())
}

export function ChatDock() {
  const api = getAtlasApi()
  const [open, setOpen] = useState(false)
  const [launchProjectId, setLaunchProjectId] = useState<string | null>(null)
  const [size, setSize] = useState<ChatDockSize>(() =>
    clampChatDockSize(CHAT_DOCK_DEFAULT_WIDTH, CHAT_DOCK_DEFAULT_HEIGHT, {
      width: typeof window === 'undefined' ? 1440 : window.innerWidth,
      height: typeof window === 'undefined' ? 900 : window.innerHeight,
    }),
  )
  const [dragging, setDragging] = useState<ResizeEdge | null>(null)
  const sizeRef = useRef(size)
  const dragOriginRef = useRef<(ChatDockSize & { x: number; y: number }) | null>(null)
  const draggingRef = useRef<ResizeEdge | null>(null)
  const userSizedRef = useRef(false)
  sizeRef.current = size

  const persistSize = useCallback(
    (next: ChatDockSize) => {
      void api.settings.update({
        chatPanelWidth: next.width,
        chatPanelHeight: next.height,
      })
    },
    [api],
  )

  useEffect(() => {
    return onAtlasChatOpen((detail) => {
      setLaunchProjectId(detail.projectId ?? null)
      setOpen(true)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void api.settings.get().then((settings) => {
      if (cancelled || userSizedRef.current) return
      setSize(normalizeChatDockSize(settings.chatPanelWidth, settings.chatPanelHeight, viewportSize()))
    })
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    function onResize() {
      setSize((current) => clampChatDockSize(current.width, current.height, viewportSize()))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor =
      dragging === 'left' ? 'ew-resize' : dragging === 'top' ? 'ns-resize' : 'nwse-resize'
    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
    }
  }, [dragging])

  function beginResize(edge: ResizeEdge, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOriginRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
    }
    draggingRef.current = edge
    userSizedRef.current = true
    setDragging(edge)
  }

  function onResizeMove(edge: ResizeEdge, event: ReactPointerEvent<HTMLDivElement>) {
    const origin = dragOriginRef.current
    if (!origin || draggingRef.current !== edge) return
    const next = applyDrag(edge, origin, event.clientX, event.clientY)
    sizeRef.current = next
    setSize(next)
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    draggingRef.current = null
    setDragging(null)
    dragOriginRef.current = null
    persistSize(sizeRef.current)
  }

  function resetSize() {
    const next = clampChatDockSize(CHAT_DOCK_DEFAULT_WIDTH, CHAT_DOCK_DEFAULT_HEIGHT, viewportSize())
    userSizedRef.current = true
    sizeRef.current = next
    setSize(next)
    persistSize(next)
  }

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[45]">
        {!open ? (
          <div
            id="atlas-chat-hint"
            className="pointer-events-none absolute bottom-[calc(100%+10px)] right-0 whitespace-nowrap rounded-xl bg-card px-2.5 py-1.5 text-[11px] font-medium text-text shadow-[0_8px_24px_rgba(0,0,0,0.4)] ring-1 ring-border"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-accent" />
              {atlasAssistantCopy.speakHint}
            </span>
            <span className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45 bg-card ring-1 ring-border" />
            <span className="absolute -bottom-px right-4 h-3 w-3 rotate-45 bg-card" />
          </div>
        ) : null}

        <button
          type="button"
          data-tour="chat"
          aria-label={open ? 'Fechar chat' : atlasAssistantCopy.speakLabel}
          aria-describedby={open ? undefined : 'atlas-chat-hint'}
          title={open ? 'Fechar chat' : atlasAssistantCopy.speakHint}
          onClick={() => {
            if (open) {
              setOpen(false)
              return
            }
            setOpen(true)
          }}
          className={cn(
            'relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors',
            open
              ? 'bg-card-2 text-text ring-1 ring-border hover:bg-white/10'
              : 'bg-accent text-black hover:bg-accent-hover',
          )}
        >
          {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
          {!open ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
              <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[8px] font-bold leading-none text-black">
                1
              </span>
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div
          className={cn(
            'fixed bottom-20 right-5 z-[44] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_16px_48px_rgba(0,0,0,0.45)]',
            dragging ? 'select-none' : null,
          )}
          style={{ width: size.width, height: size.height }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar largura do chat"
            className={cn(
              'absolute inset-y-2 left-0 z-10 w-2 cursor-ew-resize touch-none select-none rounded-full',
              dragging === 'left' || dragging === 'corner' ? 'bg-accent/35' : 'bg-transparent hover:bg-white/15',
            )}
            onPointerDown={(event) => beginResize('left', event)}
            onPointerMove={(event) => onResizeMove('left', event)}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Redimensionar altura do chat"
            className={cn(
              'absolute inset-x-2 top-0 z-10 h-2 cursor-ns-resize touch-none select-none rounded-full',
              dragging === 'top' || dragging === 'corner' ? 'bg-accent/35' : 'bg-transparent hover:bg-white/15',
            )}
            onPointerDown={(event) => beginResize('top', event)}
            onPointerMove={(event) => onResizeMove('top', event)}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
          <div
            role="separator"
            aria-label="Redimensionar chat"
            className={cn(
              'absolute left-0 top-0 z-20 h-3.5 w-3.5 cursor-nwse-resize touch-none select-none rounded-tl-2xl',
              dragging === 'corner' ? 'bg-accent/40' : 'bg-transparent hover:bg-white/20',
            )}
            onPointerDown={(event) => beginResize('corner', event)}
            onPointerMove={(event) => onResizeMove('corner', event)}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ChatPage
              variant="dock"
              launchProjectId={launchProjectId}
              onClose={() => setOpen(false)}
              onLaunchConsumed={() => setLaunchProjectId(null)}
              onResetSize={resetSize}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
