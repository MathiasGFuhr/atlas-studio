import { BookOpen, CheckSquare, FolderKanban, Music2, Tv } from 'lucide-react'
import type { HomeActivityItem, HomeActivityKind } from '@shared/homeActivity'
import { formatRelativeDate } from '../../lib/utils'

const ICONS: Record<HomeActivityKind, typeof FolderKanban> = {
  'project-created': FolderKanban,
  'project-updated': FolderKanban,
  'script-updated': BookOpen,
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
        className="flex w-full items-start gap-3 px-1 py-3.5 text-left transition-colors hover:bg-white/[0.015] disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
        </div>
        <span className="shrink-0 pt-0.5 text-[11px] text-muted-2">
          {formatRelativeDate(item.at)}
        </span>
      </button>
    </li>
  )
}
