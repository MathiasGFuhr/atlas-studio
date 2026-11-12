import { useMemo, useState } from 'react'
import {
  EDITOR_TEXT_CATEGORY_LABEL,
  EDITOR_TEXT_CATEGORY_ORDER,
  EDITOR_TEXT_TEMPLATES,
  editorTextTemplatesByCategory,
  type EditorTextCategory,
  type EditorTextTemplateDef,
} from '@shared/editor/textTemplatesCatalog'
import { cn } from '../../lib/utils'

function TemplateCard({
  template,
  onPick,
}: {
  template: EditorTextTemplateDef
  onPick: (id: string) => void
}) {
  return (
    <button
      type="button"
      title={`${template.label} — ${template.description}`}
      onClick={() => onPick(template.id)}
      className="group overflow-hidden rounded-md border border-border-soft text-left transition-colors hover:border-border-strong"
    >
      <div
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden px-2"
        style={{ background: template.previewBg }}
      >
        <div
          className="max-w-full text-center"
          style={{
            ...cssFromTemplate(template.titleStyle),
            fontSize: '13px',
            lineHeight: 1.1,
          }}
        >
          {template.defaultTitle || template.label}
        </div>
        {template.defaultSubtitle ? (
          <div
            className="absolute bottom-1.5 left-1 right-1 truncate text-center text-[9px] text-white/70"
          >
            {template.defaultSubtitle}
          </div>
        ) : null}
      </div>
      <div className="px-1.5 py-1">
        <p className="truncate text-[10px] font-semibold text-text">{template.label}</p>
      </div>
    </button>
  )
}

function cssFromTemplate(style: EditorTextTemplateDef['titleStyle']): React.CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight as React.CSSProperties['fontWeight'],
    color: style.color === 'transparent' ? '#fff' : style.color,
    letterSpacing: style.letterSpacing,
    textTransform: style.textTransform,
    textShadow: style.textShadow,
  }
}

type Props = {
  onPickTemplate: (templateId: string) => void
}

type CategoryFilter = EditorTextCategory | 'all'

export function TextLibraryPanel({ onPickTemplate }: Props) {
  const [category, setCategory] = useState<CategoryFilter>('ma-kinetic')
  const [query, setQuery] = useState('')
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<EditorTextCategory, number>> = {}
    for (const item of EDITOR_TEXT_TEMPLATES) {
      counts[item.category] = (counts[item.category] ?? 0) + 1
    }
    return counts
  }, [])
  const items = useMemo(() => {
    const base = category === 'all' ? EDITOR_TEXT_TEMPLATES : editorTextTemplatesByCategory(category)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.defaultTitle.toLowerCase().includes(q) ||
        item.defaultSubtitle.toLowerCase().includes(q),
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
            category === 'all'
              ? 'bg-accent-subtle text-accent'
              : 'text-muted-2 hover:bg-hover hover:text-text',
          )}
        >
          <span>Todos</span>
          <span className="tabular-nums text-[9px] opacity-70">{EDITOR_TEXT_TEMPLATES.length}</span>
        </button>
        {EDITOR_TEXT_CATEGORY_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            className={cn(
              'flex items-center justify-between gap-1 px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors',
              category === id
                ? 'bg-accent-subtle text-accent'
                : 'text-muted-2 hover:bg-hover hover:text-text',
            )}
          >
            <span className="truncate">{EDITOR_TEXT_CATEGORY_LABEL[id]}</span>
            <span className="tabular-nums text-[9px] opacity-70">{categoryCounts[id] ?? 0}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-2 border-b border-border-soft px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold text-text">
              {category === 'all' ? 'Todos' : EDITOR_TEXT_CATEGORY_LABEL[category]}
            </p>
            <p className="text-[10px] leading-relaxed text-muted-2">
              {items.length} modelos · {EDITOR_TEXT_TEMPLATES.length} no total · clique para a timeline
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar modelo…"
            className="w-full rounded-lg border border-border-soft bg-elevated px-2.5 py-1.5 text-[11px] text-text outline-none placeholder:text-muted-2 focus:border-accent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {items.length === 0 ? (
            <p className="px-2 py-8 text-center text-[11px] text-muted-2">Nenhum modelo encontrado.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((template) => (
                <TemplateCard key={template.id} template={template} onPick={onPickTemplate} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
