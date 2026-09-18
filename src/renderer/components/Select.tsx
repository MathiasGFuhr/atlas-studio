import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: Array<{ value: string; label: string }>
}

export function Select({ className, label, id, options, ...props }: SelectProps) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-2">
      {label ? <span className="text-sm font-medium text-muted">{label}</span> : null}
      <div className="relative">
        <select
          id={id}
          className={cn(
            'h-11 w-full min-w-0 appearance-none rounded-xl border border-border bg-card-2 px-3.5 pr-10 text-sm text-text',
            'transition-colors hover:border-[#334049] focus:border-accent/60 focus:outline-none',
            className,
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    </label>
  )
}
