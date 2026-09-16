import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../lib/utils'

type ToastItem = { id: string; message: string; tone?: 'default' | 'success' | 'error' }

const ToastContext = createContext<{
  push: (message: string, tone?: ToastItem['tone']) => void
} | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, tone: ToastItem['tone'] = 'default') => {
    const id = crypto.randomUUID()
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 3200)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-5 z-[60] flex w-[320px] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur',
              item.tone === 'success' && 'border-accent/30 bg-accent-dark/80 text-accent',
              item.tone === 'error' && 'border-danger/30 bg-danger/15 text-danger',
              item.tone === 'default' && 'border-border bg-card/95 text-text',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
