import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(3_6_9/0.35)] hover:bg-accent-hover hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.26),0_8px_22px_-10px_rgb(53_191_155/0.6)] active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-hover disabled:text-disabled disabled:shadow-none',
  secondary:
    'bg-elevated text-text border border-border-soft shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] hover:border-border hover:bg-hover active:bg-elevated disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-elevated',
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
  type = 'button',
  icon,
  fullWidth,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'atlas-press inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold tracking-[-0.005em]',
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
