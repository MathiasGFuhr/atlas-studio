import type { Project } from '@shared/types'
import { ArrowUpRight, Music2 } from 'lucide-react'
import { Card } from '../Card'
import { StatusBadge } from '../StatusBadge'

export function HomeFeaturedProject({
  project,
  onOpen,
}: {
  project: Project | null
  onOpen: () => void
}) {
  if (!project) {
    return (
      <Card padding="lg" className="flex min-h-[280px] flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border-soft bg-elevated text-muted-2">
          <Music2 className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-text">Nenhum projeto em destaque</p>
        <p className="mt-1 max-w-xs text-xs text-muted-2">
          Crie um projeto de Música para ele aparecer aqui.
        </p>
      </Card>
    )
  }

  return (
    <Card padding="sm" className="group relative min-h-[280px] overflow-hidden !p-0">
      <button type="button" onClick={onOpen} className="absolute inset-0 z-10" aria-label={`Abrir ${project.name}`} />
      <div className="absolute inset-0">
        {project.scheduledVideoThumbnailDataUrl ? (
          <img
            src={project.scheduledVideoThumbnailDataUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                'linear-gradient(145deg, var(--color-elevated), var(--color-card))',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-overlay via-overlay/55 to-overlay/10" />
      </div>

      <div className="relative z-[1] flex h-full min-h-[280px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text/70">
            Em destaque
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg/30 text-text/80 backdrop-blur">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>

        <div>
          {project.scheduledVideoStatus ? (
            <StatusBadge
              status={project.scheduledVideoStatus}
              className="mb-3 bg-bg/45 px-2 py-0.5 text-[10px] backdrop-blur"
            />
          ) : null}
          <h2 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-text">
            {project.name}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-text/70">
            {project.description?.trim() ||
              project.scheduledVideoTitle ||
              project.channelName ||
              'Projeto de Música'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text/55">
            <span>Música</span>
            {project.scheduledDate ? (
              <>
                <span aria-hidden>·</span>
                <span>{project.scheduledDate}</span>
              </>
            ) : null}
            {project.trackCount != null ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {project.trackCount} faixa{project.trackCount === 1 ? '' : 's'}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  )
}
