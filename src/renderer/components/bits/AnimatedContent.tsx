import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * React Bits · AnimatedContent / FadeContent.
 * Entrada única ao montar (transform + opacity). `delay` permite cascatas.
 */
export function AnimatedContent({
  children,
  delay = 0,
  variant = 'rise',
  as: Tag = 'div',
  className,
  style,
  ...props
}: {
  children: ReactNode
  delay?: number
  variant?: 'rise' | 'fade'
  as?: ElementType
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(variant === 'rise' ? 'atlas-rise' : 'atlas-fade', className)}
      style={{ animationDelay: delay ? `${delay}ms` : undefined, ...style }}
      {...props}
    >
      {children}
    </Tag>
  )
}
