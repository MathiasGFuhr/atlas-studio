import type { ShortsAspectMode, ShortsClip, ShortsClipPatch, ShortsCopyFields } from '@shared/shorts'
import { clipDuration, formatShortsTimecode, shortsClipPreviewKey } from '@shared/shorts'
import { formatClipLength } from '@shared/shortsDuration'
import { Button } from '../Button'
import { Card } from '../Card'
import { ShortsClipCopyEditor } from './ShortsClipCopyEditor'
import { ShortsClipPreview } from './ShortsClipPreview'
import { cn } from '../../lib/utils'

export function ShortsResultCard({
  clip,
  mediaUrl,
  aspectMode,
  sourceWidth,
  sourceHeight,
  playing,
  busy,
  regenerating,
  onPlayingChange,
  onAdjust,
  onExport,
  onPersist,
  onCopy,
  onRegenerate,
  onDelete,
}: {
  clip: ShortsClip
  mediaUrl: string | null
  aspectMode: ShortsAspectMode
  sourceWidth: number
  sourceHeight: number
  playing: boolean
  busy: boolean
  regenerating: boolean
  onPlayingChange: (playing: boolean) => void
  onAdjust: () => void
  onExport: () => void
  onPersist: (patch: ShortsClipPatch) => void
  onCopy: (part: 'title' | 'description' | 'all') => void
  onRegenerate: (fields: ShortsCopyFields) => void
  onDelete: () => void
}) {
  const vertical = aspectMode !== 'original'

  return (
    <Card className="flex flex-col gap-4 lg:flex-row">
      <div className={cn('mx-auto shrink-0', vertical ? 'w-[148px]' : 'w-full max-w-[260px] lg:w-[240px]')}>
        <ShortsClipPreview
          clipId={clip.id}
          src={mediaUrl}
          start={clip.start}
          end={clip.end}
          aspectMode={aspectMode}
          sourceWidth={sourceWidth}
          sourceHeight={sourceHeight}
          active={playing}
          resetToken={shortsClipPreviewKey(clip)}
          posterUrl={clip.posterUrl}
          onPlayingChange={onPlayingChange}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-2">Short #{clip.index}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-text">
              {formatShortsTimecode(clip.start)} → {formatShortsTimecode(clip.end)}
              <span className="ml-2 font-normal text-muted">· {formatClipLength(clipDuration(clip))}</span>
            </p>
          </div>
          <div className="rounded-xl bg-accent-dark px-3 py-2 text-center">
            <p className="text-[10px] uppercase text-muted-2">Score</p>
            <p className="text-lg font-semibold text-accent">{clip.score}/100</p>
          </div>
        </div>
        <ShortsClipCopyEditor
          clip={clip}
          compact
          disabled={busy}
          regenerating={regenerating}
          onPersist={onPersist}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => onPlayingChange(!playing)}>
            {playing ? 'Pausar' : 'Assistir'}
          </Button>
          <Button variant="secondary" className="h-9 px-3 text-xs" onClick={onAdjust}>
            Ajustar
          </Button>
          <Button className="h-9 px-3 text-xs" disabled={busy} onClick={onExport}>
            Gerar Short
          </Button>
          <Button variant="ghost" className="h-9 px-3 text-xs" disabled={busy} onClick={onDelete}>
            Excluir
          </Button>
        </div>
      </div>
    </Card>
  )
}
