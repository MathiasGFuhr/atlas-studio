import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, CalendarClock, PiggyBank, Target, TrendingUp } from 'lucide-react'
import {
  estimateRevenueGoal,
  formatBrl,
  formatGoalHitDate,
  formatMonthsLabel,
  type RevenueGoalKind,
  type RevenueGoalMode,
} from '@shared/finance/revenueGoal'
import { goalProgressPercent } from '@shared/finance/ledger'
import { Card } from '../Card'
import { Input } from '../Input'
import { MoneyField } from './MoneyField'
import { cn } from '../../lib/utils'

export type RevenueGoalSnapshot = {
  goalAmount: number
  currentMonthlyRevenue: number
  investedTotal: number
  estimatedMonths: number | null
  suggestedInvestment: number | null
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (next: T) => void
  options: Array<{ id: T; label: string; icon?: ReactNode }>
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
            value === option.id
              ? 'border-accent/40 bg-accent-subtle/55 text-accent'
              : 'border-border bg-elevated text-muted hover:text-text',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function RevenueGoalPlanner({
  investedTotal,
  monthlyRevenueTotal,
  monthlyProfitTotal = 0,
  onSnapshot,
}: {
  /** Soma dos investimentos cadastrados (banco, ações etc.). */
  investedTotal: number
  /** Soma das receitas mensais cadastradas. */
  monthlyRevenueTotal: number
  /** Lucro mensal (receitas − despesas). Preferido para estimar quando a meta de capital será batida. */
  monthlyProfitTotal?: number
  onSnapshot?: (snapshot: RevenueGoalSnapshot) => void
}) {
  const [kind, setKind] = useState<RevenueGoalKind>('accumulate')
  const [mode, setMode] = useState<RevenueGoalMode>('estimate_time')
  const [goal, setGoal] = useState(150_000)
  const [months, setMonths] = useState('12')
  const [returnPerReal, setReturnPerReal] = useState('1,5')

  const targetMonths = Number(months.replace(/\D/g, '')) || 0
  const returnRate = Number(returnPerReal.replace(',', '.').replace(/[^\d.]/g, '')) || 1
  const saved = Math.max(0, investedTotal)
  const monthly = Math.max(0, monthlyRevenueTotal)
  /** Ritmo usado na estimativa de capital: lucro se positivo, senão receita. */
  const paceMonthly =
    kind === 'accumulate'
      ? monthlyProfitTotal > 0
        ? monthlyProfitTotal
        : monthly
      : monthly

  const liveEta = useMemo(
    () =>
      estimateRevenueGoal({
        kind,
        mode: 'estimate_time',
        goalAmount: goal,
        currentMonthlyRevenue: paceMonthly,
        alreadySaved: kind === 'accumulate' ? saved : 0,
      }),
    [kind, goal, paceMonthly, saved],
  )

  const result = useMemo(
    () =>
      estimateRevenueGoal({
        kind,
        mode,
        goalAmount: goal,
        currentMonthlyRevenue: paceMonthly,
        alreadySaved: kind === 'accumulate' ? saved : 0,
        targetMonths,
        expectedReturnPerReal: returnRate,
      }),
    [kind, mode, goal, paceMonthly, saved, targetMonths, returnRate],
  )

  useEffect(() => {
    if (!onSnapshot) return
    const etaMonths =
      liveEta.ok && liveEta.mode === 'estimate_time' && !liveEta.alreadyReached
        ? liveEta.months
        : liveEta.ok && liveEta.alreadyReached
          ? 0
          : null
    onSnapshot({
      goalAmount: goal,
      currentMonthlyRevenue: monthly,
      investedTotal: saved,
      estimatedMonths:
        etaMonths ??
        (result.ok && result.mode === 'estimate_investment' ? result.targetMonths : null),
      suggestedInvestment:
        result.ok && result.mode === 'estimate_investment' && !result.alreadyReached
          ? result.suggestedInvestment
          : null,
    })
  }, [goal, liveEta, monthly, onSnapshot, result, saved])

  const progress =
    kind === 'accumulate'
      ? goalProgressPercent(goal, saved)
      : goalProgressPercent(goal, monthly)

  return (
    <Card padding="lg" className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/8 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-28 -left-16 h-56 w-56 rounded-full bg-info/8 blur-3xl"
        aria-hidden
      />

      <div className="relative mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent-subtle text-accent">
          <Target className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-2">
            Meta de receita
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">
            Planejador de meta
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            O progresso usa só o capital investido. A estimativa de quando bate a meta atualiza com
            o ritmo mensal cadastrado.
          </p>
        </div>
      </div>

      <div className="relative mb-5 overflow-hidden rounded-2xl border border-border-soft bg-bg/30 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
              {kind === 'accumulate' ? 'Progresso pelo capital investido' : 'Progresso da receita mensal'}
            </p>
            <p className="mt-1.5 text-[1.65rem] font-semibold leading-none tabular-nums tracking-tight text-text sm:text-[1.85rem]">
              {formatBrl(kind === 'accumulate' ? saved : monthly)}
            </p>
            <p className="mt-1.5 text-sm text-muted">
              de <span className="font-medium tabular-nums text-text">{formatBrl(goal)}</span>
              {kind === 'monthly' ? ' por mês' : ''}
            </p>
          </div>
          <div className="rounded-xl border border-accent/20 bg-accent-subtle/50 px-3 py-2 text-right">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
              Avanço
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-accent">
              {Math.round(progress)}%
            </p>
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <GoalEtaBanner
          kind={kind}
          liveEta={liveEta}
          paceMonthly={paceMonthly}
          usingProfit={kind === 'accumulate' && monthlyProfitTotal > 0}
        />
      </div>

      <div className="relative flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Tipo de meta</p>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              {
                id: 'accumulate',
                label: 'Juntar um total',
                icon: <PiggyBank className="h-3.5 w-3.5" />,
              },
              {
                id: 'monthly',
                label: 'Receita mensal',
                icon: <TrendingUp className="h-3.5 w-3.5" />,
              },
            ]}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">O que calcular</p>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { id: 'estimate_time', label: 'Estimar prazo' },
              { id: 'estimate_investment', label: 'Estimar investimento' },
            ]}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyField
            id="finance-goal"
            label={kind === 'accumulate' ? 'Meta total' : 'Meta mensal'}
            value={goal}
            onChange={setGoal}
            hint={kind === 'accumulate' ? 'Quanto você quer juntar' : 'Receita mensal desejada'}
          />
          <div className="rounded-xl border border-border-soft bg-elevated/40 px-3.5 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
              Ritmo mensal da estimativa
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-accent">
              {formatBrl(paceMonthly)}
            </p>
            <p className="mt-1 text-[11px] text-muted-2">
              {kind === 'accumulate' && monthlyProfitTotal > 0
                ? 'Lucro mensal (receitas − despesas).'
                : 'Receita mensal cadastrada.'}
            </p>
          </div>
          {kind === 'accumulate' ? (
            <div className="rounded-xl border border-border-soft bg-elevated/40 px-3.5 py-3 sm:col-span-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
                Capital investido (cadastros)
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-accent">
                {formatBrl(saved)}
              </p>
            </div>
          ) : null}
          {mode === 'estimate_investment' ? (
            <>
              <Input
                id="finance-months"
                label="Prazo desejado (meses)"
                inputMode="numeric"
                value={months}
                onChange={(event) => setMonths(event.target.value.replace(/\D/g, ''))}
                placeholder="12"
              />
              <Input
                id="finance-return"
                label="Retorno esperado por R$ 1,00"
                inputMode="decimal"
                value={returnPerReal}
                onChange={(event) => setReturnPerReal(event.target.value)}
                placeholder="1,5"
              />
            </>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border-soft bg-elevated/50 px-4 py-4 sm:px-5">
          {!result.ok ? (
            <p className="text-sm text-muted">{result.error}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
                <p className="text-sm leading-relaxed text-text">{result.summary}</p>
              </div>

              {result.mode === 'estimate_time' && !result.alreadyReached ? (
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <Metric label="Ainda falta" value={formatBrl(result.remaining)} money />
                  <Metric label="Prazo estimado" value={`${result.months} meses`} highlight />
                  <Metric
                    label="Leitura"
                    value={
                      result.years > 0
                        ? `${result.years} ano${result.years > 1 ? 's' : ''}${
                            result.monthsRemainder
                              ? ` e ${result.monthsRemainder} ${
                                  result.monthsRemainder > 1 ? 'meses' : 'mês'
                                }`
                              : ''
                          }`
                        : `${result.months} meses`
                    }
                  />
                </div>
              ) : null}

              {result.mode === 'estimate_investment' && !result.alreadyReached ? (
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <Metric label="Precisa gerar / mês" value={formatBrl(result.requiredMonthly)} money />
                  <Metric label="Falta vs. hoje" value={formatBrl(result.monthlyGap)} money />
                  <Metric
                    label="Investimento sugerido"
                    value={formatBrl(result.suggestedInvestment)}
                    money
                    highlight
                  />
                </div>
              ) : null}

              {mode === 'estimate_investment' ? (
                <p className="text-[11px] leading-relaxed text-muted-2">
                  Retorno esperado: ex. 1,5 = cada R$ 1,00 investido tende a gerar R$ 1,50 de receita
                  no prazo.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function GoalEtaBanner({
  kind,
  liveEta,
  paceMonthly,
  usingProfit,
}: {
  kind: RevenueGoalKind
  liveEta: ReturnType<typeof estimateRevenueGoal>
  paceMonthly: number
  usingProfit: boolean
}) {
  if (!liveEta.ok) {
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border-soft bg-elevated/45 px-3.5 py-3">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-2" />
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
            Estimativa
          </p>
          <p className="mt-1 text-sm text-muted">{liveEta.error}</p>
        </div>
      </div>
    )
  }

  if (liveEta.alreadyReached) {
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent-subtle/40 px-3.5 py-3">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
            Estimativa
          </p>
          <p className="mt-1 text-sm font-medium text-accent">Meta já alcançada.</p>
        </div>
      </div>
    )
  }

  if (liveEta.mode !== 'estimate_time') return null

  return (
    <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-accent/20 bg-accent-subtle/35 px-3.5 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
            Estimativa de bater a meta
          </p>
          <p className="mt-1 text-[15px] font-semibold tracking-tight text-text">
            Em cerca de {formatMonthsLabel(liveEta.months)}
          </p>
          <p className="mt-0.5 text-sm text-accent">~ {formatGoalHitDate(liveEta.months)}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
            Ritmo: {formatBrl(paceMonthly)}/mês
            {kind === 'accumulate'
              ? usingProfit
                ? ' (lucro mensal cadastrado)'
                : ' (receita mensal — cadastre gastos para usar o lucro)'
              : ' (receita atual)'}
            . Faltam {formatBrl(liveEta.remaining)}.
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border-soft bg-bg/35 px-3 py-2 text-right">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">Prazo</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-accent">
          {liveEta.months} {liveEta.months === 1 ? 'mês' : 'meses'}
        </p>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  highlight,
  money,
}: {
  label: string
  value: string
  highlight?: boolean
  money?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3.5 py-3',
        highlight ? 'border-accent/25 bg-accent-subtle/40' : 'border-border-soft bg-bg/35',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">{label}</p>
      <p
        className={cn(
          'mt-1.5 font-semibold tabular-nums tracking-tight',
          money ? 'text-[1.05rem] sm:text-[1.15rem]' : 'text-sm',
          highlight ? 'text-accent' : 'text-text',
        )}
      >
        {value}
      </p>
    </div>
  )
}
