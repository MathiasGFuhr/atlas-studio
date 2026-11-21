import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, FolderOpen, Loader2, Play, X } from 'lucide-react'
import {
  clampExportPercent,
  formatExportBarLabel,
  pickPrimaryExportBarJob,
} from '@shared/editor/exportJob'
import { useOptionalEditorExport } from '../../hooks/useEditorExport'
import { getAtlasApi } from '../../lib/api'
import { dirnameOf } from '../../lib/editor/editorMedia'
import { cn } from '../../lib/utils'

export function EditorExportTopBar() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const editorExport = useOptionalEditorExport()
  const jobs = editorExport?.jobs

  const { primary, activeCount } = useMemo(
    () => (jobs ? pickPrimaryExportBarJob(jobs) : { primary: null, activeCount: 0 }),
    [jobs],
  )

  if (!editorExport || !primary) return null
  const { dismissJob, requestOpenModal } = editorExport

  const percent = primary.status === 'done' ? 100 : clampExportPercent(primary.percent)
  const label = formatExportBarLabel(primary)
  const projectName = primary.projectName.trim()
  const failed = primary.status === 'failed'
  const done = primary.status === 'done'
  const rendering = primary.status === 'rendering'
  const outputPath = primary.outputPath

  function handleInspect() {
    if (!primary) return
    const editorPath = `/editor/${primary.projectId}`
    if (pathname === editorPath) {
      requestOpenModal(primary.projectId)
      return
    }
    navigate(editorPath)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'relative z-30 flex h-7 shrink-0 items-center justify-between gap-3 border-b border-border-soft px-3 text-xs sm:px-5',
        failed ? 'bg-danger-subtle/35' : 'bg-topbar/95',
      )}
    >
      <button
        type="button"
        onClick={handleInspect}
        title={rendering ? 'Abrir detalhes da exportação' : 'Ir para o projeto no editor'}
        className="flex min-w-0 items-center gap-2 text-left transition-opacity hover:opacity-85"
      >
        {rendering ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
        ) : done ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
        )}

        <span className={cn('shrink-0 font-medium', failed ? 'text-danger' : 'text-muted')}>
          {label}
        </span>

        {projectName ? (
          <>
            <span className="text-muted-2">·</span>
            <span className="truncate font-medium text-text">{projectName}</span>
          </>
        ) : null}

        {failed && primary.error ? (
          <>
            <span className="text-muted-2">·</span>
            <span className="truncate text-[11px] text-danger/90">{primary.error}</span>
          </>
        ) : null}

        {rendering && activeCount > 1 ? (
          <span className="shrink-0 rounded bg-hover px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
            +{activeCount - 1}
          </span>
        ) : null}
      </button>

      <div className="flex shrink-0 items-center gap-2.5">
        {rendering ? (
          <>
            <div
              aria-hidden="true"
              className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-hover sm:block md:w-32"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="min-w-[2.5rem] text-right text-[11px] font-semibold tabular-nums text-accent">
              {percent}%
            </span>
          </>
        ) : null}

        {done && outputPath ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                void api.system.openPath(primary.mode === 'clips' ? outputPath : dirnameOf(outputPath))
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
            >
              <FolderOpen className="h-3 w-3" />
              <span className="hidden sm:inline">Abrir pasta</span>
            </button>
            {primary.mode === 'single' ? (
              <button
                type="button"
                onClick={() => void api.system.openPath(outputPath)}
                className="inline-flex items-center gap-1 rounded-md bg-accent-subtle px-2 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                <Play className="h-3 w-3" />
                <span>Assistir</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {!rendering ? (
          <button
            type="button"
            onClick={() => dismissJob(primary.projectId)}
            aria-label="Dispensar barra de exportação"
            title="Dispensar"
            className="rounded-md p-0.5 text-muted-2 transition-colors hover:bg-hover hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {!failed ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-border-soft/40"
        >
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

