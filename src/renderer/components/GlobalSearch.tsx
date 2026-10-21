import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Search, Tv } from 'lucide-react'
import { PROJECT_TYPE_LABEL, type Channel, type Project } from '@shared/types'
import { getAtlasApi } from '../lib/api'
import { projectPath } from '../lib/environments'
import { cn } from '../lib/utils'

type SearchKind = 'project' | 'channel'

interface SearchHit {
  id: string
  kind: SearchKind
  title: string
  subtitle: string
  to: string
}

const KIND_META: Record<SearchKind, { label: string; icon: typeof Search }> = {
  project: { label: 'Projetos', icon: FolderKanban },
  channel: { label: 'Canais', icon: Tv },
}

const KIND_ORDER: SearchKind[] = ['project', 'channel']
const PER_KIND = 6
const MIN_CHARS = 2

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

function mapProject(project: Project): SearchHit {
  const extra = project.channelName?.trim()
  return {
    id: `project:${project.id}`,
    kind: 'project',
    title: project.name,
    subtitle: [PROJECT_TYPE_LABEL.music, extra].filter(Boolean).join(' · '),
    to: projectPath('music', project.id),
  }
}

function mapChannel(channel: Channel): SearchHit {
  return {
    id: `channel:${channel.id}`,
    kind: 'channel',
    title: channel.name,
    subtitle: 'Canal',
    to: `/canais/${channel.id}`,
  }
}

export function GlobalSearch() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const shortcut = isMacPlatform() ? '⌘K' : 'Ctrl+K'

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(0)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [close])

  useEffect(() => {
    const term = query.trim()
    if (!open || term.length < MIN_CHARS) {
      setHits([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [projects, channels] = await Promise.all([
            api.projects.list({ query: term }),
            api.channels.list({ query: term }),
          ])
          if (cancelled) return
          setHits([
            ...projects.slice(0, PER_KIND).map(mapProject),
            ...channels.slice(0, PER_KIND).map(mapChannel),
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
  }, [api, open, query])

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
      if (hit) {
        navigate(hit.to)
        close()
        setQuery('')
      }
    }
  }

  const grouped = useMemo(() => {
    return KIND_ORDER.map((kind) => ({
      kind,
      items: hits.filter((hit) => hit.kind === kind),
    })).filter((group) => group.items.length > 0)
  }, [hits])

  let flatIndex = -1

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder="Buscar projetos e canais"
          aria-controls={listId}
          aria-expanded={open}
          className="h-10 w-full rounded-xl border border-border bg-elevated pl-10 pr-16 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border-soft px-1.5 py-0.5 text-[10px] text-muted-2">
          {shortcut}
        </kbd>
      </div>

      {open ? (
        <div
          id={listId}
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-popover"
        >
          {query.trim().length < MIN_CHARS ? (
            <p className="px-4 py-3 text-xs text-muted">Digite pelo menos {MIN_CHARS} letras.</p>
          ) : loading ? (
            <p className="px-4 py-3 text-xs text-muted">Buscando...</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted">Nada encontrado para “{query.trim()}”.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto py-2">
              {grouped.map((group) => {
                const Meta = KIND_META[group.kind]
                return (
                  <div key={group.kind} className="px-2 py-1">
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
                      {Meta.label}
                    </p>
                    {group.items.map((hit) => {
                      flatIndex += 1
                      const index = flatIndex
                      const Icon = KIND_META[hit.kind].icon
                      return (
                        <button
                          key={hit.id}
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors',
                            index === activeIndex ? 'bg-elevated text-text' : 'text-muted hover:bg-elevated hover:text-text',
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => {
                            navigate(hit.to)
                            close()
                            setQuery('')
                          }}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text">{hit.title}</span>
                            <span className="block truncate text-xs text-muted-2">{hit.subtitle}</span>
                          </span>
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
