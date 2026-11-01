import { describe, expect, it } from 'vitest'
import {
  applyExpenseCapitalMovement,
  goalProgressPercent,
  monthlyProfit,
  sumInvestments,
  sumMonthlyExpenses,
  sumMonthlyRevenues,
  sumOneTimeExpenses,
  type FinanceExpense,
  type FinanceInvestment,
  type FinanceRevenue,
} from './ledger'

function investment(amount: number): FinanceInvestment {
  return {
    id: 'i',
    name: 'X',
    kind: 'banco',
    amount,
    notes: '',
    createdAt: '',
    updatedAt: '',
  }
}

function revenue(amount: number, recurrence: FinanceRevenue['recurrence']): FinanceRevenue {
  return {
    id: 'r',
    name: 'Y',
    source: 'youtube',
    amount,
    recurrence,
    notes: '',
    createdAt: '',
    updatedAt: '',
  }
}

function expense(
  amount: number,
  recurrence: FinanceExpense['recurrence'],
  investmentId: string | null = null,
): FinanceExpense {
  return {
    id: 'e',
    name: 'Z',
    category: 'chatgpt',
    amount,
    recurrence,
    investmentId,
    investmentName: investmentId ? 'Conta' : null,
    notes: '',
    createdAt: '',
    updatedAt: '',
  }
}

describe('finance ledger', () => {
  it('soma investimentos para o progresso da meta', () => {
    expect(sumInvestments([investment(10_000), investment(5_000)])).toBe(15_000)
    expect(goalProgressPercent(150_000, 15_000)).toBe(10)
  })

  it('calcula receitas, despesas e lucro mensal', () => {
    const revenues = [
      revenue(20_000, 'monthly'),
      revenue(3_000, 'monthly'),
      revenue(8_000, 'once'),
    ]
    const expenses = [expense(200, 'monthly'), expense(500, 'once'), expense(800, 'monthly')]
    expect(sumMonthlyRevenues(revenues)).toBe(23_000)
    expect(sumMonthlyExpenses(expenses)).toBe(1_000)
    expect(sumOneTimeExpenses(expenses)).toBe(500)
    expect(monthlyProfit(revenues, expenses)).toBe(22_000)
  })

  it('gastos e receitas não alteram o progresso da meta', () => {
    const invested = sumInvestments([investment(40_000)])
    expect(goalProgressPercent(100_000, invested)).toBe(40)
  })

  it('gasto vinculado debita a conta e atualiza o capital da meta', () => {
    const accounts = [
      { ...investment(8_276), id: 'pj', name: 'CONTA PJ' },
      { ...investment(4_102), id: 'caixa', name: 'caixinha' },
    ]
    const moved = applyExpenseCapitalMovement(accounts, null, {
      amount: 500,
      investmentId: 'pj',
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) throw new Error('esperava ok')
    expect(moved.investments.find((item) => item.id === 'pj')?.amount).toBe(7_776)
    expect(sumInvestments(moved.investments)).toBe(11_878)
  })

  it('recusa débito sem saldo', () => {
    const accounts = [{ ...investment(100), id: 'pj', name: 'CONTA PJ' }]
    const moved = applyExpenseCapitalMovement(accounts, null, {
      amount: 200,
      investmentId: 'pj',
    })
    expect(moved.ok).toBe(false)
  })

  it('ao remover gasto vinculado, devolve o valor à conta', () => {
    const accounts = [{ ...investment(7_776), id: 'pj', name: 'CONTA PJ' }]
    const moved = applyExpenseCapitalMovement(
      accounts,
      { amount: 500, investmentId: 'pj' },
      null,
    )
    expect(moved.ok).toBe(true)
    if (!moved.ok) throw new Error('esperava ok')
    expect(moved.investments[0].amount).toBe(8_276)
  })
})
