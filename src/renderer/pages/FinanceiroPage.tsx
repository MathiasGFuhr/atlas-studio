import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  Building2,
  CircleDollarSign,
  Plus,
  Receipt,
  Scale,
  TrendingUp,
} from 'lucide-react'
import {
  monthlyProfit,
  sumInvestments,
  sumMonthlyExpenses,
  sumMonthlyRevenues,
  type FinanceExpense,
  type FinanceInvestment,
  type FinanceRevenue,
} from '@shared/finance/ledger'
import { formatBrl } from '@shared/finance/revenueGoal'
import heroImage from '../assets/home-hero.jpg'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import {
  FinanceLedgerPanels,
  type FinanceCreateKind,
} from '../components/financeiro/FinanceLedgerPanels'
import {
  RevenueGoalPlanner,
  type RevenueGoalSnapshot,
} from '../components/financeiro/RevenueGoalPlanner'
import { loadFinanceLedger, saveFinanceLedger } from '../lib/financeStore'
import { cn } from '../lib/utils'

const PLANNED_AREAS = [
  {
    icon: Building2,
    title: 'Regime',
    body: 'ME, MEI e os dados da empresa ligados à operação.',
    tone: 'info' as const,
  },
  {
    icon: Scale,
    title: 'Impostos',
    body: 'Pagamentos e prazos. Conformidade legal ainda em estudo.',
    tone: 'muted' as const,
  },
]

const TONE_ICON: Record<(typeof PLANNED_AREAS)[number]['tone'], string> = {
  info: 'border-info/20 bg-info-subtle text-info',
  muted: 'border-border-soft bg-elevated text-muted',
}

export function FinanceiroPage() {
  const initial = loadFinanceLedger()
  const [investments, setInvestments] = useState<FinanceInvestment[]>(() => initial.investments)
  const [revenues, setRevenues] = useState<FinanceRevenue[]>(() => initial.revenues)
  const [expenses, setExpenses] = useState<FinanceExpense[]>(() => initial.expenses)
  const [snapshot, setSnapshot] = useState<RevenueGoalSnapshot | null>(null)
  const [createRequest, setCreateRequest] = useState<FinanceCreateKind | null>(null)

  const investedTotal = useMemo(() => sumInvestments(investments), [investments])
  const monthlyRevenue = useMemo(() => sumMonthlyRevenues(revenues), [revenues])
  const monthlyExpenses = useMemo(() => sumMonthlyExpenses(expenses), [expenses])
  const profit = useMemo(() => monthlyProfit(revenues, expenses), [revenues, expenses])

  const handleSnapshot = useCallback((next: RevenueGoalSnapshot) => {
    setSnapshot(next)
  }, [])

  const clearCreateRequest = useCallback(() => setCreateRequest(null), [])

  function handleInvestmentsChange(next: FinanceInvestment[]) {
    const saved = saveFinanceLedger({ investments: next, revenues, expenses })
    setInvestments(saved.investments)
  }

  function handleRevenuesChange(next: FinanceRevenue[]) {
    const saved = saveFinanceLedger({ investments, revenues: next, expenses })
    setRevenues(saved.revenues)
  }

  function handleExpensesChange(next: FinanceExpense[]) {
    const saved = saveFinanceLedger({ investments, revenues, expenses: next })
    setExpenses(saved.expenses)
  }

  function handleExpenseWithCapitalChange(
    nextExpenses: FinanceExpense[],
    nextInvestments: FinanceInvestment[],
  ) {
    const saved = saveFinanceLedger({
      investments: nextInvestments,
      revenues,
      expenses: nextExpenses,
    })
    setInvestments(saved.investments)
    setExpenses(saved.expenses)
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="relative mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <FinanceHero />

        <Card padding="sm" className="overflow-hidden !p-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceStat
              className="border-b border-border-soft sm:border-r xl:border-b-0"
              icon={<CircleDollarSign className="h-4 w-4 text-accent" />}
              label="Receita / mês"
              value={formatBrl(monthlyRevenue)}
              hint="Todas as fontes"
            />
            <FinanceStat
              className="border-b border-border-soft sm:border-r-0 xl:border-b-0 xl:border-r"
              icon={<Receipt className="h-4 w-4 text-warning" />}
              label="Despesas / mês"
              value={formatBrl(monthlyExpenses)}
              hint="Não afeta a meta"
            />
            <FinanceStat
              className="border-b border-border-soft sm:border-r xl:border-b-0 xl:border-r"
              icon={<Wallet className="h-4 w-4 text-accent" />}
              label="Lucro / mês"
              value={formatBrl(profit)}
              hint="Receitas − despesas"
            />
            <FinanceStat
              icon={<TrendingUp className="h-4 w-4 text-accent" />}
              label="Investido"
              value={formatBrl(investedTotal)}
              hint={
                snapshot?.goalAmount
                  ? `Meta ${formatBrl(snapshot.goalAmount)}`
                  : 'Capital da meta'
              }
            />
          </div>
        </Card>

        <Card padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
              Ações rápidas
            </p>
            <p className="mt-1 text-sm text-muted">
              Cadastre sem rolar até o final da página.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCreateRequest('revenue')}
            >
              Nova receita
            </Button>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCreateRequest('expense')}
            >
              Novo gasto
            </Button>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCreateRequest('investment')}
            >
              Novo investimento
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
          <RevenueGoalPlanner
            investedTotal={investedTotal}
            monthlyRevenueTotal={monthlyRevenue}
            monthlyProfitTotal={profit}
            onSnapshot={handleSnapshot}
          />
          <ModuleRoadmap />
        </div>
        <FinanceLedgerPanels
          investments={investments}
          revenues={revenues}
          expenses={expenses}
          onInvestmentsChange={handleInvestmentsChange}
          onRevenuesChange={handleRevenuesChange}
          onExpensesChange={handleExpensesChange}
          onExpenseWithCapitalChange={handleExpenseWithCapitalChange}
          createRequest={createRequest}
          onCreateRequestHandled={clearCreateRequest}
        />
      </div>
    </div>
  )
}

function FinanceHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border-soft/90 shadow-popover">
      <div className="absolute inset-0" aria-hidden>
        <img src={heroImage} alt="" className="h-full w-full object-cover object-[center_35%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/94 via-bg/78 to-bg/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg/88 via-transparent to-bg/40" />
        <div className="absolute -left-20 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-accent/12 blur-3xl" />
      </div>

      <div className="relative grid min-h-[200px] grid-cols-1 items-end gap-6 px-5 py-6 sm:min-h-[230px] sm:px-8 sm:py-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-2">
            Atlas / Operação
          </p>
          <h1 className="home-greeting text-[2rem] leading-[1.1] text-text sm:text-[2.55rem]">
            Financeiro
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-[15px]">
            Receitas, despesas e lucro do mês. O progresso da meta usa só o capital investido.
          </p>
        </div>

        <div className="justify-self-start rounded-2xl border border-border-soft bg-bg/40 px-4 py-3.5 backdrop-blur-md lg:justify-self-end">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">Foco</p>
          <p className="home-greeting mt-1.5 text-[1.15rem] leading-snug text-text/95 sm:text-[1.3rem]">
            Receita e gasto mostram o lucro. Investimento move a meta.
          </p>
        </div>
      </div>
    </section>
  )
}

function FinanceStat({
  icon,
  label,
  value,
  hint,
  className,
}: {
  icon: ReactNode
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-[100px] min-w-0 items-center gap-4 px-5 py-5', className)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-elevated">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">{label}</p>
        <p className="mt-1.5 truncate text-[22px] font-semibold tabular-nums tracking-tight text-text">
          {value}
        </p>
        {hint ? <p className="mt-1 truncate text-xs leading-snug text-muted-2">{hint}</p> : null}
      </div>
    </div>
  )
}

function ModuleRoadmap() {
  return (
    <Card padding="lg" className="flex h-full flex-col">
      <div className="mb-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">Roadmap</p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Ainda por vir</h2>
        <p className="mt-1 text-sm text-muted">Regime ME/MEI e impostos.</p>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {PLANNED_AREAS.map((area, index) => (
          <div
            key={area.title}
            className="flex items-start gap-3 rounded-2xl border border-border-soft bg-bg/25 px-3.5 py-3"
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                TONE_ICON[area.tone],
              )}
            >
              <area.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-text">{area.title}</p>
                <span className="text-[10px] tabular-nums text-muted-2">0{index + 1}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{area.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
