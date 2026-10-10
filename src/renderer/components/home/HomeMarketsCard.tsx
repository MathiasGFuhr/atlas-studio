import { useEffect, useMemo, useState } from 'react'
import { Globe2, Moon, Plus, Sun, Trash2 } from 'lucide-react'
import type { WorldClock } from '@shared/worldClocks'
import {
  WORLD_CLOCK_CATALOG,
  createWorldClock,
  formatWorldClockDay,
  formatWorldClockOffset,
  formatWorldClockTime,
  getWorldClockCountryCode,
  isWorldClockDaytime,
  worldClockFlagUrl,
} from '@shared/worldClocks'
import { Card } from '../Card'
import { Modal } from '../Modal'
import { Button } from '../Button'
import { cn } from '../../lib/utils'
import marketsBg from '../../assets/markets-bg.jpg'

export function HomeMarketsCard({
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
  const visible = clocks.slice(0, 6)

  async function handleAdd() {
    const label = customLabel.trim() || selectedCatalog?.label || ''
    const clock = createWorldClock(label, selectedZone)
    if (!clock) return
    await onChange([...clocks, clock])
    setAddOpen(false)
  }

  return (
    <>
      <Card padding="lg" className="relative flex shrink-0 flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
          <img
            src={marketsBg}
            alt=""
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[#070b0e]/68" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#070b0e]/50 via-[#070b0e]/58 to-[#070b0e]/85" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-accent/[0.08] to-transparent" />
        </div>

        <div className="relative mb-3.5 flex shrink-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
              Mercados
            </p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">
              Fusos horários
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setCustomLabel('')
              setSelectedZone(WORLD_CLOCK_CATALOG[0]?.timeZone ?? '')
              setAddOpen(true)
            }}
            disabled={saving}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11px] font-medium text-muted transition-colors hover:border-accent/30 hover:text-accent disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>

        <div className="relative flex flex-col gap-2">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-black/20 px-4 py-8 text-center backdrop-blur-sm">
              <p className="text-sm font-medium text-text">Nenhum fuso configurado</p>
              <p className="mt-1 text-xs text-muted-2">
                Adicione mercados para publicar no horário certo.
              </p>
            </div>
          ) : (
            visible.map((clock) => {
              const daytime = isWorldClockDaytime(now, clock.timeZone)
              const countryCode = getWorldClockCountryCode(clock.timeZone, clock.label)
              return (
                <div
                  key={clock.id}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black/30 backdrop-blur-md"
                >
                  {countryCode ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-[0.22]"
                      style={{
                        backgroundImage: `url(${worldClockFlagUrl(countryCode)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a1014]/92 via-[#0a1014]/82 to-[#0a1014]/55" />

                  <div className="relative flex items-center gap-3 px-3 py-3">
                    <div className="relative h-11 w-11 shrink-0">
                      <div
                        className={cn(
                          'flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
                          countryCode
                            ? 'border-white/15 bg-[#12181d]'
                            : daytime
                              ? 'border-accent/25 bg-accent/15 text-accent'
                              : 'border-white/[0.08] bg-white/[0.06] text-muted',
                        )}
                      >
                        {countryCode ? (
                          <img
                            src={worldClockFlagUrl(countryCode)}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <Globe2 className="h-4 w-4" />
                        )}
                      </div>
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#0a1014] shadow-sm',
                          daytime ? 'bg-accent text-black' : 'bg-[#1c2430] text-muted',
                        )}
                        title={daytime ? 'Dia' : 'Noite'}
                      >
                        {daytime ? (
                          <Sun className="h-2.5 w-2.5" strokeWidth={2.5} />
                        ) : (
                          <Moon className="h-2.5 w-2.5" strokeWidth={2.5} />
                        )}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold tracking-tight text-text">
                        {clock.label}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-2">
                        {formatWorldClockDay(now, clock.timeZone)}
                        <span className="mx-1 opacity-50">·</span>
                        {formatWorldClockOffset(now, clock.timeZone)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[22px] font-semibold leading-none tabular-nums tracking-tight text-text">
                        {formatWorldClockTime(now, clock.timeZone)}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 z-[2] rounded-md p-1 text-muted-2 opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-danger group-hover:opacity-100"
                      aria-label={`Remover ${clock.label}`}
                      disabled={saving}
                      onClick={() => void onChange(clocks.filter((item) => item.id !== clock.id))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Modal
        open={addOpen}
        title="Adicionar fuso"
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving || !selectedZone} onClick={() => void handleAdd()}>
              Adicionar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cidade ou fuso..."
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
          <input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder="Nome personalizado (opcional)"
            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {filteredCatalog.map((item) => (
              <li key={item.timeZone}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm',
                    selectedZone === item.timeZone
                      ? 'bg-accent/12 ring-1 ring-accent/20'
                      : 'hover:bg-white/[0.04]',
                  )}
                  onClick={() => setSelectedZone(item.timeZone)}
                >
                  <span className="font-medium text-text">{item.label}</span>
                  <span className="text-xs text-muted-2">{item.region}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  )
}
