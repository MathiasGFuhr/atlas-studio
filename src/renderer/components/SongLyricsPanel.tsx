import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react'
import { ArrowDownToLine, Check, ChevronDown, Copy, ScrollText } from 'lucide-react'
import { Button } from './Button'
import { Card } from './Card'
import { Textarea } from './Textarea'
import { excerptFromTextarea, removeExcerptFallback, removeSelectedRange } from '@shared/songLyrics'
import { getAtlasApi } from '../lib/api'
import { useToast } from './Toast'

function lyricsLineCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

function lineLabel(count: number): string {
  if (count === 0) return 'cole a letra do Suno'
  return `${count} ${count === 1 ? 'linha' : 'linhas'}`
}

function previewExcerpt(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= 72) return compact
  return `${compact.slice(0, 72).trimEnd()}…`
}

export function SongLyricsPanel({
  lyrics = '',
  disabled,
  collapsible,
  assignTarget,
  onSave,
  onAssign,
}: {
  lyrics?: string
  disabled?: boolean
  collapsible?: boolean
  assignTarget?: { number: string } | null
  onSave: (lyrics: string) => Promise<void>
  onAssign?: (excerpt: string, remaining: string) => boolean | void | Promise<boolean | void>
}) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [draft, setDraft] = useState(lyrics)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(Boolean(onAssign) || !lyrics.trim())
  const [excerpt, setExcerpt] = useState<{ text: string; start: number; end: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(lyrics)
  }, [lyrics])

  useLayoutEffect(() => {
    if (!onAssign || !excerpt || typeof excerpt !== 'object') return
    const el = textareaRef.current
    if (!el) return
    const max = el.value.length
    const start = Math.max(0, Math.min(excerpt.start, max))
    const end = Math.max(start, Math.min(excerpt.end, max))
    if (start === end) return
    el.focus({ preventScroll: true })
    el.setSelectionRange(start, end)
  }, [assignTarget?.number])

  const dirty = draft !== lyrics
  const lines = lyricsLineCount(draft)
  const selectedText = excerpt && typeof excerpt === 'object' ? excerpt.text : ''
  const canAssign = Boolean(onAssign && selectedText && assignTarget && !disabled)

  function captureSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget
    const next = excerptFromTextarea(el)
    if (!next || el.selectionStart == null || el.selectionEnd == null || el.selectionStart === el.selectionEnd) {
      return
    }
    setExcerpt({
      text: next,
      start: Math.min(el.selectionStart, el.selectionEnd),
      end: Math.max(el.selectionStart, el.selectionEnd),
    })
  }

  function remainingAfter(source: string, el?: HTMLTextAreaElement): string {
    if (el && el.selectionStart != null && el.selectionEnd != null && el.selectionStart !== el.selectionEnd) {
      return removeSelectedRange(source, el.selectionStart, el.selectionEnd)
    }
    if (excerpt && typeof excerpt === 'object') {
      return removeSelectedRange(source, excerpt.start, excerpt.end)
    }
    return removeExcerptFallback(source, selectedText)
  }

  async function assign(text = selectedText, el?: HTMLTextAreaElement) {
    if (!onAssign || disabled) return
    const next = text.trim()
    if (!next) {
      push('Selecione um trecho da letra.')
      return
    }
    if (!assignTarget) {
      push('Escolha a cena na lista à esquerda.')
      return
    }
    const remaining = remainingAfter(draft, el)
    const ok = await onAssign(next, remaining)
    if (ok === false) return
    setDraft(remaining)
    setExcerpt(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true })
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    captureSelection(event)
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void assign(excerptFromTextarea(event.currentTarget) || selectedText, event.currentTarget)
    }
  }

  async function save() {
    if (disabled || saving || !dirty) return
    setSaving(true)
    try {
      await onSave(draft)
    } catch (error) {
      pushError(error, 'Não foi possível salvar a letra.')
    } finally {
      setSaving(false)
    }
  }

  async function copy() {
    if (!draft.trim()) {
      push('Cole a letra antes de copiar.')
      return
    }
    try {
      await api.system.copyText(draft)
      push('Letra copiada.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível copiar a letra.')
    }
  }

  const body = (
    <>
      <p className="text-xs leading-relaxed text-muted">
        {onAssign
          ? 'Selecione o trecho e mande para a cena aberta. Ele sai da letra. Ctrl+Enter também envia.'
          : 'Cole a letra completa do Suno uma vez. Os recortes de cada cena ficam para depois.'}
      </p>
      <Textarea
        ref={textareaRef}
        value={draft}
        disabled={disabled || saving}
        onChange={(event) => {
          setDraft(event.target.value)
          setExcerpt(null)
        }}
        onSelect={captureSelection}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
        onKeyDown={onKeyDown}
        placeholder="Cole aqui a letra completa, como está no Suno…"
        spellCheck={false}
        className="min-h-[200px] font-mono text-[13px]"
      />
      {onAssign ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
            {excerpt ? (
              <>
                <span className="font-medium text-text">Selecionado: </span>
                {previewExcerpt(selectedText)}
              </>
            ) : (
              'Selecione o trecho na letra'
            )}
          </p>
          <Button
            type="button"
            className="h-9 px-3 text-xs"
            icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
            disabled={!canAssign}
            title={
              assignTarget
                ? `Envia o trecho selecionado para a cena ${assignTarget.number}`
                : 'Escolha a cena na lista à esquerda'
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => assign()}
          >
            {assignTarget ? `Mandar para a cena ${assignTarget.number}` : 'Escolha uma cena'}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] tabular-nums text-muted-2">
          {lines === 0 ? 'Sem letra' : lineLabel(lines)}
          {dirty ? ' · não salvo' : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-xs"
            icon={<Copy className="h-3.5 w-3.5" />}
            disabled={!draft.trim()}
            onClick={() => void copy()}
          >
            Copiar
          </Button>
          {dirty ? (
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-40"
              disabled={disabled || saving}
              onClick={() => setDraft(lyrics)}
            >
              Descartar
            </button>
          ) : null}
          <Button
            type="button"
            className="h-9 px-3 text-xs"
            icon={<Check className="h-3.5 w-3.5" />}
            disabled={disabled || saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? 'Salvando...' : 'Salvar letra'}
          </Button>
        </div>
      </div>
    </>
  )

  if (collapsible) {
    return (
      <div className="shrink-0 rounded-2xl border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-text"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <ScrollText className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          Letra da música
          <span className="font-medium text-muted">· {lineLabel(lyricsLineCount(lyrics))}</span>
          {dirty ? <span className="text-[11px] font-medium text-warning">não salvo</span> : null}
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {expanded ? <div className="space-y-3 border-t border-border px-4 py-3">{body}</div> : null}
      </div>
    )
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-accent" aria-hidden />
        <h3 className="text-sm font-semibold text-text">Letra da música</h3>
      </div>
      {body}
    </Card>
  )
}
