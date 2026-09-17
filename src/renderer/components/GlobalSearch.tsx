import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FolderKanban, Lightbulb, Search, Tv } from 'lucide-react'
import { PROJECT_TYPE_LABEL, type Channel, type Niche, type Project, type ScriptRecord } from '@shared/types'
import { isContentAreaEnabled } from '@shared/workspaceCapabilities'
import { getAtlasApi } from '../lib/api'
import { projectPath } from '../lib/environments'
import { cn, statusLabel } from '../lib/utils'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'

type SearchKind = 'project' | 'script' | 'channel' | 'niche'

interface SearchHit {
  id: string
  kind: SearchKind
  title: string
  subtitle: string
  to: string
  hiddenArea?: boolean
}

const KIND_META: Record<
  SearchKind,
  { label: string; icon: typeof Search }
> = {
  project: { label: 'Projetos', icon: FolderKanban },
  script: { label: 'Roteiros', icon: FileText },
  channel: { label: 'Canais', icon: Tv },
  niche: { label: 'Temas', icon: Lightbulb },
}

const KIND_ORDER: SearchKind[] = ['project', 'script', 'channel', 'niche']
const PER_KIND = 6
const MIN_CHARS = 2

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

function mapProject(
  project: Project,
  hiddenArea: boolean,
): SearchHit {
  const extra = project.channelName?.trim()
  const areaLabel = PROJECT_TYPE_LABEL[project.projectType]
  return {
    id: `project:${project.id}`,
    kind: 'project',
    title: project.name,
    subtitle: [hiddenArea ? `${areaLabel} (área oculta)` : areaLabel, extra].filter(Boolean).join(' · '),
    to: projectPath(project.projectType, project.id),
    hiddenArea,
  }
}

function mapScript(script: ScriptRecord, hiddenArea: boolean): SearchHit {
  const extra = script.projectName || script.nicheName || statusLabel(script.status)
  return {
    id: `script:${script.id}`,
    kind: 'script',
    title: script.title || script.topic || 'Roteiro sem título',
    subtitle: hiddenArea ? [extra, 'área oculta'].filter(Boolean).join(' · ') : extra,
    to: `/historia/roteiros/${script.id}`,
    hiddenArea,
  }
}

function mapNiche(niche: Niche, hiddenArea: boolean): SearchHit {
  return {
    id: `niche:${niche.id}`,
    kind: 'niche',
    title: niche.name,
    subtitle: hiddenArea
      ? `${niche.defaultLanguage || 'Tema'} · área oculta`
      : niche.defaultLanguage || 'Tema',
    to: `/historia/nichos?q=${encodeURIComponent(niche.name)}`,
    hiddenArea,
  }
}

function mapChannel(channel: Channel): SearchHit {
  return {
    id: `channel:${channel.id}`,
    kind: 'channel',
    title: channel.name,
    subtitle: channel.nicheName || 'Canal',
    to: `/canais/${channel.id}`,
  }
}

export function GlobalSearch() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { capabilities } = useWorkspaceCapabilities()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const shortcut = isMacPlatform() ? '⌘ K' : 'Ctrl K'

  const grouped = useMemo(() => {
    return KIND_ORDER.map((kind) => ({
      kind,
      items: hits.filter((hit) => hit.kind === kind),
    })).filter((group) => group.items.length > 0)
  }, [hits])

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(0)
  }, [])

  const goTo = useCallback(
    (hit: SearchHit) => {
      navigate(hit.to)
      setQuery('')
      setHits([])
      close()
      inputRef.current?.blur()
    },
    [close, navigate],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [close])

  useEffect(() => {
    const term = query.trim()
    if (!open) return
    if (term.length < MIN_CHARS) {
      setHits([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [projects, scripts, channels, niches] = await Promise.all([
            api.projects.list({ query: term }),
            api.scripts.list({ query: term }),
            api.channels.list({ query: term }),
            api.niches.list({ query: term }),
          ])
          if (cancelled) return
          const historyHidden = !isContentAreaEnabled(capabilities, 'history')
          const musicHidden = !isContentAreaEnabled(capabilities, 'music')
          setHits([
            ...projects.slice(0, PER_KIND).map((project) =>
              mapProject(project, project.projectType === 'history' ? historyHidden : musicHidden),
            ),
            ...scripts.slice(0, PER_KIND).map((script) => mapScript(script, historyHidden)),
            ...channels.slice(0, PER_KIND).map(mapChannel),
            ...niches.slice(0, PER_KIND).map((niche) => mapNiche(niche, historyHidden)),
          ])
          setActiveIndex(0)
        } catch {
          if (!cancelled) setHits([])
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 160)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [api, capabilities, open, query])

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      inputRef.current?.blur()
      return
    }
    if (!open || hits.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[activeIndex]
      if (hit) goTo(hit)
    }
  }

  const term = query.trim()
  const showPanel = open && (term.length > 0 || loading)
  const activeId = hits[activeIndex] ? `${listId}-${hits[activeIndex].id}` : undefined

  return (
    <div ref={rootRef} className="relative mx-auto flex h-11 w-full max-w-[560px] items-center">
      <Search className="pointer-events-none absolute left-3.5 z-10 h-4 w-4 text-muted-2" />
      <input
        ref={inputRef}
        aria-label="Buscar projetos, roteiros, canais ou temas"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showPanel}
        aria-activedescendant={activeId}
        role="combobox"
        placeholder="Buscar projetos, roteiros, canais ou temas..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        className="h-11 w-full rounded-full border border-border bg-card px-10 pr-16 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-3 rounded-md border border-border bg-card-2 px-1.5 py-0.5 text-[10px] text-muted-2">
        {shortcut}
      </kbd>

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
        >
          {term.length < MIN_CHARS ? (
            <p className="px-4 py-3 text-sm text-muted">Digite pelo menos 2 caracteres</p>
          ) : loading && hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Buscando...</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Nenhum resultado para “{term}”</p>
          ) : (
            <div className="max-h-[min(420px,70vh)] overflow-y-auto py-1.5">
              {grouped.map((group) => {
                const Icon = KIND_META[group.kind].icon
                return (
                  <div key={group.kind} className="px-1.5 py-1">
                    <div className="flex items-center gap-2 px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-2">
                      <Icon className="h-3.5 w-3.5" />
                      {KIND_META[group.kind].label}
                    </div>
                    {group.items.map((hit) => {
                      const index = hits.findIndex((item) => item.id === hit.id)
                      const active = index === activeIndex
                      return (
                        <button
                          key={hit.id}
                          id={`${listId}-${hit.id}`}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={cn(
                            'flex w-full flex-col rounded-xl px-2.5 py-2 text-left transition-colors',
                            active ? 'bg-accent-dark/55 text-text' : 'text-text hover:bg-white/[0.04]',
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => goTo(hit)}
                        >
                          <span className="truncate text-sm font-medium">{hit.title}</span>
                          <span className="truncate text-[11px] text-muted">{hit.subtitle}</span>
                        </button>
                      )
                    })}
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
