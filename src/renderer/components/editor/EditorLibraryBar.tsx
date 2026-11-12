import { Droplets } from 'lucide-react'
import type { EditorAsset, EditorWatermark } from '@shared/editor/types'
import { EDITOR_LIBRARY_TOOLS, type EditorLibraryTool } from './editorLibraryTools'
import { assetPlaybackUrl } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'

type Props = {
  tool: EditorLibraryTool
  onToolChange: (tool: EditorLibraryTool) => void
  watermarks: EditorWatermark[]
  watermarkAssets: EditorAsset[]
  busy?: boolean
  onPickWatermark: () => void
  onOpenWatermarkConfig: () => void
}

export function EditorLibraryBar({
  tool,
  onToolChange,
  watermarks,
  watermarkAssets,
  busy,
  onPickWatermark,
  onOpenWatermarkConfig,
}: Props) {
  const firstAsset = watermarkAssets[0] ?? null
  const previewUrl = assetPlaybackUrl(firstAsset ?? undefined) || firstAsset?.coverUrl || null
  const count = watermarks.length
  const hasWatermark = count > 0

  return (
    <nav
      className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border-soft bg-topbar/80 px-3"
      aria-label="Ferramentas da biblioteca"
    >
      {EDITOR_LIBRARY_TOOLS.map(({ id, label, Icon, hint }) => {
        const active = tool === id
        return (
          <button
            key={id}
            type="button"
            title={hint}
            aria-pressed={active}
            onClick={() => onToolChange(id)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
              active
                ? 'bg-elevated text-text ring-1 ring-border-strong'
                : 'text-muted-2 hover:bg-hover hover:text-text',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        )
      })}

      <button
        type="button"
        disabled={busy}
        title={
          hasWatermark
            ? `Configurar marca d'água (${count})`
            : 'Adicionar marca d\'água'
        }
        aria-pressed={hasWatermark}
        onClick={() => {
          if (hasWatermark) onOpenWatermarkConfig()
          else onPickWatermark()
        }}
        className={cn(
          'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-50',
          hasWatermark
            ? 'bg-elevated text-text ring-1 ring-border-strong'
            : 'text-muted-2 hover:bg-hover hover:text-text',
        )}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-3.5 w-3.5 rounded-[2px] object-contain" />
        ) : (
          <Droplets className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        Marca d&apos;água
        {count > 1 ? (
          <span className="rounded-full bg-accent-subtle px-1.5 text-[9px] tabular-nums text-accent">
            {count}
          </span>
        ) : null}
      </button>
    </nav>
  )
}
