import { useMemo, useState } from 'react'
import { Copy, MessageSquareText } from 'lucide-react'
import type { CustomPrompt, CustomPromptTab } from '@shared/quickPrompts/types'
import { Card } from '../Card'
import { cn } from '../../lib/utils'

export function HomePromptsCard({
  prompts,
  tabs,
  favorites,
  onOpenLibrary,
  onCopy,
}: {
  prompts: CustomPrompt[]
  tabs: CustomPromptTab[]
  favorites: string[]
  onOpenLibrary: () => void
  onCopy: (text: string, name: string) => void
}) {
  const [tab, setTab] = useState<'fav' | 'all' | string>('fav')

  const filters = useMemo(() => {
    const items: Array<{ id: string; label: string }> = [
      { id: 'fav', label: 'Mais usados' },
      { id: 'all', label: 'Todos' },
      ...tabs.slice(0, 3).map((item) => ({ id: item.id, label: item.name })),
    ]
    return items
  }, [tabs])

  const visible = useMemo(() => {
    let list = prompts
    if (tab === 'fav') {
      const favSet = new Set(favorites)
      list = prompts.filter((item) => favSet.has(item.id))
      if (list.length === 0) list = prompts
    } else if (tab !== 'all') {
      list = prompts.filter((item) => item.tabId === tab)
    }
    return list.slice(0, 5)
  }, [favorites, prompts, tab])

  return (
    <Card padding="lg" className="flex h-full min-h-[300px] flex-col">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Biblioteca
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Prompts</h2>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
        >
          Abrir
        </button>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto pb-0.5">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              tab === item.id
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:bg-hover hover:text-text',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <MessageSquareText className="mb-2 h-5 w-5 text-muted-2" />
          <p className="text-sm text-muted-2">Nenhum prompt ainda.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {visible.map((prompt) => (
            <li key={prompt.id}>
              <div className="group flex items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-hover/60">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-soft bg-elevated text-accent">
                  <MessageSquareText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{prompt.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">{prompt.text}</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted opacity-0 transition-all hover:bg-hover hover:text-text group-hover:opacity-100"
                  aria-label={`Copiar ${prompt.name}`}
                  onClick={() => onCopy(prompt.text, prompt.name)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
