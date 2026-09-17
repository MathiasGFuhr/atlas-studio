import { ChevronRight } from 'lucide-react'
import type { CodexAuthState, CodexStatus } from '@shared/types'
import { cn } from '../lib/utils'

const stateConfig: Record<
  CodexAuthState,
  { dotClass: string; textClass: string; label: string; action?: string }
> = {
  initializing: {
    dotClass: 'bg-muted animate-pulse',
    textClass: 'text-muted',
    label: 'Inicializando...',
  },
  not_found: {
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-500',
    label: 'Não instalado',
  },
  not_authenticated: {
    dotClass: 'bg-muted',
    textClass: 'text-muted',
    label: 'Não vinculado',
    action: 'Vincular',
  },
  authenticating: {
    dotClass: 'bg-accent animate-pulse',
    textClass: 'text-accent',
    label: 'Vinculando...',
  },
  connected: {
    dotClass: 'bg-accent shadow-[0_0_8px_rgba(53,229,139,0.8)]',
    textClass: 'text-accent',
    label: 'Pronto',
  },
  error: {
    dotClass: 'bg-danger',
    textClass: 'text-danger',
    label: 'Erro de conexão',
    action: 'Reconectar',
  },
}

function accountLabel(status: CodexStatus | null): string {
  const type = status?.account?.loginType
  if (type === 'api_key') return 'API Key vinculada'
  if (type === 'chatgpt' || status?.connected) return 'ChatGPT vinculada'
  return 'Conta não vinculada'
}

export function CodexStatusCard({
  status,
  onClick,
  compact = false,
}: {
  status: CodexStatus | null
  onClick?: () => void
  compact?: boolean
}) {
  const authState: CodexAuthState = status?.authState ?? 'initializing'
  const config = stateConfig[authState]

  const subtitle =
    authState === 'connected'
      ? [
          status?.model ? status.model : null,
          status?.codexVersion ? `v${status.codexVersion}` : null,
          accountLabel(status),
        ]
          .filter(Boolean)
          .join(' · ')
      : authState === 'not_authenticated'
        ? 'Vincular com ChatGPT'
        : authState === 'not_found'
          ? 'Codex não encontrado'
          : authState === 'error'
            ? 'Toque para reconectar'
            : 'Preparando integração...'

  const showAction = Boolean(config.action)
  const compactLabel = `Codex · ${config.label}`

  if (compact) {
    return (
      <button
        type="button"
        title={compactLabel}
        aria-label={compactLabel}
        onClick={onClick}
        className={cn(
          'flex h-11 w-full items-center justify-center rounded-xl border border-border-soft bg-card-2 transition-colors',
          'hover:border-[#334049]',
        )}
      >
        <span className={cn('h-2 w-2 rounded-full', config.dotClass)} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-xl border border-border-soft bg-card-2 px-3 py-3 text-left transition-colors',
        'hover:border-[#334049]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', config.dotClass)} />
          <span className={cn('truncate text-sm font-medium', config.textClass)}>
            Codex · {config.label}
          </span>
        </div>
        <p className="mt-1 truncate pl-4 text-xs text-muted">{subtitle}</p>
      </div>
      {showAction ? (
        <span className="shrink-0 text-xs font-medium text-accent">{config.action}</span>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
      )}
    </button>
  )
}
