import { describe, expect, it } from 'vitest'
import {
  estimateRevenueGoal,
  formatBrl,
  formatBrlInteger,
  formatGoalHitDate,
  formatMonthsLabel,
  parseBrlDigits,
} from './revenueGoal'

describe('estimateRevenueGoal', () => {
  it('estima prazo para acumular a meta com a receita atual', () => {
    const result = estimateRevenueGoal({
      kind: 'accumulate',
      mode: 'estimate_time',
      goalAmount: 150_000,
      currentMonthlyRevenue: 10_000,
      alreadySaved: 0,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.mode !== 'estimate_time') throw new Error('modo inesperado')
    expect(result.months).toBe(15)
    expect(result.summary).toContain('1 ano e 3 meses')
  })

  it('estima quanto precisa gerar e investir no prazo desejado', () => {
    const result = estimateRevenueGoal({
      kind: 'accumulate',
      mode: 'estimate_investment',
      goalAmount: 150_000,
      currentMonthlyRevenue: 5_000,
      targetMonths: 10,
      expectedReturnPerReal: 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.mode !== 'estimate_investment') throw new Error('modo inesperado')
    expect(result.requiredMonthly).toBe(15_000)
    expect(result.monthlyGap).toBe(10_000)
    expect(result.suggestedInvestment).toBe(50_000)
  })

  it('marca meta acumulada já atingida', () => {
    const result = estimateRevenueGoal({
      kind: 'accumulate',
      mode: 'estimate_time',
      goalAmount: 50_000,
      currentMonthlyRevenue: 1_000,
      alreadySaved: 60_000,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('esperava ok')
    expect(result.alreadyReached).toBe(true)
  })

  it('estima gap de meta mensal e investimento no prazo', () => {
    const result = estimateRevenueGoal({
      kind: 'monthly',
      mode: 'estimate_investment',
      goalAmount: 150_000,
      currentMonthlyRevenue: 40_000,
      targetMonths: 6,
      expectedReturnPerReal: 1,
    })
    expect(result.ok).toBe(true)
    if (!result.ok || result.mode !== 'estimate_investment') throw new Error('modo inesperado')
    expect(result.monthlyGap).toBe(110_000)
    expect(result.suggestedInvestment).toBe(660_000)
  })

  it('recusa meta vazia', () => {
    const result = estimateRevenueGoal({
      kind: 'accumulate',
      mode: 'estimate_time',
      goalAmount: 0,
      currentMonthlyRevenue: 1000,
    })
    expect(result.ok).toBe(false)
  })
})

describe('formatBrl', () => {
  it('formata em real', () => {
    expect(formatBrl(1500)).toMatch(/1\.500/)
  })
})

describe('parseBrlDigits / formatBrlInteger', () => {
  it('lê dígitos como reais inteiros', () => {
    expect(parseBrlDigits('150000')).toBe(150_000)
    expect(parseBrlDigits('150.000')).toBe(150_000)
  })

  it('mostra valor com milhar', () => {
    expect(formatBrlInteger(150_000)).toBe('150.000')
  })
})

describe('formatMonthsLabel / formatGoalHitDate', () => {
  it('descreve o prazo', () => {
    expect(formatMonthsLabel(15)).toBe('1 ano e 3 meses')
  })

  it('projeta o mês da meta', () => {
    const from = new Date(2026, 10, 1) // nov/2026
    expect(formatGoalHitDate(3, from)).toMatch(/Fevereiro.*2027/i)
  })
})
