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
import type { ShortsAnalyzeInput, ShortsJob, ShortsProgressEvent } from '@shared/shorts'
import { SHORTS_PROGRESS_LABEL } from '@shared/shorts'
import {
  isShortsAnalyzeStage,
  shortsAnalyzeResultToast,
} from '@shared/shortsGeneration'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

type AnalyzeOptions = {
  preservedCount?: number
}

type ShortsGenerationValue = {
  analyzingJobIds: string[]
  hasActiveAnalysis: boolean
  analyze: (input: ShortsAnalyzeInput, options?: AnalyzeOptions) => Promise<ShortsJob>
  watchJob: (jobId: string) => void
  isAnalyzing: (jobId: string) => boolean
  progressFor: (jobId: string) => ShortsProgressEvent | null
  jobFor: (jobId: string) => ShortsJob | null
}

const ShortsGenerationContext = createContext<ShortsGenerationValue | null>(null)

function addId(current: string[], id: string) {
  return current.includes(id) ? current : [...current, id]
}

function removeId(current: string[], id: string) {
  return current.filter((item) => item !== id)
}

export function ShortsGenerationProvider({ children }: { children: ReactNode }) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [analyzingJobIds, setAnalyzingJobIds] = useState<string[]>([])
  const [progressByJobId, setProgressByJobId] = useState<Record<string, ShortsProgressEvent>>({})
  const [jobsById, setJobsById] = useState<Record<string, ShortsJob>>({})
  const inFlightRef = useRef(new Map<string, Promise<ShortsJob>>())
  const toastedRef = useRef(new Set<string>())
  const analyzingIdsRef = useRef<string[]>([])
  analyzingIdsRef.current = analyzingJobIds

  const rememberJob = useCallback((job: ShortsJob) => {
    setJobsById((current) => {
      const previous = current[job.id]
      if (previous && previous.updatedAt > job.updatedAt) return current
      return { ...current, [job.id]: job }
    })
  }, [])

  const markAnalyzing = useCallback((jobId: string) => {
    setAnalyzingJobIds((current) => addId(current, jobId))
  }, [])

  const clearAnalyzeProgress = useCallback((jobId: string) => {
    setProgressByJobId((current) => {
      const event = current[jobId]
      if (!event || !isShortsAnalyzeStage(event.stage)) return current
      const next = { ...current }
      delete next[jobId]
      return next
    })
  }, [])

  const finishAnalyzing = useCallback(
    (job: ShortsJob, preservedCount = 0) => {
      rememberJob(job)
      setAnalyzingJobIds((current) => removeId(current, job.id))
      clearAnalyzeProgress(job.id)
      const key = `${job.id}:${job.updatedAt}:${job.status}`
      if (toastedRef.current.has(key)) return
      toastedRef.current.add(key)
      const toast = shortsAnalyzeResultToast(job, preservedCount)
      push(toast.message, toast.type)
    },
    [clearAnalyzeProgress, push, rememberJob],
  )

  const watchJob = useCallback(
    (jobId: string) => {
      if (!jobId) return
      markAnalyzing(jobId)
    },
    [markAnalyzing],
  )

  useEffect(() => {
    return api.shorts.onProgress((event) => {
      setProgressByJobId((current) => ({ ...current, [event.jobId]: event }))
    })
  }, [api])

  useEffect(() => {
    let cancelled = false
    void api.shorts
      .list()
      .then((list) => {
        if (cancelled) return
        const running = list.filter((job) => job.status === 'analyzing')
        if (!running.length) return
        setJobsById((current) => {
          const next = { ...current }
          for (const job of running) next[job.id] = job
          return next
        })
        setAnalyzingJobIds((current) => {
          let next = current
          for (const job of running) next = addId(next, job.id)
          return next
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    if (analyzingJobIds.length === 0) return
    let cancelled = false

    async function refresh() {
      await Promise.all(
        analyzingIdsRef.current.map(async (jobId) => {
          try {
            const job = await api.shorts.get(jobId)
            if (cancelled || !job) return
            rememberJob(job)
            if (job.status !== 'analyzing' && !inFlightRef.current.has(jobId)) {
              finishAnalyzing(job)
            }
          } catch {
            /* a próxima rodada tenta de novo */
          }
        }),
      )
    }

    void refresh()
    // Com a janela oculta o polling pausa; ao voltar, atualiza na hora.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void refresh()
    }, 2500)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [analyzingJobIds, api, finishAnalyzing, rememberJob])

  const analyze = useCallback(
    async (input: ShortsAnalyzeInput, options?: AnalyzeOptions) => {
      const existing = inFlightRef.current.get(input.jobId)
      if (existing) return existing

      markAnalyzing(input.jobId)
      setProgressByJobId((current) => ({
        ...current,
        [input.jobId]: {
          jobId: input.jobId,
          stage: 'preparing_video',
          message: SHORTS_PROGRESS_LABEL.preparing_video,
        },
      }))

      const run = (async () => {
        try {
          void api.shorts
            .get(input.jobId)
            .then((job) => {
              if (!job) return
              rememberJob(
                job.status === 'analyzing'
                  ? job
                  : { ...job, status: 'analyzing', updatedAt: new Date().toISOString() },
              )
            })
            .catch(() => undefined)

          const next = await api.shorts.analyze(input)
          finishAnalyzing(next, options?.preservedCount ?? 0)
          return next
        } catch (error) {
          setAnalyzingJobIds((current) => removeId(current, input.jobId))
          clearAnalyzeProgress(input.jobId)
          try {
            const latest = await api.shorts.get(input.jobId)
            if (latest) rememberJob(latest)
          } catch {
            /* o caller ainda pode recarregar o job */
          }
          pushError(error, 'Falha ao analisar o vídeo')
          throw error
        } finally {
          inFlightRef.current.delete(input.jobId)
        }
      })()

      inFlightRef.current.set(input.jobId, run)
      return run
    },
    [api, clearAnalyzeProgress, finishAnalyzing, markAnalyzing, pushError, rememberJob],
  )

  const isAnalyzing = useCallback(
    (jobId: string) => analyzingJobIds.includes(jobId),
    [analyzingJobIds],
  )

  const progressFor = useCallback(
    (jobId: string) => {
      if (!analyzingJobIds.includes(jobId)) return null
      const event = progressByJobId[jobId]
      if (!event || !isShortsAnalyzeStage(event.stage)) return null
      return event
    },
    [analyzingJobIds, progressByJobId],
  )

  const jobFor = useCallback((jobId: string) => jobsById[jobId] ?? null, [jobsById])

  const value = useMemo<ShortsGenerationValue>(
    () => ({
      analyzingJobIds,
      hasActiveAnalysis: analyzingJobIds.length > 0,
      analyze,
      watchJob,
      isAnalyzing,
      progressFor,
      jobFor,
    }),
    [analyze, analyzingJobIds, isAnalyzing, jobFor, progressFor, watchJob],
  )

  return <ShortsGenerationContext.Provider value={value}>{children}</ShortsGenerationContext.Provider>
}

export function useShortsGeneration(): ShortsGenerationValue {
  const value = useContext(ShortsGenerationContext)
  if (!value) {
    throw new Error('useShortsGeneration precisa estar dentro de ShortsGenerationProvider')
  }
  return value
}
