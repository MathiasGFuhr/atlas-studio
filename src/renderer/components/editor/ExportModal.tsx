import { useEffect, useState } from 'react'
import { CheckCircle2, FolderOpen, Loader2, Play } from 'lucide-react'
import {
  EDITOR_EXPORT_RESOLUTIONS,
  EDITOR_EXPORT_RESOLUTION_LABEL,
  editorOutputSize,
  formatDuration,
  type EditorAspect,
  type EditorExportProgress,
  type EditorExportResolution,
} from '@shared/editor/types'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { getAtlasApi } from '../../lib/api'
import { dirnameOf } from '../../lib/editor/editorMedia'
import { useToast } from '../Toast'
import { cn } from '../../lib/utils'

export function ExportModal({
  open,
  projectId,
  aspect,
  duration,
  onBeforeExport,
  onClose,
}: {
  open: boolean
  projectId: string
  aspect: EditorAspect
  duration: number
  /** Garante que a timeline atual está salva antes de renderizar. */
  onBeforeExport: () => Promise<void>
  onClose: () => void
}) {
  const api = getAtlasApi()
  const { pushError } = useToast()
  const [resolution, setResolution] = useState<EditorExportResolution>(1080)
  const [progress, setProgress] = useState<EditorExportProgress | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(
    () =>
      api.editor.onExportProgress((event) => {
        if (event.projectId === projectId) setProgress(event)
      }),
    [api, projectId],
  )

  useEffect(() => {
    if (open && !running) setProgress(null)
  }, [open, running])

  async function start() {
    setRunning(true)
    setProgress(null)
    try {
      await onBeforeExport()
      const output = await api.editor.export({ projectId, resolution })
      if (!output) setProgress(null)
    } catch (error) {
      pushError(error, 'Falha ao exportar o vídeo')
    } finally {
      setRunning(false)
    }
  }

  const outputPath = progress?.stage === 'done' ? (progress.outputPath ?? null) : null
  const done = Boolean(outputPath)
  const failed = progress?.stage === 'failed'

  return (
    <Modal
      open={open}
      title="Exportar vídeo"
      onClose={() => {
        if (!running) onClose()
      }}
      footer={
        done ? (
          <>
            <Button
              variant="secondary"
              icon={<FolderOpen className="h-4 w-4" />}
              onClick={() => {
                if (outputPath) void api.system.openPath(dirnameOf(outputPath))
              }}
            >
              Abrir pasta
            </Button>
            <Button
              icon={<Play className="h-4 w-4" />}
              onClick={() => {
                if (outputPath) void api.system.openPath(outputPath)
              }}
            >
              Assistir
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" disabled={running} onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={running || duration <= 0} onClick={() => void start()}>
              {running ? 'Exportando...' : 'Escolher destino e exportar'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-2">Resolução</p>
          <div className="grid grid-cols-2 gap-2">
            {EDITOR_EXPORT_RESOLUTIONS.map((value) => {
              const size = editorOutputSize(aspect, value)
              return (
                <button
                  key={value}
                  type="button"
                  disabled={running}
                  onClick={() => setResolution(value)}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-60',
                    resolution === value
                      ? 'border-accent/60 bg-accent-subtle'
                      : 'border-border-soft bg-elevated hover:border-border-strong',
                  )}
                >
                  <p className={cn('text-sm font-semibold', resolution === value ? 'text-accent' : 'text-text')}>
                    {EDITOR_EXPORT_RESOLUTION_LABEL[value]} · {value}p
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-2">
                    {size.width}×{size.height} · MP4 H.264
                  </p>
                </button>
              )
            })}
          </div>
          {(resolution === 1440 || resolution === 2160) && (
            <p className="mt-2 text-[10px] leading-relaxed text-muted-2">
              Se a mídia original for menor, o Atlas amplia com Lanczos. O ideal é gravar/exportar a fonte já em
              alta resolução.
            </p>
          )}
        </div>

        <p className="text-xs text-muted">
          Duração: <span className="tabular-nums text-text">{formatDuration(duration)}</span> · formato {aspect}. O
          render usa os arquivos originais, não os proxies.
        </p>

        {progress && !done && progress.stage !== 'done' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              {failed ? null : <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
              <span className={failed ? 'text-danger' : 'text-muted'}>{progress.message}</span>
            </div>
            {!failed ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${progress.percent ?? 0}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {done ? (
          <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-subtle px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">Vídeo exportado</p>
              <p className="truncate text-xs text-muted" title={outputPath ?? ''}>
                {outputPath}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
