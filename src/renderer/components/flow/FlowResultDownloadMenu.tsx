import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { cn } from '../../lib/utils'

const OPTIONS = [
  { id: '1k' as const, title: '1K', detail: 'Tamanho original' },
  { id: '2k' as const, title: '2K', detail: 'Aprimorada' },
  { id: '4k' as const, title: '4K', detail: 'Aprimorada' },
]

export function FlowResultDownloadMenu({
  disabled,
  busy,
  compact = true,
  onPick,
}: {
  disabled?: boolean
  busy?: boolean
  compact?: boolean
  onPick: (resolution: '1k' | '2k' | '4k') => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || busy}
        className={cn(
          'inline-flex items-center gap-1 text-muted hover:text-text disabled:opacity-40',
          compact ? 'text-[9px]' : 'h-7 rounded-md border border-white/10 px-3 text-[10px]',
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <Download className="h-3 w-3" />
        {busy ? 'Baixando…' : 'Baixar'}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-44 rounded-lg border border-white/10 bg-[#1c1c1c] p-1 shadow-xl">
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-white/10"
              onClick={() => {
                setOpen(false)
                onPick(option.id)
              }}
            >
              <span className="text-[11px] font-medium text-white">{option.title}</span>
              <span className="text-[10px] text-white/60">{option.detail}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
