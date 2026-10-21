import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import type { AtlasTask } from '@shared/types'
import {
  deriveTaskNotifications,
  deriveUpdateNotification,
  mergeReadKeys,
  normalizeNotificationReadKeys,
  unreadNotifications,
  type AtlasNotification,
} from '@shared/notifications'
import { getAtlasApi } from '../lib/api'
import { onTasksChanged } from '../lib/taskEvents'
import { cn } from '../lib/utils'
import { useAppUpdate } from '../hooks/useAppUpdate'

export function NotificationBell() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { status: updateStatus } = useAppUpdate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<AtlasTask[]>([])
  const [readKeys, setReadKeys] = useState<string[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const writeGen = useRef(0)

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api.tasks.list())
    } catch (error) {
      console.error('[atlas] falha ao carregar tarefas das notificações', error)
    }
  }, [api])

  useEffect(() => {
    void loadTasks()
    void api.settings
      .get()
      .then((settings) => {
        if (writeGen.current !== 0) return
        setReadKeys(normalizeNotificationReadKeys(settings.notificationReadKeys))
      })
      .catch((error) => console.error('[atlas] falha ao ler notificações lidas', error))
    const offTasks = onTasksChanged(() => {
      void loadTasks()
    })
    const offOpenChat = api.teamChat.onOpenChat((roomId) => {
      setOpen(false)
      const id = typeof roomId === 'string' ? roomId.trim() : ''
      navigate(id ? `/equipe?sala=${encodeURIComponent(id)}` : '/equipe')
    })
    return () => {
      offTasks()
      offOpenChat()
    }
  }, [api, loadTasks, navigate])

  const items = useMemo(() => {
    const update = updateStatus ? deriveUpdateNotification(updateStatus) : null
    const next = deriveTaskNotifications(tasks)
    return update ? [update, ...next] : next
  }, [tasks, updateStatus])
  const unread = useMemo(() => unreadNotifications(items, readKeys), [items, readKeys])
  const unreadCount = unread.length

  const persistKeys = useCallback(
    async (next: string[]) => {
      writeGen.current += 1
      const normalized = normalizeNotificationReadKeys(next)
      setReadKeys(normalized)
      try {
        await api.settings.update({ notificationReadKeys: normalized })
      } catch (error) {
        console.error('[atlas] falha ao salvar notificações lidas', error)
      }
    },
    [api],
  )

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, close])

  useEffect(() => {
    setActiveIndex(0)
  }, [open])

  function openItem(item: AtlasNotification) {
    void persistKeys(mergeReadKeys(readKeys, [item.id]))
    close()
    navigate(item.href, { state: { focusTask: item.taskId, nonce: Date.now() } })
  }

  async function markOneRead(item: AtlasNotification) {
    await persistKeys(mergeReadKeys(readKeys, [item.id]))
  }

  async function markAllRead() {
    await persistKeys(mergeReadKeys(readKeys, items.map((item) => item.id)))
  }

  function onButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (!open || items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      openItem(items[activeIndex])
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Notificações"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-hover hover:text-text"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-bg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-popover"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border-soft px-3.5 py-2.5">
            <p className="text-sm font-semibold text-text">Notificações</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-[11px] font-medium text-accent hover:underline"
                onClick={() => void markAllRead()}
              >
                Marcar todas como lidas
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm text-muted">Você está em dia.</p>
          ) : (
            <div className="max-h-[min(420px,70vh)] overflow-y-auto py-1.5">
              {items.map((item, index) => {
                const isUnread = unread.some((entry) => entry.id === item.id)
                const active = index === activeIndex
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'mx-1.5 flex items-start gap-2 rounded-xl px-2 py-2 transition-colors',
                      active ? 'bg-accent-subtle/55' : 'hover:bg-hover',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openItem(item)}
                    >
                      <div className="flex items-center gap-2">
                        {isUnread ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        ) : (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-transparent" />
                        )}
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-2">
                          {item.title}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate pl-3.5 text-sm font-medium text-text">
                        {item.body}
                      </p>
                      <p
                        className={cn(
                          'pl-3.5 text-xs',
                          item.kind === 'task-overdue'
                            ? 'text-danger'
                            : item.kind === 'app-update'
                              ? 'text-accent'
                              : 'text-warning',
                        )}
                      >
                        {item.hint}
                      </p>
                    </button>
                    {isUnread ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-1.5 py-1 text-[10px] font-medium text-muted hover:bg-hover hover:text-text"
                        onClick={() => void markOneRead(item)}
                      >
                        Lida
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
