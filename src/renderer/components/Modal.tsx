import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  size = 'md',
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl' | '2xl'
}) {
  if (!open) return null
  return (
    <div className="atlas-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-overlay/78 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          size === '2xl'
            ? 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,960px)] w-full min-w-0 max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal'
            : size === 'xl'
              ? 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,900px)] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal'
              : size === 'lg'
                ? 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,820px)] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal'
                : 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,720px)] w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal'
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="min-w-0 text-base font-semibold break-words text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="atlas-press rounded-lg p-1.5 text-muted hover:bg-hover hover:text-text"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border-soft px-4 py-3 sm:px-5 sm:py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  confirmOnEnter = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** warning = ação de parar/desligar; danger = destrutivo. */
  tone?: 'default' | 'warning' | 'danger'
  /** Enter confirma enquanto o diálogo está aberto (opt-in por tela). */
  confirmOnEnter?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm

  useEffect(() => {
    if (!open || !confirmOnEnter) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat || event.isComposing) return
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      // Botões do próprio diálogo (Cancelar / Fechar) mantêm o comportamento nativo.
      if (target?.closest('[role="dialog"]') && target.closest('button')) return
      // Impede que o Enter reative o botão da página que abriu o diálogo.
      event.preventDefault()
      event.stopPropagation()
      onConfirmRef.current()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, confirmOnEnter])

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className={
              tone === 'warning'
                ? 'bg-amber-600 text-white hover:bg-amber-500'
                : tone === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : undefined
            }
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{message}</p>
    </Modal>
  )
}
