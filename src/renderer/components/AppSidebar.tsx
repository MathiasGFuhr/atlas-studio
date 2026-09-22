import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, CheckSquare, ChevronLeft, ChevronRight, Clapperboard, Home, MessageSquareText, Music2, Settings, Tv } from 'lucide-react'
import { AI_SETTINGS_HREF, deriveAtlasAiStatus } from '@shared/atlasAiStatus'
import type { CodexStatus } from '@shared/types'
import { isContentAreaEnabled, MUSIC_PROMPTS_PATH } from '@shared/workspaceCapabilities'
import { AtlasAiStatusCard } from './AtlasAiStatusCard'
import { SidebarChannelSwitcher } from './SidebarChannelSwitcher'
import { SidebarUpdateCard } from './SidebarUpdateCard'
import { ENVIRONMENTS } from '../lib/environments'
import { cn } from '../lib/utils'
import { getAtlasApi } from '../lib/api'
import { onTasksChanged } from '../lib/taskEvents'
import { useAntigravityStatus } from '../hooks/useAntigravityStatus'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { PRODUCT_TOUR_ACTIVE_EVENT } from '../lib/productTourEvents'

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
}: {
  codexStatus: CodexStatus | null
}) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const antigravityStatus = useAntigravityStatus()
  const aiStatus = deriveAtlasAiStatus(codexStatus, antigravityStatus)
  const [pendingCount, setPendingCount] = useState(0)
  const compactViewport = useMediaQuery('(max-width: 1100px)')
  const userToggledRef = useRef(false)
  const collapsedRef = useRef(false)
  const tourLockRef = useRef(false)
  const tourRestoreRef = useRef<boolean | null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  collapsedRef.current = collapsed
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

  useEffect(() => {
    if (userToggledRef.current || tourLockRef.current) return
    if (compactViewport) setCollapsed(true)
  }, [compactViewport])

  useEffect(() => {
    function onTour(event: Event) {
      const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active)
      tourLockRef.current = active
      if (active) {
        if (tourRestoreRef.current === null) tourRestoreRef.current = collapsedRef.current
        setCollapsed(false)
        return
      }
      if (tourRestoreRef.current !== null) {
        setCollapsed(tourRestoreRef.current)
        tourRestoreRef.current = null
      }
    }
    window.addEventListener(PRODUCT_TOUR_ACTIVE_EVENT, onTour)
    return () => window.removeEventListener(PRODUCT_TOUR_ACTIVE_EVENT, onTour)
  }, [])

  function toggleCollapsed() {
    userToggledRef.current = true
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

  function openAiSettings() {
    const onAiSection = pathname === '/configuracoes' && new URLSearchParams(search).get('secao') === 'ia'
    if (onAiSection) {
      document.getElementById('ia')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    navigate(AI_SETTINGS_HREF)
  }

  const collapseLabel = collapsed ? 'Expandir menu' : 'Recolher menu'

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        'relative z-10 flex h-full shrink-0 flex-col border-r border-border-soft bg-sidebar transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      <button
        type="button"
        title={collapseLabel}
        aria-label={collapseLabel}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
        className="absolute right-0 top-[1.65rem] z-20 flex h-6 w-6 translate-x-1/2 items-center justify-center rounded-full border border-border-soft bg-sidebar text-muted shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-colors hover:bg-card-2 hover:text-text"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
      <div className={cn('flex items-center pb-3 pt-5', collapsed ? 'justify-center px-2' : 'gap-3 px-5')}>
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

      <SidebarChannelSwitcher compact={collapsed} />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-3">
        {collapsed ? null : (
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
            Principal
          </p>
        )}
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
        <AtlasAiStatusCard view={aiStatus} onClick={openAiSettings} compact={collapsed} />
      </div>
    </aside>
  )
}
