import { useMemo, useState, type CSSProperties } from 'react'
import {
  EDITOR_EFFECTS,
  EDITOR_EFFECT_CATEGORY_LABEL,
  EDITOR_EFFECT_CATEGORY_ORDER,
  type EditorEffectCategory,
  type EditorEffectDef,
  type EditorEffectId,
} from '@shared/editor/effectsCatalog'
import { EDITOR_EFFECT_DRAG_TYPE } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'

const PREVIEW_BG =
  'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 45%, #ec4899 100%), radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 55%)'

function EffectPreviewCard({
  effect,
  active,
  onPick,
}: {
  effect: EditorEffectDef
  active?: boolean
  onPick?: (id: EditorEffectId) => void
}) {
  return (
    <button
      type="button"
      title={
        active
          ? `${effect.label} — na timeline (clique para remover)`
          : `${effect.label} — ${effect.description}`
      }
      aria-pressed={active}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(EDITOR_EFFECT_DRAG_TYPE, effect.id)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onPick?.(effect.id)}
      className={cn(
        'group overflow-hidden rounded-md border text-left transition-colors',
        active
          ? 'border-accent/70 ring-1 ring-accent/40'
          : 'border-border-soft hover:border-border-strong',
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-elevated">
        <div
          className="absolute inset-0 opacity-95 transition-transform duration-500 group-hover:scale-105"
          style={{
            backgroundImage: PREVIEW_BG,
            backgroundSize: 'cover',
            filter: effect.cssFilter || 'none',
          }}
        />
        {effect.overlay ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: effect.overlay.background,
              backgroundSize: effect.overlay.backgroundSize,
              opacity: effect.overlay.opacity ?? 0.55,
              mixBlendMode: (effect.overlay.mixBlendMode as CSSProperties['mixBlendMode']) || 'screen',
              animationName: effect.overlay.animation,
              animationDuration: effect.overlay.animationDuration || '8s',
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
            }}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {active ? (
          <span className="absolute left-1 top-1 rounded bg-accent px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-on-accent">
            Ativo
          </span>
        ) : null}
        {effect.source === 'pixi' || effect.source === 'react-bits' ? (
          <span className="absolute right-1 top-1 rounded bg-black/65 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/90">
            {effect.source === 'pixi' ? 'Pixi' : 'Bits'}
          </span>
        ) : null}
        <span className="absolute inset-x-1 bottom-1 truncate text-[10px] font-semibold text-white drop-shadow">
          {effect.label}
        </span>
      </div>
    </button>
  )
}

type Props = {
  activeEffectIds?: string[]
  onPickEffect?: (id: EditorEffectId, options?: { applyToAll?: boolean }) => void
}

export function EffectsLibraryPanel({ activeEffectIds = [], onPickEffect }: Props) {
  const [category, setCategory] = useState<EditorEffectCategory>('pixi')
  const [applyToAll, setApplyToAll] = useState(true)
  const active = useMemo(() => new Set(activeEffectIds), [activeEffectIds])
  const items = useMemo(
    () => EDITOR_EFFECTS.filter((effect) => effect.category === category),
    [category],
  )

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-[108px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border-soft py-2">
        {EDITOR_EFFECT_CATEGORY_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            className={cn(
              'px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors',
              category === id
                ? 'bg-accent-subtle text-accent'
                : 'text-muted-2 hover:bg-hover hover:text-text',
            )}
          >
            {EDITOR_EFFECT_CATEGORY_LABEL[id]}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b border-border-soft px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold text-text">{EDITOR_EFFECT_CATEGORY_LABEL[category]}</p>
            <p className="text-[10px] leading-relaxed text-muted-2">
              {items.length} efeitos · clique ou arraste para a timeline
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-soft bg-elevated px-2 py-1.5">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(event) => setApplyToAll(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-text">Aplicar a tudo</span>
              <span className="block text-[10px] leading-snug text-muted-2">
                Do início ao fim do vídeo
              </span>
            </span>
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((effect) => (
              <EffectPreviewCard
                key={effect.id}
                effect={effect}
                active={active.has(effect.id)}
                onPick={(id) => onPickEffect?.(id, { applyToAll })}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
