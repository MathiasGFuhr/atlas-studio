import type { TitleStrengthAnalysis } from '@shared/types'
import { cn } from '../lib/utils'

function scoreTone(score: number): string {
  if (score >= 80) return 'text-accent'
  if (score >= 60) return 'text-warning'
  return 'text-danger'
}

export function TitleScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return <span className="text-[11px] text-muted-2">Sem nota</span>
  }
  return (
    <span className={cn('text-[11px] font-semibold', scoreTone(score))}>
      Força {score}/100
    </span>
  )
}

export function TitleScorePanel({ analysis }: { analysis: TitleStrengthAnalysis | null | undefined }) {
  if (!analysis) {
    return <p className="text-xs text-muted-2">Ainda sem análise do Antigravity neste título.</p>
  }

  const metrics = [
    { label: 'Curiosidade', value: analysis.curiosity },
    { label: 'Clareza', value: analysis.clarity },
    { label: 'Emoção', value: analysis.emotion },
    { label: 'Tamanho', value: analysis.length },
    { label: 'Especificidade', value: analysis.specificity },
  ]

  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-card-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-lg font-semibold', scoreTone(analysis.score))}>{analysis.score}/100</p>
        <p className="text-xs leading-relaxed text-muted">{analysis.verdict}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg bg-black/20 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-2">{metric.label}</p>
            <p className="text-xs font-medium text-text">
              {metric.value == null ? '—' : `${metric.value}`}
            </p>
          </div>
        ))}
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
          <p className="text-[11px] font-medium text-muted">O que enfraquece</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
            {analysis.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.suggestions.length > 0 ? (
        <div>
          <p className="text-[11px] font-medium text-muted">Títulos mais fortes</p>
          <ul className="mt-1 space-y-1 text-xs text-text">
            {analysis.suggestions.map((item) => (
              <li key={item} className="rounded-lg border border-border-soft px-2 py-1.5">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
