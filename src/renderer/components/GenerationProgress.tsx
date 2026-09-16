import { Check, LoaderCircle, X } from 'lucide-react'
import type { GenerationStep } from '@shared/types'
import { Button } from './Button'
import { cn } from '../lib/utils'

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function GenerationProgress({
  steps,
  title = 'Criando seu roteiro...',
  elapsedMs = 0,
  onCancel,
  cancellable = false,
}: {
  steps: GenerationStep[]
  title?: string
  elapsedMs?: number
  onCancel?: () => void
  cancellable?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted">{formatElapsed(elapsedMs)}</span>
          {cancellable && onCancel ? (
            <Button
              variant="secondary"
              className="h-8 px-3 text-xs"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={onCancel}
            >
              Cancelar geração
            </Button>
          ) : null}
        </div>
      </div>
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1
          return (
            <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast ? (
                <span
                  className={cn(
                    'absolute left-[11px] top-6 h-[calc(100%-12px)] w-px',
                    step.state === 'done' ? 'bg-accent/60' : 'bg-border',
                  )}
                />
              ) : null}
              <span
                className={cn(
                  'relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border',
                  step.state === 'done' && 'border-accent bg-accent text-black',
                  step.state === 'running' && 'border-accent/50 bg-accent-dark text-accent',
                  step.state === 'pending' && 'border-border bg-card-2 text-muted-2',
                  step.state === 'error' && 'border-danger bg-danger/20 text-danger',
                  step.state === 'cancelled' && 'border-warning bg-warning/10 text-warning',
                )}
              >
                {step.state === 'done' ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : step.state === 'running' ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span
                className={cn(
                  'pt-0.5 text-sm',
                  step.state === 'done' && 'text-text',
                  step.state === 'running' && 'font-medium text-accent',
                  step.state === 'pending' && 'text-muted-2',
                  step.state === 'error' && 'text-danger',
                  step.state === 'cancelled' && 'text-warning',
                )}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
