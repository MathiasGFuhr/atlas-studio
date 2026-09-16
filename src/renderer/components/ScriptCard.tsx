import { MoreHorizontal, Globe } from 'lucide-react'
import type { ScriptRecord } from '@shared/types'
import { formatRelativeDate } from '../lib/utils'
import { Card } from './Card'

const thumbs = [
  'linear-gradient(135deg,#1d3a2f,#0d1418)',
  'linear-gradient(135deg,#3a2a1d,#120e0c)',
  'linear-gradient(135deg,#1d2a3a,#0c1016)',
]

export function ScriptCard({
  script,
  index = 0,
  onOpen,
}: {
  script: ScriptRecord
  index?: number
  onOpen?: () => void
}) {
  return (
    <Card
      padding="sm"
      className="cursor-pointer transition-colors hover:border-[#334049]"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen?.()
      }}
    >
      <div className="flex gap-3">
        <div
          className="h-14 w-14 shrink-0 rounded-xl border border-border-soft"
          style={{ background: thumbs[index % thumbs.length] }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-text">{script.title}</h4>
            <button
              type="button"
              className="rounded-md p-1 text-muted hover:bg-white/5 hover:text-text"
              onClick={(e) => e.stopPropagation()}
              aria-label="Mais opções"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {script.language}
            </span>
            <span>{formatRelativeDate(script.createdAt)}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
