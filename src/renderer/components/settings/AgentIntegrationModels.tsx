import { RefreshCw } from 'lucide-react'
import type { AgentModelSnapshot, AgentProviderId } from '@shared/agents/types'
import { Button } from '../Button'
import { Select } from '../Select'

export function AgentIntegrationModels({
  provider,
  snapshot,
  loading,
  refreshing,
  onRefresh,
  onModelChange,
  onEffortChange,
}: {
  provider: AgentProviderId
  snapshot: AgentModelSnapshot
  loading: boolean
  refreshing: boolean
  onRefresh: () => void
  onModelChange: (model: string) => void
  onEffortChange: (effort: string) => void
}) {
  const modelValue = snapshot.currentModel || ''
  const modelOptions = snapshot.models.map((model) => ({ value: model.id, label: model.label }))
  if (modelValue && !modelOptions.some((option) => option.value === modelValue)) {
    modelOptions.unshift({ value: modelValue, label: `${modelValue} (indisponível)` })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
        <span className="text-sm text-muted">Modelo padrão</span>
        <Select
          value={loading ? '' : modelValue}
          disabled={loading || modelOptions.length === 0}
          onChange={(event) => onModelChange(event.target.value)}
          options={
            loading
              ? [{ value: '', label: 'Carregando...' }]
              : modelOptions.length > 0
                ? modelOptions
                : [{ value: '', label: 'Nenhum modelo' }]
          }
        />
      </div>
      {snapshot.supportsReasoningEffort ? (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
          <span className="text-sm text-muted">Esforço</span>
          <Select
            value={loading ? '' : snapshot.currentReasoningEffort || ''}
            disabled={loading || snapshot.reasoningEfforts.length === 0}
            onChange={(event) => onEffortChange(event.target.value)}
            options={
              loading
                ? [{ value: '', label: 'Carregando...' }]
                : snapshot.reasoningEfforts.map((effort) => ({
                    value: effort.id,
                    label: effort.label,
                  }))
            }
          />
        </div>
      ) : null}
      {snapshot.configuredModelMissing ? (
        <p className="text-xs text-danger">
          Modelo configurado não está mais disponível.
          {snapshot.officialFallbackMessage ? ` ${snapshot.officialFallbackMessage}` : ''}
        </p>
      ) : null}
      {!loading && snapshot.models.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted">Não foi possível carregar os modelos.</p>
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={onRefresh}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="h-9 text-xs"
          icon={<RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />}
          onClick={onRefresh}
          disabled={refreshing}
        >
          Atualizar modelos
        </Button>
      )}
      <span className="sr-only">{provider}</span>
    </div>
  )
}
