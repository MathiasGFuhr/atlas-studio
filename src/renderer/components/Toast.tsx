import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { stripTechnicalErrorWrappers, toUserFacingError } from '@shared/userFacingError'
import { cn } from '../lib/utils'

type ToastTone = 'default' | 'success' | 'error'

type ToastItem = {
  id: string
  title: string
  message: string
  tone: ToastTone
}

type ToastContextValue = {
  push: (message: string, tone?: ToastTone) => void
  pushError: (error: unknown, fallback?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS: Record<ToastTone, number> = {
  default: 3400,
  success: 3200,
  error: 5600,
}

const TOAST_TITLE: Record<ToastTone, string> = {
  default: 'Aviso',
  success: 'Pronto',
  error: 'Erro',
}

function prepareToastMessage(message: string, tone: ToastTone): string {
  if (tone === 'error') {
    return toUserFacingError(message)
  }
  const cleaned = stripTechnicalErrorWrappers(message).trim()
  return cleaned || message.trim()
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: ToastTone = 'default') => {
      const prepared = prepareToastMessage(message, tone)
      if (!prepared) return

      const id = crypto.randomUUID()
      setItems((prev) => {
        const next = [...prev, { id, title: TOAST_TITLE[tone], message: prepared, tone }]
        return next.slice(-4)
      })

      const timer = setTimeout(() => dismiss(id), TOAST_DURATION_MS[tone])
      timersRef.current.set(id, timer)
    },
    [dismiss],
  )

  const pushError = useCallback(
    (error: unknown, fallback = 'Algo deu errado. Tente novamente.') => {
      const id = crypto.randomUUID()
      const prepared = toUserFacingError(error, fallback)
      setItems((prev) => {
        const next = [
          ...prev,
          { id, title: TOAST_TITLE.error, message: prepared, tone: 'error' as const },
        ]
        return next.slice(-4)
      })
      const timer = setTimeout(() => dismiss(id), TOAST_DURATION_MS.error)
      timersRef.current.set(id, timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const value = useMemo(() => ({ push, pushError }), [push, pushError])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 right-5 z-[60] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? AlertCircle : Info

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto atlas-toast-enter flex items-start gap-3 rounded-2xl border px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md',
        item.tone === 'success' && 'border-accent/35 bg-[#10261c]/92 text-text',
        item.tone === 'error' && 'border-danger/40 bg-[#2a1416]/95 text-text',
        item.tone === 'default' && 'border-border bg-card/95 text-text',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
          item.tone === 'success' && 'bg-accent/15 text-accent',
          item.tone === 'error' && 'bg-danger/20 text-[#ff8b8b]',
          item.tone === 'default' && 'bg-white/5 text-muted',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <p
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wide',
            item.tone === 'success' && 'text-accent',
            item.tone === 'error' && 'text-[#ff9a9a]',
            item.tone === 'default' && 'text-muted-2',
          )}
        >
          {item.title}
        </p>
        <p className="mt-0.5 text-sm leading-snug text-text">{item.message}</p>
      </div>

      <button
        type="button"
        aria-label="Fechar notificação"
        className="mt-0.5 rounded-lg p-1 text-muted transition-colors hover:bg-white/5 hover:text-text"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
