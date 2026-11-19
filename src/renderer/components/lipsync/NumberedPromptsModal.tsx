import { useState, type DragEvent } from 'react'
import { ClipboardPaste, Copy, FileUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../Button'
import { Modal } from '../Modal'

export function NumberedPromptsModal({
  open,
  sceneCount,
  parsedCount,
  text,
  applying,
  onChange,
  onPasteClipboard,
  onImportFile,
  onCopyAll,
  onDropFile,
  onClose,
  onApply,
}: {
  open: boolean
  sceneCount: number
  parsedCount: number
  text: string
  applying: boolean
  onChange: (value: string) => void
  onPasteClipboard: () => void
  onImportFile: () => void
  onCopyAll: () => void
  onDropFile: (file: File) => void
  onClose: () => void
  onApply: () => void
}) {
  const [draggingFile, setDraggingFile] = useState(false)
  const canApply = parsedCount > 0 && sceneCount > 0 && !applying

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!draggingFile) setDraggingFile(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDraggingFile(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    setDraggingFile(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    event.preventDefault()
    onDropFile(file)
  }

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
      <div
        className="flex flex-col gap-3"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="text-sm text-muted">
          Cole ou puxe do PC a lista <span className="font-medium text-text">1- 2- 3-</span> ou o
          documento de direção (<span className="font-medium text-text">CENA</span> /{' '}
          <span className="font-medium text-text">CORTE</span>, inclusive{' '}
          <span className="font-medium text-text">1- CENA 01</span>, com ou sem ```). Somente o
          bloco <span className="font-medium text-text">ComfyUI</span> entra no campo de prompt.
          No corte de banda ou instrumental, sem Comfy, entra o bloco{' '}
          <span className="font-medium text-text">Veo</span>. Flow fica de fora.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={<ClipboardPaste className="h-3.5 w-3.5" />}
            disabled={applying}
            onClick={onPasteClipboard}
          >
            Colar documento
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={<FileUp className="h-3.5 w-3.5" />}
            disabled={applying}
            onClick={onImportFile}
          >
            Puxar do PC
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={<Copy className="h-3.5 w-3.5" />}
            disabled={applying || parsedCount === 0}
            onClick={onCopyAll}
          >
            Copiar todos
          </Button>
          <span className="text-[11px] text-muted-2">ou arraste um .txt / .md aqui</span>
        </div>
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            '1- CENA 01 — Título\nComfyUI\n```\nAnimate this supplied frame…\n```\n\n2- CENA 02 — …'
          }
          spellCheck={false}
          className={cn(
            'h-56 w-full resize-none overflow-y-auto rounded-xl border bg-bg/50 px-3 py-2 font-mono text-[13px] leading-relaxed text-text placeholder:text-muted-2 transition-colors focus:border-accent/60 focus:outline-none',
            draggingFile ? 'border-accent bg-accent/5' : 'border-border',
          )}
        />
        <p className="text-xs text-muted">
          {parsedCount === 0
            ? `${sceneCount} ${sceneCount === 1 ? 'cena' : 'cenas'} na fila. Lista numerada ou documento CENA/CORTE (.txt ou .md).`
            : parsedCount === 1
              ? '1 prompt reconhecido.'
              : `${parsedCount} prompts reconhecidos.`}
        </p>
      </div>
    </Modal>
  )
}
