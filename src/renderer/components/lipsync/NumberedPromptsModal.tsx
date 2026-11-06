import { Button } from '../Button'
import { Modal } from '../Modal'

export function NumberedPromptsModal({
  open,
  sceneCount,
  parsedCount,
  text,
  applying,
  onChange,
  onClose,
  onApply,
}: {
  open: boolean
  sceneCount: number
  parsedCount: number
  text: string
  applying: boolean
  onChange: (value: string) => void
  onClose: () => void
  onApply: () => void
}) {
  const canApply = parsedCount > 0 && sceneCount > 0 && !applying

  return (
    <Modal
      open={open}
      title="Colocar prompts nas cenas"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancelar
          </Button>
          <Button disabled={!canApply} onClick={onApply}>
            {applying
              ? 'Colocando…'
              : parsedCount === 1
                ? 'Colocar na cena'
                : `Colocar em ${parsedCount} cenas`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Cole a lista <span className="font-medium text-text">1- 2- 3-</span> ou o documento de
          direção (<span className="font-medium text-text">CENA</span> /{' '}
          <span className="font-medium text-text">CORTE</span>, com ou sem ```). O bloco{' '}
          <span className="font-medium text-text">ComfyUI</span> entra na cena com letra. No corte
          de banda ou instrumental, sem Comfy, entra o bloco{' '}
          <span className="font-medium text-text">Veo</span>. Flow fica de fora.
        </p>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            'CORTE 01 — Título\nCOMFYUI — ANIMAÇÃO…\nAnimate this supplied frame…\n\nCORTE 02 — …'
          }
          spellCheck={false}
          className="h-56 w-full resize-none overflow-y-auto rounded-xl border border-border bg-bg/50 px-3 py-2 font-mono text-[13px] leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
        />
        <p className="text-xs text-muted">
          {parsedCount === 0
            ? `${sceneCount} ${sceneCount === 1 ? 'cena' : 'cenas'} na fila. Lista numerada ou documento CENA/CORTE.`
            : parsedCount === 1
              ? '1 prompt reconhecido.'
              : `${parsedCount} prompts reconhecidos.`}
        </p>
      </div>
    </Modal>
  )
}
