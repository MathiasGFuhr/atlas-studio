import { PageHeader } from '../components/PageHeader'
import { QuickPromptsPanel } from '../components/QuickPromptsPanel'
import { environmentBreadcrumb } from '../lib/environments'

/**
 * Biblioteca de Prompts rápidos, acessível pelo sidebar do ambiente Música.
 */
export function PromptsPage() {
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Prompts')}
        title="Prompts"
        subtitle="Biblioteca de Prompts rápidos do ambiente Música."
      />
      <QuickPromptsPanel />
    </div>
  )
}
