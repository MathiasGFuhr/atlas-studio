import type { InputHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ className, label, id, ...props }: InputProps) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-2" htmlFor={id}>
      {label ? <span className="text-sm font-medium text-muted">{label}</span> : null}
      <input
        id={id}
        className={cn(
          'h-11 w-full min-w-0 rounded-xl border border-border bg-input px-3.5 text-sm text-text placeholder:text-muted-2',
          'transition-colors hover:border-border-strong focus:border-accent/70 focus:outline-none disabled:cursor-not-allowed disabled:text-disabled disabled:hover:border-border',
          className,
        )}
        {...props}
      />
    </label>
  )
}
