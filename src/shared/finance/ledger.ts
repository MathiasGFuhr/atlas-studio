export type FinanceInvestmentKind = 'banco' | 'acoes' | 'fundo' | 'cripto' | 'outro'

export type FinanceRevenueSource =
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'distribuicao'
  | 'produtos'
  | 'patrocinio'
  | 'outro'

export type FinanceExpenseCategory =
  | 'chatgpt'
  | 'comfy'
  | 'proxy'
  | 'ads'
  | 'ferramentas'
  | 'equipe'
  | 'infra'
  | 'impostos'
  | 'produtos'
  | 'outro'

export type FinanceRecurrence = 'once' | 'monthly'

export type FinanceInvestment = {
  id: string
  name: string
  kind: FinanceInvestmentKind
  amount: number
  notes: string
  createdAt: string
  updatedAt: string
}

export type FinanceRevenue = {
  id: string
  name: string
  source: FinanceRevenueSource
  amount: number
  recurrence: FinanceRecurrence
  notes: string
  createdAt: string
  updatedAt: string
}

export type FinanceExpense = {
  id: string
  name: string
  category: FinanceExpenseCategory
  amount: number
  recurrence: FinanceRecurrence
  /** Conta/investimento de onde o dinheiro saiu. Afeta o capital da meta. */
  investmentId: string | null
  investmentName: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type FinanceInvestmentInput = {
  name: string
  kind: FinanceInvestmentKind
  amount: number
  notes?: string
}

export type FinanceRevenueInput = {
  name: string
  source: FinanceRevenueSource
  amount: number
  recurrence: FinanceRecurrence
  notes?: string
}

export type FinanceExpenseInput = {
  name: string
  category: FinanceExpenseCategory
  amount: number
  recurrence: FinanceRecurrence
  investmentId?: string | null
  notes?: string
}

/** @deprecated use FinanceRecurrence */
export type FinanceExpenseRecurrence = FinanceRecurrence

export const FINANCE_INVESTMENT_KIND_LABEL: Record<FinanceInvestmentKind, string> = {
  banco: 'Banco / poupança',
  acoes: 'Ações',
  fundo: 'Fundo',
  cripto: 'Cripto',
  outro: 'Outro',
}

export const FINANCE_REVENUE_SOURCE_LABEL: Record<FinanceRevenueSource, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  distribuicao: 'Distribuição de músicas',
  produtos: 'Venda de produtos',
  patrocinio: 'Patrocínio',
  outro: 'Outro',
}

export const FINANCE_EXPENSE_CATEGORY_LABEL: Record<FinanceExpenseCategory, string> = {
  chatgpt: 'ChatGPT',
  comfy: 'Comfy',
  proxy: 'Proxy',
  ads: 'Anúncios',
  ferramentas: 'Ferramentas',
  equipe: 'Equipe',
  infra: 'Infra / servidor',
  impostos: 'Impostos',
  produtos: 'Custo de produtos',
  outro: 'Outro',
}

export const FINANCE_RECURRENCE_LABEL: Record<FinanceRecurrence, string> = {
  once: 'Único',
  monthly: 'Mensal',
}

export const FINANCE_EXPENSE_RECURRENCE_LABEL = FINANCE_RECURRENCE_LABEL

export const FINANCE_INVESTMENT_KINDS = Object.keys(
  FINANCE_INVESTMENT_KIND_LABEL,
) as FinanceInvestmentKind[]

export const FINANCE_REVENUE_SOURCES = Object.keys(
  FINANCE_REVENUE_SOURCE_LABEL,
) as FinanceRevenueSource[]

export const FINANCE_EXPENSE_CATEGORIES = Object.keys(
  FINANCE_EXPENSE_CATEGORY_LABEL,
) as FinanceExpenseCategory[]

/** Soma do capital investido — alimenta o progresso da meta. */
export function sumInvestments(items: FinanceInvestment[]): number {
  return roundMoney(items.reduce((total, item) => total + positive(item.amount), 0))
}

export function sumMonthlyRevenues(items: FinanceRevenue[]): number {
  return roundMoney(
    items
      .filter((item) => item.recurrence === 'monthly')
      .reduce((total, item) => total + positive(item.amount), 0),
  )
}

export function sumOneTimeRevenues(items: FinanceRevenue[]): number {
  return roundMoney(
    items
      .filter((item) => item.recurrence === 'once')
      .reduce((total, item) => total + positive(item.amount), 0),
  )
}

export function sumOneTimeExpenses(items: FinanceExpense[]): number {
  return roundMoney(
    items
      .filter((item) => item.recurrence === 'once')
      .reduce((total, item) => total + positive(item.amount), 0),
  )
}

/** Gastos mensais — não entram no progresso da meta. */
export function sumMonthlyExpenses(items: FinanceExpense[]): number {
  return roundMoney(
    items
      .filter((item) => item.recurrence === 'monthly')
      .reduce((total, item) => total + positive(item.amount), 0),
  )
}

/** Lucro mensal = receitas mensais − despesas mensais. */
export function monthlyProfit(revenues: FinanceRevenue[], expenses: FinanceExpense[]): number {
  return roundMoney(sumMonthlyRevenues(revenues) - sumMonthlyExpenses(expenses))
}

export function goalProgressPercent(goalAmount: number, investedTotal: number): number {
  if (goalAmount <= 0) return 0
  return Math.min(100, Math.max(0, (positive(investedTotal) / goalAmount) * 100))
}

/**
 * Ajusta o capital investido quando um gasto entra, muda ou sai.
 * - Remove vínculo antigo: devolve o valor à conta
 * - Aplica vínculo novo: debita o valor da conta
 */
export function applyExpenseCapitalMovement(
  investments: FinanceInvestment[],
  previous: Pick<FinanceExpense, 'amount' | 'investmentId'> | null,
  next: Pick<FinanceExpense, 'amount' | 'investmentId'> | null,
): { ok: true; investments: FinanceInvestment[] } | { ok: false; error: string } {
  const stamp = new Date().toISOString()
  let nextInvestments = investments.map((item) => ({ ...item }))

  function credit(id: string | null | undefined, amount: number) {
    if (!id || amount <= 0) return
    nextInvestments = nextInvestments.map((item) =>
      item.id === id
        ? {
            ...item,
            amount: roundMoney(item.amount + amount),
            updatedAt: stamp,
          }
        : item,
    )
  }

  function debit(id: string | null | undefined, amount: number): string | null {
    if (!id || amount <= 0) return null
    const target = nextInvestments.find((item) => item.id === id)
    if (!target) return 'Conta de origem não encontrada nos investimentos.'
    if (target.amount + 1e-9 < amount) {
      return `Saldo insuficiente em "${target.name}". Disponível: ${target.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
    }
    nextInvestments = nextInvestments.map((item) =>
      item.id === id
        ? {
            ...item,
            amount: roundMoney(item.amount - amount),
            updatedAt: stamp,
          }
        : item,
    )
    return null
  }

  // 1) Estorna o gasto anterior (se havia vínculo)
  if (previous?.investmentId) {
    credit(previous.investmentId, positive(previous.amount))
  }

  // 2) Debita o gasto novo (se houver vínculo)
  if (next?.investmentId) {
    const error = debit(next.investmentId, positive(next.amount))
    if (error) return { ok: false, error }
  }

  return { ok: true, investments: nextInvestments }
}

export function resolveInvestmentName(
  investments: FinanceInvestment[],
  investmentId: string | null | undefined,
): string | null {
  if (!investmentId) return null
  return investments.find((item) => item.id === investmentId)?.name ?? null
}

function positive(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return value
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
