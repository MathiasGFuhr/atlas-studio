import { Library } from 'lucide-react'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { cn } from '../../lib/utils'

const TEXT_SOFT_LIMIT = 2000

export function ApplyAllScenesPromptModal({
  open,
  sceneCount,
  scenesWithPrompt,
  text,
  applying,
  onChange,
  onClose,
  onOpenSaved,
  onApply,
}: {
  open: boolean
  sceneCount: number
  scenesWithPrompt: number
  text: string
  applying: boolean
  onChange: (value: string) => void
  onClose: () => void
  onOpenSaved: () => void
  onApply: () => void
}) {
  const trimmed = text.trim()
  const canApply = trimmed.length > 0 && sceneCount > 0 && !applying

  return (
    <Modal
      open={open}
      title="Prompt padrão para todas as cenas"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancelar
          </Button>
          <Button disabled={!canApply} onClick={onApply}>
            {applying
              ? 'Aplicando…'
              : sceneCount === 1
                ? 'Aplicar na cena'
                : `Aplicar em ${sceneCount} cenas`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Digite um prompt ou puxe um salvo. O mesmo texto entra em todas as cenas deste projeto.
          Depois você ainda pode ajustar cena por cena.
        </p>
        {scenesWithPrompt > 0 ? (
          <p className="text-xs leading-relaxed text-text">
            {scenesWithPrompt === 1
              ? '1 cena já tem prompt. Esse texto substitui o dela.'
              : `${scenesWithPrompt} cenas já têm prompt. Esse texto substitui o de todas.`}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">Prompt</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
            onClick={onOpenSaved}
          >
            <Library className="h-3.5 w-3.5" />
            Usar salvo
          </button>
        </div>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Cantando com emoção, olhar para a câmera, iluminação cinematográfica…"
          spellCheck={false}
          className="h-40 w-full resize-none overflow-y-auto rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
        />
        <p
          className={cn(
            'text-right text-[10px] tabular-nums',
            text.length > TEXT_SOFT_LIMIT ? 'text-warning' : 'text-muted-2',
          )}
        >
          {text.length}/{TEXT_SOFT_LIMIT}
        </p>
      </div>
    </Modal>
  )
}
