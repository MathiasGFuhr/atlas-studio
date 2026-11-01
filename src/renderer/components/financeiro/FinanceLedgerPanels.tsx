import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleDollarSign, Pencil, Plus, Receipt, Trash2, TrendingUp } from 'lucide-react'
import {
  FINANCE_EXPENSE_CATEGORIES,
  FINANCE_EXPENSE_CATEGORY_LABEL,
  FINANCE_INVESTMENT_KIND_LABEL,
  FINANCE_INVESTMENT_KINDS,
  FINANCE_RECURRENCE_LABEL,
  FINANCE_REVENUE_SOURCE_LABEL,
  FINANCE_REVENUE_SOURCES,
  applyExpenseCapitalMovement,
  monthlyProfit,
  resolveInvestmentName,
  sumInvestments,
  sumMonthlyExpenses,
  sumMonthlyRevenues,
  sumOneTimeExpenses,
  sumOneTimeRevenues,
  type FinanceExpense,
  type FinanceExpenseCategory,
  type FinanceInvestment,
  type FinanceInvestmentKind,
  type FinanceRecurrence,
  type FinanceRevenue,
  type FinanceRevenueSource,
} from '@shared/finance/ledger'
import { formatBrl } from '@shared/finance/revenueGoal'
import { Button } from '../Button'
import { Card } from '../Card'
import { Input } from '../Input'
import { ConfirmDialog, Modal } from '../Modal'
import { Select } from '../Select'
import { MoneyField } from './MoneyField'
import { cn } from '../../lib/utils'

type InvestmentForm = {
  name: string
  kind: FinanceInvestmentKind
  amount: number
  notes: string
}

type RevenueForm = {
  name: string
  source: FinanceRevenueSource
  amount: number
  recurrence: FinanceRecurrence
  notes: string
}

type ExpenseForm = {
  name: string
  category: FinanceExpenseCategory
  amount: number
  recurrence: FinanceRecurrence
  /** '' = sem vínculo com capital */
  investmentId: string
  notes: string
}

const EMPTY_INVESTMENT: InvestmentForm = {
  name: '',
  kind: 'banco',
  amount: 0,
  notes: '',
}

const EMPTY_REVENUE: RevenueForm = {
  name: '',
  source: 'youtube',
  amount: 0,
  recurrence: 'monthly',
  notes: '',
}

const EMPTY_EXPENSE: ExpenseForm = {
  name: '',
  category: 'ferramentas',
  amount: 0,
  recurrence: 'monthly',
  investmentId: '',
  notes: '',
}

function newId(): string {
  return crypto.randomUUID()
}

export type FinanceCreateKind = 'revenue' | 'expense' | 'investment'

export function FinanceLedgerPanels({
  investments,
  revenues,
  expenses,
  onInvestmentsChange,
  onRevenuesChange,
  onExpensesChange,
  onExpenseWithCapitalChange,
  createRequest = null,
  onCreateRequestHandled,
}: {
  investments: FinanceInvestment[]
  revenues: FinanceRevenue[]
  expenses: FinanceExpense[]
  onInvestmentsChange: (next: FinanceInvestment[]) => void
  onRevenuesChange: (next: FinanceRevenue[]) => void
  onExpensesChange: (next: FinanceExpense[]) => void
  onExpenseWithCapitalChange: (
    nextExpenses: FinanceExpense[],
    nextInvestments: FinanceInvestment[],
  ) => void
  createRequest?: FinanceCreateKind | null
  onCreateRequestHandled?: () => void
}) {
  const investedTotal = useMemo(() => sumInvestments(investments), [investments])
  const monthlyRevenue = useMemo(() => sumMonthlyRevenues(revenues), [revenues])
  const oneTimeRevenue = useMemo(() => sumOneTimeRevenues(revenues), [revenues])
  const monthlyExpenses = useMemo(() => sumMonthlyExpenses(expenses), [expenses])
  const oneTimeExpenses = useMemo(() => sumOneTimeExpenses(expenses), [expenses])
  const profit = useMemo(() => monthlyProfit(revenues, expenses), [revenues, expenses])

  const [investmentModal, setInvestmentModal] = useState(false)
  const [revenueModal, setRevenueModal] = useState(false)
  const [expenseModal, setExpenseModal] = useState(false)
  const [editingInvestment, setEditingInvestment] = useState<FinanceInvestment | null>(null)
  const [editingRevenue, setEditingRevenue] = useState<FinanceRevenue | null>(null)
  const [editingExpense, setEditingExpense] = useState<FinanceExpense | null>(null)
  const [investmentForm, setInvestmentForm] = useState<InvestmentForm>(EMPTY_INVESTMENT)
  const [revenueForm, setRevenueForm] = useState<RevenueForm>(EMPTY_REVENUE)
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(EMPTY_EXPENSE)
  const [deletingInvestment, setDeletingInvestment] = useState<FinanceInvestment | null>(null)
  const [deletingRevenue, setDeletingRevenue] = useState<FinanceRevenue | null>(null)
  const [deletingExpense, setDeletingExpense] = useState<FinanceExpense | null>(null)
  const [expenseError, setExpenseError] = useState<string | null>(null)

  const investmentOptions = useMemo(
    () => [
      { value: '', label: 'Sem vínculo (só no resultado do mês)' },
      ...investments.map((item) => ({
        value: item.id,
        label: `${item.name} · ${formatBrl(item.amount)}`,
      })),
    ],
    [investments],
  )

  function openCreateInvestment() {
    setEditingInvestment(null)
    setInvestmentForm(EMPTY_INVESTMENT)
    setInvestmentModal(true)
  }

  function openEditInvestment(item: FinanceInvestment) {
    setEditingInvestment(item)
    setInvestmentForm({
      name: item.name,
      kind: item.kind,
      amount: item.amount,
      notes: item.notes,
    })
    setInvestmentModal(true)
  }

  function openCreateRevenue() {
    setEditingRevenue(null)
    setRevenueForm(EMPTY_REVENUE)
    setRevenueModal(true)
  }

  function openEditRevenue(item: FinanceRevenue) {
    setEditingRevenue(item)
    setRevenueForm({
      name: item.name,
      source: item.source,
      amount: item.amount,
      recurrence: item.recurrence,
      notes: item.notes,
    })
    setRevenueModal(true)
  }

  function openCreateExpense() {
    setEditingExpense(null)
    setExpenseForm(EMPTY_EXPENSE)
    setExpenseError(null)
    setExpenseModal(true)
  }

  useEffect(() => {
    if (!createRequest) return
    if (createRequest === 'revenue') openCreateRevenue()
    if (createRequest === 'expense') openCreateExpense()
    if (createRequest === 'investment') openCreateInvestment()
    // Atrasa o clear para o Strict Mode remount ainda ver o pedido e reabrir o modal.
    const timer = window.setTimeout(() => onCreateRequestHandled?.(), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequest])

  function openEditExpense(item: FinanceExpense) {
    setEditingExpense(item)
    setExpenseForm({
      name: item.name,
      category: item.category,
      amount: item.amount,
      recurrence: item.recurrence,
      investmentId: item.investmentId ?? '',
      notes: item.notes,
    })
    setExpenseError(null)
    setExpenseModal(true)
  }

  function saveInvestment() {
    const name = investmentForm.name.trim()
    if (!name || investmentForm.amount <= 0) return
    const stamp = new Date().toISOString()
    if (editingInvestment) {
      onInvestmentsChange(
        investments.map((item) =>
          item.id === editingInvestment.id
            ? {
                ...item,
                name,
                kind: investmentForm.kind,
                amount: investmentForm.amount,
                notes: investmentForm.notes.trim(),
                updatedAt: stamp,
              }
            : item,
        ),
      )
    } else {
      onInvestmentsChange([
        {
          id: newId(),
          name,
          kind: investmentForm.kind,
          amount: investmentForm.amount,
          notes: investmentForm.notes.trim(),
          createdAt: stamp,
          updatedAt: stamp,
        },
        ...investments,
      ])
    }
    setInvestmentModal(false)
  }

  function saveRevenue() {
    const name = revenueForm.name.trim()
    if (!name || revenueForm.amount <= 0) return
    const stamp = new Date().toISOString()
    if (editingRevenue) {
      onRevenuesChange(
        revenues.map((item) =>
          item.id === editingRevenue.id
            ? {
                ...item,
                name,
                source: revenueForm.source,
                amount: revenueForm.amount,
                recurrence: revenueForm.recurrence,
                notes: revenueForm.notes.trim(),
                updatedAt: stamp,
              }
            : item,
        ),
      )
    } else {
      onRevenuesChange([
        {
          id: newId(),
          name,
          source: revenueForm.source,
          amount: revenueForm.amount,
          recurrence: revenueForm.recurrence,
          notes: revenueForm.notes.trim(),
          createdAt: stamp,
          updatedAt: stamp,
        },
        ...revenues,
      ])
    }
    setRevenueModal(false)
  }

  function saveExpense() {
    const name = expenseForm.name.trim()
    if (!name || expenseForm.amount <= 0) return
    const stamp = new Date().toISOString()
    const investmentId = expenseForm.investmentId || null
    const investmentName = resolveInvestmentName(investments, investmentId)

    const nextExpense: FinanceExpense = editingExpense
      ? {
          ...editingExpense,
          name,
          category: expenseForm.category,
          amount: expenseForm.amount,
          recurrence: expenseForm.recurrence,
          investmentId,
          investmentName,
          notes: expenseForm.notes.trim(),
          updatedAt: stamp,
        }
      : {
          id: newId(),
          name,
          category: expenseForm.category,
          amount: expenseForm.amount,
          recurrence: expenseForm.recurrence,
          investmentId,
          investmentName,
          notes: expenseForm.notes.trim(),
          createdAt: stamp,
          updatedAt: stamp,
        }

    const moved = applyExpenseCapitalMovement(
      investments,
      editingExpense
        ? { amount: editingExpense.amount, investmentId: editingExpense.investmentId }
        : null,
      { amount: nextExpense.amount, investmentId: nextExpense.investmentId },
    )

    if (!moved.ok) {
      setExpenseError(moved.error)
      return
    }

    const nextExpenses = editingExpense
      ? expenses.map((item) => (item.id === editingExpense.id ? nextExpense : item))
      : [nextExpense, ...expenses]

    if (investmentId || editingExpense?.investmentId) {
      onExpenseWithCapitalChange(nextExpenses, moved.investments)
    } else {
      onExpensesChange(nextExpenses)
    }
    setExpenseError(null)
    setExpenseModal(false)
  }

  return (
    <>
      <Card padding="lg" className="overflow-hidden">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
              Resultado do mês
            </p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">
              Receitas − despesas
            </h2>
          </div>
          <div
            className={cn(
              'rounded-xl border px-4 py-2.5 text-right',
              profit >= 0
                ? 'border-accent/25 bg-accent-subtle/45'
                : 'border-danger/25 bg-danger-subtle/50',
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
              Lucro mensal
            </p>
            <p
              className={cn(
                'mt-0.5 text-xl font-semibold tabular-nums',
                profit >= 0 ? 'text-accent' : 'text-danger',
              )}
            >
              {formatBrl(profit)}
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <MiniStat label="Receitas / mês" value={formatBrl(monthlyRevenue)} tone="accent" />
          <MiniStat label="Despesas / mês" value={formatBrl(monthlyExpenses)} tone="warning" />
          <MiniStat
            label="Pontuais (rec + desp)"
            value={formatBrl(oneTimeRevenue + oneTimeExpenses)}
            tone="muted"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <LedgerCard
          kicker="Entradas"
          title="Receitas"
          description="YouTube, Facebook, distribuição, produtos e qualquer outra fonte."
          icon={<CircleDollarSign className="h-4 w-4" />}
          iconTone="accent"
          totalLabel="Mensal"
          total={formatBrl(monthlyRevenue)}
          secondaryLabel="Pontuais"
          secondary={formatBrl(oneTimeRevenue)}
          onAdd={openCreateRevenue}
          emptyTitle="Nenhuma receita"
          emptyBody="Cadastre o que entra de cada fonte."
          emptyAction="Cadastrar receita"
        >
          {revenues.map((item) => (
            <LedgerRow
              key={item.id}
              title={item.name}
              subtitle={`${FINANCE_REVENUE_SOURCE_LABEL[item.source]} · ${FINANCE_RECURRENCE_LABEL[item.recurrence]}`}
              amount={formatBrl(item.amount)}
              tone="accent"
              onEdit={() => openEditRevenue(item)}
              onDelete={() => setDeletingRevenue(item)}
            />
          ))}
        </LedgerCard>

        <LedgerCard
          kicker="Saídas"
          title="Gastos"
          description="Ferramentas, ads, equipe, produtos — tudo que sai no mês."
          icon={<Receipt className="h-4 w-4" />}
          iconTone="warning"
          totalLabel="Mensal"
          total={formatBrl(monthlyExpenses)}
          secondaryLabel="Pontuais"
          secondary={formatBrl(oneTimeExpenses)}
          onAdd={openCreateExpense}
          emptyTitle="Nenhum gasto"
          emptyBody="Registre os custos da operação."
          emptyAction="Cadastrar gasto"
        >
          {expenses.map((item) => (
            <LedgerRow
              key={item.id}
              title={item.name}
              subtitle={[
                FINANCE_EXPENSE_CATEGORY_LABEL[item.category],
                FINANCE_RECURRENCE_LABEL[item.recurrence],
                item.investmentName ? `saiu de ${item.investmentName}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              amount={formatBrl(item.amount)}
              tone="warning"
              onEdit={() => openEditExpense(item)}
              onDelete={() => setDeletingExpense(item)}
            />
          ))}
        </LedgerCard>

        <LedgerCard
          kicker="Capital"
          title="Investimentos"
          description="Banco, ações e ativos. Só isso alimenta o progresso da meta."
          icon={<TrendingUp className="h-4 w-4" />}
          iconTone="accent"
          totalLabel="Total investido"
          total={formatBrl(investedTotal)}
          onAdd={openCreateInvestment}
          emptyTitle="Nenhum investimento"
          emptyBody="Cadastre o capital aplicado."
          emptyAction="Cadastrar investimento"
        >
          {investments.map((item) => (
            <LedgerRow
              key={item.id}
              title={item.name}
              subtitle={FINANCE_INVESTMENT_KIND_LABEL[item.kind]}
              amount={formatBrl(item.amount)}
              tone="accent"
              onEdit={() => openEditInvestment(item)}
              onDelete={() => setDeletingInvestment(item)}
            />
          ))}
        </LedgerCard>
      </div>

      <Modal
        open={revenueModal}
        title={editingRevenue ? 'Editar receita' : 'Nova receita'}
        onClose={() => setRevenueModal(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevenueModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveRevenue}
              disabled={!revenueForm.name.trim() || revenueForm.amount <= 0}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            id="rev-name"
            label="Nome"
            value={revenueForm.name}
            onChange={(event) =>
              setRevenueForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Ex.: AdSense canal principal, DistroKid..."
          />
          <Select
            id="rev-source"
            label="Fonte"
            value={revenueForm.source}
            onChange={(event) =>
              setRevenueForm((current) => ({
                ...current,
                source: event.target.value as FinanceRevenueSource,
              }))
            }
            options={FINANCE_REVENUE_SOURCES.map((source) => ({
              value: source,
              label: FINANCE_REVENUE_SOURCE_LABEL[source],
            }))}
          />
          <Select
            id="rev-recurrence"
            label="Recorrência"
            value={revenueForm.recurrence}
            onChange={(event) =>
              setRevenueForm((current) => ({
                ...current,
                recurrence: event.target.value as FinanceRecurrence,
              }))
            }
            options={[
              { value: 'monthly', label: 'Mensal' },
              { value: 'once', label: 'Único' },
            ]}
          />
          <MoneyField
            id="rev-amount"
            label="Valor"
            value={revenueForm.amount}
            onChange={(amount) => setRevenueForm((current) => ({ ...current, amount }))}
            hint="Entra no lucro do mês se for mensal"
          />
          <Input
            id="rev-notes"
            label="Observação (opcional)"
            value={revenueForm.notes}
            onChange={(event) =>
              setRevenueForm((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </div>
      </Modal>

      <Modal
        open={expenseModal}
        title={editingExpense ? 'Editar gasto' : 'Novo gasto'}
        onClose={() => setExpenseModal(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExpenseModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveExpense}
              disabled={!expenseForm.name.trim() || expenseForm.amount <= 0}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            id="exp-name"
            label="Nome"
            value={expenseForm.name}
            onChange={(event) =>
              setExpenseForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Ex.: ChatGPT Plus, frete, anúncio..."
          />
          <Select
            id="exp-category"
            label="Finalidade"
            value={expenseForm.category}
            onChange={(event) =>
              setExpenseForm((current) => ({
                ...current,
                category: event.target.value as FinanceExpenseCategory,
              }))
            }
            options={FINANCE_EXPENSE_CATEGORIES.map((category) => ({
              value: category,
              label: FINANCE_EXPENSE_CATEGORY_LABEL[category],
            }))}
          />
          <Select
            id="exp-from"
            label="Saiu de qual conta?"
            value={expenseForm.investmentId}
            onChange={(event) => {
              setExpenseError(null)
              setExpenseForm((current) => ({
                ...current,
                investmentId: event.target.value,
              }))
            }}
            options={investmentOptions}
          />
          <Select
            id="exp-recurrence"
            label="Recorrência"
            value={expenseForm.recurrence}
            onChange={(event) =>
              setExpenseForm((current) => ({
                ...current,
                recurrence: event.target.value as FinanceRecurrence,
              }))
            }
            options={[
              { value: 'monthly', label: 'Mensal' },
              { value: 'once', label: 'Único' },
            ]}
          />
          <MoneyField
            id="exp-amount"
            label="Valor"
            value={expenseForm.amount}
            onChange={(amount) => {
              setExpenseError(null)
              setExpenseForm((current) => ({ ...current, amount }))
            }}
            hint={
              expenseForm.investmentId
                ? 'Debita essa conta e atualiza o progresso da meta'
                : 'Sem vínculo: só entra no resultado do mês'
            }
          />
          <Input
            id="exp-notes"
            label="Observação (opcional)"
            value={expenseForm.notes}
            onChange={(event) =>
              setExpenseForm((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="Detalhe da finalidade, se precisar"
          />
          {expenseError ? (
            <p className="rounded-xl border border-danger/25 bg-danger-subtle/50 px-3 py-2 text-sm text-danger">
              {expenseError}
            </p>
          ) : null}
          {investments.length === 0 ? (
            <p className="text-xs text-muted-2">
              Cadastre um investimento (ex.: Conta PJ) para poder vincular a origem do gasto.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={investmentModal}
        title={editingInvestment ? 'Editar investimento' : 'Novo investimento'}
        onClose={() => setInvestmentModal(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInvestmentModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveInvestment}
              disabled={!investmentForm.name.trim() || investmentForm.amount <= 0}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            id="inv-name"
            label="Nome"
            value={investmentForm.name}
            onChange={(event) =>
              setInvestmentForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Ex.: Tesouro Selic, conta XP..."
          />
          <Select
            id="inv-kind"
            label="Tipo"
            value={investmentForm.kind}
            onChange={(event) =>
              setInvestmentForm((current) => ({
                ...current,
                kind: event.target.value as FinanceInvestmentKind,
              }))
            }
            options={FINANCE_INVESTMENT_KINDS.map((kind) => ({
              value: kind,
              label: FINANCE_INVESTMENT_KIND_LABEL[kind],
            }))}
          />
          <MoneyField
            id="inv-amount"
            label="Valor investido"
            value={investmentForm.amount}
            onChange={(amount) => setInvestmentForm((current) => ({ ...current, amount }))}
            hint="Entra no progresso da meta"
          />
          <Input
            id="inv-notes"
            label="Observação (opcional)"
            value={investmentForm.notes}
            onChange={(event) =>
              setInvestmentForm((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingRevenue)}
        title="Remover receita"
        message={`Remover "${deletingRevenue?.name}"?`}
        confirmLabel="Remover"
        onClose={() => setDeletingRevenue(null)}
        onConfirm={() => {
          if (!deletingRevenue) return
          onRevenuesChange(revenues.filter((item) => item.id !== deletingRevenue.id))
          setDeletingRevenue(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        title="Remover gasto"
        message={
          deletingExpense?.investmentId
            ? `Remover "${deletingExpense.name}"? O valor volta para ${deletingExpense.investmentName ?? 'a conta de origem'} e o progresso da meta é atualizado.`
            : `Remover "${deletingExpense?.name}"?`
        }
        confirmLabel="Remover"
        onClose={() => setDeletingExpense(null)}
        onConfirm={() => {
          if (!deletingExpense) return
          const nextExpenses = expenses.filter((item) => item.id !== deletingExpense.id)
          if (deletingExpense.investmentId) {
            const moved = applyExpenseCapitalMovement(
              investments,
              {
                amount: deletingExpense.amount,
                investmentId: deletingExpense.investmentId,
              },
              null,
            )
            if (moved.ok) {
              onExpenseWithCapitalChange(nextExpenses, moved.investments)
            } else {
              onExpensesChange(nextExpenses)
            }
          } else {
            onExpensesChange(nextExpenses)
          }
          setDeletingExpense(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingInvestment)}
        title="Remover investimento"
        message={`Remover "${deletingInvestment?.name}"? O progresso da meta será atualizado.`}
        confirmLabel="Remover"
        onClose={() => setDeletingInvestment(null)}
        onConfirm={() => {
          if (!deletingInvestment) return
          const nextInvestments = investments.filter((item) => item.id !== deletingInvestment.id)
          const linked = expenses.some((item) => item.investmentId === deletingInvestment.id)
          if (linked) {
            const nextExpenses = expenses.map((item) =>
              item.investmentId === deletingInvestment.id
                ? { ...item, investmentId: null, investmentName: null }
                : item,
            )
            onExpenseWithCapitalChange(nextExpenses, nextInvestments)
          } else {
            onInvestmentsChange(nextInvestments)
          }
          setDeletingInvestment(null)
        }}
      />
    </>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'accent' | 'warning' | 'muted'
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-bg/30 px-3.5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          tone === 'accent' && 'text-accent',
          tone === 'warning' && 'text-warning',
          tone === 'muted' && 'text-text',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function LedgerCard({
  kicker,
  title,
  description,
  icon,
  iconTone,
  totalLabel,
  total,
  secondaryLabel,
  secondary,
  onAdd,
  emptyTitle,
  emptyBody,
  emptyAction,
  children,
}: {
  kicker: string
  title: string
  description: string
  icon: ReactNode
  iconTone: 'accent' | 'warning'
  totalLabel: string
  total: string
  secondaryLabel?: string
  secondary?: string
  onAdd: () => void
  emptyTitle: string
  emptyBody: string
  emptyAction: string
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children : [children]
  const hasItems = items.filter(Boolean).length > 0

  return (
    <Card padding="lg" className="flex min-h-[360px] flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-xl border',
                iconTone === 'accent'
                  ? 'border-accent/20 bg-accent-subtle text-accent'
                  : 'border-warning/20 bg-warning-subtle text-warning',
              )}
            >
              {icon}
            </span>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
                {kicker}
              </p>
              <h2 className="text-[17px] font-semibold tracking-tight text-text">{title}</h2>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{description}</p>
        </div>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
          Novo
        </Button>
      </div>

      {secondaryLabel && secondary != null ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-border-soft bg-bg/30 px-3.5 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
              {totalLabel}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-text">{total}</p>
          </div>
          <div className="rounded-2xl border border-border-soft bg-bg/30 px-3.5 py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
              {secondaryLabel}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-text">{secondary}</p>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-accent/20 bg-accent-subtle/35 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-2">
            {totalLabel}
          </p>
          <p className="mt-1 text-[1.35rem] font-semibold tabular-nums tracking-tight text-accent">
            {total}
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {!hasItems ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border-soft px-4 py-8 text-center">
            <p className="text-sm font-medium text-text">{emptyTitle}</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{emptyBody}</p>
            <Button
              className="mt-4"
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={onAdd}
            >
              {emptyAction}
            </Button>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}

function LedgerRow({
  title,
  subtitle,
  amount,
  tone,
  onEdit,
  onDelete,
}: {
  title: string
  subtitle: string
  amount: string
  tone: 'accent' | 'warning'
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-soft bg-bg/25 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
      </div>
      <p
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          tone === 'accent' ? 'text-accent' : 'text-warning',
        )}
      >
        {amount}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Editar"
          onClick={onEdit}
          className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-text"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Remover"
          onClick={onDelete}
          className="rounded-lg p-1.5 text-muted hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
