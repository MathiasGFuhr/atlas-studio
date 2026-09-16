import { Sparkles, Gauge, Heart, Waves, Copy } from 'lucide-react'

export function QualityScore({
  originality,
  retention,
  naturalness,
  similarity,
}: {
  originality?: number | null
  retention?: number | null
  naturalness?: number | null
  similarity?: number | null
}) {
  const rows = [
    { label: 'Originalidade', value: originality, icon: Sparkles },
    { label: 'Retenção', value: retention, icon: Gauge },
    { label: 'Naturalidade', value: naturalness, icon: Heart },
    {
      label: 'Similaridade',
      value: similarity,
      icon: Waves,
      suffix: '%',
      warn: true,
    },
  ]

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <row.icon className="h-4 w-4 text-accent" />
            {row.label}
          </div>
          <div
            className={
              row.value == null
                ? 'text-sm text-muted-2'
                : row.warn
                  ? 'text-sm font-semibold text-warning'
                  : 'text-sm font-semibold text-text'
            }
          >
            {row.value == null ? 'Não analisado' : `${row.value}${row.suffix ?? ''}`}
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-muted-2">
        Métricas reais só aparecem após auditoria. Sem números inventados.
      </p>
    </div>
  )
}

export function CopyHint() {
  return <Copy className="h-4 w-4" />
}
