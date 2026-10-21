import { CheckSquare, FolderKanban, Music2, Tv } from 'lucide-react'
import type { HomeActivityItem, HomeActivityKind } from '@shared/homeActivity'
import { formatRelativeDate } from '../../lib/utils'

const ICONS: Record<HomeActivityKind, typeof FolderKanban> = {
  'project-created': FolderKanban,
  'project-updated': FolderKanban,
  'task-completed': CheckSquare,
  'channel-created': Tv,
  'music-updated': Music2,
}

export function HomeActivityRow({
  item,
  onOpen,
}: {
  item: HomeActivityItem
  onOpen: (href: string) => void
}) {
  const Icon = ICONS[item.kind]
  const clickable = Boolean(item.href)

  return (
    <li>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => {
          if (item.href) onOpen(item.href)
        }}
        className="group flex w-full items-start gap-3 rounded-xl px-2 py-3.5 text-left transition-colors hover:bg-hover/60 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-elevated text-muted transition-colors group-hover:text-text">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
        </div>
        <span className="shrink-0 pt-1 text-[11px] tabular-nums text-muted-2">
          {formatRelativeDate(item.at)}
        </span>
      </button>
    </li>
  )
}
