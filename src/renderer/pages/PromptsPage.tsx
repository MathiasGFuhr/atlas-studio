import { PageHeader } from '../components/PageHeader'
import { QuickPromptsPanel } from '../components/QuickPromptsPanel'
import { environmentBreadcrumb } from '../lib/environments'

/**
 * Entrada global da biblioteca de Prompts rápidos.
 * Reusa o mesmo painel dos projetos de Música, sem persistência própria.
 * Sem projeto selecionado, só presets e prompts globais.
 */
export function PromptsPage() {
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Prompts')}
        title="Prompts"
        subtitle="Biblioteca de Prompts rápidos do ambiente Música."
      />
      <p className="mb-5 text-xs leading-relaxed text-muted">
        Sem projeto selecionado, entram só os presets e os prompts globais. Prompts
        salvos para um projeto específico continuam no próprio projeto de Música.
      </p>
      <QuickPromptsPanel />
    </div>
  )
}
