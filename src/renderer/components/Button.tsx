import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-black hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_0_1px_rgba(53,229,139,0.15)]',
  secondary:
    'bg-card-2 text-text border border-border hover:border-[#334049] hover:bg-[#182028] disabled:opacity-50',
  ghost: 'bg-transparent text-muted hover:text-text hover:bg-white/5',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
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
