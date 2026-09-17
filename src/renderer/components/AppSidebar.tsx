import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { BookOpen, CheckSquare, Clapperboard, Home, MessageSquareText, Music2, PanelLeftClose, PanelLeftOpen, Settings, Tv } from 'lucide-react'
import type { CodexStatus } from '@shared/types'
import { isContentAreaEnabled, MUSIC_PROMPTS_PATH } from '@shared/workspaceCapabilities'
import { CodexStatusCard } from './CodexStatus'
import { SidebarUpdateCard } from './SidebarUpdateCard'
import { ENVIRONMENTS } from '../lib/environments'
import { cn } from '../lib/utils'
import { getAtlasApi } from '../lib/api'
import { onTasksChanged } from '../lib/taskEvents'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'

const globalItems = [
  { to: '/', label: 'Início', icon: Home, end: true, color: undefined, area: null as 'history' | 'music' | null },
  {
    to: ENVIRONMENTS.history.basePath,
    label: ENVIRONMENTS.history.label,
    icon: BookOpen,
    color: ENVIRONMENTS.history.color,
    area: 'history' as const,
  },
  {
    to: ENVIRONMENTS.music.basePath,
    label: ENVIRONMENTS.music.label,
    icon: Music2,
    color: ENVIRONMENTS.music.color,
    area: 'music' as const,
  },
  {
    to: MUSIC_PROMPTS_PATH,
    label: 'Prompts',
    icon: MessageSquareText,
    color: ENVIRONMENTS.music.color,
    area: 'music' as const,
  },
  { to: '/canais', label: 'Canais', icon: Tv, color: undefined, area: null },
  { to: '/shorts', label: 'Shorts Studio', icon: Clapperboard, color: undefined, area: null },
  { to: '/tarefas', label: 'Tarefas', icon: CheckSquare, color: undefined, area: null },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, color: undefined, area: null },
]

function isSidebarLinkActive(to: string, pathname: string, matched: boolean): boolean {
  if (to === ENVIRONMENTS.music.basePath) {
    return (
      pathname === ENVIRONMENTS.music.basePath ||
      (pathname.startsWith(`${ENVIRONMENTS.music.basePath}/`) && !pathname.startsWith(MUSIC_PROMPTS_PATH))
    )
  }
  if (to === MUSIC_PROMPTS_PATH) {
    return pathname === MUSIC_PROMPTS_PATH || pathname.startsWith(`${MUSIC_PROMPTS_PATH}/`)
  }
  return matched
}

const SIDEBAR_COLLAPSED_KEY = 'atlas.sidebar.collapsed'

export function AppSidebar({
  codexStatus,
  onCodexClick,
}: {
  codexStatus: CodexStatus | null
  onCodexClick?: () => void
}) {
  const api = getAtlasApi()
  const { pathname } = useLocation()
  const [pendingCount, setPendingCount] = useState(0)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const { capabilities } = useWorkspaceCapabilities()
  const items = globalItems.filter((item) => {
    if (!item.area) return true
    return isContentAreaEnabled(capabilities, item.area)
  })

  useEffect(() => {
    function refresh() {
      void api.tasks.pendingCount().then(setPendingCount)
    }
    refresh()
    return onTasksChanged(refresh)
  }, [api])

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border-soft bg-sidebar',
        collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      <div className={cn('flex items-center pb-6 pt-5', collapsed ? 'justify-center px-2' : 'gap-3 px-5')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-dark text-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 18L12 4L20 18H15.5L12 11.5L8.5 18H4Z"
              fill="currentColor"
            />
          </svg>
        </div>
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-tight text-text">
              Atlas Studio
            </div>
            <div className="truncate text-[11px] text-muted">Sistema de roteiros com IA</div>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => {
              const active = isSidebarLinkActive(item.to, pathname, isActive)
              return cn(
                'group relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                active
                  ? 'bg-accent-dark/55 text-accent'
                  : 'text-muted hover:bg-white/[0.03] hover:text-text',
              )
            }}
            style={({ isActive }) =>
              isSidebarLinkActive(item.to, pathname, isActive) && item.color
                ? { backgroundColor: `${item.color}1f` }
                : {}
            }
          >
            {({ isActive }) => {
              const active = isSidebarLinkActive(item.to, pathname, isActive)
              return (
              <>
                {active ? (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                    style={item.color ? { backgroundColor: item.color } : undefined}
                  />
                ) : null}
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0',
                    active ? 'text-accent' : 'text-muted group-hover:text-text',
                  )}
                  style={active && item.color ? { color: item.color } : undefined}
                />
                {collapsed ? (
                  item.to === '/tarefas' && pendingCount > 0 ? (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                  ) : null
                ) : (
                  <>
                    <span style={active && item.color ? { color: item.color } : undefined}>
                      {item.label}
                    </span>
                    {item.to === '/tarefas' && pendingCount > 0 ? (
                      <span className="ml-auto rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-muted">
                        {pendingCount}
                      </span>
                    ) : null}
                  </>
                )}
              </>
              )
            }}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-2 px-3 pb-4 pt-2">
        <SidebarUpdateCard compact={collapsed} />
        <CodexStatusCard status={codexStatus} onClick={onCodexClick} compact={collapsed} />
        <button
          type="button"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          onClick={toggleCollapsed}
          className="flex w-full items-center justify-center rounded-lg py-1.5 text-muted transition-colors hover:bg-white/[0.03] hover:text-text"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  )
}
