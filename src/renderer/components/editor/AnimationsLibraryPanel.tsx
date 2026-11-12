import { useMemo, useState } from 'react'
import {
  EDITOR_ANIMATION_SOURCE_LABEL,
  EDITOR_ANIMATION_SOURCE_ORDER,
  EDITOR_ANIMATIONS,
  editorAnimationsByKind,
  type EditorAnimationDef,
  type EditorAnimationKind,
  type EditorAnimationSource,
} from '@shared/editor/animationsCatalog'
import { EDITOR_ANIMATION_SOURCE_HINT } from '@shared/editor/animationSources'
import { cn } from '../../lib/utils'

const KIND_TABS: Array<{ id: EditorAnimationKind; label: string }> = [
  { id: 'in', label: 'Entrada' },
  { id: 'out', label: 'Saída' },
  { id: 'combo', label: 'Combinação' },
]

type AnimTarget = 'clip' | 'watermark'
type SourceFilter = EditorAnimationSource | 'all'

function AnimationCard({
  item,
  active,
  onPick,
}: {
  item: EditorAnimationDef
  active: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      title={
        active
          ? `${item.label} — ativo (clique para remover)`
          : `${item.label} — ${item.description}`
      }
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        'group overflow-hidden rounded-md border text-left transition-colors',
        active
          ? 'border-accent/70 ring-1 ring-accent/40'
          : 'border-border-soft hover:border-border-strong',
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-elevated">
        <div
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-gradient-to-br from-sky-400 via-violet-500 to-fuchsia-500 shadow-md"
          style={{ animation: item.previewAnimation }}
        />
        {active ? (
          <span className="absolute left-1 top-1 rounded bg-accent px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-on-accent">
            Ativo
          </span>
        ) : null}
        <span className="absolute right-1 top-1 max-w-[70%] truncate rounded bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/90">
          {EDITOR_ANIMATION_SOURCE_LABEL[item.source]}
        </span>
      </div>
      <div className="px-1.5 py-1">
        <p className="truncate text-[10px] font-semibold text-text">{item.label}</p>
      </div>
    </button>
  )
}

type Props = {
  target: AnimTarget
  onTargetChange: (target: AnimTarget) => void
  activeInId?: string | null
  activeOutId?: string | null
  activeComboId?: string | null
  hasWatermark: boolean
  onPick: (kind: EditorAnimationKind, id: string) => void
  onClearKind: (kind: EditorAnimationKind) => void
}

export function AnimationsLibraryPanel({
  target,
  onTargetChange,
  activeInId,
  activeOutId,
  activeComboId,
  hasWatermark,
  onPick,
  onClearKind,
}: Props) {
  const [kind, setKind] = useState<EditorAnimationKind>('in')
  const [source, setSource] = useState<SourceFilter>('all')
  const [query, setQuery] = useState('')

  const sourceCounts = useMemo(() => {
    const counts: Partial<Record<EditorAnimationSource, number>> = {}
    for (const item of EDITOR_ANIMATIONS) {
      if (item.kind !== kind) continue
      counts[item.source] = (counts[item.source] ?? 0) + 1
    }
    return counts
  }, [kind])

  const items = useMemo(() => {
    let list = editorAnimationsByKind(kind)
    if (source !== 'all') list = list.filter((item) => item.source === source)
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        EDITOR_ANIMATION_SOURCE_LABEL[item.source].toLowerCase().includes(q),
    )
  }, [kind, query, source])

  const activeId = kind === 'in' ? activeInId : kind === 'out' ? activeOutId : activeComboId
  const kindTotal = editorAnimationsByKind(kind).length

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-[122px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border-soft py-2">
        <button
          type="button"
          onClick={() => setSource('all')}
          className={cn(
            'flex items-center justify-between gap-1 px-2 py-1.5 text-left text-[10px] font-medium transition-colors',
            source === 'all' ? 'bg-accent-subtle text-accent' : 'text-muted-2 hover:bg-hover hover:text-text',
          )}
        >
          <span>Todas</span>
          <span className="tabular-nums text-[9px] opacity-70">{kindTotal}</span>
        </button>
        {EDITOR_ANIMATION_SOURCE_ORDER.map((id) => {
          const count = sourceCounts[id] ?? 0
          if (count === 0 && id === 'atlas') {
            /* still show */
          }
          return (
            <button
              key={id}
              type="button"
              title={EDITOR_ANIMATION_SOURCE_HINT[id]}
              onClick={() => setSource(id)}
              className={cn(
                'flex items-center justify-between gap-1 px-2 py-1.5 text-left text-[10px] font-medium transition-colors',
                source === id ? 'bg-accent-subtle text-accent' : 'text-muted-2 hover:bg-hover hover:text-text',
              )}
            >
              <span className="truncate">{EDITOR_ANIMATION_SOURCE_LABEL[id]}</span>
              <span className="tabular-nums text-[9px] opacity-70">{count}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b border-border-soft px-3 py-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border-soft bg-elevated p-0.5">
            {(
              [
                ['clip', 'Clipe'],
                ['watermark', "Marca d'água"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={id === 'watermark' && !hasWatermark}
                title={
                  id === 'watermark' && !hasWatermark
                    ? "Defina uma marca d'água antes"
                    : undefined
                }
                onClick={() => onTargetChange(id)}
                className={cn(
                  'rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors disabled:opacity-40',
                  target === id ? 'bg-accent-subtle text-accent' : 'text-muted-2 hover:text-text',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setKind(tab.id)}
                className={cn(
                  'flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-semibold transition-colors',
                  kind === tab.id
                    ? 'bg-accent-subtle text-accent'
                    : 'text-muted-2 hover:bg-hover hover:text-text',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar animação…"
            className="w-full rounded-lg border border-border-soft bg-elevated px-2.5 py-1.5 text-[11px] text-text outline-none placeholder:text-muted-2 focus:border-accent"
          />
          <p className="text-[10px] leading-relaxed text-muted-2">
            {items.length} animações · {EDITOR_ANIMATIONS.length} no total · clique de novo no ativo para remover
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              title="Sem animação neste slot"
              aria-pressed={!activeId}
              onClick={() => onClearKind(kind)}
              className={cn(
                'overflow-hidden rounded-md border text-left transition-colors',
                !activeId
                  ? 'border-accent/70 ring-1 ring-accent/40'
                  : 'border-border-soft hover:border-border-strong',
              )}
            >
              <div className="relative flex aspect-square items-center justify-center bg-elevated">
                <span className="text-[10px] font-semibold text-muted-2">Nenhum</span>
              </div>
              <div className="px-1.5 py-1">
                <p className="truncate text-[10px] font-semibold text-text">Nenhum</p>
              </div>
            </button>
            {items.map((item) => (
              <AnimationCard
                key={item.id}
                item={item}
                active={activeId === item.id}
                onPick={() => onPick(kind, item.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes atlas-anim-fade-in { 0% { opacity: 0 } 40% { opacity: 1 } 100% { opacity: 1 } }
        @keyframes atlas-anim-fade-out { 0% { opacity: 1 } 60% { opacity: 0 } 100% { opacity: 0 } }
        @keyframes atlas-anim-slide-left { 0% { transform: translate(-50%, -50%) translateX(40%); opacity: 0 } 45% { transform: translate(-50%, -50%); opacity: 1 } 100% { transform: translate(-50%, -50%); opacity: 1 } }
        @keyframes atlas-anim-slide-right { 0% { transform: translate(-50%, -50%) translateX(-40%); opacity: 0 } 45% { transform: translate(-50%, -50%); opacity: 1 } 100% { transform: translate(-50%, -50%); opacity: 1 } }
        @keyframes atlas-anim-slide-up { 0% { transform: translate(-50%, -50%) translateY(35%); opacity: 0 } 45% { transform: translate(-50%, -50%); opacity: 1 } 100% { transform: translate(-50%, -50%); opacity: 1 } }
        @keyframes atlas-anim-slide-down { 0% { transform: translate(-50%, -50%) translateY(-35%); opacity: 0 } 45% { transform: translate(-50%, -50%); opacity: 1 } 100% { transform: translate(-50%, -50%); opacity: 1 } }
        @keyframes atlas-anim-zoom-in { 0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0 } 45% { transform: translate(-50%, -50%) scale(1); opacity: 1 } 100% { transform: translate(-50%, -50%) scale(1); opacity: 1 } }
        @keyframes atlas-anim-pop-in { 0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0 } 50% { transform: translate(-50%, -50%) scale(1.12); opacity: 1 } 100% { transform: translate(-50%, -50%) scale(1); opacity: 1 } }
        @keyframes atlas-anim-spin-in { 0% { transform: translate(-50%, -50%) rotate(-18deg) scale(0.85); opacity: 0 } 50% { transform: translate(-50%, -50%) rotate(0) scale(1); opacity: 1 } 100% { transform: translate(-50%, -50%); opacity: 1 } }
        @keyframes atlas-anim-slide-out-left { 0% { transform: translate(-50%, -50%); opacity: 1 } 55% { transform: translate(-50%, -50%) translateX(-40%); opacity: 0 } 100% { opacity: 0 } }
        @keyframes atlas-anim-slide-out-right { 0% { transform: translate(-50%, -50%); opacity: 1 } 55% { transform: translate(-50%, -50%) translateX(40%); opacity: 0 } 100% { opacity: 0 } }
        @keyframes atlas-anim-slide-out-up { 0% { transform: translate(-50%, -50%); opacity: 1 } 55% { transform: translate(-50%, -50%) translateY(-35%); opacity: 0 } 100% { opacity: 0 } }
        @keyframes atlas-anim-slide-out-down { 0% { transform: translate(-50%, -50%); opacity: 1 } 55% { transform: translate(-50%, -50%) translateY(35%); opacity: 0 } 100% { opacity: 0 } }
        @keyframes atlas-anim-zoom-out { 0% { transform: translate(-50%, -50%) scale(1); opacity: 1 } 55% { transform: translate(-50%, -50%) scale(1.25); opacity: 0 } 100% { opacity: 0 } }
        @keyframes atlas-anim-pop-out { 0% { transform: translate(-50%, -50%) scale(1); opacity: 1 } 55% { transform: translate(-50%, -50%) scale(0.55); opacity: 0 } 100% { opacity: 0 } }
        @keyframes atlas-anim-pulse { 0%, 100% { transform: translate(-50%, -50%) scale(1) } 50% { transform: translate(-50%, -50%) scale(1.08) } }
        @keyframes atlas-anim-float { 0%, 100% { transform: translate(-50%, -50%) translateY(0) } 50% { transform: translate(-50%, -50%) translateY(-10%) } }
        @keyframes atlas-anim-sway { 0%, 100% { transform: translate(-50%, -50%) rotate(-3deg) } 50% { transform: translate(-50%, -50%) rotate(3deg) } }
        @keyframes atlas-anim-glow { 0%, 100% { filter: brightness(1); opacity: 0.85 } 50% { filter: brightness(1.15); opacity: 1 } }
      `}</style>
    </div>
  )
}
