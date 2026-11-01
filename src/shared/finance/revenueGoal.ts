/** Meta de receita: acumular um total ou atingir um faturamento mensal. */
export type RevenueGoalKind = 'accumulate' | 'monthly'

export type RevenueGoalMode = 'estimate_time' | 'estimate_investment'

export type RevenueGoalInput = {
  kind: RevenueGoalKind
  mode: RevenueGoalMode
  /** Valor da meta (total a juntar ou receita mensal alvo). */
  goalAmount: number
  /** Quanto entra por mês hoje. */
  currentMonthlyRevenue: number
  /** Já guardado (só faz sentido em acumular). */
  alreadySaved?: number
  /** Prazo desejado em meses (modo investimento). */
  targetMonths?: number
  /**
   * Retorno esperado por real investido no período.
   * Ex.: 2,5 → cada R$ 1 investido tende a gerar R$ 2,50 de receita no prazo.
   * Padrão 1 = 1:1 (investimento cobre o gap direto).
   */
  expectedReturnPerReal?: number
}

export type RevenueGoalResult =
  | {
      ok: true
      kind: RevenueGoalKind
      mode: 'estimate_time'
      remaining: number
      months: number
      years: number
      monthsRemainder: number
      alreadyReached: boolean
      summary: string
    }
  | {
      ok: true
      kind: RevenueGoalKind
      mode: 'estimate_investment'
      remaining: number
      targetMonths: number
      requiredMonthly: number
      monthlyGap: number
      suggestedInvestment: number
      expectedReturnPerReal: number
      alreadyReached: boolean
      summary: string
    }
  | {
      ok: false
      error: string
    }

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function positive(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0
  return value
}

export function formatMonthsLabel(months: number): string {
  if (months <= 0) return 'menos de 1 mês'
  if (months === 1) return '1 mês'
  if (months < 12) return `${months} meses`
  const years = Math.floor(months / 12)
  const rest = months % 12
  const yearLabel = years === 1 ? '1 ano' : `${years} anos`
  if (rest === 0) return yearLabel
  return `${yearLabel} e ${rest === 1 ? '1 mês' : `${rest} meses`}`
}

/** Data aproximada de bater a meta, a partir de hoje + N meses. */
export function formatGoalHitDate(months: number, from = new Date()): string {
  const safeMonths = Math.max(0, Math.ceil(months))
  const hit = new Date(from.getFullYear(), from.getMonth() + safeMonths, 1)
  const label = hit.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Lê só os dígitos como reais inteiros (ignora pontos/vírgulas da máscara). */
export function parseBrlDigits(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  const value = Number(digits)
  return Number.isFinite(value) ? value : 0
}

/** Parte inteira com milhar pt-BR (ex.: 150.000). */
export function formatBrlInteger(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  return safe.toLocaleString('pt-BR')
}

export function estimateRevenueGoal(input: RevenueGoalInput): RevenueGoalResult {
  const goalAmount = positive(input.goalAmount)
  const currentMonthlyRevenue = positive(input.currentMonthlyRevenue)
  const alreadySaved = positive(input.alreadySaved)
  const expectedReturnPerReal = Math.max(positive(input.expectedReturnPerReal) || 1, 0.01)

  if (goalAmount <= 0) {
    return { ok: false, error: 'Informe a meta de receita.' }
  }

  if (input.kind === 'accumulate') {
    const remaining = Math.max(0, goalAmount - alreadySaved)
    if (remaining <= 0) {
      if (input.mode === 'estimate_time') {
        return {
          ok: true,
          kind: 'accumulate',
          mode: 'estimate_time',
          remaining: 0,
          months: 0,
          years: 0,
          monthsRemainder: 0,
          alreadyReached: true,
          summary: `Você já alcançou a meta de ${formatBrl(goalAmount)}.`,
        }
      }
      return {
        ok: true,
        kind: 'accumulate',
        mode: 'estimate_investment',
        remaining: 0,
        targetMonths: Math.max(1, Math.round(positive(input.targetMonths) || 1)),
        requiredMonthly: 0,
        monthlyGap: 0,
        suggestedInvestment: 0,
        expectedReturnPerReal,
        alreadyReached: true,
        summary: `Você já alcançou a meta de ${formatBrl(goalAmount)}.`,
      }
    }

    if (input.mode === 'estimate_time') {
      if (currentMonthlyRevenue <= 0) {
        return {
          ok: false,
          error: 'Informe quanto você recebe por mês para estimar o prazo.',
        }
      }
      const months = Math.max(1, Math.ceil(remaining / currentMonthlyRevenue))
      const years = Math.floor(months / 12)
      const monthsRemainder = months % 12
      return {
        ok: true,
        kind: 'accumulate',
        mode: 'estimate_time',
        remaining: roundMoney(remaining),
        months,
        years,
        monthsRemainder,
        alreadyReached: false,
        summary: `Com ${formatBrl(currentMonthlyRevenue)}/mês, a meta de ${formatBrl(goalAmount)} fica em cerca de ${formatMonthsLabel(months)}.`,
      }
    }

    const targetMonths = Math.round(positive(input.targetMonths))
    if (targetMonths <= 0) {
      return { ok: false, error: 'Informe em quantos meses você quer atingir a meta.' }
    }
    const requiredMonthly = roundMoney(remaining / targetMonths)
    const monthlyGap = roundMoney(Math.max(0, requiredMonthly - currentMonthlyRevenue))
    const suggestedInvestment = roundMoney((monthlyGap * targetMonths) / expectedReturnPerReal)
    return {
      ok: true,
      kind: 'accumulate',
      mode: 'estimate_investment',
      remaining: roundMoney(remaining),
      targetMonths,
      requiredMonthly,
      monthlyGap,
      suggestedInvestment,
      expectedReturnPerReal,
      alreadyReached: false,
      summary:
        monthlyGap <= 0
          ? `Em ${formatMonthsLabel(targetMonths)}, basta manter cerca de ${formatBrl(requiredMonthly)}/mês — sua receita atual já cobre.`
          : `Para juntar ${formatBrl(goalAmount)} em ${formatMonthsLabel(targetMonths)}, você precisa de cerca de ${formatBrl(requiredMonthly)}/mês. Faltam ${formatBrl(monthlyGap)}/mês em relação ao que entra hoje; investimento sugerido: ${formatBrl(suggestedInvestment)}.`,
    }
  }

  // Meta mensal: atingir X/mês de receita
  const remaining = Math.max(0, goalAmount - currentMonthlyRevenue)
  if (remaining <= 0) {
    if (input.mode === 'estimate_time') {
      return {
        ok: true,
        kind: 'monthly',
        mode: 'estimate_time',
        remaining: 0,
        months: 0,
        years: 0,
        monthsRemainder: 0,
        alreadyReached: true,
        summary: `Sua receita mensal já está em ${formatBrl(currentMonthlyRevenue)}, acima da meta de ${formatBrl(goalAmount)}/mês.`,
      }
    }
    return {
      ok: true,
      kind: 'monthly',
      mode: 'estimate_investment',
      remaining: 0,
      targetMonths: Math.max(1, Math.round(positive(input.targetMonths) || 1)),
      requiredMonthly: goalAmount,
      monthlyGap: 0,
      suggestedInvestment: 0,
      expectedReturnPerReal,
      alreadyReached: true,
      summary: `Sua receita mensal já cobre a meta de ${formatBrl(goalAmount)}/mês.`,
    }
  }

  if (input.mode === 'estimate_time') {
    if (currentMonthlyRevenue <= 0) {
      return {
        ok: false,
        error: 'Informe a receita mensal atual para estimar o prazo.',
      }
    }
    // Sem taxa de crescimento: usamos o gap como “parcelas” do que falta gerar
    // (mesma lógica linear do acumular), para dar uma ordem de grandeza.
    const months = Math.max(1, Math.ceil(remaining / Math.max(currentMonthlyRevenue, 1)))
    const years = Math.floor(months / 12)
    const monthsRemainder = months % 12
    return {
      ok: true,
      kind: 'monthly',
      mode: 'estimate_time',
      remaining: roundMoney(remaining),
      months,
      years,
      monthsRemainder,
      alreadyReached: false,
      summary: `Faltam ${formatBrl(remaining)}/mês para a meta de ${formatBrl(goalAmount)}/mês. Mantendo o ritmo atual como referência de crescimento, a ordem de grandeza é cerca de ${formatMonthsLabel(months)}.`,
    }
  }

  const targetMonths = Math.round(positive(input.targetMonths))
  if (targetMonths <= 0) {
    return { ok: false, error: 'Informe em quantos meses você quer atingir a meta mensal.' }
  }
  const requiredMonthly = roundMoney(goalAmount)
  const monthlyGap = roundMoney(remaining)
  // Para chegar à receita mensal alvo no prazo: investe o gap total / retorno esperado
  const suggestedInvestment = roundMoney((monthlyGap * targetMonths) / expectedReturnPerReal)
  return {
    ok: true,
    kind: 'monthly',
    mode: 'estimate_investment',
    remaining: monthlyGap,
    targetMonths,
    requiredMonthly,
    monthlyGap,
    suggestedInvestment,
    expectedReturnPerReal,
    alreadyReached: false,
    summary: `Para chegar a ${formatBrl(goalAmount)}/mês em ${formatMonthsLabel(targetMonths)}, falta ${formatBrl(monthlyGap)}/mês. Com retorno esperado de ${expectedReturnPerReal.toLocaleString('pt-BR')}x, o investimento sugerido no período é ${formatBrl(suggestedInvestment)}.`,
  }
}
