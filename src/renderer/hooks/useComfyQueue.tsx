import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ComfyBatchView, ComfyConfig } from '@shared/comfy'
import { isComfyBatchInProgress } from '@shared/comfy'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

export type ComfyPendingStart = {
  projectId: string
  projectName: string
  sceneCount: number
  totalCount: number
  problems: string[]
  outputDir: string | null
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

  const startPending = useCallback(async () => {
    if (!pending) return
    setBusy(true)
    try {
      const result = await api.comfy.start(pending.projectId)
      applyView(result.view)
      setSelectedId(result.view.batch.id)
      setPending(null)
      push(
        result.skipped.length > 0
          ? `${result.view.jobs.length} cenas enviadas; ${result.skipped.length} ficaram de fora.`
          : `${result.view.jobs.length} cenas enviadas. Vídeos em ${result.view.batch.outputDir}.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível começar o envio.')
    } finally {
      setBusy(false)
    }
  }, [api, pending, push, pushError, applyView])

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
    ],
  )

  return <ComfyQueueContext.Provider value={value}>{children}</ComfyQueueContext.Provider>
}

export function useComfyQueue(): ComfyQueueValue {
  const value = useContext(ComfyQueueContext)
  if (!value) throw new Error('useComfyQueue precisa estar dentro de ComfyQueueProvider')
  return value
}
