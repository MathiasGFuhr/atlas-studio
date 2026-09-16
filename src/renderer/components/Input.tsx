import type { InputHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ className, label, id, ...props }: InputProps) {
  return (
    <label className="flex w-full flex-col gap-2" htmlFor={id}>
      {label ? <span className="text-sm font-medium text-muted">{label}</span> : null}
      <input
        id={id}
        className={cn(
          'h-11 w-full rounded-xl border border-border bg-card-2 px-3.5 text-sm text-text placeholder:text-muted-2',
          'transition-colors hover:border-[#334049] focus:border-accent/60 focus:outline-none',
          className,
        )}
        {...props}
      />
    </label>
  )
}
