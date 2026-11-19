import { forwardRef, useEffect, useRef, type Ref, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  autoGrow?: boolean
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else ref.current = value
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, id, autoGrow, value, onChange, ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!autoGrow || !localRef.current) return
    const el = localRef.current
    el.style.height = 'auto'
    const minHeight = Number.parseFloat(getComputedStyle(el).minHeight) || 88
    const clamped = Math.min(Math.max(el.scrollHeight, minHeight), 360)
    el.style.height = `${clamped}px`
    el.style.overflowY = el.scrollHeight > 360 ? 'auto' : 'hidden'
  }, [autoGrow, value])

  return (
    <label className="flex w-full min-w-0 flex-col gap-2">
      {label ? <span className="text-sm font-medium text-muted">{label}</span> : null}
      <textarea
        id={id}
        ref={(node) => {
          localRef.current = node
          assignRef(forwardedRef, node)
        }}
        value={value}
        onChange={onChange}
        className={cn(
          'min-h-[120px] w-full min-w-0 resize-y rounded-xl border border-border bg-input px-3.5 py-3 text-sm leading-relaxed break-words text-text placeholder:text-muted-2',
          'transition-[border-color,box-shadow] duration-200 ease-out hover:border-border-strong focus:border-accent/70 focus:outline-none disabled:cursor-not-allowed disabled:text-disabled disabled:hover:border-border',
          autoGrow && 'resize-none',
          className,
        )}
        {...props}
      />
    </label>
  )
})
