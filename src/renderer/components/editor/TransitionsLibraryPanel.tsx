import { useMemo, useState } from 'react'
import {
  EDITOR_TRANSITIONS,
  EDITOR_TRANSITION_CATEGORY_LABEL,
  EDITOR_TRANSITION_CATEGORY_ORDER,
  editorTransitionsByCategory,
  type EditorTransitionCategory,
  type EditorTransitionId,
} from '@shared/editor/transitionsCatalog'
import { cn } from '../../lib/utils'

type CategoryFilter = EditorTransitionCategory | 'all'

type Props = {
  onPickTransition?: (id: EditorTransitionId) => void
}

export function TransitionsLibraryPanel({ onPickTransition }: Props) {
  const [category, setCategory] = useState<CategoryFilter>('remotion')
  const [query, setQuery] = useState('')
  const items = useMemo(() => {
    const base = category === 'all' ? EDITOR_TRANSITIONS : editorTransitionsByCategory(category)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.glName.toLowerCase().includes(q),
    )
  }, [category, query])

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-[118px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border-soft py-2">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={cn(
            'flex items-center justify-between gap-1 px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors',
            category === 'all' ? 'bg-accent-subtle text-accent' : 'text-muted-2 hover:bg-hover hover:text-text',
          )}
        >
          <span>Todas</span>
          <span className="tabular-nums text-[9px] opacity-70">{EDITOR_TRANSITIONS.length}</span>
        </button>
        {EDITOR_TRANSITION_CATEGORY_ORDER.map((id) => {
          const count = editorTransitionsByCategory(id).length
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={cn(
                'flex items-center justify-between gap-1 px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors',
                category === id ? 'bg-accent-subtle text-accent' : 'text-muted-2 hover:bg-hover hover:text-text',
              )}
            >
              <span className="truncate">{EDITOR_TRANSITION_CATEGORY_LABEL[id]}</span>
              <span className="tabular-nums text-[9px] opacity-70">{count}</span>
            </button>
          )
        })}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b border-border-soft px-3 py-2">
          <p className="text-[11px] leading-relaxed text-muted-2">
            Remotion-like + gl-transitions · {items.length} na lista
          </p>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar transição…"
            className="w-full rounded-lg border border-border-soft bg-elevated px-2.5 py-1.5 text-[11px] text-text outline-none placeholder:text-muted-2 focus:border-accent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          {items.length === 0 ? (
            <p className="px-2 py-8 text-center text-[11px] text-muted-2">Nenhuma transição encontrada.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.description}
                  onClick={() => onPickTransition?.(item.id)}
                  className={cn(
                    'rounded-lg border border-border-soft bg-card px-2.5 py-2 text-left transition-colors',
                    'hover:border-border-strong hover:bg-hover',
                  )}
                >
                  <p className="truncate text-[11px] font-semibold text-text">{item.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-2">{item.description}</p>
                  <p className="mt-1 text-[9px] tabular-nums text-muted-2">
                    {item.defaultDuration.toFixed(1)}s
                    {item.source === 'remotion' ? ' · Remotion' : ''}
                    {item.ffmpegXfade ? ' · exportável' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
