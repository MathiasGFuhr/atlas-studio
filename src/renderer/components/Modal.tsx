import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel) {
      const alreadyInside = previousFocus && panel.contains(previousFocus)
      if (!alreadyInside) {
        const firstInput = panel.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [autofocus]',
        )
        const target = firstInput ?? panel
        target.focus({ preventScroll: true })
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null)
      if (focusables.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey) {
        if (!active || active === first || !panelRef.current.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (!active || active === last || !panelRef.current.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [open])

  if (!open) return null

  const content = (
    <div
      className="atlas-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-overlay/78 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          size === '2xl'
            ? 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,960px)] w-full min-w-0 max-w-6xl flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal outline-none'
            : size === 'xl'
              ? 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,900px)] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal outline-none'
              : size === 'lg'
                ? 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,820px)] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal outline-none'
                : 'atlas-modal-panel atlas-surface flex max-h-[min(92vh,720px)] w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal outline-none'
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border-soft px-4 py-3 sm:px-5 sm:py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
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
  onConfirm: () => void | Promise<unknown>
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm

  useEffect(() => {
    if (!open) {
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [open])

  const triggerConfirm = () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    Promise.resolve()
      .then(() => onConfirmRef.current())
      .catch(() => undefined)
      .finally(() => {
        submittingRef.current = false
        setSubmitting(false)
      })
  }

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
      triggerConfirm()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, confirmOnEnter])

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!submittingRef.current) onClose()
      }}
      footer={
        <>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            disabled={submitting}
            onClick={triggerConfirm}
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
