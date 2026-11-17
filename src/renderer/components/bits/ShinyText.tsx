import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** React Bits · ShinyText — reflexo que atravessa o texto (herda a cor atual). */
export function ShinyText({
  children,
  speed = 4.5,
  className,
}: {
  children: ReactNode
  speed?: number
  className?: string
}) {
  return (
    <span
      className={cn('atlas-shiny', className)}
      style={{ '--shiny-speed': `${speed}s` } as CSSProperties}
    >
      {children}
    </span>
  )
}
