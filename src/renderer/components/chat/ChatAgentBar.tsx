import type { ChatAgentId } from '@shared/chat/types'
import type { AgentModelSnapshot } from '@shared/agents/types'
import { cn } from '../../lib/utils'

const AGENTS: Array<{ id: ChatAgentId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'antigravity', label: 'Antigravity' },
]

function CompactSelect({
  label,
  value,
  options,
  disabled,
  onChange,
  compact,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  disabled?: boolean
  onChange: (value: string) => void
  compact?: boolean
}) {
  return (
    <label className="flex min-w-[8.5rem] flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'appearance-none rounded-xl border border-border bg-card-2 px-2.5 pr-7 text-text',
          compact ? 'h-8 text-xs' : 'h-9 text-sm',
          'focus:border-accent/60 focus:outline-none disabled:opacity-60',
        )}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value || 'empty'}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ChatAgentBar({
  agent,
  snapshot,
  modelOverride,
  effortOverride,
  loading,
  compact,
  onAgentChange,
  onModelChange,
  onEffortChange,
}: {
  agent: ChatAgentId
  snapshot: AgentModelSnapshot
  modelOverride: string | null
  effortOverride: string | null
  loading: boolean
  compact?: boolean
  onAgentChange: (agent: ChatAgentId) => void
  onModelChange: (model: string) => void
  onEffortChange: (effort: string) => void
}) {
  const modelOptions = [
    { value: '', label: 'padrão' },
    ...snapshot.models.map((model) => ({ value: model.id, label: model.label })),
  ]
  if (modelOverride && !modelOptions.some((item) => item.value === modelOverride)) {
    modelOptions.push({ value: modelOverride, label: `${modelOverride} (indisponível)` })
  }
  const effortOptions = [
    { value: '', label: 'padrão' },
    ...snapshot.reasoningEfforts.map((effort) => ({ value: effort.id, label: effort.label })),
  ]

  return (
    <div className={cn('flex flex-wrap items-end gap-2', compact ? 'gap-1.5' : 'gap-2')}>
      <CompactSelect
        label="Agente"
        compact={compact}
        value={agent}
        onChange={(value) => onAgentChange(value as ChatAgentId)}
        options={AGENTS.map((item) => ({ value: item.id, label: item.label }))}
      />
      <CompactSelect
        label="Modelo"
        compact={compact}
        value={loading ? '' : modelOverride || ''}
        disabled={loading}
        onChange={onModelChange}
        options={loading ? [{ value: '', label: 'Carregando...' }] : modelOptions}
      />
      {snapshot.supportsReasoningEffort ? (
        <CompactSelect
          label="Esforço"
          compact={compact}
          value={loading ? '' : effortOverride || ''}
          disabled={loading}
          onChange={onEffortChange}
          options={loading ? [{ value: '', label: 'Carregando...' }] : effortOptions}
        />
      ) : null}
    </div>
  )
}
