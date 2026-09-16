import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Eraser, Sparkles, X } from 'lucide-react'
import type {
  AnalyzeQuickPromptRequest,
  QuickPromptAnalysis,
  QuickPromptAuditIntent,
  QuickPromptIssue,
} from '@shared/types'
import { qualityLabelForScore } from '@shared/antigravity/quickPromptAnalysis'
import { Button } from './Button'
import { Modal } from './Modal'
import { getAtlasApi } from '../lib/api'
import { cn } from '../lib/utils'

const FAIL_MESSAGE = 'Não foi possível analisar com Antigravity.'

export function useQuickPromptAntigravity(opts: {
  context: Omit<AnalyzeQuickPromptRequest, 'prompt' | 'intent'>
  prompt: string
  resetKey: string
  onApplyPrompt: (text: string) => void
}) {
  const api = getAtlasApi()
  const latest = useRef(opts)
  latest.current = opts
  const [busy, setBusy] = useState<QuickPromptAuditIntent | null>(null)
  const [analysis, setAnalysis] = useState<QuickPromptAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<'corrected' | 'cleaned' | null>(null)

  useEffect(() => {
    setAnalysis(null)
    setError(null)
    setPreview(null)
    setBusy(null)
  }, [opts.resetKey])

  const run = useCallback(
    async (intent: QuickPromptAuditIntent) => {
      const { context, prompt } = latest.current
      setBusy(intent)
      setError(null)
      try {
        const result = await api.antigravity.analyzeQuickPrompt({
          ...context,
          prompt,
          intent,
        })
        setAnalysis(result.analysis)
        if (intent === 'clean') setPreview('cleaned')
      } catch {
        setAnalysis(null)
        setError(FAIL_MESSAGE)
      } finally {
        setBusy(null)
      }
    },
    [api],
  )

  const applyPreview = useCallback(() => {
    const { prompt, onApplyPrompt } = latest.current
    if (!analysis || !preview) return
    const next = preview === 'cleaned' ? analysis.cleanedPrompt : analysis.correctedPrompt
    if (next.trim() && next.trim() !== prompt.trim()) {
      onApplyPrompt(next)
    }
    setPreview(null)
  }, [analysis, preview])

  return {
    busy,
    analysis,
    error,
    preview,
    setPreview,
    analyze: () => void run('audit'),
    clean: () => {
      if (analysis) {
        setPreview('cleaned')
        return
      }
      void run('clean')
    },
    applyPreview,
    close: () => {
      setAnalysis(null)
      setError(null)
      setPreview(null)
    },
  }
}

export function QuickPromptAntigravityButtons({
  busy,
  onAnalyze,
  onClean,
}: {
  busy: QuickPromptAuditIntent | null
  onAnalyze: () => void
  onClean: () => void
}) {
  return (
    <>
      <Button
        variant="secondary"
        icon={<Sparkles className={cn('h-4 w-4', busy ? 'animate-pulse' : '')} />}
        onClick={onAnalyze}
        disabled={Boolean(busy)}
      >
        {busy === 'audit' ? 'Analisando...' : 'Analisar com Antigravity'}
      </Button>
      <Button
        variant="ghost"
        icon={<Eraser className="h-4 w-4" />}
        onClick={onClean}
        disabled={Boolean(busy)}
      >
        {busy === 'clean' ? 'Limpando...' : 'Limpar prompt'}
      </Button>
    </>
  )
}

export function QuickPromptAntigravityPanel({
  analysis,
  error,
  preview,
  currentPrompt,
  onClose,
  onPreviewCorrected,
  onPreviewCleaned,
  onApplyPreview,
  onCancelPreview,
}: {
  analysis: QuickPromptAnalysis | null
  error: string | null
  preview: 'corrected' | 'cleaned' | null
  currentPrompt: string
  onClose: () => void
  onPreviewCorrected: () => void
  onPreviewCleaned: () => void
  onApplyPreview: () => void
  onCancelPreview: () => void
}) {
  const previewText = useMemo(() => {
    if (!analysis || !preview) return ''
    return preview === 'cleaned' ? analysis.cleanedPrompt : analysis.correctedPrompt
  }, [analysis, preview])

  if (!analysis && !error) return null

  return (
    <>
      {error ? <p className="text-xs text-muted-2">{error}</p> : null}

      {analysis ? (
        <div className="space-y-3 rounded-xl border border-border bg-card-2 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
                Antigravity
              </p>
              <p className="mt-1 text-sm text-text">
                Qualidade:{' '}
                <span className={cn('font-semibold', scoreTone(analysis.score))}>
                  {analysis.score}/100
                </span>
                <span className="ml-2 text-xs text-muted">
                  {qualityLabelForScore(analysis.score)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-muted hover:bg-white/5 hover:text-text"
              aria-label="Fechar análise"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {analysis.okItems.length > 0 ? (
            <ul className="space-y-1">
              {analysis.okItems.map((item) => (
                <li key={item.title} className="flex gap-2 text-xs text-muted">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <span>
                    <span className="text-text">{item.title}</span>
                    {item.detail ? <span className="text-muted-2"> — {item.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {analysis.issues.length > 0 ? (
            <ul className="space-y-2">
              {analysis.issues.map((issue, index) => (
                <IssueRow key={`${issue.title}-${index}`} issue={issue} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-2">Nenhum problema específico encontrado.</p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              className="h-9 px-3 text-xs"
              onClick={onPreviewCorrected}
              disabled={!analysis.correctedPrompt.trim()}
            >
              Aplicar correções
            </Button>
            <Button
              variant="secondary"
              className="h-9 px-3 text-xs"
              onClick={onPreviewCleaned}
              disabled={!analysis.cleanedPrompt.trim()}
            >
              Limpar prompt
            </Button>
            <Button variant="ghost" className="h-9 px-3 text-xs" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(preview && analysis)}
        title={preview === 'cleaned' ? 'Prompt limpo' : 'Prompt corrigido'}
        onClose={onCancelPreview}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onCancelPreview}>
              Cancelar
            </Button>
            <Button onClick={onApplyPreview} disabled={!previewText.trim()}>
              Substituir prompt
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-muted">
          Nada é alterado até você confirmar. A composição local dos presets continua disponível se
          você mudar os blocos.
        </p>
        {previewText.trim() === currentPrompt.trim() ? (
          <p className="mb-3 text-xs text-muted-2">A versão sugerida é igual ao prompt atual.</p>
        ) : null}
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-card-2 px-3.5 py-3 font-mono text-xs leading-relaxed text-muted">
          {previewText || '—'}
        </pre>
      </Modal>
    </>
  )
}

function IssueRow({ issue }: { issue: QuickPromptIssue }) {
  return (
    <li className="flex gap-2 text-xs">
      <AlertTriangle
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          issue.severity === 'error' ? 'text-danger' : 'text-warning',
        )}
      />
      <div>
        <p className="font-medium text-text">{issue.title}</p>
        {issue.detail ? <p className="mt-0.5 text-muted">{issue.detail}</p> : null}
      </div>
    </li>
  )
}

function scoreTone(score: number): string {
  if (score >= 75) return 'text-accent'
  if (score >= 60) return 'text-warning'
  return 'text-danger'
}
