import type { ReactNode } from 'react'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          size === '2xl'
            ? 'flex max-h-[min(92vh,960px)] w-full min-w-0 max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl'
            : size === 'xl'
            ? 'flex max-h-[min(92vh,900px)] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl'
            : size === 'lg'
            ? 'flex max-h-[min(92vh,820px)] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl'
            : 'flex max-h-[min(92vh,720px)] w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl'
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="min-w-0 text-base font-semibold break-words text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-text"
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
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{message}</p>
    </Modal>
  )
}
