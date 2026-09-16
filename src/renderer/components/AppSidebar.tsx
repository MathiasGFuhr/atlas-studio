import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { BookOpen, CheckSquare, Home, Music2, Settings, Tv } from 'lucide-react'
import type { CodexStatus } from '@shared/types'
import { CodexStatusCard } from './CodexStatus'
import { ENVIRONMENTS } from '../lib/environments'
import { cn } from '../lib/utils'
import { getAtlasApi } from '../lib/api'
import { onTasksChanged } from '../lib/taskEvents'

const items = [
  { to: '/', label: 'Início', icon: Home, end: true, color: undefined },
  {
    to: ENVIRONMENTS.history.basePath,
    label: ENVIRONMENTS.history.label,
    icon: BookOpen,
    color: ENVIRONMENTS.history.color,
  },
  {
    to: ENVIRONMENTS.music.basePath,
    label: ENVIRONMENTS.music.label,
    icon: Music2,
    color: ENVIRONMENTS.music.color,
  },
  { to: '/canais', label: 'Canais', icon: Tv, color: undefined },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, color: undefined },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, color: undefined },
]

export function AppSidebar({
  codexStatus,
  onCodexClick,
}: {
  codexStatus: CodexStatus | null
  onCodexClick?: () => void
}) {
  const api = getAtlasApi()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    function refresh() {
      void api.tasks.pendingCount().then(setPendingCount)
    }
    refresh()
    return onTasksChanged(refresh)
  }, [api])

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-border-soft bg-sidebar">
      <div className="flex items-center gap-3 px-5 pb-6 pt-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-dark text-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 18L12 4L20 18H15.5L12 11.5L8.5 18H4Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight text-text">
            Atlas Studio
          </div>
          <div className="truncate text-[11px] text-muted">Sistema de roteiros com IA</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-dark/55 text-accent'
                  : 'text-muted hover:bg-white/[0.03] hover:text-text',
              )
            }
            style={({ isActive }) =>
              isActive && item.color ? { backgroundColor: `${item.color}1f` } : {}
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                    style={item.color ? { backgroundColor: item.color } : undefined}
                  />
                ) : null}
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px]',
                    isActive ? 'text-accent' : 'text-muted group-hover:text-text',
                  )}
                  style={isActive && item.color ? { color: item.color } : undefined}
                />
                <span style={isActive && item.color ? { color: item.color } : undefined}>
                  {item.label}
                </span>
                {item.to === '/tarefas' && pendingCount > 0 ? (
                  <span className="ml-auto rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {pendingCount}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4 pt-2">
        <CodexStatusCard status={codexStatus} onClick={onCodexClick} />
      </div>
    </aside>
  )
}
