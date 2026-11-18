import { useMemo, useState } from 'react'
import { Ban, Trash2, X } from 'lucide-react'
import {
  EDITOR_TRANSITIONS,
  EDITOR_TRANSITION_CATEGORY_LABEL,
  EDITOR_TRANSITION_CATEGORY_ORDER,
  editorTransitionById,
  editorTransitionsByCategory,
  type EditorTransitionCategory,
  type EditorTransitionId,
} from '@shared/editor/transitionsCatalog'
import { formatTimecode } from '@shared/editor/types'
import { cn } from '../../lib/utils'

type CategoryFilter = EditorTransitionCategory | 'all'

export type AppliedTransitionItem = {
  clipId: string
  clipLabel: string
  transitionId: string
  transitionLabel: string
  start: number
  end: number
  duration: number
  locked: boolean
}

type Props = {
  activeTransitionId?: string | null
  appliedTransitions?: AppliedTransitionItem[]
  fps?: number
  onPickTransition?: (id: EditorTransitionId) => void
  onClearTransition?: () => void
  onRemoveClipTransition?: (clipId: string) => void
  onClearAllTransitions?: () => void
  onFocusClip?: (clipId: string, time: number) => void
}

export function TransitionsLibraryPanel({
  activeTransitionId,
  appliedTransitions = [],
  fps = 30,
  onPickTransition,
  onClearTransition,
  onRemoveClipTransition,
  onClearAllTransitions,
  onFocusClip,
}: Props) {
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

  const transitionCount = appliedTransitions.length

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
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-relaxed text-muted-2">
              {items.length} transições
            </p>
            <div className="flex items-center gap-1">
              {activeTransitionId && onClearTransition ? (
                <button
                  type="button"
                  title="Remover transição do clipe selecionado"
                  onClick={onClearTransition}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-danger hover:bg-danger/10"
                >
                  Remover
                </button>
              ) : null}
              {transitionCount > 0 && onClearAllTransitions ? (
                <button
                  type="button"
                  title="Remover todas as transições da timeline"
                  onClick={onClearAllTransitions}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-danger/25 bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger hover:bg-danger/15"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  Remover todas ({transitionCount})
                </button>
              ) : null}
            </div>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar transição…"
            className="w-full rounded-lg border border-border-soft bg-elevated px-2.5 py-1.5 text-[11px] text-text outline-none placeholder:text-muted-2 focus:border-accent"
          />
        </div>

        {transitionCount > 0 ? (
          <div className="max-h-36 shrink-0 space-y-1 overflow-y-auto border-b border-border-soft bg-elevated/40 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-2">
              Na timeline ({transitionCount})
            </p>
            {appliedTransitions.map((item) => (
              <div
                key={item.clipId}
                className="flex items-center gap-1.5 rounded-md border border-border-soft bg-card px-2 py-1"
              >
                <button
                  type="button"
                  title="Ir para esta transição na timeline"
                  onClick={() => onFocusClip?.(item.clipId, Math.max(item.start, item.end - item.duration))}
                  className="min-w-0 flex-1 text-left hover:text-accent"
                >
                  <p className="truncate text-[10px] font-semibold text-text">
                    {editorTransitionById(item.transitionId)?.label ?? item.transitionLabel} · {item.duration.toFixed(1)}s
                  </p>
                  <p className="truncate text-[9px] tabular-nums text-muted-2">
                    {item.clipLabel} · {formatTimecode(item.end, fps)}
                    {item.locked ? ' · faixa travada' : ''}
                  </p>
                </button>
                {onRemoveClipTransition ? (
                  <button
                    type="button"
                    disabled={item.locked}
                    title={item.locked ? 'Destrave a faixa para remover' : 'Remover esta transição'}
                    onClick={() => onRemoveClipTransition(item.clipId)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-2 hover:bg-danger/15 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          {items.length === 0 ? (
            <p className="px-2 py-8 text-center text-[11px] text-muted-2">Nenhuma transição encontrada.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {onClearTransition ? (
                <button
                  type="button"
                  title="Remover transição do clipe selecionado"
                  onClick={onClearTransition}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 rounded-lg border px-2.5 py-2 text-center transition-colors',
                    !activeTransitionId
                      ? 'border-accent/60 bg-elevated text-text'
                      : 'border-border-soft bg-card text-muted-2 hover:border-danger/40 hover:bg-danger/10 hover:text-danger',
                  )}
                >
                  <Ban className="h-4 w-4" />
                  <span className="text-[11px] font-semibold">Nenhuma</span>
                  <span className="text-[9px] leading-tight opacity-75">Remover transição</span>
                </button>
              ) : null}
              {items.map((item) => {
                const active = activeTransitionId === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={active ? `${item.label} — ativa (clique para remover)` : item.description}
                    aria-pressed={active}
                    onClick={() => onPickTransition?.(item.id)}
                    className={cn(
                      'relative rounded-lg border px-2.5 py-2 text-left transition-colors',
                      active
                        ? 'border-accent/70 bg-accent-subtle/30 ring-1 ring-accent/40'
                        : 'border-border-soft bg-card hover:border-border-strong hover:bg-hover',
                    )}
                  >
                    {active ? (
                      <span className="mb-1 inline-block rounded bg-accent px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-on-accent">
                        Ativo
                      </span>
                    ) : null}
                    <p className="truncate text-[11px] font-semibold text-text">{item.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-2">{item.description}</p>
                    <p className="mt-1 text-[9px] tabular-nums text-muted-2">
                      {item.defaultDuration.toFixed(1)}s
                      {item.source === 'remotion' ? ' · Remotion' : ''}
                      {item.ffmpegXfade ? ' · exportável' : ''}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
