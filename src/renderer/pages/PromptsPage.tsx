import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { QuickPromptsPanel } from '../components/QuickPromptsPanel'
import { environmentBreadcrumb } from '../lib/environments'

/**
 * Biblioteca de Meus prompts, acessível pelo sidebar do ambiente Música.
 */
export function PromptsPage() {
  return (
    <PageShell scroll={false} className="flex min-h-0 flex-col">
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Prompts')}
        title="Prompts"
        subtitle="Biblioteca para guardar, agrupar e copiar os textos da produção."
      />
      <div className="min-h-0 flex-1">
        <QuickPromptsPanel />
      </div>
    </PageShell>
  )
}
