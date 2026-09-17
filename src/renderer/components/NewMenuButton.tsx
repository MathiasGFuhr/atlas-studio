import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { BookOpen, CheckSquare, Music2, Plus, Tv } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { createMenuAreaFromPath, createMenuOrder, type CreateMenuId } from '@shared/createMenu'
import { filterCreateMenuItems } from '@shared/workspaceCapabilities'
import { Button } from './Button'
import { useCreateActions } from './CreateActionsProvider'
import { cn } from '../lib/utils'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'

const LABELS: Record<CreateMenuId, { label: string; icon: typeof BookOpen }> = {
  history: { label: 'Projeto de História', icon: BookOpen },
  music: { label: 'Projeto de Música', icon: Music2 },
  channel: { label: 'Canal', icon: Tv },
  task: { label: 'Tarefa', icon: CheckSquare },
}

export function NewMenuButton() {
  const location = useLocation()
  const { openCreate } = useCreateActions()
  const { capabilities } = useWorkspaceCapabilities()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const items = filterCreateMenuItems(
    createMenuOrder(createMenuAreaFromPath(location.pathname)),
    capabilities,
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
  }, [location.pathname, open])

  function select(id: CreateMenuId) {
    close()
    openCreate(id)
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
      select(items[activeIndex])
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        className="h-10 px-3.5"
        icon={<Plus className="h-4 w-4" />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Novo"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKeyDown}
      >
        Novo
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Criar"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[240px] rounded-xl border border-border bg-card-2 p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
        >
          {items.map((id, index) => {
            const meta = LABELS[id]
            const Icon = meta.icon
            const active = index === activeIndex
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-text transition-colors',
                  active ? 'bg-accent-dark/55' : 'hover:bg-white/[0.04]',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(id)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted" />
                {meta.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
