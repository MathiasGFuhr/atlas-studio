import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-hover disabled:text-disabled',
  secondary:
    'bg-elevated text-text border border-border-soft hover:border-border hover:bg-hover active:bg-elevated disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-elevated',
  ghost:
    'bg-transparent text-muted hover:text-text hover:bg-hover active:bg-elevated disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent',
  danger:
    'bg-danger/12 text-danger border border-danger/20 hover:border-danger/35 hover:bg-danger/18 disabled:cursor-not-allowed disabled:opacity-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  className,
  variant = 'primary',
  icon,
  fullWidth,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}
