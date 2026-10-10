import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Home,
  Loader2,
  MessageSquareText,
  MessagesSquare,
  Mic2,
  Music2,
  Settings,
  Tv,
} from 'lucide-react'
import { AI_SETTINGS_HREF, deriveAtlasAiStatus } from '@shared/atlasAiStatus'
import type { CodexStatus } from '@shared/types'
import { MUSIC_LIPSYNC_PATH, MUSIC_PROMPTS_PATH } from '@shared/workspaceCapabilities'
import { AtlasAiStatusCard } from './AtlasAiStatusCard'
import { SidebarChannelSwitcher } from './SidebarChannelSwitcher'
import { SidebarUpdateCard } from './SidebarUpdateCard'
import { ENVIRONMENTS } from '../lib/environments'
import { cn } from '../lib/utils'
import { getAtlasApi } from '../lib/api'
import { onTasksChanged } from '../lib/taskEvents'
import { useAntigravityStatus } from '../hooks/useAntigravityStatus'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useShortsGeneration } from '../hooks/useShortsGeneration'
import { PRODUCT_TOUR_ACTIVE_EVENT } from '../lib/productTourEvents'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
}

type NavSection = {
  id: string
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    id: 'geral',
    label: 'Geral',
    items: [{ to: '/', label: 'Início', icon: Home, end: true }],
  },
  {
    id: 'estudio',
    label: 'Estúdio',
    items: [
      { to: ENVIRONMENTS.music.basePath, label: 'Projetos', icon: Music2 },
      { to: MUSIC_PROMPTS_PATH, label: 'Prompts', icon: MessageSquareText },
      { to: MUSIC_LIPSYNC_PATH, label: 'Lipsync', icon: Mic2 },
      { to: '/shorts', label: 'Shorts', icon: Clapperboard },
    ],
  },
  {
    id: 'operacao',
    label: 'Operação',
    items: [
      { to: '/canais', label: 'Canais', icon: Tv },
      { to: '/equipe', label: 'Chat', icon: MessagesSquare },
      { to: '/tarefas', label: 'Tarefas', icon: CheckSquare },
    ],
  },
]

const settingsItem: NavItem = {
  to: '/configuracoes',
  label: 'Configurações',
  icon: Settings,
}

function isSidebarLinkActive(to: string, pathname: string, matched: boolean): boolean {
  if (to === ENVIRONMENTS.music.basePath) {
    return (
      pathname === ENVIRONMENTS.music.basePath ||
      (pathname.startsWith(`${ENVIRONMENTS.music.basePath}/`) &&
        !pathname.startsWith(MUSIC_PROMPTS_PATH) &&
        !pathname.startsWith(MUSIC_LIPSYNC_PATH))
    )
  }
  if (to === MUSIC_PROMPTS_PATH) {
    return pathname === MUSIC_PROMPTS_PATH || pathname.startsWith(`${MUSIC_PROMPTS_PATH}/`)
  }
  if (to === MUSIC_LIPSYNC_PATH) {
    return pathname === MUSIC_LIPSYNC_PATH || pathname.startsWith(`${MUSIC_LIPSYNC_PATH}/`)
  }
  return matched
}

const SIDEBAR_COLLAPSED_KEY = 'atlas.sidebar.collapsed'

export function AppSidebar({
  codexStatus,
  accountId,
}: {
  codexStatus: CodexStatus | null
  accountId: string
}) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const antigravityStatus = useAntigravityStatus()
  const aiStatus = deriveAtlasAiStatus(codexStatus, antigravityStatus)
  const shortsGeneration = useShortsGeneration()
  const [pendingCount, setPendingCount] = useState(0)
  const [onlineCount, setOnlineCount] = useState(0)
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

  useEffect(() => {
    function refresh() {
      void api.tasks.pendingCount().then(setPendingCount)
    }
    refresh()
    return onTasksChanged(refresh)
  }, [api])

  useEffect(() => {
    let cancelled = false

    function applyPeers(peers: { id: string }[]) {
      if (cancelled) return
      setOnlineCount(peers.filter((peer) => peer.id && peer.id !== accountId).length)
    }

    void api.teamChat.listOnline().then(applyPeers)
    const offPresence = api.teamChat.onPresence(applyPeers)

    return () => {
      cancelled = true
      offPresence()
    }
  }, [accountId, api])

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
    const onAiSection =
      pathname === '/configuracoes' && new URLSearchParams(search).get('secao') === 'ia'
    if (onAiSection) {
      document.getElementById('ia')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    navigate(AI_SETTINGS_HREF)
  }

  const collapseLabel = collapsed ? 'Expandir menu' : 'Recolher menu'

  function renderNavLink(item: NavItem) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) => {
          const active = isSidebarLinkActive(item.to, pathname, isActive)
          return cn(
            'group relative flex items-center rounded-lg text-[13px] font-medium tracking-[-0.01em] transition-colors',
            collapsed ? 'h-10 justify-center px-0' : 'h-9 gap-2.5 px-2.5',
            active
              ? 'bg-white/[0.06] text-text'
              : 'text-muted-2 hover:bg-white/[0.03] hover:text-text',
          )
        }}
      >
        {({ isActive }) => {
          const active = isSidebarLinkActive(item.to, pathname, isActive)
          return (
            <>
              {active ? (
                <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-accent" />
              ) : null}
              <item.icon
                className={cn(
                  'h-[17px] w-[17px] shrink-0 transition-colors',
                  active ? 'text-accent' : 'text-muted-2 group-hover:text-muted',
                )}
              />
              {collapsed ? (
                item.to === '/tarefas' && pendingCount > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                ) : item.to === '/equipe' && onlineCount > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-dark px-1 text-[10px] font-semibold leading-none text-accent">
                    {onlineCount > 9 ? '9+' : onlineCount}
                  </span>
                ) : item.to === '/shorts' && shortsGeneration.hasActiveAnalysis ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                ) : null
              ) : (
                <>
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.to === '/tarefas' && pendingCount > 0 ? (
                    <span className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                      {pendingCount}
                    </span>
                  ) : null}
                  {item.to === '/equipe' && onlineCount > 0 ? (
                    <span className="ml-auto text-[11px] font-semibold tabular-nums text-accent">
                      {onlineCount}
                    </span>
                  ) : null}
                  {item.to === '/shorts' && shortsGeneration.hasActiveAnalysis ? (
                    <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                  ) : null}
                </>
              )}
            </>
          )
        }}
      </NavLink>
    )
  }

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        'relative z-10 flex h-full shrink-0 flex-col border-r border-border-soft/80 bg-sidebar transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[252px]',
      )}
    >
      <button
        type="button"
        title={collapseLabel}
        aria-label={collapseLabel}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
        className="absolute right-0 top-[1.55rem] z-20 flex h-6 w-6 translate-x-1/2 items-center justify-center rounded-full border border-border-soft bg-sidebar text-muted-2 shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-colors hover:bg-card-2 hover:text-text"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      <div className={cn('flex items-center pb-2 pt-5', collapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-dark text-accent ring-1 ring-accent/20">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 18L12 4L20 18H15.5L12 11.5L8.5 18H4Z" fill="currentColor" />
          </svg>
        </div>
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <div className="sidebar-brand truncate text-[17px] leading-none tracking-[-0.02em] text-text">
              Atlas Studio
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-2">Produção musical</div>
          </div>
        )}
      </div>

      <div className="pb-1">
        <SidebarChannelSwitcher compact={collapsed} />
      </div>

      <nav className="sidebar-nav flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 pb-2 pt-3">
        {navSections.map((section) => (
          <div key={section.id} className="flex flex-col gap-0.5">
            {collapsed ? (
              <div className="mx-auto mb-1 h-px w-6 bg-border-soft" aria-hidden />
            ) : (
              <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-2/90">
                {section.label}
              </p>
            )}
            {section.items.map((item) => renderNavLink(item))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-border-soft/70 px-2.5 pb-3 pt-3">
        <div className="flex flex-col gap-0.5">{renderNavLink(settingsItem)}</div>
        <SidebarUpdateCard compact={collapsed} />
        <AtlasAiStatusCard view={aiStatus} onClick={openAiSettings} compact={collapsed} />
      </div>
    </aside>
  )
}
