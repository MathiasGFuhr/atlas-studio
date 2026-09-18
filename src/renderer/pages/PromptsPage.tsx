import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { QuickPromptsPanel } from '../components/QuickPromptsPanel'
import { environmentBreadcrumb } from '../lib/environments'

/**
 * Biblioteca de Prompts rápidos, acessível pelo sidebar do ambiente Música.
 */
export function PromptsPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Prompts')}
        title="Prompts"
        subtitle="Presets de imagem e animação, e os prompts que você criar."
      />
      <QuickPromptsPanel />
    </PageShell>
  )
}
