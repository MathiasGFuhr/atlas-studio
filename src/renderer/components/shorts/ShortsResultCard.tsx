import { FolderOpen } from 'lucide-react'
import type { ShortsAspectMode, ShortsClip, ShortsClipPatch, ShortsCopyFields } from '@shared/shorts'
import type { ShortsFramingPlan } from '@shared/shortsFraming'
import type { ShortsLogoSettings } from '@shared/shortsLogo'
import { clipDuration, formatShortsTimecode, shortsClipPreviewKey } from '@shared/shorts'
import { formatClipLength } from '@shared/shortsDuration'
import { shortsExportProgressLabel } from '@shared/shortsGeneration'
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
  framingPlan,
  picking,
  placingLogo,
  logo,
  logoUrl,
  playing,
  busy,
  regenerating,
  exporting,
  exportPercent,
  onPlayingChange,
  onAssignPoint,
  onPlaceLogo,
  onAdjust,
  onExport,
  onOpenFolder,
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
  framingPlan?: ShortsFramingPlan | null
  picking?: boolean
  placingLogo?: boolean
  logo?: ShortsLogoSettings | null
  logoUrl?: string | null
  playing: boolean
  busy: boolean
  regenerating: boolean
  exporting?: boolean
  exportPercent?: number | null
  onPlayingChange: (playing: boolean) => void
  onAssignPoint?: (x: number, y: number, time: number) => void
  onPlaceLogo?: (x: number, y: number) => void
  onAdjust: () => void
  onExport: () => void
  onOpenFolder?: () => void
  onPersist: (patch: ShortsClipPatch) => void
  onCopy: (part: 'title' | 'description' | 'all') => void
  onRegenerate: (fields: ShortsCopyFields) => void
  onDelete: () => void
}) {
  const vertical = aspectMode !== 'original'
  const canOpenFolder = Boolean(clip.exportedPath && onOpenFolder)

  return (
    <Card className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start">
      <div
        className={cn(
          'mx-auto w-full shrink-0 xl:mx-0',
          vertical ? 'max-w-[240px] xl:w-[200px]' : 'max-w-[420px] xl:w-[300px]',
        )}
      >
        <ShortsClipPreview
          clipId={clip.id}
          src={mediaUrl}
          start={clip.start}
          end={clip.end}
          aspectMode={aspectMode}
          sourceWidth={sourceWidth}
          sourceHeight={sourceHeight}
          framingPlan={framingPlan}
          picking={picking}
          placingLogo={placingLogo}
          logo={logo}
          logoUrl={logoUrl}
          active={playing}
          resetToken={shortsClipPreviewKey(clip)}
          posterUrl={clip.posterUrl}
          onPlayingChange={onPlayingChange}
          onAssignPoint={onAssignPoint}
          onPlaceLogo={onPlaceLogo}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-2">Short #{clip.index}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-text">
              {formatShortsTimecode(clip.start)} → {formatShortsTimecode(clip.end)}
              <span className="ml-2 font-normal text-muted">· {formatClipLength(clipDuration(clip))}</span>
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-accent-dark px-3 py-2 text-center">
            <p className="text-[10px] uppercase text-muted-2">Score</p>
            <p className="text-lg font-semibold text-accent">{clip.score}/100</p>
          </div>
        </div>
        <ShortsClipCopyEditor
          clip={clip}
          disabled={busy}
          regenerating={regenerating}
          onPersist={onPersist}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
        />
        {exporting ? (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <p className="text-xs text-muted">{shortsExportProgressLabel(exportPercent)}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  'h-full rounded-full bg-accent transition-[width] duration-200',
                  exportPercent == null && 'w-full animate-pulse opacity-50',
                )}
                style={exportPercent == null ? undefined : { width: `${Math.max(0, Math.min(100, exportPercent))}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => onPlayingChange(!playing)}>
            {playing ? 'Pausar' : 'Assistir'}
          </Button>
          <Button variant="secondary" className="h-9 px-3 text-xs" onClick={onAdjust}>
            Ajustar
          </Button>
          <Button className="h-9 px-3 text-xs" disabled={busy} onClick={onExport}>
            {clip.exportedPath ? 'Gerar novamente' : 'Gerar Short'}
          </Button>
          {canOpenFolder ? (
            <Button
              variant="secondary"
              className="h-9 px-3 text-xs"
              disabled={busy}
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              onClick={onOpenFolder}
            >
              Abrir pasta
            </Button>
          ) : null}
          <Button variant="ghost" className="h-9 px-3 text-xs" disabled={busy} onClick={onDelete}>
            Excluir
          </Button>
        </div>
      </div>
    </Card>
  )
}
