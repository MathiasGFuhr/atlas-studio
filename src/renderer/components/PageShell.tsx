import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export function PageShell({
  children,
  className,
  scroll = true,
}: {
  children: ReactNode
  className?: string
  scroll?: boolean
}) {
  return (
    <div
      className={cn(
        'h-full min-w-0',
        scroll ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden',
        'px-4 py-5 sm:px-6 lg:px-8 lg:py-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
