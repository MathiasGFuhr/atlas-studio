import { type EditorAnimationKind } from '@shared/editor/animationsCatalog'
import { cn } from '../../lib/utils'
import { CapCutAnimationPicker } from './CapCutAnimationPicker'

type AnimTarget = 'clip' | 'watermark'

type Props = {
  target: AnimTarget
  onTargetChange: (target: AnimTarget) => void
  activeInId?: string | null
  activeOutId?: string | null
  activeComboId?: string | null
  hasWatermark: boolean
  onPick: (kind: EditorAnimationKind, id: string) => void
  onClearKind: (kind: EditorAnimationKind) => void
}

export function AnimationsLibraryPanel({
  target,
  onTargetChange,
  activeInId,
  activeOutId,
  activeComboId,
  hasWatermark,
  onPick,
  onClearKind,
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border-soft px-3 py-2.5">
        <div className="flex items-center gap-1 rounded-lg bg-elevated p-0.5">
          <button
            type="button"
            onClick={() => onTargetChange('clip')}
            className={cn(
              'flex-1 rounded-md py-1 text-[11px] font-semibold transition-colors',
              target === 'clip' ? 'bg-surface text-text shadow-sm' : 'text-muted-2 hover:text-text',
            )}
          >
            Clipe selecionado
          </button>
          <button
            type="button"
            disabled={!hasWatermark}
            onClick={() => onTargetChange('watermark')}
            title={hasWatermark ? 'Animar marca d’água' : 'Adicione uma marca d’água primeiro'}
            className={cn(
              'flex-1 rounded-md py-1 text-[11px] font-semibold transition-colors disabled:opacity-40',
              target === 'watermark' ? 'bg-surface text-text shadow-sm' : 'text-muted-2 hover:text-text',
            )}
          >
            Marca d’água
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-2">
          Passe o mouse sobre qualquer card para visualizar a animação ao vivo.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <CapCutAnimationPicker
          activeInId={activeInId}
          activeOutId={activeOutId}
          activeComboId={activeComboId}
          onPick={onPick}
          onClearKind={onClearKind}
        />
      </div>
    </div>
  )
}
