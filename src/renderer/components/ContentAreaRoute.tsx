import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { ContentArea } from '@shared/workspaceCapabilities'
import { isContentAreaEnabled, isContentAreaEntityPath } from '@shared/workspaceCapabilities'
import { PROJECT_TYPE_LABEL } from '@shared/types'
import { Button } from './Button'
import { Card } from './Card'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'
import { ENVIRONMENTS } from '../lib/environments'

export function ContentAreaRoute({
  area,
  children,
  unavailableTitle,
  unavailableDescription,
}: {
  area: ContentArea
  children: ReactNode
  /** Substitui o título padrão da tela de área oculta. */
  unavailableTitle?: string
  /** `null` esconde o parágrafo; omitir mantém o texto padrão. */
  unavailableDescription?: string | null
}) {
  const { pathname } = useLocation()
  const { capabilities, enableArea } = useWorkspaceCapabilities()
  const enabled = isContentAreaEnabled(capabilities, area)
  const preserveEntity = isContentAreaEntityPath(pathname)

  if (enabled) return children

  if (preserveEntity) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <HiddenAreaBanner area={area} onEnable={() => void enableArea(area)} />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    )
  }

  return (
    <HiddenAreaScreen
      area={area}
      onEnable={() => void enableArea(area)}
      title={unavailableTitle}
      description={unavailableDescription}
    />
  )
}

function HiddenAreaBanner({ area, onEnable }: { area: ContentArea; onEnable: () => void }) {
  const label = PROJECT_TYPE_LABEL[area]
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-soft bg-card-2 px-4 py-3 sm:px-6">
      <p className="min-w-0 text-sm leading-relaxed text-pretty text-muted">
        {label} está oculta nas suas preferências. Os dados continuam disponíveis.
      </p>
      <Button className="h-9 shrink-0 px-3 text-xs" onClick={onEnable}>
        {area === 'history' ? 'Mostrar História' : 'Ativar Música'}
      </Button>
    </div>
  )
}

function HiddenAreaScreen({
  area,
  onEnable,
  title,
  description,
}: {
  area: ContentArea
  onEnable: () => void
  title?: string
  description?: string | null
}) {
  const env = ENVIRONMENTS[area]
  const heading = title ?? 'Esta área está oculta nas suas preferências.'
  const body =
    description === undefined
      ? `Nada foi apagado. Você pode mostrar ${PROJECT_TYPE_LABEL[area]} de novo a qualquer momento.`
      : description
  return (
    <div className="flex h-full items-center justify-center px-4 py-6 sm:px-8">
      <Card className="max-w-lg text-center" padding="lg">
        <env.icon className="mx-auto h-8 w-8 text-muted-2" />
        <h1 className="mt-4 text-lg font-semibold text-text">{heading}</h1>
        {body ? <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p> : null}
        <Button className="mt-5" onClick={onEnable}>
          {area === 'history' ? 'Mostrar História' : 'Ativar Música'}
        </Button>
      </Card>
    </div>
  )
}
