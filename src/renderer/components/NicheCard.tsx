import { AlertTriangle, Globe, MoreVertical, Pencil } from 'lucide-react'
import type { Niche } from '@shared/types'
import { Card } from './Card'
import { Button } from './Button'
import { StatusBadge } from './StatusBadge'

const gradients = [
  'linear-gradient(145deg,#254036,#10171c)',
  'linear-gradient(145deg,#3a2430,#141014)',
  'linear-gradient(145deg,#24344a,#10151c)',
  'linear-gradient(145deg,#3a3020,#16120e)',
  'linear-gradient(145deg,#2a2440,#12141c)',
  'linear-gradient(145deg,#20363a,#0f1618)',
]

function extractSkillName(skillPath: string | undefined | null): string | null {
  if (!skillPath?.trim()) return null
  const segments = skillPath.split(/[/\\]/).filter(Boolean)
  return segments.pop() ?? null
}

export function NicheCard({
  niche,
  index = 0,
  onEdit,
}: {
  niche: Niche
  index?: number
  onEdit?: () => void
}) {
  const skillName = extractSkillName(niche.skillPath)

  return (
    <Card className="flex flex-col gap-4 transition-colors hover:border-[#334049]">
      <div className="flex gap-3">
        <div
          className="h-16 w-16 shrink-0 rounded-xl border border-border-soft"
          style={{ background: gradients[index % gradients.length] }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-semibold text-text">{niche.name}</h3>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                <Globe className="h-3.5 w-3.5" />
                {niche.defaultLanguage}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted hover:bg-white/5"
              aria-label="Editar nicho"
              onClick={onEdit}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{niche.description}</p>
        </div>
      </div>

      {/* Skill associada */}
      <div className="rounded-lg border border-border-soft/50 bg-white/[0.02] px-3 py-2">
        {skillName ? (
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-2">
              Skill
            </span>
            <p className="mt-0.5 truncate text-xs font-mono text-muted" title={niche.skillPath}>
              {skillName}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-500/80" />
            <span className="text-[11px] text-yellow-500/80">Sem skill associada</span>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between">
        <StatusBadge status={niche.active ? 'ativo' : 'rascunho'} label={niche.active ? 'Ativo' : 'Inativo'} />
        <Button variant="secondary" className="h-9 px-3 text-xs" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
          Editar
        </Button>
      </div>
    </Card>
  )
}
