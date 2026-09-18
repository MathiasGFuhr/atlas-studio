import type { AntigravityAuthState, AntigravityStatus, CodexAuthState, CodexStatus } from './types'

export const AI_SETTINGS_HREF = '/configuracoes?secao=ia'

export type AgentAuthState = CodexAuthState | AntigravityAuthState
export type AtlasAiKind = 'connected' | 'connecting' | 'attention' | 'disconnected'
export type AtlasAiAgentId = 'codex' | 'antigravity'

export interface AtlasAiAgentSnapshot {
  id: AtlasAiAgentId
  label: string
  connected: boolean
  modelLabel: string | null
}

export interface AtlasAiStatusView {
  kind: AtlasAiKind
  title: string
  statusLabel: string
  compactLabel: string
  tooltip: string
  connectedCount: number
  agents: AtlasAiAgentSnapshot[]
}

type AgentInput = {
  id: AtlasAiAgentId
  label: string
  authState: AgentAuthState
  model?: string | null
}

function agentPhase(authState: AgentAuthState): AtlasAiKind {
  if (authState === 'connected') return 'connected'
  if (authState === 'initializing' || authState === 'authenticating') return 'connecting'
  if (authState === 'error') return 'attention'
  return 'disconnected'
}

/** Converte ids técnicos (ex.: gpt-5.6-sol) em rótulo curto para tooltip. */
export function friendlyModelLabel(model: string | null | undefined): string | null {
  const value = model?.trim()
  if (!value) return null
  if (/[/\\]/.test(value) || /^v?\d+\.\d+/.test(value)) return null
  if (/^gpt[-_]/i.test(value)) {
    const rest = value.slice(4).replace(/[-_]+/g, ' ')
    const titled = rest.replace(/\b([a-z])/g, (char) => char.toUpperCase())
    return `GPT-${titled}`
  }
  return value.replace(/[-_]+/g, ' ')
}

function resolveAuthState(
  status: Pick<{ authState: AgentAuthState; connected: boolean }, 'authState' | 'connected'> | null,
): AgentAuthState {
  if (!status) return 'initializing'
  if (status.authState === 'connected' || status.connected) return 'connected'
  return status.authState
}

export function deriveAtlasAiStatus(
  codex: CodexStatus | null,
  antigravity: AntigravityStatus | null,
): AtlasAiStatusView {
  const inputs: AgentInput[] = [
    {
      id: 'codex',
      label: 'Codex',
      authState: resolveAuthState(codex),
      model: codex?.model ?? null,
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      authState: resolveAuthState(antigravity),
      model: null,
    },
  ]

  const agents: AtlasAiAgentSnapshot[] = inputs.map((agent) => ({
    id: agent.id,
    label: agent.label,
    connected: agentPhase(agent.authState) === 'connected',
    modelLabel: friendlyModelLabel(agent.model),
  }))

  const connected = agents.filter((agent) => agent.connected)
  const phases = inputs.map((agent) => agentPhase(agent.authState))

  let kind: AtlasAiKind
  let statusLabel: string

  if (connected.length >= 2) {
    kind = 'connected'
    statusLabel = '2 agentes conectados'
  } else if (connected.length === 1) {
    kind = 'connected'
    statusLabel = `${connected[0].label} conectado`
  } else if (phases.includes('connecting')) {
    kind = 'connecting'
    statusLabel = 'Conectando...'
  } else if (phases.includes('attention')) {
    kind = 'attention'
    statusLabel = 'Atenção necessária'
  } else {
    kind = 'disconnected'
    statusLabel = 'Configuração necessária'
  }

  const headline =
    kind === 'connected' && connected.length >= 2 ? 'Conectada' : statusLabel
  const compactLabel = `IA do Atlas · ${headline}`
  const tooltipLines = [compactLabel]
  for (const agent of agents) {
    if (!agent.connected) continue
    tooltipLines.push(agent.modelLabel ? `${agent.label}: ${agent.modelLabel}` : agent.label)
  }

  return {
    kind,
    title: 'IA do Atlas',
    statusLabel,
    compactLabel,
    tooltip: tooltipLines.join('\n'),
    connectedCount: connected.length,
    agents,
  }
}
