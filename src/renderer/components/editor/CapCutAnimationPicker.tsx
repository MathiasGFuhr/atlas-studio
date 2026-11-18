import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Check, Search } from 'lucide-react'
import {
  EDITOR_ANIMATION_CATEGORY_LABEL,
  EDITOR_ANIMATION_CATEGORY_ORDER,
  editorAnimationsByKind,
  type EditorAnimationCategory,
  type EditorAnimationDef,
  type EditorAnimationKind,
} from '@shared/editor/animationsCatalog'
import { cn } from '../../lib/utils'

const KIND_TABS: Array<{ id: EditorAnimationKind; label: string }> = [
  { id: 'in', label: 'Entrada' },
  { id: 'out', label: 'Saída' },
  { id: 'combo', label: 'Combinação' },
]

type CategoryFilter = EditorAnimationCategory | 'all'

function VisualSceneThumb() {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #f97316 0%, #fb923c 42%, #7c2d12 72%, #1c1917 100%)',
      }}
    >
      {/* Sol */}
      <div
        className="absolute left-1/2 top-[34%] h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: 'radial-gradient(circle, #fef08a 0%, #fdba74 60%, transparent 100%)',
        }}
      />
      {/* Horizonte e reflexo */}
      <div className="absolute inset-x-0 top-[58%] h-px bg-amber-200/40" />
      <div
        className="absolute inset-x-0 bottom-0 top-[58%]"
        style={{
          background:
            'linear-gradient(180deg, rgba(251,146,60,0.45) 0%, rgba(124,45,18,0.85) 60%, rgba(28,25,23,0.95) 100%)',
        }}
      />
      {/* Silhueta de montanha / barco */}
      <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M0 50 L18 42 L34 49 L55 44 L80 50 L80 80 L0 80 Z" fill="rgba(28,25,23,0.55)" />
        <path d="M36 47 L40 31 L43 47 Z" fill="rgba(17,24,39,0.85)" />
        <path d="M30 48 L50 48 L46 52 L34 52 Z" fill="rgba(17,24,39,0.9)" />
      </svg>
    </div>
  )
}

function AnimationVisualCard({
  item,
  active,
  onPick,
}: {
  item: EditorAnimationDef
  active: boolean
  onPick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    if (!hovered) {
      el.style.opacity = '1'
      el.style.transform = 'none'
      el.style.filter = 'none'
      el.style.clipPath = 'none'
      return
    }
    let raf = 0
    const start = performance.now()
    const cycleMs = item.kind === 'combo' ? 1400 : 1150
    const tick = (now: number) => {
      const progress = ((now - start) % cycleMs) / cycleMs
      const state = item.css(progress)
      el.style.opacity = String(state.opacity)
      el.style.transform = state.transform === 'none' ? '' : state.transform
      el.style.filter = state.filter || 'none'
      el.style.clipPath = state.clipPath || 'none'
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hovered, item])

  return (
    <button
      type="button"
      title={active ? `${item.label} — ativa (clique para remover)` : `${item.label} — ${item.description}`}
      aria-pressed={active}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onPick}
      className="group flex flex-col items-center gap-1 text-center"
    >
      <div
        className={cn(
          'relative aspect-square w-full overflow-hidden rounded-lg border bg-black/50 transition-all',
          active
            ? 'border-accent ring-2 ring-accent/60'
            : 'border-border-soft group-hover:border-accent/60',
        )}
      >
        <div
          ref={previewRef}
          className="h-full w-full will-change-transform"
          style={{ transformOrigin: 'center center' }}
        >
          <VisualSceneThumb />
        </div>
        {active ? (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent shadow">
            <Check className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </div>
      <span className={cn('w-full truncate text-[10px] leading-tight', active ? 'font-semibold text-accent' : 'text-muted group-hover:text-text')}>
        {item.label}
      </span>
    </button>
  )
}

export function CapCutAnimationPicker({
  activeInId,
  activeOutId,
  activeComboId,
  inDuration = 0.6,
  outDuration = 0.6,
  onPick,
  onClearKind,
  onChangeDuration,
}: {
  activeInId?: string | null
  activeOutId?: string | null
  activeComboId?: string | null
  inDuration?: number
  outDuration?: number
  onPick: (kind: EditorAnimationKind, id: string) => void
  onClearKind: (kind: EditorAnimationKind) => void
  onChangeDuration?: (kind: 'in' | 'out', seconds: number) => void
}) {
  const [kind, setKind] = useState<EditorAnimationKind>('in')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    let list = editorAnimationsByKind(kind)
    if (category !== 'all') list = list.filter((item) => item.category === category)
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (item) => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    )
  }, [category, kind, query])

  const activeId = kind === 'in' ? activeInId : kind === 'out' ? activeOutId : activeComboId
  const currentDuration = kind === 'in' ? inDuration : outDuration

  return (
    <div className="space-y-2.5">
      {/* Tabs Entrada / Saída / Combinação */}
      <div className="grid grid-cols-3 rounded-lg bg-elevated p-0.5">
        {KIND_TABS.map((tab) => {
          const hasActive =
            (tab.id === 'in' && Boolean(activeInId)) ||
            (tab.id === 'out' && Boolean(activeOutId)) ||
            (tab.id === 'combo' && Boolean(activeComboId))
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setKind(tab.id)}
              className={cn(
                'relative rounded-md py-1.5 text-[11px] font-semibold transition-colors',
                kind === tab.id ? 'bg-surface text-text shadow-sm' : 'text-muted-2 hover:text-text',
              )}
            >
              {tab.label}
              {hasActive ? (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar animação..."
          className="h-8 w-full rounded-lg border border-border-soft bg-elevated pl-8 pr-2.5 text-[11px] text-text outline-none placeholder:text-muted-2 focus:border-accent"
        />
      </div>

      {/* Categorias estilo CapCut */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
            category === 'all' ? 'bg-elevated text-text ring-1 ring-border-strong' : 'text-muted-2 hover:text-text',
          )}
        >
          Todas
        </button>
        {EDITOR_ANIMATION_CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors',
              category === cat ? 'bg-elevated text-text ring-1 ring-border-strong' : 'text-muted-2 hover:text-text',
            )}
          >
            {EDITOR_ANIMATION_CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* Grid visual 3 colunas com preview ao passar o mouse */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          title="Remover animação"
          onClick={() => onClearKind(kind)}
          className="group flex flex-col items-center gap-1 text-center"
        >
          <div
            className={cn(
              'flex aspect-square w-full items-center justify-center rounded-lg border bg-elevated transition-colors',
              !activeId ? 'border-accent/60 text-text' : 'border-border-soft text-muted-2 group-hover:border-border-strong group-hover:text-text',
            )}
          >
            <Ban className="h-5 w-5" />
          </div>
          <span className={cn('w-full truncate text-[10px] leading-tight', !activeId ? 'font-semibold text-text' : 'text-muted-2')}>
            Nenhum
          </span>
        </button>

        {items.map((item) => (
          <AnimationVisualCard
            key={item.id}
            item={item}
            active={activeId === item.id}
            onPick={() => {
              if (activeId === item.id) onClearKind(kind)
              else onPick(kind, item.id)
            }}
          />
        ))}
      </div>

      {/* Duração (para Entrada / Saída) */}
      {kind !== 'combo' && onChangeDuration ? (
        <div className="flex items-center gap-2 border-t border-border-soft pt-2">
          <span className="shrink-0 text-[10px] text-muted-2">Duração</span>
          <input
            type="range"
            min={0.1}
            max={2.0}
            step={0.1}
            value={currentDuration}
            onChange={(event) => onChangeDuration(kind, Number(event.target.value))}
            className="h-1.5 flex-1 accent-[var(--color-accent)]"
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-text">{currentDuration.toFixed(1)}s</span>
        </div>
      ) : null}
    </div>
  )
}
