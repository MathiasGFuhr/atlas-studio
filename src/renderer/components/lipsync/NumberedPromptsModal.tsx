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
          Cole a lista <span className="font-medium text-text">1- 2- 3-</span> ou o documento completo
          (CENA 01, FLOW e ComfyUI). Só o bloco ComfyUI entra em cada cena.
        </p>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder={'1- prompt da cena 1\n\n2- prompt da cena 2\n\n3- prompt da cena 3'}
          spellCheck={false}
          className="h-56 w-full resize-none overflow-y-auto rounded-xl border border-border bg-bg/50 px-3 py-2 font-mono text-[13px] leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
        />
        <p className="text-xs text-muted">
          {parsedCount === 0
            ? `${sceneCount} ${sceneCount === 1 ? 'cena' : 'cenas'} na fila. Lista numerada ou documento de direção.`
            : parsedCount === 1
              ? '1 prompt Comfy reconhecido.'
              : `${parsedCount} prompts Comfy reconhecidos.`}
        </p>
      </div>
    </Modal>
  )
}
