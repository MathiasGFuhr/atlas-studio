import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Clapperboard, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { ShortsJob } from '@shared/shorts'
import { formatShortsTimecode } from '@shared/shorts'
import {
  exportedShortsCount,
  shortsProfileLabel,
  shortsProjectStatusLabel,
} from '@shared/shortsProject'
import { Card } from '../Card'
import { Button } from '../Button'
import { getAtlasApi } from '../../lib/api'
import { useToast } from '../Toast'
import { formatRelativeDate } from '../../lib/utils'
import { cn } from '../../lib/utils'

function formatEditedLabel(iso: string): string {
  const relative = formatRelativeDate(iso)
  if (relative.startsWith('Hoje')) return 'Editado hoje'
  if (relative === 'Ontem') return 'Editado ontem'
  return `Editado ${relative}`
}

export function ShortsProjectCard({
  project,
  onOpen,
  onRename,
  onDelete,
}: {
  project: ShortsJob
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const api = getAtlasApi()
  const { push } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState(project.thumbnailUrl)
  const menuRef = useRef<HTMLDivElement>(null)
  const exported = exportedShortsCount(project.clips)
  const duration = project.probe?.duration ?? 0

  useEffect(() => {
    setThumbnailUrl(project.thumbnailUrl)
    if (project.thumbnailUrl || !project.sourceExists) return
    let cancelled = false
    void api.shorts
      .thumbnailUrl(project.id)
      .then((url) => {
        if (!cancelled && url) setThumbnailUrl(url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, project.id, project.thumbnailUrl, project.sourceExists])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  async function openExportsFolder() {
    setMenuOpen(false)
    try {
      await api.shorts.openExportsFolder(project.id)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível abrir a pasta de exports.', 'error')
    }
  }

  return (
    <Card
      padding="sm"
      role="button"
      tabIndex={0}
      className="flex min-w-0 cursor-pointer flex-col overflow-hidden transition-colors hover:border-[#334049]"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-card-2">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-2">
            <Clapperboard className="h-8 w-8" />
          </div>
        )}
        {!project.sourceExists ? (
          <div className="absolute inset-x-2 bottom-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] text-danger">
            Arquivo original não encontrado.
          </div>
        ) : null}
      </div>

      <div className="mt-3 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-text">{project.name}</h3>
            <p className="mt-0.5 truncate text-xs text-muted">{project.sourceName}</p>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className="rounded-md p-1 text-muted hover:bg-white/5 hover:text-text"
              aria-label="Mais opções"
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen((open) => !open)
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[200px] rounded-xl border border-border-soft bg-card-2 py-1 shadow-lg"
                onClick={(event) => event.stopPropagation()}
              >
                <MenuItem
                  label="Abrir"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpen()
                  }}
                />
                <MenuItem
                  label="Renomear"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setMenuOpen(false)
                    onRename()
                  }}
                />
                <MenuItem
                  label="Abrir pasta de exports"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  onClick={() => {
                    void openExportsFolder()
                  }}
                />
                <MenuItem
                  label="Excluir projeto"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  danger
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete()
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <p className="mt-2 text-xs font-medium text-muted">{shortsProfileLabel(project.profile)}</p>
        <div className="mt-2 space-y-1 text-xs text-muted">
          <p>Vídeo: {duration ? formatShortsTimecode(duration) : '—'}</p>
          {project.clips.length ? (
            <>
              <p>
                {project.clips.length} {project.clips.length === 1 ? 'Short' : 'Shorts'}
              </p>
              <p>
                {exported} {exported === 1 ? 'exportado' : 'exportados'}
              </p>
            </>
          ) : (
            <p>{shortsProjectStatusLabel(project)}</p>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-2">{formatEditedLabel(project.updatedAt)}</p>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="secondary"
          className="h-9 px-3 text-xs"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          Abrir
        </Button>
      </div>
    </Card>
  )
}

function MenuItem({
  label,
  onClick,
  icon,
  danger,
}: {
  label: string
  onClick: () => void
  icon?: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5',
        danger ? 'text-danger' : 'text-text',
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}
