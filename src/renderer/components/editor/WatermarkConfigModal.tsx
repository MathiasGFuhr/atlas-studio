import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import { editorAnimationById } from '@shared/editor/animationsCatalog'
import {
  EDITOR_MAX_WATERMARKS,
  EDITOR_WATERMARK_CORNER_LABEL,
  EDITOR_WATERMARK_CORNERS,
  editorOutputSize,
  type EditorAspect,
  type EditorAsset,
  type EditorClipAnimation,
  type EditorWatermark,
  type EditorWatermarkCorner,
} from '@shared/editor/types'
import { watermarkCssPosition } from '@shared/editor/watermark'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { assetPlaybackUrl } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'

type Props = {
  open: boolean
  aspect: EditorAspect
  watermarks: EditorWatermark[]
  selectedId: string | null
  assetsById: Map<string, EditorAsset>
  busy?: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onChange: (
    watermarkId: string,
    patch: Partial<Pick<EditorWatermark, 'corner' | 'scale' | 'opacity' | 'margin' | 'animation'>>,
  ) => void
  onPickImage: (watermarkId: string | null) => void
  onAdd: () => void
  onRemove: (watermarkId: string) => void
}

function CornerButton({
  corner,
  active,
  onClick,
}: {
  corner: EditorWatermarkCorner
  active: boolean
  onClick: () => void
}) {
  const dot =
    corner === 'top-left'
      ? 'top-1 left-1'
      : corner === 'top-right'
        ? 'top-1 right-1'
        : corner === 'bottom-left'
          ? 'bottom-1 left-1'
          : 'bottom-1 right-1'

  return (
    <button
      type="button"
      title={EDITOR_WATERMARK_CORNER_LABEL[corner]}
      aria-label={EDITOR_WATERMARK_CORNER_LABEL[corner]}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative h-10 w-10 rounded-lg border transition-colors',
        active
          ? 'border-accent/70 bg-accent-subtle'
          : 'border-border-soft bg-elevated/40 hover:border-border-strong hover:bg-hover',
      )}
    >
      <span className={cn('absolute h-2.5 w-2.5 rounded-[3px]', active ? 'bg-accent' : 'bg-muted-2', dot)} />
    </button>
  )
}

export function WatermarkConfigModal({
  open,
  aspect,
  watermarks,
  selectedId,
  assetsById,
  busy,
  onClose,
  onSelect,
  onChange,
  onPickImage,
  onAdd,
  onRemove,
}: Props) {
  const selected =
    watermarks.find((item) => item.id === selectedId) ?? watermarks[0] ?? null
  const asset = selected ? (assetsById.get(selected.assetId) ?? null) : null
  const previewUrl = assetPlaybackUrl(asset ?? undefined) || asset?.coverUrl || null
  const frameWidth = editorOutputSize(aspect, 1080).width
  const sizePx = selected ? Math.round(frameWidth * selected.scale) : 0
  const minPx = Math.round(frameWidth * 0.05)
  const maxPx = Math.round(frameWidth * 0.45)
  const opacityPercent = selected ? Math.round(selected.opacity * 100) : 0
  const anim = selected?.animation ?? {
    inId: null,
    outId: null,
    comboId: null,
    inDuration: 0.6,
    outDuration: 0.6,
  }
  const patchAnim = (patch: Partial<EditorClipAnimation>) => {
    if (!selected) return
    onChange(selected.id, { animation: { ...anim, ...patch } })
  }
  const canAdd = watermarks.length < EDITOR_MAX_WATERMARKS

  return (
    <Modal
      open={open}
      title="Configurar marca d'água"
      onClose={onClose}
      footer={
        <>
          {selected ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => onRemove(selected.id)}
            >
              Remover
            </Button>
          ) : (
            <span className="mr-auto" />
          )}
          <Button onClick={onClose}>Concluído</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {watermarks.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                item.id === selected?.id
                  ? 'bg-accent-subtle text-accent ring-1 ring-accent/50'
                  : 'bg-elevated text-muted hover:text-text',
              )}
            >
              Marca {index + 1}
            </button>
          ))}
          {canAdd ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border-strong px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:border-accent/60 hover:text-text disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar outra
            </button>
          ) : null}
        </div>

        <div className="relative mx-auto aspect-video w-full max-w-sm overflow-hidden rounded-xl border border-border-soft bg-black">
          {watermarks.map((item) => {
            const markAsset = assetsById.get(item.assetId)
            const src = assetPlaybackUrl(markAsset) || markAsset?.coverUrl || null
            if (!src) return null
            return (
              <img
                key={item.id}
                src={src}
                alt=""
                draggable={false}
                className={cn(
                  'pointer-events-none absolute object-contain transition-opacity',
                  item.id === selected?.id ? 'opacity-100' : 'opacity-70',
                )}
                style={{
                  width: `${item.scale * 100}%`,
                  opacity: item.opacity * (item.id === selected?.id ? 1 : 0.7),
                  ...watermarkCssPosition(item.corner, item.margin * 100),
                }}
              />
            )
          })}
          {watermarks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[11px] text-muted-2">
              Nenhuma marca d&apos;água
            </div>
          ) : null}
        </div>

        {selected ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onPickImage(selected.id)}
                className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-soft bg-elevated px-3 py-2 text-left text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-50"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="h-7 w-7 rounded-md object-contain" />
                ) : (
                  <ImagePlus className="h-4 w-4 shrink-0 text-muted-2" />
                )}
                <span className="min-w-0 truncate">{asset?.name ?? 'Escolher imagem'}</span>
              </button>
              <Button variant="ghost" disabled={busy} onClick={() => onPickImage(selected.id)}>
                Trocar
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">Posição</p>
              <div className="grid w-fit grid-cols-2 gap-1.5" role="group" aria-label="Posição da marca d'água">
                {EDITOR_WATERMARK_CORNERS.map((corner) => (
                  <CornerButton
                    key={corner}
                    corner={corner}
                    active={selected.corner === corner}
                    onClick={() => onChange(selected.id, { corner })}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">Tamanho</p>
                <span className="text-[11px] tabular-nums text-text">{sizePx} px</span>
              </div>
              <input
                type="range"
                min={minPx}
                max={maxPx}
                step={1}
                value={sizePx}
                onChange={(event) =>
                  onChange(selected.id, { scale: Number(event.target.value) / frameWidth })
                }
                className="w-full accent-[var(--color-accent)]"
                aria-label="Tamanho da marca d'água"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">Opacidade</p>
                <span className="text-[11px] tabular-nums text-text">{opacityPercent}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={opacityPercent}
                onChange={(event) =>
                  onChange(selected.id, { opacity: Number(event.target.value) / 100 })
                }
                className="w-full accent-[var(--color-accent)]"
                aria-label="Opacidade da marca d'água"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-border-soft bg-elevated/40 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">Animação</p>
              <p className="text-[11px] text-text">
                Entrada: {anim.inId ? editorAnimationById(anim.inId)?.label ?? anim.inId : 'Nenhuma'}
              </p>
              <p className="text-[11px] text-text">
                Saída: {anim.outId ? editorAnimationById(anim.outId)?.label ?? anim.outId : 'Nenhuma'}
              </p>
              <p className="text-[11px] text-text">
                Combinação:{' '}
                {anim.comboId ? editorAnimationById(anim.comboId)?.label ?? anim.comboId : 'Nenhuma'}
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-2">Duração entrada</span>
                  <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={anim.inDuration}
                    onChange={(event) => patchAnim({ inDuration: Number(event.target.value) })}
                    className="w-full accent-[var(--color-accent)]"
                  />
                  <span className="block text-[10px] tabular-nums text-text">{anim.inDuration.toFixed(1)}s</span>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-2">Duração saída</span>
                  <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={anim.outDuration}
                    onChange={(event) => patchAnim({ outDuration: Number(event.target.value) })}
                    className="w-full accent-[var(--color-accent)]"
                  />
                  <span className="block text-[10px] tabular-nums text-text">{anim.outDuration.toFixed(1)}s</span>
                </label>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-2">
                Escolha presets na biblioteca Animação com o alvo “Marca d&apos;água”.
              </p>
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-8 text-xs font-semibold text-muted hover:border-accent/60 hover:text-text disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar marca d&apos;água
          </button>
        )}
      </div>
    </Modal>
  )
}
