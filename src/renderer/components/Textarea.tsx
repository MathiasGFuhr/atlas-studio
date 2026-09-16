import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ className, label, id, ...props }: TextareaProps) {
  return (
    <label className="flex w-full flex-col gap-2">
      {label ? <span className="text-sm font-medium text-muted">{label}</span> : null}
      <textarea
        id={id}
        className={cn(
          'min-h-[120px] w-full resize-y rounded-xl border border-border bg-card-2 px-3.5 py-3 text-sm leading-relaxed text-text placeholder:text-muted-2',
          'transition-colors hover:border-[#334049] focus:border-accent/60 focus:outline-none',
          className,
        )}
        {...props}
      />
    </label>
  )
}
