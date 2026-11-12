/**
 * Decisões de sessão do Google Flow em segundo plano (Fase 1+).
 * Sem DOM — só regras reutilizáveis entre Atlas e testes.
 */

export type FlowSessionFocusReason = 'automation' | 'login' | 'user_reveal'

export type FlowTabCandidate = {
  id: number
  url?: string | null
  active?: boolean
  discarded?: boolean
}

export type FlowSessionPlan =
  | { action: 'reuse'; tabId: number; reason: string }
  | { action: 'create_background'; reason: string }
  | { action: 'unavailable'; reason: string }

export function isFlowTabUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === 'flow.google.com' || host.endsWith('.flow.google.com')) {
      return true
    }
    if (host !== 'labs.google' && !host.endsWith('.labs.google')) {
      return false
    }
    return /\/tools\/flow(\/|$)/i.test(parsed.pathname)
  } catch {
    return false
  }
}

/** A automação comum nunca deve ativar a aba/janela. */
export function shouldStealFocus(reason: FlowSessionFocusReason): boolean {
  return reason === 'login' || reason === 'user_reveal'
}

/**
 * Escolhe a aba persistente do Flow.
 * Preferência: aba marcada pelo Atlas → qualquer aba Flow existente.
 * Nunca cria aqui — só decide reutilizar.
 */
export function pickReusableFlowTab(
  tabs: FlowTabCandidate[],
  preferredTabId?: number | null,
): FlowTabCandidate | null {
  const usable = tabs.filter((tab) => !tab.discarded && (isFlowTabUrl(tab.url) || preferredTabId === tab.id))
  if (preferredTabId != null) {
    const preferred = usable.find((tab) => tab.id === preferredTabId)
    if (preferred) return preferred
  }
  return usable.find((tab) => isFlowTabUrl(tab.url)) ?? null
}

export function planFlowSession(input: {
  browserAvailable: boolean
  tabs: FlowTabCandidate[]
  preferredTabId?: number | null
}): FlowSessionPlan {
  if (!input.browserAvailable) {
    return {
      action: 'unavailable',
      reason:
        'Chrome indisponível. Abra o Google Chrome com a extensão Atlas Flow Bridge — a automação não roda sem contexto de navegador.',
    }
  }

  const existing = pickReusableFlowTab(input.tabs, input.preferredTabId)
  if (existing) {
    return {
      action: 'reuse',
      tabId: existing.id,
      reason: 'Reutilizando a aba Flow em segundo plano.',
    }
  }

  return {
    action: 'create_background',
    reason: 'Nenhuma aba Flow encontrada — criar uma aba inativa.',
  }
}

/** Modo da operação: automático (sem foco) vs acompanhar (usuário pediu). */
export type FlowOperationMode = 'automatic' | 'follow'

export function resolveOperationFocus(mode: FlowOperationMode): FlowSessionFocusReason {
  return mode === 'follow' ? 'user_reveal' : 'automation'
}
