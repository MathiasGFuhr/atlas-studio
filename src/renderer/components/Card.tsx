import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
}

const paddings = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

export function Card({ children, className, padding = 'md', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-border-soft/90 bg-card shadow-card',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
