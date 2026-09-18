import type { ReactNode } from 'react'
import { CalendarDays, ImagePlus } from 'lucide-react'
import type { ChannelVideoStatus } from '@shared/types'
import { parseDateKey } from '@shared/channelVideos'
import { Card } from './Card'
import { Button } from './Button'
import { StatusBadge } from './StatusBadge'
import { cn } from '../lib/utils'

export function formatPublicationDate(dateKey: string): string {
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Field({
  label,
  children,
  compact,
}: {
  label: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className={cn('font-medium uppercase tracking-wide text-muted-2', compact ? 'text-[10px]' : 'text-[11px]')}>
        {label}
      </p>
      <div className={cn('mt-0.5 min-w-0 text-text', compact ? 'text-sm' : 'text-sm leading-relaxed')}>{children}</div>
    </div>
  )
}

export function MusicPublicationCard({
  title,
  description,
  thumbnailDataUrl,
  channelName,
  scheduledDate,
  status,
  compact = false,
  bare = false,
  onOpen,
}: {
  title: string
  description?: string | null
  thumbnailDataUrl?: string | null
  channelName?: string | null
  scheduledDate?: string | null
  status?: ChannelVideoStatus | null
  compact?: boolean
  bare?: boolean
  onOpen?: () => void
}) {
  const dateLabel = scheduledDate ? formatPublicationDate(scheduledDate) : null
  const desc = description?.trim() || ''
  const dateFieldLabel = status === 'publicado' ? 'Publicado em' : 'Agendado para'

  const content = (
    <div className={cn('flex gap-4', compact ? 'flex-col' : 'flex-col lg:flex-row')}>
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-border-soft bg-card-2',
          compact ? 'aspect-video w-full' : 'aspect-video w-full shrink-0 lg:w-[280px]',
        )}
      >
        {thumbnailDataUrl ? (
          <img src={thumbnailDataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-2">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {status ? <StatusBadge status={status} /> : null}
        </div>

        <Field label="Título" compact={compact}>
          <p className={cn('font-semibold text-text', compact ? 'line-clamp-2' : '')}>{title || 'Sem título'}</p>
        </Field>

        <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
          <Field label="Canal" compact={compact}>
            <p className="truncate">{channelName || 'Sem canal'}</p>
          </Field>
          <Field label={dateFieldLabel} compact={compact}>
            <p>{dateLabel || 'Sem data'}</p>
          </Field>
        </div>

        <Field label="Descrição" compact={compact}>
          {desc ? (
            <p
              className={cn(
                'whitespace-pre-wrap leading-relaxed text-muted',
                compact ? 'line-clamp-4 text-xs' : 'max-h-48 overflow-y-auto text-sm',
              )}
            >
              {desc}
            </p>
          ) : (
            <p className="text-xs text-muted-2">Sem descrição</p>
          )}
        </Field>

        {onOpen ? (
          <Button
            variant="secondary"
            className="h-9 px-3 text-xs"
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            {status === 'publicado' ? 'Abrir em vídeos publicados' : 'Abrir no calendário'}
          </Button>
        ) : null}
      </div>
    </div>
  )

  if (bare) return content
  return (
    <Card padding="sm" className={cn('flex flex-col', compact && 'h-full')}>
      {content}
    </Card>
  )
}
