import type { ReactNode } from 'react'
import type { ContentArea } from '@shared/workspaceCapabilities'

/** Mantido por compatibilidade — o Atlas agora é só Música. */
export function ContentAreaRoute({
  children,
}: {
  area: ContentArea
  children: ReactNode
  unavailableTitle?: string
  unavailableDescription?: string | null
}) {
  return children
}
