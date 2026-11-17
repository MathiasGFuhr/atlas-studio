import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Loader2, Plus } from 'lucide-react'
import type { FlowImageSettings } from '@shared/flowImageSettings'
import { cn } from '../../lib/utils'
import { FlowImageSettingsBar } from './FlowImageSettingsBar'

export function FlowPromptComposer({
  value,
  readOnly,
  settings,
  onSettings,
  onChange,
  onFocus,
  onBlur,
  onSubmit,
  onAdd,
  submitDisabled,
  submitting,
  children,
}: {
  value: string
  readOnly?: boolean
  settings: FlowImageSettings
  onSettings: (next: FlowImageSettings) => void
  onChange: (text: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onSubmit: () => void
  onAdd: () => void
  submitDisabled?: boolean
  submitting?: boolean
  children?: ReactNode
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsOpen) return
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [settingsOpen])

  return (
    <div ref={rootRef} className="relative">
      {settingsOpen ? (
        <div className="absolute bottom-full right-0 z-30 mb-2">
          <FlowImageSettingsBar value={settings} onChange={onSettings} />
        </div>
      ) : null}
      <div className="rounded-[28px] border border-white/10 bg-[#1c1c1c] px-3 pb-2.5 pt-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        {children ? <div className="mb-2 flex flex-wrap gap-1 px-1">{children}</div> : null}
        <textarea
          value={value}
          readOnly={readOnly}
          autoComplete="off"
          spellCheck
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !submitDisabled) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder="O que você quer criar?"
          className={cn(
            'min-h-[64px] w-full resize-none bg-transparent px-2 text-[15px] leading-relaxed text-white caret-white placeholder:text-white/40 focus:outline-none',
            readOnly && 'cursor-not-allowed opacity-70',
          )}
        />
        <div className="mt-1 flex items-center gap-2 px-1">
          <button
            type="button"
            title="Adicionar referência"
            onClick={onAdd}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white hover:bg-white/5"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="inline-flex h-9 max-w-[220px] items-center gap-1.5 rounded-full px-2 text-[13px] text-white hover:bg-white/5"
            >
              <span className="text-amber-300">🍌</span>
              <span className="truncate">{settings.modelLabel}</span>
              <span className="text-white/40">▾</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-[13px] text-white/90 hover:bg-white/5"
            >
              <span className="inline-block h-3 w-4 rounded-[2px] border border-white/70" />
              x{settings.outputs}
            </button>
            <button
              type="button"
              title="Gerar"
              disabled={submitDisabled}
              onClick={onSubmit}
              className="grid h-9 w-9 place-items-center rounded-full bg-[#3a3a3a] text-white hover:bg-[#4a4a4a] disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
