import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ComfyBatchView, ComfyConfig, ComfyConnectionInfo } from '@shared/comfy'
import { comfyBatchesJustFinished, isComfyBatchInProgress } from '@shared/comfy'
import {
  COMFY_CONNECT_SIMULATED_MESSAGE,
  isComfyConnectBusy,
  isComfyConnectReadyForGeneration,
  mapLifecyclePhaseToConnectUi,
  type ComfyConnectGpuAlternative,
  type ComfyConnectUiPhase,
} from '@shared/comfyConnect'
import type { ComfyGpuRecoveryPreview } from '@shared/comfyGpuRecovery'
import type { RunpodStartPreview } from '@shared/runpod'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

export type ComfyFinishedNotice = {
  batchId: string
  projectName: string
  doneCount: number
  errorCount: number
}

export type ComfyPendingStart = {
  projectId: string
  projectName: string
  sceneCount: number
  totalCount: number
  problems: string[]
  outputDir: string | null
  /** Sem isso, envia todas as cenas prontas. */
  refIds?: string[] | null
}

type ComfyQueueValue = {
  views: ComfyBatchView[]
  activeProjectIds: string[]
  config: ComfyConfig | null
  pending: ComfyPendingStart | null
  selectedId: string | null
  minimized: boolean
  visible: boolean
  busy: boolean
  openComposer: (pending: ComfyPendingStart) => void
  startPending: () => Promise<void>
  minimize: () => void
  expand: (batchId?: string) => void
  dismiss: () => void
  select: (batchId: string | null) => void
  pause: (batchId: string) => Promise<void>
  resume: (batchId: string) => Promise<void>
  cancel: (batchId: string) => Promise<void>
  retryFailed: (batchId: string) => Promise<void>
  setConfig: (config: ComfyConfig) => void
  finished: ComfyFinishedNotice | null
  acknowledgeFinished: () => void
  /** Orquestrador compartilhado Conectar / Gerar. */
  connectPhase: ComfyConnectUiPhase
  connectMessage: string
  connectBusy: boolean
  connectPreview: RunpodStartPreview | null
  connectRecovery: ComfyGpuRecoveryPreview | null
  connectAlternatives: ComfyConnectGpuAlternative[]
  connectConnection: ComfyConnectionInfo | null
  connectAcceptBilling: boolean
  setConnectAcceptBilling: (value: boolean) => void
  connectAcceptStopOriginal: boolean
  setConnectAcceptStopOriginal: (value: boolean) => void
  connectSelectedRecoveryId: string | null
  setConnectSelectedRecoveryId: (value: string | null) => void
  prepareConnect: () => Promise<'ready' | 'needs_confirmation' | 'error'>
  confirmConnect: () => Promise<boolean>
  confirmRecovery: () => Promise<boolean>
  cancelConnectConfirm: () => void
  refreshConnectStatus: () => Promise<void>
  /** STOP manual (nunca terminate). */
  stopPod: (podId?: string | null) => Promise<boolean>
}

const ComfyQueueContext = createContext<ComfyQueueValue | null>(null)

const POLL_MS = 2_000

export function ComfyQueueProvider({ children }: { children: ReactNode }) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [views, setViews] = useState<ComfyBatchView[]>([])
  const [config, setConfig] = useState<ComfyConfig | null>(null)
  const [pending, setPending] = useState<ComfyPendingStart | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [finishedQueue, setFinishedQueue] = useState<ComfyFinishedNotice[]>([])
  const [connectPhase, setConnectPhase] = useState<ComfyConnectUiPhase>('idle')
  const [connectMessage, setConnectMessage] = useState('')
  const [connectBusy, setConnectBusy] = useState(false)
  const [connectPreview, setConnectPreview] = useState<RunpodStartPreview | null>(null)
  const [connectRecovery, setConnectRecovery] = useState<ComfyGpuRecoveryPreview | null>(null)
  const [connectAlternatives, setConnectAlternatives] = useState<ComfyConnectGpuAlternative[]>([])
  const [connectConnection, setConnectConnection] = useState<ComfyConnectionInfo | null>(null)
  const [connectAcceptBilling, setConnectAcceptBilling] = useState(false)
  const [connectAcceptStopOriginal, setConnectAcceptStopOriginal] = useState(false)
  const [connectSelectedRecoveryId, setConnectSelectedRecoveryId] = useState<string | null>(null)
  const inProgressIdsRef = useRef<Set<string>>(new Set())
  const viewsRef = useRef<ComfyBatchView[]>([])
  const connectLock = useRef(false)
  const pendingAfterConnect = useRef(false)
  const configRef = useRef(config)
  configRef.current = config
  const previewRef = useRef(connectPreview)
  previewRef.current = connectPreview
  const recoveryRef = useRef(connectRecovery)
  recoveryRef.current = connectRecovery
  const selectedRecoveryRef = useRef(connectSelectedRecoveryId)
  selectedRecoveryRef.current = connectSelectedRecoveryId
  const acceptRef = useRef(connectAcceptBilling)
  acceptRef.current = connectAcceptBilling
  const acceptStopRef = useRef(connectAcceptStopOriginal)
  acceptStopRef.current = connectAcceptStopOriginal

  const refresh = useCallback(async () => {
    const [nextViews, nextConfig] = await Promise.all([api.comfy.list(), api.comfy.getConfig()])
    setViews(nextViews)
    setConfig(nextConfig)
    return nextViews
  }, [api])

  useEffect(() => {
    void refresh()
      .then((nextViews) => {
        const active = nextViews.some((view) => isComfyBatchInProgress(view.batch.status))
        if (active) {
          setVisible(true)
          setMinimized(true)
        }
      })
      .catch(() => {})
  }, [refresh])

  useEffect(() => {
    const active = views.some((view) => isComfyBatchInProgress(view.batch.status))
    if (!visible && !active) return
    const timer = setInterval(() => void refresh().catch(() => {}), POLL_MS)
    return () => clearInterval(timer)
  }, [visible, views, refresh])

  const activeProjectIds = useMemo(
    () =>
      views
        .filter((view) => isComfyBatchInProgress(view.batch.status) && view.batch.projectId)
        .map((view) => view.batch.projectId!),
    [views],
  )

  useEffect(() => {
    const justFinished = comfyBatchesJustFinished(inProgressIdsRef.current, views, viewsRef.current)
    inProgressIdsRef.current = new Set(
      views.filter((view) => isComfyBatchInProgress(view.batch.status)).map((view) => view.batch.id),
    )
    viewsRef.current = views
    if (justFinished.length === 0) return
    setFinishedQueue((current) => [
      ...current,
      ...justFinished.map((view) => ({
        batchId: view.batch.id,
        projectName: view.projectName?.trim() || 'Projeto',
        doneCount: view.counts?.done ?? 0,
        errorCount: view.counts?.error ?? 0,
      })),
    ])
  }, [views])

  const acknowledgeFinished = useCallback(() => {
    setFinishedQueue((current) => current.slice(1))
  }, [])

  const openComposer = useCallback((next: ComfyPendingStart) => {
    const running = views.find(
      (view) => view.batch.projectId === next.projectId && isComfyBatchInProgress(view.batch.status),
    )
    setVisible(true)
    setMinimized(false)
    if (running) {
      setPending(null)
      setSelectedId(running.batch.id)
      return
    }
    setPending(next)
    setSelectedId(null)
  }, [views])

  const applyView = useCallback((next: ComfyBatchView) => {
    setViews((current) => {
      const previous = current.find((view) => view.batch.id === next.batch.id)
      const rest = current.filter((view) => view.batch.id !== next.batch.id)
      return [...rest, { ...next, projectName: next.projectName || previous?.projectName || null }]
    })
  }, [])

  const pollLifecycleWhile = useCallback(
    async (run: () => Promise<void>) => {
      const timer = window.setInterval(() => {
        void api.comfy.getRunpodLifecycle().then((life) => {
          if (!life) return
          setConnectPhase(mapLifecyclePhaseToConnectUi(life.phase, life.dryRun))
          setConnectMessage(
            life.dryRun && life.phase === 'ready'
              ? COMFY_CONNECT_SIMULATED_MESSAGE
              : life.message,
          )
          if (life.comfy) setConnectConnection(life.comfy)
          // Dry-run nunca aplica URL simulada na config/fila.
          if (life.baseUrl && !life.dryRun) {
            setConfig((current) =>
              current ? { ...current, baseUrl: life.baseUrl! } : current,
            )
          }
        })
      }, 800)
      try {
        await run()
      } finally {
        window.clearInterval(timer)
      }
    },
    [api],
  )

  const refreshConnectStatus = useCallback(async () => {
    if (connectLock.current) return
    setConnectBusy(true)
    try {
      const result = await api.comfy.refreshComfyConnectStatus()
      setConfig(result.config)
      setConnectConnection(result.connection)
      setConnectPhase(result.phase === 'idle' ? 'gpu_off' : result.phase)
      setConnectMessage(result.message)
    } catch (error) {
      setConnectPhase('error')
      setConnectMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectBusy(false)
    }
  }, [api])

  const prepareConnect = useCallback(async (): Promise<'ready' | 'needs_confirmation' | 'error'> => {
    if (connectLock.current) return 'error'
    if (isComfyConnectBusy(connectPhase)) return 'error'
    connectLock.current = true
    setConnectBusy(true)
    setConnectPreview(null)
    setConnectRecovery(null)
    setConnectAcceptBilling(false)
    setConnectAcceptStopOriginal(false)
    setConnectSelectedRecoveryId(null)
    setConnectAlternatives([])
    setConnectPhase('starting')
    setConnectMessage('Identificando Pod e conta RunPod…')
    try {
      let outcome: 'ready' | 'needs_confirmation' | 'error' = 'error'
      await pollLifecycleWhile(async () => {
        const result = await api.comfy.prepareComfyConnect()
        setConfig(result.config)

        if (result.status === 'ready' && !result.dryRun) {
          setConnectConnection(result.connection)
          setConnectPhase('ready')
          setConnectMessage(result.message)
          push(result.message, 'success')
          outcome = 'ready'
          return
        }
        if (result.status === 'ready' && result.dryRun) {
          setConnectConnection(null)
          setConnectPhase('simulated')
          setConnectMessage(COMFY_CONNECT_SIMULATED_MESSAGE)
          push(COMFY_CONNECT_SIMULATED_MESSAGE, 'success')
          outcome = 'error'
          return
        }
        if (result.status === 'in_flight') {
          setConnectPhase(result.phase)
          setConnectMessage(result.message)
          outcome = 'error'
          return
        }
        if (result.status === 'needs_confirmation') {
          const usingDryRun = Boolean(
            result.dryRunDefault || result.config.runpodDryRunStarts,
          )
          // Dry-run: mantém painel de simulação. Start real: inicia direto (sem checkbox).
          if (usingDryRun) {
            setConnectPreview(result.preview)
            setConnectPhase('awaiting_cost')
            setConnectMessage(result.message)
            setConnectAlternatives(result.alternatives)
            outcome = 'needs_confirmation'
            return
          }
          setConnectPhase('starting')
          setConnectMessage('Iniciando Pod…')
          const confirmed = await api.comfy.confirmComfyConnect({
            podId: result.preview.pod.id,
            confirmedCostPerHr: result.preview.costPerHr,
            dryRun: false,
            acceptBilling: true,
          })
          setConfig(confirmed.config)
          setConnectConnection(confirmed.status === 'simulated' ? null : confirmed.connection)
          setConnectPhase(confirmed.phase)
          setConnectMessage(confirmed.message)
          if (confirmed.status === 'ready') {
            setConnectPreview(null)
            setConnectRecovery(null)
            push(confirmed.message, 'success')
            outcome = 'ready'
            return
          }
          if (confirmed.status === 'needs_recovery' && confirmed.recovery) {
            setConnectPreview(null)
            setConnectRecovery(confirmed.recovery)
            setConnectSelectedRecoveryId(confirmed.recovery.recommendedOptionId)
            setConnectAcceptBilling(true)
            setConnectAcceptStopOriginal(true)
            setConnectPhase('awaiting_cost')
            setConnectMessage(confirmed.message)
            push('GPU ocupada neste Pod. Escolha como continuar abaixo.', 'error')
            outcome = 'needs_confirmation'
            return
          }
          setConnectPhase('error')
          push(confirmed.message, 'error')
          outcome = 'error'
          return
        }
        if (result.status === 'needs_recovery') {
          setConnectRecovery(result.recovery)
          setConnectSelectedRecoveryId(result.recovery.recommendedOptionId)
          setConnectAcceptBilling(true)
          setConnectAcceptStopOriginal(true)
          setConnectPhase('awaiting_cost')
          setConnectMessage(result.message)
          outcome = 'needs_confirmation'
          return
        }
        if (result.status === 'gpu_unavailable') {
          setConnectPhase('gpu_unavailable')
          setConnectMessage(result.message)
          setConnectAlternatives(result.alternatives)
          if (result.recovery) {
            setConnectRecovery(result.recovery)
            setConnectSelectedRecoveryId(result.recovery.recommendedOptionId)
          }
          push(result.message, 'error')
          outcome = 'error'
          return
        }
        setConnectPhase('error')
        setConnectMessage(result.message)
        push(result.message, 'error')
        outcome = 'error'
      })
      return outcome
    } catch (error) {
      setConnectPhase('error')
      const message = error instanceof Error ? error.message : String(error)
      setConnectMessage(message)
      pushError(error, 'Não foi possível conectar o ComfyUI.')
      return 'error'
    } finally {
      setConnectBusy(false)
      connectLock.current = false
    }
  }, [api, connectPhase, pollLifecycleWhile, push, pushError])

  const confirmConnect = useCallback(async (): Promise<boolean> => {
    const preview = previewRef.current
    if (!preview || connectLock.current) return false
    const cfg = configRef.current
    const usingDryRun = Boolean(preview.dryRunDefault || cfg?.runpodDryRunStarts)
    connectLock.current = true
    setConnectBusy(true)
    setConnectPhase('starting')
    setConnectMessage(usingDryRun ? 'Simulação: iniciando Pod…' : 'Iniciando Pod…')
    try {
      let ok = false
      await pollLifecycleWhile(async () => {
        const result = await api.comfy.confirmComfyConnect({
          podId: preview.pod.id,
          confirmedCostPerHr: preview.costPerHr,
          dryRun: usingDryRun,
          acceptBilling: !usingDryRun,
        })
        setConfig(result.config)
        setConnectConnection(result.status === 'simulated' ? null : result.connection)
        setConnectPhase(result.phase)
        setConnectMessage(result.message)
        if (result.status === 'ready') {
          setConnectPreview(null)
          setConnectRecovery(null)
          push(result.message, 'success')
          ok = true
        } else if (result.status === 'simulated') {
          setConnectPreview(null)
          pendingAfterConnect.current = false
          push(COMFY_CONNECT_SIMULATED_MESSAGE, 'success')
          ok = false
        } else if (result.status === 'needs_recovery' && result.recovery) {
          setConnectPreview(null)
          setConnectRecovery(result.recovery)
          setConnectSelectedRecoveryId(result.recovery.recommendedOptionId)
          setConnectAcceptBilling(true)
          setConnectAcceptStopOriginal(true)
          setConnectPhase('awaiting_cost')
          setConnectMessage(result.message)
          push('GPU ocupada neste Pod. Escolha como continuar abaixo.', 'error')
          ok = false
        } else {
          push(result.message, 'error')
        }
      })
      return ok
    } catch (error) {
      setConnectPhase('error')
      pushError(error, 'Falha ao iniciar o Pod.')
      return false
    } finally {
      setConnectBusy(false)
      connectLock.current = false
    }
  }, [api, pollLifecycleWhile, push, pushError])

  const confirmRecovery = useCallback(async (): Promise<boolean> => {
    const recovery = recoveryRef.current
    const optionId = selectedRecoveryRef.current || recovery?.recommendedOptionId
    if (!recovery || !optionId || connectLock.current) return false
    const option = recovery.options.find((row) => row.id === optionId)
    if (!option) return false
    const cfg = configRef.current
    const usingDryRun = Boolean(cfg?.runpodDryRunStarts)
    connectLock.current = true
    setConnectBusy(true)
    setConnectPhase('starting')
    setConnectMessage(usingDryRun ? 'Simulação: recuperação…' : 'Recuperando GPU…')
    try {
      let ok = false
      await pollLifecycleWhile(async () => {
        const result = await api.comfy.confirmComfyGpuRecovery({
          optionId,
          confirmedCostPerHr: option.estimatedCostPerHr,
          dryRun: usingDryRun,
          acceptBilling: !usingDryRun,
          acceptStopOriginalIfRunning: !usingDryRun,
        })
        setConfig(result.config)
        setConnectConnection(result.status === 'simulated' ? null : result.connection)
        setConnectPhase(result.phase)
        setConnectMessage(result.message)
        if (result.status === 'ready') {
          setConnectRecovery(null)
          setConnectPreview(null)
          push(result.message, 'success')
          ok = true
        } else if (result.status === 'simulated') {
          setConnectRecovery(null)
          pendingAfterConnect.current = false
          push(COMFY_CONNECT_SIMULATED_MESSAGE, 'success')
          ok = false
        } else {
          push(result.message, 'error')
        }
      })
      return ok
    } catch (error) {
      setConnectPhase('error')
      pushError(error, 'Falha na recuperação de GPU.')
      return false
    } finally {
      setConnectBusy(false)
      connectLock.current = false
    }
  }, [api, pollLifecycleWhile, push, pushError])

  const cancelConnectConfirm = useCallback(() => {
    setConnectPreview(null)
    setConnectRecovery(null)
    setConnectAcceptBilling(false)
    setConnectAcceptStopOriginal(false)
    setConnectSelectedRecoveryId(null)
    setConnectPhase('gpu_off')
    setConnectMessage('Autorização cancelada. GPU permanece desligada.')
    pendingAfterConnect.current = false
  }, [])

  const stopPod = useCallback(
    async (podId?: string | null): Promise<boolean> => {
      if (connectLock.current) return false
      const cfg = configRef.current
      const resolved =
        podId?.trim() ||
        cfg?.runpodPreferredPodId?.trim() ||
        ''
      if (!resolved) {
        push('Selecione um Pod (ou conecte antes) para poder parar.', 'error')
        return false
      }
      connectLock.current = true
      setConnectBusy(true)
      setConnectPhase('starting')
      setConnectMessage('Parando Pod…')
      try {
        const usingDryRun = Boolean(cfg?.runpodDryRunStarts)
        const result = await api.comfy.stopRunpodPod({
          podId: resolved,
          dryRun: usingDryRun,
        })
        const nextConfig = await api.comfy.getConfig()
        setConfig(nextConfig)
        setConnectPhase(result.phase === 'stopped' ? 'gpu_off' : 'error')
        setConnectMessage(result.message)
        setConnectConnection(null)
        setConnectPreview(null)
        setConnectRecovery(null)
        if (result.phase === 'stopped') {
          push(result.message, 'success')
          return true
        }
        push(result.message, 'error')
        return false
      } catch (error) {
        setConnectPhase('error')
        pushError(error, 'Falha ao parar o Pod.')
        return false
      } finally {
        setConnectBusy(false)
        connectLock.current = false
      }
    },
    [api, push, pushError],
  )

  const startBatchNow = useCallback(
    async (nextPending: ComfyPendingStart) => {
      setBusy(true)
      try {
        const result = await api.comfy.start(nextPending.projectId, nextPending.refIds)
        applyView(result.view)
        setSelectedId(result.view.batch.id)
        setPending(null)
        const sent = result.view.jobs.length
        const sentLabel = sent === 1 ? '1 cena enviada' : `${sent} cenas enviadas`
        push(
          result.skipped.length > 0
            ? `${sentLabel}; ${result.skipped.length} ficaram de fora.`
            : `${sentLabel}. Vídeos em ${result.view.batch.outputDir}.`,
          'success',
        )
      } catch (error) {
        pushError(error, 'Não foi possível começar o envio.')
      } finally {
        setBusy(false)
      }
    },
    [api, applyView, push, pushError],
  )

  const startPending = useCallback(async () => {
    if (!pending) return
    if (connectPhase === 'simulated') {
      push(
        'Simulação concluída — nenhuma GPU iniciada. Desligue o dry-run e conecte de verdade antes de gerar.',
        'error',
      )
      return
    }
    if (isComfyConnectReadyForGeneration(connectPhase) && connectConnection?.ok) {
      await startBatchNow(pending)
      return
    }
    // Com dry-run ligado, prepare/confirm só simula — não envia fila real.
    if (config?.runpodDryRunStarts) {
      const outcome = await prepareConnect()
      if (outcome === 'needs_confirmation') {
        pendingAfterConnect.current = false
        push(
          'Dry-run ligado: a confirmação só simula. Desligue o dry-run nas Configurações para start real.',
          'error',
        )
        return
      }
      push(
        'Dry-run ligado — não é possível enviar LipSync real. Desligue a simulação nas Configurações.',
        'error',
      )
      return
    }
    const outcome = await prepareConnect()
    if (outcome === 'ready') {
      await startBatchNow(pending)
      return
    }
    if (outcome === 'needs_confirmation') {
      // Recovery ainda exige escolher opção (ou dry-run).
      pendingAfterConnect.current = true
      push('Escolha como continuar na barra RunPod para enviar.', 'error')
      return
    }
  }, [
    pending,
    connectPhase,
    connectConnection,
    config?.runpodDryRunStarts,
    prepareConnect,
    startBatchNow,
    push,
  ])

  // Após confirmação real (não simulada), retoma o envio se Gerar pediu conexão.
  useEffect(() => {
    if (!isComfyConnectReadyForGeneration(connectPhase) || !pendingAfterConnect.current || !pending) {
      return
    }
    pendingAfterConnect.current = false
    void startBatchNow(pending)
  }, [connectPhase, pending, startBatchNow])

  const run = useCallback(
    async (action: () => Promise<ComfyBatchView | null>) => {
      setBusy(true)
      try {
        const next = await action()
        if (next) applyView(next)
        else await refresh()
      } catch (error) {
        pushError(error, 'Não foi possível atualizar o envio.')
      } finally {
        setBusy(false)
      }
    },
    [applyView, refresh, pushError],
  )

  const value = useMemo<ComfyQueueValue>(
    () => ({
      views,
      activeProjectIds,
      config,
      pending,
      selectedId,
      minimized,
      visible,
      busy,
      openComposer,
      startPending,
      minimize: () => {
        setMinimized(true)
        setVisible(true)
      },
      expand: (batchId) => {
        setVisible(true)
        setMinimized(false)
        if (batchId) setSelectedId(batchId)
      },
      dismiss: () => {
        if (activeProjectIds.length > 0) {
          setMinimized(true)
          return
        }
        setVisible(false)
        setPending(null)
      },
      select: setSelectedId,
      pause: (batchId) => run(() => api.comfy.pause(batchId)),
      resume: (batchId) => run(() => api.comfy.resume(batchId)),
      cancel: (batchId) => run(() => api.comfy.cancel(batchId)),
      retryFailed: (batchId) => run(() => api.comfy.retryFailed(batchId)),
      setConfig,
      finished: finishedQueue[0] ?? null,
      acknowledgeFinished,
      connectPhase,
      connectMessage,
      connectBusy,
      connectPreview,
      connectRecovery,
      connectAlternatives,
      connectConnection,
      connectAcceptBilling,
      setConnectAcceptBilling,
      connectAcceptStopOriginal,
      setConnectAcceptStopOriginal,
      connectSelectedRecoveryId,
      setConnectSelectedRecoveryId,
      prepareConnect,
      confirmConnect,
      confirmRecovery,
      cancelConnectConfirm,
      refreshConnectStatus,
      stopPod,
    }),
    [
      views,
      activeProjectIds,
      config,
      pending,
      selectedId,
      minimized,
      visible,
      busy,
      openComposer,
      startPending,
      api,
      run,
      setConfig,
      finishedQueue,
      acknowledgeFinished,
      connectPhase,
      connectMessage,
      connectBusy,
      connectPreview,
      connectRecovery,
      connectAlternatives,
      connectConnection,
      connectAcceptBilling,
      connectAcceptStopOriginal,
      connectSelectedRecoveryId,
      prepareConnect,
      confirmConnect,
      confirmRecovery,
      cancelConnectConfirm,
      refreshConnectStatus,
      stopPod,
    ],
  )

  return <ComfyQueueContext.Provider value={value}>{children}</ComfyQueueContext.Provider>
}

export function useComfyQueue(): ComfyQueueValue {
  const value = useContext(ComfyQueueContext)
  if (!value) throw new Error('useComfyQueue precisa estar dentro de ComfyQueueProvider')
  return value
}
