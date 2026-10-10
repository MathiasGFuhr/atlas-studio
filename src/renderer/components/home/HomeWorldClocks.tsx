import { useEffect, useMemo, useState } from 'react'
import { Clock3, Moon, Plus, Sun, Trash2 } from 'lucide-react'
import type { WorldClock } from '@shared/worldClocks'
import {
  WORLD_CLOCK_CATALOG,
  createWorldClock,
  formatWorldClockDay,
  formatWorldClockOffset,
  formatWorldClockTime,
  isWorldClockDaytime,
} from '@shared/worldClocks'
import { Card } from '../Card'
import { Modal } from '../Modal'
import { Button } from '../Button'
import { cn } from '../../lib/utils'

export function HomeWorldClocks({
  clocks,
  saving,
  onChange,
}: {
  clocks: WorldClock[]
  saving?: boolean
  onChange: (next: WorldClock[]) => void | Promise<void>
}) {
  const [now, setNow] = useState(() => new Date())
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [selectedZone, setSelectedZone] = useState(WORLD_CLOCK_CATALOG[0]?.timeZone ?? '')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const filteredCatalog = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return WORLD_CLOCK_CATALOG
    return WORLD_CLOCK_CATALOG.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.timeZone.toLowerCase().includes(needle) ||
        item.region.toLowerCase().includes(needle),
    )
  }, [query])

  const selectedCatalog = WORLD_CLOCK_CATALOG.find((item) => item.timeZone === selectedZone)

  function openAdd() {
    setQuery('')
    setCustomLabel('')
    setSelectedZone(WORLD_CLOCK_CATALOG[0]?.timeZone ?? '')
    setAddOpen(true)
  }

  async function handleAdd() {
    const label = customLabel.trim() || selectedCatalog?.label || ''
    const clock = createWorldClock(label, selectedZone)
    if (!clock) return
    await onChange([...clocks, clock])
    setAddOpen(false)
  }

  async function handleRemove(id: string) {
    await onChange(clocks.filter((clock) => clock.id !== id))
  }

  return (
    <>
      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-2">
              Fusos
            </p>
            <p className="mt-1 text-sm text-muted">
              Horário local dos mercados para subir vídeo no canal certo.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="!px-3 !py-2 text-[13px]"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={openAdd}
            disabled={saving}
          >
            Adicionar fuso
          </Button>
        </div>

        {clocks.length === 0 ? (
          <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3 border-dashed">
            <div>
              <p className="text-sm font-medium text-text">Nenhum fuso configurado</p>
              <p className="mt-1 text-sm text-muted-2">
                Adicione países ou cidades para acompanhar o melhor horário de publicação.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={openAdd} disabled={saving}>
              Adicionar fuso
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {clocks.map((clock) => {
              const daytime = isWorldClockDaytime(now, clock.timeZone)
              return (
                <Card
                  key={clock.id}
                  padding="sm"
                  className="group relative !px-4 !py-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          daytime ? 'bg-accent/10 text-accent' : 'bg-white/[0.04] text-muted',
                        )}
                      >
                        {daytime ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-2">
                          {clock.label}
                        </p>
                        <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-text">
                          {formatWorldClockTime(now, clock.timeZone)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemove(clock.id)}
                      disabled={saving}
                      className="rounded-lg p-1.5 text-muted opacity-0 transition-opacity hover:bg-white/5 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
                      aria-label={`Remover ${clock.label}`}
                      title="Remover fuso"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-2">
                    <span className="truncate">{formatWorldClockDay(now, clock.timeZone)}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatWorldClockOffset(now, clock.timeZone)}
                    </span>
                  </div>
                </Card>
              )
            })}

            <button
              type="button"
              onClick={openAdd}
              disabled={saving}
              className="flex min-h-[104px] items-center justify-center gap-2 rounded-2xl border border-dashed border-border-soft bg-card/40 px-4 py-3.5 text-sm font-medium text-muted transition-colors hover:border-border hover:bg-card/70 hover:text-text disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Adicionar fuso
            </button>
          </div>
        )}
      </section>

      <Modal
        open={addOpen}
        title="Adicionar fuso horário"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleAdd()} disabled={saving || !selectedZone}>
              Adicionar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Escolha um país ou cidade para acompanhar o horário ideal de publicação.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted-2">
              Buscar
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: Japão, Los Angeles, UTC..."
              className="w-full rounded-xl border border-border bg-card-2 px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted-2 focus:border-accent/40"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted-2">
              Nome exibido (opcional)
            </span>
            <input
              value={customLabel}
              onChange={(event) => setCustomLabel(event.target.value)}
              placeholder={selectedCatalog?.label ?? 'Ex.: Canal EUA'}
              className="w-full rounded-xl border border-border bg-card-2 px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted-2 focus:border-accent/40"
            />
          </label>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border-soft p-1">
            {filteredCatalog.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-2">Nenhum fuso encontrado.</p>
            ) : (
              filteredCatalog.map((item) => {
                const selected = item.timeZone === selectedZone
                return (
                  <button
                    key={`${item.timeZone}-${item.label}`}
                    type="button"
                    onClick={() => setSelectedZone(item.timeZone)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      selected ? 'bg-accent/10 text-text' : 'text-muted hover:bg-white/[0.03] hover:text-text',
                    )}
                  >
                    <Clock3 className={cn('h-4 w-4 shrink-0', selected ? 'text-accent' : 'text-muted-2')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-2">
                        {item.region} · {item.timeZone}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-2">
                      {formatWorldClockTime(now, item.timeZone)}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
