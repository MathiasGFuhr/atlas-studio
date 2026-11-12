import { GripVertical, MessageSquare, Sparkles, X } from 'lucide-react'
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
import {
  getFabBottomClearance,
  subscribeFabBottomClearance,
} from '../../lib/fabClearance'
import { cn } from '../../lib/utils'

const FAB_GAP = 20
const FAB_SIZE = 48
const PANEL_ABOVE_FAB = 68

type ResizeEdge = 'left' | 'top' | 'corner'
type FabPoint = { x: number; y: number }

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight }
}

function clampFabPoint(point: FabPoint, clearance = 0): FabPoint {
  const { width, height } = viewportSize()
  const maxX = Math.max(FAB_GAP, width - FAB_GAP - FAB_SIZE)
  const maxY = Math.max(FAB_GAP, height - FAB_GAP - clearance - FAB_SIZE)
  return {
    x: Math.min(maxX, Math.max(FAB_GAP, point.x)),
    y: Math.min(maxY, Math.max(FAB_GAP, point.y)),
  }
}

function defaultFabPoint(clearance = 0): FabPoint {
  const { width, height } = viewportSize()
  return clampFabPoint(
    {
      x: width - FAB_GAP - FAB_SIZE,
      y: height - FAB_GAP - clearance - FAB_SIZE,
    },
    clearance,
  )
}

function applyDrag(
  edge: ResizeEdge,
  origin: ChatDockSize & { x: number; y: number },
  clientX: number,
  clientY: number,
  bottomClearance = 0,
): ChatDockSize {
  const nextWidth =
    edge === 'top' ? origin.width : origin.width + (origin.x - clientX)
  const nextHeight =
    edge === 'left' ? origin.height : origin.height + (origin.y - clientY)
  return clampChatDockSize(nextWidth, nextHeight, viewportSize(), bottomClearance)
}

export function ChatDock() {
  const api = getAtlasApi()
  const [open, setOpen] = useState(false)
  const [launchProjectId, setLaunchProjectId] = useState<string | null>(null)
  const [fabHidden, setFabHidden] = useState(false)
  const [fabPos, setFabPos] = useState<FabPoint | null>(null)
  const [fabDragging, setFabDragging] = useState(false)
  const fabDraggingRef = useRef(false)
  const [showHint, setShowHint] = useState(false)
  const [bottomClearance, setBottomClearance] = useState(() =>
    typeof window === 'undefined' ? 0 : getFabBottomClearance(),
  )
  const [size, setSize] = useState<ChatDockSize>(() =>
    clampChatDockSize(
      CHAT_DOCK_DEFAULT_WIDTH,
      CHAT_DOCK_DEFAULT_HEIGHT,
      {
        width: typeof window === 'undefined' ? 1440 : window.innerWidth,
        height: typeof window === 'undefined' ? 900 : window.innerHeight,
      },
      typeof window === 'undefined' ? 0 : getFabBottomClearance(),
    ),
  )
  const [dragging, setDragging] = useState<ResizeEdge | null>(null)
  const sizeRef = useRef(size)
  const clearanceRef = useRef(bottomClearance)
  const fabPosRef = useRef<FabPoint | null>(null)
  const fabDragOriginRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  )
  const fabMovedRef = useRef(false)
  const dragOriginRef = useRef<(ChatDockSize & { x: number; y: number }) | null>(null)
  const draggingRef = useRef<ResizeEdge | null>(null)
  const userSizedRef = useRef(false)
  sizeRef.current = size
  clearanceRef.current = bottomClearance
  fabPosRef.current = fabPos

  const persistSize = useCallback(
    (next: ChatDockSize) => {
      void api.settings.update({
        chatPanelWidth: next.width,
        chatPanelHeight: next.height,
      })
    },
    [api],
  )

  const persistFab = useCallback(
    (next: { hidden?: boolean; x?: number | null; y?: number | null }) => {
      void api.settings.update({
        ...(next.hidden !== undefined ? { chatFabHidden: next.hidden } : {}),
        ...(next.x !== undefined ? { chatFabX: next.x } : {}),
        ...(next.y !== undefined ? { chatFabY: next.y } : {}),
      })
    },
    [api],
  )

  useEffect(() => {
    return onAtlasChatOpen((detail) => {
      setLaunchProjectId(detail.projectId ?? null)
      setOpen(true)
      setFabHidden(false)
      persistFab({ hidden: false })
    })
  }, [persistFab])

  useEffect(() => {
    let cancelled = false
    void api.settings.get().then((settings) => {
      if (cancelled) return
      if (!userSizedRef.current) {
        setSize(
          normalizeChatDockSize(
            settings.chatPanelWidth,
            settings.chatPanelHeight,
            viewportSize(),
            clearanceRef.current,
          ),
        )
      }
      setFabHidden(Boolean(settings.chatFabHidden))
      const hasCustom =
        typeof settings.chatFabX === 'number' &&
        Number.isFinite(settings.chatFabX) &&
        typeof settings.chatFabY === 'number' &&
        Number.isFinite(settings.chatFabY)
      if (hasCustom) {
        const next = clampFabPoint(
          { x: settings.chatFabX as number, y: settings.chatFabY as number },
          clearanceRef.current,
        )
        fabPosRef.current = next
        setFabPos(next)
      } else {
        fabPosRef.current = null
        setFabPos(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    function syncClearanceAndSize() {
      const clearance = getFabBottomClearance()
      clearanceRef.current = clearance
      setBottomClearance(clearance)
      setSize((current) =>
        clampChatDockSize(current.width, current.height, viewportSize(), clearance),
      )
      // Não reescreve a posição preferida do FAB: clearance só afeta o clamp na hora de desenhar.
    }
    syncClearanceAndSize()
    return subscribeFabBottomClearance(syncClearanceAndSize)
  }, [])

  useEffect(() => {
    function onResize() {
      setFabPos((current) => {
        if (!current) return current
        const next = clampFabPoint(current, clearanceRef.current)
        if (next.x === current.x && next.y === current.y) return current
        fabPosRef.current = next
        persistFab({ x: next.x, y: next.y })
        return next
      })
      setSize((current) =>
        clampChatDockSize(current.width, current.height, viewportSize(), clearanceRef.current),
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [persistFab])

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
    const next = applyDrag(edge, origin, event.clientX, event.clientY, clearanceRef.current)
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
    const next = clampChatDockSize(
      CHAT_DOCK_DEFAULT_WIDTH,
      CHAT_DOCK_DEFAULT_HEIGHT,
      viewportSize(),
      clearanceRef.current,
    )
    userSizedRef.current = true
    sizeRef.current = next
    setSize(next)
    persistSize(next)
  }

  function beginFabDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const current = fabPosRef.current ?? defaultFabPoint(clearanceRef.current)
    fabDragOriginRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: current.x,
      y: current.y,
    }
    fabMovedRef.current = false
    fabDraggingRef.current = true
    setFabDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onFabDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = fabDragOriginRef.current
    if (!origin || !fabDraggingRef.current) return
    const dx = event.clientX - origin.pointerX
    const dy = event.clientY - origin.pointerY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fabMovedRef.current = true
    const next = clampFabPoint(
      { x: origin.x + dx, y: origin.y + dy },
      clearanceRef.current,
    )
    fabPosRef.current = next
    setFabPos(next)
  }

  function endFabDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!fabDraggingRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    fabDraggingRef.current = false
    setFabDragging(false)
    fabDragOriginRef.current = null
    const next = fabPosRef.current
    if (next && fabMovedRef.current) {
      persistFab({ x: next.x, y: next.y })
    }
  }

  function hideFab() {
    setFabHidden(true)
    setOpen(false)
    persistFab({ hidden: true })
  }

  function showFab() {
    setFabHidden(false)
    persistFab({ hidden: false })
  }

  function resetFabPosition() {
    fabPosRef.current = null
    setFabPos(null)
    persistFab({ x: null, y: null })
  }

  const resolvedFab = clampFabPoint(fabPos ?? defaultFabPoint(bottomClearance), bottomClearance)
  const fabBottom = FAB_GAP + bottomClearance
  const panelBottom = fabBottom + PANEL_ABOVE_FAB
  const hiddenTabBottom = FAB_GAP + bottomClearance

  return (
    <>
      {fabHidden ? (
        <button
          type="button"
          aria-label="Mostrar chat do Atlas"
          title="Mostrar chat do Atlas"
          onClick={showFab}
          className="fixed right-0 z-[45] flex items-center gap-1 rounded-l-xl bg-accent px-2 py-2 text-[10px] font-semibold text-on-accent shadow-popover transition-colors hover:bg-accent-hover"
          style={{ bottom: hiddenTabBottom }}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Atlas
        </button>
      ) : (
        <div
          className={cn('fixed z-[45]', fabDragging ? 'cursor-grabbing' : null)}
          style={{ left: resolvedFab.x, top: resolvedFab.y }}
          onPointerDown={beginFabDrag}
          onPointerMove={onFabDragMove}
          onPointerUp={endFabDrag}
          onPointerCancel={endFabDrag}
          onMouseEnter={() => setShowHint(true)}
          onMouseLeave={() => {
            if (!fabDragging) setShowHint(false)
          }}
        >
          {!open && showHint && !fabDragging ? (
            <div
              id="atlas-chat-hint"
              className="pointer-events-none absolute bottom-[calc(100%+10px)] right-0 whitespace-nowrap rounded-xl bg-card px-2.5 py-1.5 text-[11px] font-medium text-text shadow-card ring-1 ring-border"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-accent" />
                {atlasAssistantCopy.speakHint}
              </span>
              <span className="absolute -bottom-1.5 right-4 h-3 w-3 rotate-45 bg-card ring-1 ring-border" />
              <span className="absolute -bottom-px right-4 h-3 w-3 rotate-45 bg-card" />
            </div>
          ) : null}

          <div className="group relative">
            <button
              type="button"
              data-tour="chat"
              aria-label={open ? 'Fechar chat' : atlasAssistantCopy.speakLabel}
              aria-describedby={open || !showHint ? undefined : 'atlas-chat-hint'}
              title={
                open
                  ? 'Fechar chat'
                  : `${atlasAssistantCopy.speakHint} · Arraste para mover`
              }
              onClick={() => {
                if (fabMovedRef.current) {
                  fabMovedRef.current = false
                  return
                }
                setOpen((current) => !current)
              }}
              className={cn(
                'relative flex h-12 w-12 items-center justify-center rounded-full shadow-popover transition-colors',
                open
                  ? 'bg-elevated text-text ring-1 ring-border hover:bg-hover'
                  : 'bg-accent text-on-accent hover:bg-accent-hover',
              )}
            >
              {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
              {!open ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-text text-[8px] font-bold leading-none text-bg">
                  1
                </span>
              ) : null}
            </button>

            <span
              className="pointer-events-none absolute -left-1 top-1/2 -translate-y-1/2 rounded bg-elevated/90 p-0.5 text-muted-2 opacity-0 shadow-card ring-1 ring-border transition-opacity group-hover:opacity-100"
              aria-hidden
            >
              <GripVertical className="h-3 w-3" />
            </span>

            <button
              type="button"
              aria-label="Ocultar botão do Atlas"
              title="Ocultar botão (pode trazer de volta pela aba na borda)"
              onClick={(event) => {
                event.stopPropagation()
                hideFab()
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-elevated text-muted-2 opacity-0 shadow-card ring-1 ring-border transition-opacity hover:bg-hover hover:text-text group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>

            {fabPos ? (
              <button
                type="button"
                aria-label="Restaurar posição padrão do botão"
                title="Restaurar canto padrão"
                onClick={(event) => {
                  event.stopPropagation()
                  resetFabPosition()
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="absolute -bottom-1 -left-1 hidden rounded-md bg-elevated px-1 py-0.5 text-[9px] text-muted-2 shadow-card ring-1 ring-border hover:bg-hover hover:text-text group-hover:block"
              >
                ↺
              </button>
            ) : null}
          </div>
        </div>
      )}

      {open ? (
        <div
          className={cn(
            'fixed right-5 z-[44] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-popover',
            dragging ? 'select-none' : null,
          )}
          style={{ width: size.width, height: size.height, bottom: panelBottom }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar largura do chat"
            className={cn(
              'absolute inset-y-2 left-0 z-10 w-2 cursor-ew-resize touch-none select-none rounded-full',
              dragging === 'left' || dragging === 'corner' ? 'bg-accent/35' : 'bg-transparent hover:bg-border-strong',
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
              dragging === 'top' || dragging === 'corner' ? 'bg-accent/35' : 'bg-transparent hover:bg-border-strong',
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
              dragging === 'corner' ? 'bg-accent/40' : 'bg-transparent hover:bg-border-strong',
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
