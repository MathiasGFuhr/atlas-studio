import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Pause, Play, RotateCcw, Send, Square } from 'lucide-react'
import type { ComfyBatchView, ComfyConfig, ComfyJobStatus } from '@shared/comfy'
import { planComfyScenes } from '@shared/comfy'
import type { LipSyncRef } from '@shared/lipSyncRefs'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { getAtlasApi } from '../../lib/api'
import { useToast } from '../Toast'
import { cn } from '../../lib/utils'

const POLL_MS = 2_000

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

export function ComfyBatchModal({
  open,
  onClose,
  items,
  projectId,
  beforeStart,
}: {
  open: boolean
  onClose: () => void
  items: LipSyncRef[]
  projectId: string | null
  /** Salva rascunhos abertos antes do envio, para o ComfyUI receber o prompt atual. */
  beforeStart: () => Promise<void>
}) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push, pushError } = useToast()
  const [config, setConfig] = useState<ComfyConfig | null>(null)
  const [view, setView] = useState<ComfyBatchView | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    const load = () =>
      api.comfy
        .latest()
        .then((next) => {
          if (active) setView(next)
        })
        .catch(() => {})
    void api.comfy.getConfig().then((next) => {
      if (active) setConfig(next)
    })
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [api, open])

  const plan = useMemo(() => planComfyScenes(items, config?.durationPadding ?? 1), [items, config])
  const batch = view?.batch ?? null
  const inProgress = batch?.status === 'running' || batch?.status === 'paused'
  const missingSetup = config ? !config.baseUrl || !config.workflowMapping : false

  async function run(action: () => Promise<ComfyBatchView | null>) {
    setBusy(true)
    try {
      const next = await action()
      if (next) setView(next)
    } catch (error) {
      pushError(error, 'Não foi possível atualizar o envio.')
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    setBusy(true)
    try {
      await beforeStart()
      const result = await api.comfy.start(projectId)
      setView(result.view)
      push(
        result.skipped.length > 0
          ? `${result.view.jobs.length} cenas enviadas; ${result.skipped.length} ficaram de fora.`
          : `${result.view.jobs.length} cenas enviadas para o ComfyUI.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível começar o envio.')
    } finally {
      setBusy(false)
    }
  }

  const counts = view?.counts
  const footer = inProgress ? (
    <>
      <Button
        variant="danger"
        icon={<Square className="h-4 w-4" />}
        disabled={busy}
        onClick={() => void run(() => api.comfy.cancel(batch!.id))}
      >
        Cancelar envio
      </Button>
      {batch?.status === 'running' ? (
        <Button
          variant="secondary"
          icon={<Pause className="h-4 w-4" />}
          disabled={busy}
          onClick={() => void run(() => api.comfy.pause(batch.id))}
        >
          Pausar
        </Button>
      ) : (
        <Button
          icon={<Play className="h-4 w-4" />}
          disabled={busy}
          onClick={() => void run(() => api.comfy.resume(batch!.id))}
        >
          Retomar
        </Button>
      )}
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={onClose}>
        Fechar
      </Button>
      <Button
        icon={<Send className="h-4 w-4" />}
        disabled={busy || missingSetup || plan.scenes.length === 0}
        onClick={() => void start()}
      >
        {plan.scenes.length === 1 ? 'Enviar 1 cena' : `Enviar ${plan.scenes.length} cenas`}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Gerar vídeos no ComfyUI" onClose={onClose} size="lg" footer={footer}>
      <div className="space-y-4 text-sm">
        {missingSetup ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text">
            Falta configurar {!config?.baseUrl ? 'a URL do ComfyUI' : 'o workflow'}.{' '}
            <button
              type="button"
              className="font-semibold text-accent hover:text-accent-hover"
              onClick={() => navigate('/configuracoes#comfy')}
            >
              Abrir Configurações
            </button>
          </div>
        ) : null}

        {!inProgress ? (
          <div className="space-y-1.5">
            <p className="text-text">
              {plan.scenes.length} de {items.length} cenas prontas (imagem, áudio e prompt).
              {config ? ` Até ${config.queueSize} ficam na fila do ComfyUI; cada vídeo é baixado assim que termina.` : ''}
            </p>
            {plan.problems.length > 0 ? (
              <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs text-warning">
                {plan.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {view && batch ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {batch.status === 'running'
                  ? 'Enviando'
                  : batch.status === 'paused'
                    ? 'Pausado (as cenas que já estão no ComfyUI terminam)'
                    : batch.status === 'done'
                      ? 'Último envio concluído'
                      : 'Último envio cancelado'}
                {counts
                  ? ` · ${counts.done} prontas · ${counts.queued + counts.uploading} no ComfyUI · ${counts.pending} aguardando${counts.error ? ` · ${counts.error} com erro` : ''}`
                  : ''}
              </p>
              <div className="flex gap-2">
                {counts && (counts.error > 0 || counts.canceled > 0) ? (
                  <Button
                    variant="secondary"
                    className="h-8 px-3 py-0 text-xs"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    disabled={busy}
                    onClick={() => void run(() => api.comfy.retryFailed(batch.id))}
                  >
                    Reenviar com erro
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="h-8 px-3 py-0 text-xs"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  disabled={!counts?.done}
                  onClick={() => void api.system.openPath(batch.outputDir)}
                >
                  Abrir pasta
                </Button>
              </div>
            </div>

            {batch.lastError && inProgress ? (
              <p className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                {batch.lastError} O Atlas tenta de novo sozinho.
              </p>
            ) : null}

            <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {view.jobs.map((job) => (
                <li key={job.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-8 shrink-0 text-xs font-semibold tabular-nums text-muted-2">
                    {String(job.sceneNumber).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-xs font-medium', STATUS_CLASS[job.status])}>
                      {STATUS_LABEL[job.status]}
                      <span className="font-normal text-muted-2"> · {job.duration} s</span>
                    </span>
                    {job.error ? <span className="block truncate text-[11px] text-muted" title={job.error}>{job.error}</span> : null}
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
    </Modal>
  )
}
