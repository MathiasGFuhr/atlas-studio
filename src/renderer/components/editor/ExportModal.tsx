import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Film, FolderOpen, Loader2, Play, Scissors } from 'lucide-react'
import { isExportJobInFlight } from '@shared/editor/exportJob'
import {
  EDITOR_EXPORT_RESOLUTIONS,
  EDITOR_EXPORT_RESOLUTION_LABEL,
  editorOutputSize,
  formatDuration,
  type EditorAspect,
  type EditorExportResolution,
} from '@shared/editor/types'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { getAtlasApi } from '../../lib/api'
import { dirnameOf } from '../../lib/editor/editorMedia'
import { useEditorExport } from '../../hooks/useEditorExport'
import { cn } from '../../lib/utils'

type ExportMode = 'single' | 'clips'

export function ExportModal({
  open,
  projectId,
  projectName,
  aspect,
  duration,
  videoClipCount,
  selectedVideoClipIds,
  onBeforeExport,
  onClose,
}: {
  open: boolean
  projectId: string
  projectName: string
  aspect: EditorAspect
  duration: number
  videoClipCount: number
  selectedVideoClipIds: string[]
  /** Garante que a timeline atual está salva antes de renderizar. */
  onBeforeExport: () => Promise<void>
  onClose: () => void
}) {
  const api = getAtlasApi()
  const editorExport = useEditorExport()
  const [mode, setMode] = useState<ExportMode>('single')
  const [resolution, setResolution] = useState<EditorExportResolution>(1080)
  const [videoOnly, setVideoOnly] = useState(false)
  const [maxQuality, setMaxQuality] = useState(false)
  const [keepClipAudio, setKeepClipAudio] = useState(true)
  const [onlySelectedClips, setOnlySelectedClips] = useState(false)
  const wasOpenRef = useRef(false)
  const autoCloseArmedRef = useRef(false)

  const job = editorExport.jobFor(projectId)
  const status = job?.status ?? null
  const picking = status === 'picking'
  const rendering = status === 'rendering'
  const running = picking || rendering
  const done = status === 'done' && Boolean(job?.outputPath)
  const failed = status === 'failed'
  const outputPath = done ? (job?.outputPath ?? null) : null
  const activeMode = running || done || failed ? (job?.mode ?? mode) : mode

  useEffect(() => {
    editorExport.setModalOpen(projectId, open)
    return () => editorExport.setModalOpen(projectId, false)
  }, [editorExport, open, projectId])

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (!justOpened) return

    autoCloseArmedRef.current = false
    if (job && !isExportJobInFlight(job)) {
      editorExport.dismissJob(projectId)
    }
    if (!isExportJobInFlight(job)) {
      if (selectedVideoClipIds.length === 0 || selectedVideoClipIds.length >= videoClipCount) {
        setOnlySelectedClips(false)
      }
    } else if (job) {
      setMode(job.mode)
    }
  }, [editorExport, job, open, projectId, selectedVideoClipIds.length, videoClipCount])

  useEffect(() => {
    if (!open || !autoCloseArmedRef.current) return
    if (status === 'rendering') {
      autoCloseArmedRef.current = false
      onClose()
    } else if (status === null || status === 'failed') {
      autoCloseArmedRef.current = false
    }
  }, [onClose, open, status])

  const handleClose = useCallback(() => {
    if (picking) return
    if (done || failed) editorExport.dismissJob(projectId)
    onClose()
  }, [done, editorExport, failed, onClose, picking, projectId])

  async function start() {
    autoCloseArmedRef.current = true
    if (mode === 'clips') {
      const useSelection =
        onlySelectedClips &&
        selectedVideoClipIds.length > 0 &&
        selectedVideoClipIds.length < videoClipCount
      await editorExport.startExport({
        mode: 'clips',
        projectId,
        projectName,
        clipIds: useSelection ? selectedVideoClipIds : undefined,
        stripAudio: !keepClipAudio,
        maxQuality,
        onBeforeExport,
      })
      return
    }
    await editorExport.startExport({
      mode: 'single',
      projectId,
      projectName,
      resolution,
      videoOnly,
      maxQuality: maxQuality || videoOnly,
      onBeforeExport,
    })
  }

  const canFilterSelection =
    selectedVideoClipIds.length > 0 && selectedVideoClipIds.length < videoClipCount
  const clipsToExportCount =
    onlySelectedClips && canFilterSelection ? selectedVideoClipIds.length : videoClipCount

  return (
    <Modal
      open={open}
      title="Exportar vídeo"
      onClose={handleClose}
      footer={
        done ? (
          activeMode === 'clips' ? (
            <>
              <Button variant="secondary" onClick={handleClose}>
                Fechar
              </Button>
              <Button
                icon={<FolderOpen className="h-4 w-4" />}
                onClick={() => {
                  if (outputPath) void api.system.openPath(outputPath)
                }}
              >
                Abrir pasta
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose}>
                Fechar
              </Button>
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
          )
        ) : rendering ? (
          <Button variant="secondary" onClick={handleClose}>
            Continuar em segundo plano
          </Button>
        ) : picking ? (
          <>
            <Button variant="secondary" disabled onClick={handleClose}>
              Cancelar
            </Button>
            <Button disabled>Escolhendo destino...</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              disabled={mode === 'clips' ? clipsToExportCount <= 0 : duration <= 0}
              onClick={() => void start()}
            >
              {mode === 'clips'
                ? 'Escolher pasta e exportar cenas'
                : 'Escolher destino e exportar'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border-soft bg-elevated p-1">
          <button
            type="button"
            disabled={running}
            onClick={() => {
              if (done || failed) editorExport.dismissJob(projectId)
              setMode('single')
            }}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60',
              activeMode === 'single'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-muted hover:text-text',
            )}
          >
            <Film className="h-3.5 w-3.5" />
            Vídeo único
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => {
              if (done || failed) editorExport.dismissJob(projectId)
              setMode('clips')
            }}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60',
              activeMode === 'clips'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-muted hover:text-text',
            )}
          >
            <Scissors className="h-3.5 w-3.5" />
            Cenas cortadas (CapCut)
          </button>
        </div>

        {activeMode === 'single' ? (
          <>
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

            <div className="space-y-2 rounded-xl border border-border-soft bg-elevated p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  disabled={running}
                  checked={videoOnly}
                  onChange={(event) => {
                    const next = event.target.checked
                    setVideoOnly(next)
                    if (next) setMaxQuality(true)
                  }}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-text">
                    Somente vídeo sincronizado (sem música)
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-2">
                    Exporta sem áudio em qualidade máxima (CRF 14) para continuar editando no CapCut.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  disabled={running || videoOnly}
                  checked={maxQuality || videoOnly}
                  onChange={(event) => setMaxQuality(event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="text-xs text-muted">
                  Qualidade máxima (CRF 14 · preset slow)
                </span>
              </label>
            </div>

            <p className="text-xs text-muted">
              Duração: <span className="tabular-nums text-text">{formatDuration(duration)}</span> · formato {aspect}. O
              render usa os arquivos originais, não os proxies.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-border-soft bg-elevated p-3">
              <p className="text-xs font-semibold text-text">
                {clipsToExportCount > 0
                  ? `${clipsToExportCount} ${clipsToExportCount === 1 ? 'cena de vídeo pronta' : 'cenas de vídeo prontas'} para exportar`
                  : 'Nenhum clipe de vídeo encontrado na timeline'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-2">
                Salva cada vídeo da timeline já cortado no ponto exato do encaixe (<code className="text-text">01 - …mp4</code>,{' '}
                <code className="text-text">02 - …mp4</code>) na resolução original, pronto para arrastar em sequência no CapCut.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-border-soft bg-elevated p-3">
              {canFilterSelection ? (
                <label className="flex cursor-pointer items-start gap-2.5 pb-1">
                  <input
                    type="checkbox"
                    disabled={running}
                    checked={onlySelectedClips}
                    onChange={(event) => setOnlySelectedClips(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-text">
                      Exportar apenas os {selectedVideoClipIds.length} selecionados
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-2">
                      Desmarcado exporta todas as {videoClipCount} cenas de vídeo da timeline.
                    </span>
                  </span>
                </label>
              ) : null}
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  disabled={running}
                  checked={keepClipAudio}
                  onChange={(event) => setKeepClipAudio(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-text">
                    Manter áudio original dos clipes (para vincular no CapCut)
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-2">
                    Mantém o áudio de cada cena cortada para você alinhar/vincular facilmente no CapCut.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  disabled={running}
                  checked={maxQuality}
                  onChange={(event) => setMaxQuality(event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="text-xs text-muted">
                  Qualidade máxima (CRF 14 · preset slow)
                </span>
              </label>
            </div>
          </>
        )}

        {(rendering || failed) && job ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              {failed ? null : <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
              <span className={failed ? 'text-danger' : 'text-muted'}>{job.message}</span>
            </div>
            {!failed ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${job.percent ?? 0}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {done ? (
          <div className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent-subtle px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                {activeMode === 'clips' ? job?.message || 'Cenas exportadas' : 'Vídeo exportado'}
              </p>
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
