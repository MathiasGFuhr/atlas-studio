import { Pause, Play } from 'lucide-react'
import type { ShortsAspectMode, ShortsClip, ShortsClipPatch, ShortsJob } from '@shared/shorts'
import { clipDuration, formatShortsTimecode, shortsClipPreviewKey } from '@shared/shorts'
import { formatClipLength } from '@shared/shortsDuration'
import { Button } from '../Button'
import { Input } from '../Input'
import { Modal } from '../Modal'
import { ShortsClipCopyEditor } from './ShortsClipCopyEditor'
import { ShortsClipPreview } from './ShortsClipPreview'

export function ShortsAdjustModal({
  open,
  job,
  clip,
  mediaUrl,
  aspectMode,
  playing,
  busy,
  regenerating,
  onClose,
  onPlayingChange,
  onChange,
  onCopy,
  onRegenerate,
  onExport,
  onDelete,
}: {
  open: boolean
  job: ShortsJob | null
  clip: ShortsClip | null
  mediaUrl: string | null
  aspectMode: ShortsAspectMode
  playing: boolean
  busy: boolean
  regenerating: boolean
  onClose: () => void
  onPlayingChange: (playing: boolean) => void
  onChange: (patch: ShortsClipPatch) => Promise<void>
  onCopy: (part: 'title' | 'description' | 'all') => void
  onRegenerate: (fields: 'title' | 'description' | 'all') => void
  onExport: () => void
  onDelete: () => void
}) {
  const duration = job?.probe?.duration ?? clip?.end ?? 0
  const start = clip?.start ?? 0
  const end = clip?.end ?? 0
  const vertical = aspectMode !== 'original'
  const sourceWidth = job?.probe?.width ?? 1920
  const sourceHeight = job?.probe?.height ?? 1080

  return (
    <Modal
      open={open}
      title={clip ? `Ajustar Short #${clip.index}` : 'Prévia'}
      onClose={onClose}
      size="2xl"
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onDelete}>
            Excluir Short
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={busy} onClick={onExport}>
            Gerar Short
          </Button>
        </>
      }
    >
      {clip ? (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]">
            <div className={vertical ? 'mx-auto w-full max-w-[240px]' : 'w-full'}>
              <ShortsClipPreview
                clipId={clip.id}
                src={mediaUrl}
                start={start}
                end={end}
                aspectMode={aspectMode}
                sourceWidth={sourceWidth}
                sourceHeight={sourceHeight}
                active={playing}
                resetToken={shortsClipPreviewKey({ id: clip.id, start, end })}
                posterUrl={clip.posterUrl}
                onPlayingChange={onPlayingChange}
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-9 px-3"
                  icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  onClick={() => onPlayingChange(!playing)}
                >
                  {playing ? 'Pausar' : 'Assistir trecho'}
                </Button>
                <span className="text-sm font-medium tabular-nums text-text">
                  {formatClipLength(clipDuration(clip))}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Início (s)"
                  type="number"
                  min={0}
                  max={end}
                  step={0.1}
                  value={start}
                  onChange={(event) => void onChange({ start: Number(event.target.value), end })}
                />
                <Input
                  label="Fim (s)"
                  type="number"
                  min={start}
                  max={duration}
                  step={0.1}
                  value={end}
                  onChange={(event) => void onChange({ start, end: Number(event.target.value) })}
                />
              </div>
              <p className="text-xs text-muted">
                {formatShortsTimecode(start)} → {formatShortsTimecode(end)} · {formatClipLength(end - start)}
              </p>
              <ShortsClipCopyEditor
                clip={clip}
                disabled={busy}
                regenerating={regenerating}
                onPersist={(patch) => void onChange(patch)}
                onCopy={onCopy}
                onRegenerate={onRegenerate}
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">Linha do tempo</p>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={start}
              onChange={(event) => void onChange({ start: Number(event.target.value), end })}
              className="w-full accent-accent"
              aria-label="Início"
            />
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={end}
              onChange={(event) => void onChange({ start, end: Number(event.target.value) })}
              className="w-full accent-accent"
              aria-label="Fim"
            />
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
