import { Check, Loader2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { ChatActionResult, ChatPendingConfirmation } from '@shared/chat/types'
import { Button } from '../Button'
import { cn } from '../../lib/utils'

function formatDue(value?: string) {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function ChatActionCards({
  results,
  pending,
  confirming,
  onConfirm,
  onCancel,
}: {
  results: ChatActionResult[]
  pending?: ChatPendingConfirmation | null
  confirming?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}) {
  const navigate = useNavigate()
  const visible = results.filter((item) => item.status !== 'pending' || pending)
  if (visible.length === 0 && !pending) return null

  return (
    <div className="mt-3 space-y-2">
      {results.map((result, index) => (
        <div
          key={`${result.name}-${index}`}
          className={cn(
            'rounded-xl border px-3 py-2.5 text-sm',
            result.status === 'success' && 'border-accent/30 bg-accent-dark/40',
            result.status === 'error' && 'border-danger/30 bg-danger/10',
            result.status === 'pending' && 'border-border bg-card-2',
            result.status === 'running' && 'border-border bg-card-2',
          )}
        >
          <div className="flex items-start gap-2">
            {result.status === 'success' ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            ) : result.status === 'error' ? (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            ) : (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-text">{result.title}</div>
              {result.subtitle ? <div className="text-xs text-muted">{result.subtitle}</div> : null}
              {result.error ? <div className="mt-1 text-xs text-danger">{result.error}</div> : null}
              {typeof result.data === 'object' &&
              result.data &&
              'dueDate' in (result.data as object) &&
              (result.data as { dueDate?: string }).dueDate ? (
                <div className="mt-1 text-xs text-muted">
                  {formatDue((result.data as { dueDate?: string }).dueDate)}
                </div>
              ) : null}
            </div>
            {result.navigateTo ? (
              <Button
                variant="secondary"
                className="h-8 shrink-0 px-3 text-xs"
                onClick={() => navigate(result.navigateTo!)}
              >
                {result.navigateLabel || 'Abrir'}
              </Button>
            ) : null}
          </div>
        </div>
      ))}

      {pending ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-3">
          <div className="text-sm font-semibold text-text">{pending.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{pending.message}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="h-8 text-xs" disabled={confirming} onClick={onCancel}>
              Cancelar
            </Button>
            <Button variant="danger" className="h-8 text-xs" disabled={confirming} onClick={onConfirm}>
              {confirming ? 'Executando...' : pending.confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
