import { useEffect, useRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  autoGrow?: boolean
}

export function Textarea({ className, label, id, autoGrow, value, onChange, ...props }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!autoGrow || !ref.current) return
    const el = ref.current
    el.style.height = 'auto'
    const minHeight = Number.parseFloat(getComputedStyle(el).minHeight) || 88
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeight), 360)}px`
  }, [autoGrow, value])

  return (
    <label className="flex w-full min-w-0 flex-col gap-2">
      {label ? <span className="text-sm font-medium text-muted">{label}</span> : null}
      <textarea
        id={id}
        ref={ref}
        value={value}
        onChange={onChange}
        className={cn(
          'min-h-[120px] w-full min-w-0 resize-y rounded-xl border border-border bg-card-2 px-3.5 py-3 text-sm leading-relaxed break-words text-text placeholder:text-muted-2',
          'transition-colors hover:border-[#334049] focus:border-accent/60 focus:outline-none',
          autoGrow && 'resize-none overflow-hidden',
          className,
        )}
        {...props}
      />
    </label>
  )
}
