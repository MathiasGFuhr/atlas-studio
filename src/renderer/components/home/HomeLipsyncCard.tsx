import type { LipSyncRef } from '@shared/lipSyncRefs'
import { Mic2 } from 'lucide-react'
import { Card } from '../Card'
import { cn } from '../../lib/utils'

export function HomeLipsyncCard({
  refs,
  onOpen,
}: {
  refs: LipSyncRef[]
  onOpen: () => void
}) {
  const items = refs.slice(0, 4)

  return (
    <Card padding="lg" className="flex h-full min-h-[300px] flex-col">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Fila
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Lipsync</h2>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
        >
          Abrir
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Mic2 className="mb-2 h-5 w-5 text-muted-2" />
          <p className="text-sm text-muted-2">Nenhuma referência na fila.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((ref) => {
            const ready = Boolean(ref.prompt.trim())
            return (
              <li key={ref.id}>
                <button
                  type="button"
                  onClick={onOpen}
                  className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-bg/15 px-2.5 py-2 text-left transition-colors hover:border-border-strong"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-elevated">
                    {ref.imageDataUrl ? (
                      <img
                        src={ref.imageThumbUrl ?? ref.imageDataUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-2">
                        <Mic2 className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">
                      {ref.label || 'Referência'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {ref.projectName || 'Sem projeto'}
                    </p>
                    {ready ? (
                      <span className="mt-1.5 inline-flex rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        Concluído
                      </span>
                    ) : (
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-[10px] text-muted-2">
                          <span>Processando</span>
                          <span>sem prompt</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-hover">
                          <div className={cn('h-full w-1/3 rounded-full bg-accent/70')} />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
