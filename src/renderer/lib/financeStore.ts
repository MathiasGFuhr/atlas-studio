import type {
  FinanceExpense,
  FinanceInvestment,
  FinanceRevenue,
} from '@shared/finance/ledger'

const STORAGE_KEY = 'atlas.finance.ledger.v2'
const LEGACY_KEY = 'atlas.finance.ledger.v1'

export type FinanceLedgerState = {
  investments: FinanceInvestment[]
  revenues: FinanceRevenue[]
  expenses: FinanceExpense[]
}

const EMPTY: FinanceLedgerState = {
  investments: [],
  revenues: [],
  expenses: [],
}

function normalizeExpense(item: FinanceExpense): FinanceExpense {
  return {
    ...item,
    investmentId: item.investmentId ?? null,
    investmentName: item.investmentName ?? null,
  }
}

function readState(): FinanceLedgerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<FinanceLedgerState>
    const state: FinanceLedgerState = {
      investments: Array.isArray(parsed.investments) ? parsed.investments : [],
      revenues: Array.isArray(parsed.revenues) ? parsed.revenues : [],
      expenses: Array.isArray(parsed.expenses)
        ? parsed.expenses.map((item) => normalizeExpense(item as FinanceExpense))
        : [],
    }
    // Migra v1 → v2 na primeira leitura.
    if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(LEGACY_KEY)) {
      writeState(state)
    }
    return state
  } catch {
    return EMPTY
  }
}

function writeState(state: FinanceLedgerState): FinanceLedgerState {
  const next = {
    investments: state.investments,
    revenues: state.revenues,
    expenses: state.expenses,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function loadFinanceLedger(): FinanceLedgerState {
  return readState()
}

export function saveFinanceLedger(state: FinanceLedgerState): FinanceLedgerState {
  return writeState(state)
}
