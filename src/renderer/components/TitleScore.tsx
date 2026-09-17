import type { TitleStrengthAnalysis } from '@shared/types'
import {
  TITLE_STRATEGY_LABEL,
  computeTitleLocalFacts,
  titleScoreBand,
} from '@shared/antigravity/titleAnalysis'
import { cn } from '../lib/utils'
import { Button } from './Button'

function scoreTone(score: number): string {
  if (score >= 80) return 'text-accent'
  if (score >= 70) return 'text-text'
  if (score >= 60) return 'text-warning'
  return 'text-danger'
}

export function TitleScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return <span className="text-[11px] text-muted-2">Sem nota</span>
  }
  return (
    <span className={cn('text-[11px] font-semibold', scoreTone(score))}>
      {score}/100 · {titleScoreBand(score)}
    </span>
  )
}

function MetricChip({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-lg bg-black/20 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-2">{label}</p>
      <p className="text-xs font-medium text-text">{value == null ? '—' : value}</p>
    </div>
  )
}

export function TitleScorePanel({
  analysis,
  currentTitle,
  error,
  onUseTitle,
}: {
  analysis: TitleStrengthAnalysis | null | undefined
  currentTitle?: string
  error?: string | null
  onUseTitle?: (title: string) => void
}) {
  if (error) {
    return <p className="text-xs text-danger">{error}</p>
  }

  if (!analysis) {
    return <p className="text-xs text-muted-2">Ainda sem análise editorial neste título.</p>
  }

  const facts = currentTitle?.trim() ? computeTitleLocalFacts(currentTitle) : analysis.localFacts
  const metrics = [
    { label: 'Gancho', value: analysis.metrics.hook },
    { label: 'Clareza', value: analysis.metrics.clarity },
    { label: 'Curiosidade', value: analysis.metrics.curiosity },
    { label: 'Especificidade', value: analysis.metrics.specificity },
    { label: 'Emoção', value: analysis.metrics.emotion },
    { label: 'Naturalidade', value: analysis.metrics.naturalness },
    { label: 'Mobile', value: analysis.metrics.mobile },
    { label: 'Canal', value: analysis.metrics.channelFit },
    { label: 'Originalidade', value: analysis.metrics.originality },
  ]
  if (analysis.profile === 'music' || analysis.metrics.musicIdentity != null) {
    metrics.push({ label: 'Identidade', value: analysis.metrics.musicIdentity })
  }
  if (analysis.profile === 'history' || analysis.metrics.narrativePromise != null) {
    metrics.push({ label: 'Promessa', value: analysis.metrics.narrativePromise })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-card-2 p-3">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-2">Força do título</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className={cn('text-lg font-semibold', scoreTone(analysis.score))}>{analysis.score}/100</p>
          <p className="text-xs font-medium text-muted">{titleScoreBand(analysis.score)}</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{analysis.verdict}</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {metrics.map((metric) => (
          <MetricChip key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>

      <div className="space-y-1 rounded-lg bg-black/15 px-2 py-1.5 text-[11px] text-muted">
        <p>
          <span className="text-muted-2">Primeiros 45: </span>
          {facts.first45 || '—'}
        </p>
        <p>
          <span className="text-muted-2">Primeiros 60: </span>
          {facts.first60 || '—'}
        </p>
        <p className="text-muted-2">Se truncar aí, a promessa ainda fica clara?</p>
      </div>

      {analysis.strengths.length > 0 ? (
        <div>
          <p className="text-[11px] font-medium text-muted">Pontos fortes</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
            {analysis.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.weaknesses.length > 0 ? (
        <div>
          <p className="text-[11px] font-medium text-muted">O que pode melhorar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
            {analysis.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.alternatives.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted">Sugestões</p>
          {analysis.alternatives.map((item) => (
            <div key={`${item.strategy}-${item.title}`} className="rounded-lg border border-border-soft px-2 py-2">
              <p className="text-xs font-medium leading-snug text-text">{item.title}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-2">
                {TITLE_STRATEGY_LABEL[item.strategy]}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{item.reason}</p>
              {onUseTitle ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 h-7 px-2 text-[11px]"
                  onClick={() => onUseTitle(item.title)}
                >
                  Usar este título
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
