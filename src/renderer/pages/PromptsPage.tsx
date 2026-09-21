import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { QuickPromptsPanel } from '../components/QuickPromptsPanel'
import { environmentBreadcrumb } from '../lib/environments'

/**
 * Biblioteca de Meus prompts, acessível pelo sidebar do ambiente Música.
 */
export function PromptsPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Prompts')}
        title="Prompts"
        subtitle="Os prompts que você criar, organizados em abas como lipsync, ângulos de câmera ou o que fizer sentido."
      />
      <QuickPromptsPanel />
    </PageShell>
  )
}
