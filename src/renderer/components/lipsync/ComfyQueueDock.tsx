import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  Clapperboard,
  FolderOpen,
  Minus,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  X,
} from 'lucide-react'
import type { ComfyBatchView, ComfyJobStatus } from '@shared/comfy'
import {
  estimateComfyTiming,
  formatComfyDuration,
  isComfyBatchInProgress,
} from '@shared/comfy'
import { Button } from '../Button'
import { useToast } from '../Toast'
import { useComfyQueue } from '../../hooks/useComfyQueue'
import { getAtlasApi } from '../../lib/api'
import { cn } from '../../lib/utils'

const STATUS_LABEL: Record<ComfyJobStatus, string> = {
  pending: 'Aguardando no Atlas',
  uploading: 'Enviando arquivos',
  queued: 'Na fila do ComfyUI',
  downloading: 'Baixando vídeo',
  done: 'Pronto',
  error: 'Erro',
  canceled: 'Cancelado',
}

const STATUS_CLASS: Record<ComfyJobStatus, string> = {
  pending: 'text-muted-2',
  uploading: 'text-text',
  queued: 'text-text',
  downloading: 'text-accent',
  done: 'text-accent',
  error: 'text-danger',
  canceled: 'text-muted-2',
}

function timingLabel(view: ComfyBatchView, now: number): string {
  const timing = estimateComfyTiming(view.batch, view.jobs, now)
  const elapsed = formatComfyDuration(timing.elapsedMs)
  if (timing.finished) {
    return view.batch.status === 'canceled' ? `cancelado após ${elapsed}` : `terminou em ${elapsed}`
  }
  if (timing.remainingMs == null) return `${elapsed} decorridos · estimativa após a 1ª cena`
  return `${elapsed} decorridos · falta ~${formatComfyDuration(timing.remainingMs)}`
}

function summary(view: ComfyBatchView): string {
  const { counts, jobs } = view
  return `${counts.done}/${jobs.length}`
}

function jobStatusLabel(status: ComfyJobStatus, trimToAudio: boolean): string {
  if (status === 'downloading' && trimToAudio) return 'Baixando e ajustando'
  return STATUS_LABEL[status]
}

export function ComfyQueueDock() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const queue = useComfyQueue()
  const { pushError } = useToast()
  const [now, setNow] = useState(() => Date.now())

  async function persistTrimToAudio(next: boolean) {
    const config = queue.config
    if (!config) return
    try {
      const saved = await api.comfy.saveConfig({
        baseUrl: config.baseUrl,
        queueSize: config.queueSize,
        durationPadding: config.durationPadding,
        trimToAudio: next,
      })
      queue.setConfig(saved)
    } catch (error) {
      pushError(error, 'Não foi possível salvar a opção de corte.')
    }
  }

  useEffect(() => {
    if (!queue.visible) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [queue.visible])

  const selected = queue.selectedId
    ? (queue.views.find((view) => view.batch.id === queue.selectedId) ??
      queue.views.find((view) => isComfyBatchInProgress(view.batch.status)) ??
      null)
    : queue.pending
      ? null
      : (queue.views.find((view) => isComfyBatchInProgress(view.batch.status)) ??
        queue.views[queue.views.length - 1] ??
        null)
  const inProgress = selected ? isComfyBatchInProgress(selected.batch.status) : false
  const missingSetup = queue.config ? !queue.config.baseUrl || !queue.config.workflowMapping : false
  const activeViews = useMemo(
    () => queue.views.filter((view) => isComfyBatchInProgress(view.batch.status)),
    [queue.views],
  )

  if (!queue.visible) return null

  if (queue.minimized) {
    const headline =
      activeViews.length === 0 && selected
        ? `${selected.projectName ?? 'ComfyUI'} · ${timingLabel(selected, now)}`
        : activeViews.length === 1
          ? `${activeViews[0].projectName ?? 'ComfyUI'} · ${summary(activeViews[0])} prontas · ${timingLabel(activeViews[0], now)}`
          : `${activeViews.length} vídeos no RunPod · ${activeViews.map((view) => summary(view)).join(' + ')}`
    return (
      <button
        type="button"
        className="fixed bottom-3 right-3 z-[46] flex max-w-[min(28rem,calc(100vw-6rem))] items-center gap-2 rounded-2xl border border-border-soft bg-card px-3 py-2 text-left shadow-modal"
        onClick={() => queue.expand(selected?.batch.id)}
      >
        <Clapperboard className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate text-xs text-text">{headline}</span>
        <ChevronUp className="h-4 w-4 shrink-0 text-muted" />
      </button>
    )
  }

  const counts = selected?.counts
  const showingComposer = Boolean(queue.pending) && !inProgress

  return (
    <div className="fixed bottom-3 right-3 z-[46] flex w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border-soft bg-card shadow-modal">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Clapperboard className="h-4 w-4 shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">Gerar vídeos no ComfyUI</h2>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-text"
          aria-label="Minimizar"
          onClick={queue.minimize}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-text"
          aria-label={inProgress ? 'Minimizar' : 'Fechar'}
          onClick={queue.dismiss}
        >
          {inProgress ? <ChevronDown className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </div>

      {queue.views.length > 1 || (queue.pending && queue.views.length > 0) ? (
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {queue.pending ? (
            <button
              type="button"
              className={cn(
                'rounded-lg px-2 py-1 text-[11px] font-medium',
                !queue.selectedId ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-hover',
              )}
              onClick={() => queue.select(null)}
            >
              Novo
            </button>
          ) : null}
          {queue.views.map((view) => (
            <button
              key={view.batch.id}
              type="button"
              className={cn(
                'max-w-[9rem] truncate rounded-lg px-2 py-1 text-[11px] font-medium',
                selected?.batch.id === view.batch.id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-hover',
              )}
              onClick={() => queue.select(view.batch.id)}
            >
              {view.projectName ?? 'Projeto'} · {summary(view)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto p-3 text-sm">
        {missingSetup ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text">
            Falta configurar {!queue.config?.baseUrl ? 'a URL do ComfyUI' : 'o workflow'}.{' '}
            <button
              type="button"
              className="font-semibold text-accent hover:text-accent-hover"
              onClick={() => navigate('/configuracoes#comfy')}
            >
              Abrir Configurações
            </button>
          </div>
        ) : null}

        {showingComposer && queue.pending ? (
          <div className="space-y-1.5">
            <p className="text-text">
              {queue.pending.projectName}: {queue.pending.sceneCount} de {queue.pending.totalCount} cenas
              prontas.
            </p>
            <p className="truncate text-xs text-muted" title={queue.pending.outputDir ?? undefined}>
              {queue.pending.outputDir
                ? `Vídeos em ${queue.pending.outputDir}`
                : 'Vincule a pasta com “Puxar da pasta”. Os vídeos só são gravados em lipsync, dentro dela.'}
            </p>
            {queue.pending.problems.length > 0 ? (
              <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-warning">
                {queue.pending.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2 pt-1 text-xs text-text">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                checked={Boolean(queue.config?.trimToAudio)}
                onChange={(event) => void persistTrimToAudio(event.target.checked)}
              />
              <span>
                Cortar no tempo do áudio ao baixar
                <span className="mt-0.5 block text-muted-2">
                  Sem isso, o vídeo fica com a folga enviada ao Comfy.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-xs text-muted">
                {selected.projectName ? `${selected.projectName} · ` : ''}
                {timingLabel(selected, now)}
                {counts
                  ? ` · ${counts.done} prontas · ${counts.queued + counts.uploading} no ComfyUI · ${counts.pending} aguardando${counts.error ? ` · ${counts.error} com erro` : ''}`
                  : ''}
                {selected.batch.outputDir ? (
                  <span className="mt-0.5 block truncate text-[11px] text-muted-2" title={selected.batch.outputDir}>
                    {selected.batch.outputDir}
                  </span>
                ) : null}
              </p>
              <div className="flex gap-2">
                {counts && (counts.error > 0 || counts.canceled > 0) ? (
                  <Button
                    variant="secondary"
                    className="h-8 px-3 py-0 text-xs"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    disabled={queue.busy}
                    onClick={() => void queue.retryFailed(selected.batch.id)}
                  >
                    Reenviar
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="h-8 px-3 py-0 text-xs"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  disabled={!selected.batch.outputDir}
                  title={selected.batch.outputDir}
                  onClick={() => void api.system.openPath(selected.batch.outputDir)}
                >
                  Pasta
                </Button>
              </div>
            </div>

            {selected.batch.lastError && inProgress ? (
              <p className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                {selected.batch.lastError} O Atlas tenta de novo sozinho.
              </p>
            ) : null}

            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {selected.jobs.map((job) => (
                <li key={job.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-8 shrink-0 text-xs font-semibold tabular-nums text-muted-2">
                    {String(job.sceneNumber).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-xs font-medium', STATUS_CLASS[job.status])}>
                      {jobStatusLabel(job.status, Boolean(queue.config?.trimToAudio))}
                      <span className="font-normal text-muted-2"> · {job.duration} s</span>
                    </span>
                    {job.error ? (
                      <span className="block truncate text-[11px] text-muted" title={job.error}>
                        {job.error}
                      </span>
                    ) : null}
                  </span>
                  {job.status === 'done' && job.outputPath ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs font-semibold text-accent hover:text-accent-hover"
                      onClick={() => void api.system.openPath(job.outputPath!)}
                    >
                      Abrir
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
        {inProgress && selected ? (
          <>
            <Button
              variant="danger"
              className="h-9 px-3 py-0 text-xs"
              icon={<Square className="h-3.5 w-3.5" />}
              disabled={queue.busy}
              onClick={() => void queue.cancel(selected.batch.id)}
            >
              Cancelar
            </Button>
            {selected.batch.status === 'running' ? (
              <Button
                variant="secondary"
                className="h-9 px-3 py-0 text-xs"
                icon={<Pause className="h-3.5 w-3.5" />}
                disabled={queue.busy}
                onClick={() => void queue.pause(selected.batch.id)}
              >
                Pausar
              </Button>
            ) : (
              <Button
                className="h-9 px-3 py-0 text-xs"
                icon={<Play className="h-3.5 w-3.5" />}
                disabled={queue.busy}
                onClick={() => void queue.resume(selected.batch.id)}
              >
                Retomar
              </Button>
            )}
          </>
        ) : showingComposer && queue.pending ? (
          <Button
            className="h-9 px-3 py-0 text-xs"
            icon={<Send className="h-3.5 w-3.5" />}
            disabled={queue.busy || missingSetup || queue.pending.sceneCount === 0 || !queue.pending.outputDir}
            onClick={() => void queue.startPending()}
          >
            {queue.pending.sceneCount === 1
              ? 'Enviar 1 cena'
              : `Enviar ${queue.pending.sceneCount} cenas`}
          </Button>
        ) : (
          <Button variant="secondary" className="h-9 px-3 py-0 text-xs" onClick={queue.dismiss}>
            Fechar
          </Button>
        )}
      </div>
    </div>
  )
}
