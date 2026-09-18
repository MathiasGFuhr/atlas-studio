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
        'min-w-0 rounded-2xl border border-border-soft bg-card shadow-[0_8px_24px_rgba(0,0,0,0.25)]',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
