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
import { useLocation } from 'react-router-dom'
import type { MusicCaptionLanguage, MusicCaptionModel, MusicTrack } from '@shared/musicAnalysis'
import {
  musicCaptionResultToast,
  removeMusicCaptionJob,
  upsertMusicCaptionJob,
  type MusicCaptionJob,
} from '@shared/musicCaptionGeneration'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

export type StartMusicCaptionInput = {
  trackId: string
  trackName?: string
  language: MusicCaptionLanguage
  model: MusicCaptionModel
}

export type MusicCaptionResultSnapshot = {
  seq: number
  track: MusicTrack | null
  finishedAt: string
}

type MusicCaptionGenerationValue = {
  activeJobs: MusicCaptionJob[]
  hasActiveGeneration: boolean
  isGenerating: (trackId: string) => boolean
  jobFor: (trackId: string) => MusicCaptionJob | null
  latestResultFor: (trackId: string) => MusicCaptionResultSnapshot | null
  generateCaptions: (input: StartMusicCaptionInput) => Promise<MusicTrack | null>
}

const MusicCaptionGenerationContext = createContext<MusicCaptionGenerationValue | null>(null)

function isViewingMusicTrack(pathname: string, trackId: string): boolean {
  return pathname === `/musica/faixas/${trackId}`
}

export function MusicCaptionGenerationProvider({ children }: { children: ReactNode }) {
  const api = getAtlasApi()
  const { pathname } = useLocation()
  const { push, pushError } = useToast()
  const [activeJobs, setActiveJobs] = useState<MusicCaptionJob[]>([])
  const [latestResultsByTrackId, setLatestResultsByTrackId] = useState<
    Record<string, MusicCaptionResultSnapshot>
  >({})
  const inFlightRef = useRef(new Map<string, Promise<MusicTrack | null>>())
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const seqRef = useRef(0)

  const recordResult = useCallback((trackId: string, track: MusicTrack | null, finishedAt: string) => {
    const seq = ++seqRef.current
    setLatestResultsByTrackId((current) => ({
      ...current,
      [trackId]: { seq, track, finishedAt },
    }))
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncActive = async () => {
      try {
        const list = await api.music.activeTranscriptions?.()
        if (cancelled || !Array.isArray(list)) return
        setActiveJobs((current) => {
          let next = list
          for (const item of current) {
            if (inFlightRef.current.has(item.trackId) && !next.some((job) => job.trackId === item.trackId)) {
              next = upsertMusicCaptionJob(next, item)
            }
          }
          return next
        })
      } catch {
        /* ignora se indisponível no ambiente atual */
      }
    }

    void syncActive()

    const unsubscribe = api.music.onTranscribeChanged?.((event) => {
      if (cancelled) return
      setActiveJobs((current) => {
        let next = event.active ?? []
        for (const item of current) {
          if (inFlightRef.current.has(item.trackId) && !next.some((job) => job.trackId === item.trackId)) {
            next = upsertMusicCaptionJob(next, item)
          }
        }
        return next
      })

      const finished = event.finished
      if (!finished) return
      // Se a chamada partiu desta sessão, o próprio runner já registra o resultado e exibe o toast.
      if (inFlightRef.current.has(finished.trackId)) return

      const viewing = isViewingMusicTrack(pathnameRef.current, finished.trackId)
      if (finished.error) {
        const fallback =
          viewing || !finished.trackName
            ? 'Não foi possível gerar a legenda'
            : `Não foi possível gerar a legenda de “${finished.trackName}”`
        pushError(finished.error, fallback)
        return
      }

      if (finished.track) {
        recordResult(finished.trackId, finished.track, finished.finishedAt)
      }
      const toast = musicCaptionResultToast(finished.track, finished.trackName, viewing)
      push(toast.message, toast.type)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [api, push, pushError, recordResult])

  const generateCaptions = useCallback(
    (input: StartMusicCaptionInput): Promise<MusicTrack | null> => {
      const existing = inFlightRef.current.get(input.trackId)
      if (existing) return existing

      const job: MusicCaptionJob = {
        trackId: input.trackId,
        trackName: input.trackName?.trim() || '',
        language: input.language,
        model: input.model,
        startedAt: new Date().toISOString(),
      }
      setActiveJobs((current) => upsertMusicCaptionJob(current, job))

      const run = (async () => {
        try {
          const updated = await api.music.transcribe(input.trackId, input.language, input.model)
          const finishedAt = new Date().toISOString()
          setActiveJobs((current) => removeMusicCaptionJob(current, input.trackId))
          recordResult(input.trackId, updated, finishedAt)
          const viewing = isViewingMusicTrack(pathnameRef.current, input.trackId)
          const toast = musicCaptionResultToast(updated, input.trackName, viewing)
          push(toast.message, toast.type)
          return updated
        } catch (error) {
          setActiveJobs((current) => removeMusicCaptionJob(current, input.trackId))
          const viewing = isViewingMusicTrack(pathnameRef.current, input.trackId)
          const label = input.trackName?.trim()
          const fallback =
            viewing || !label
              ? 'Não foi possível gerar a legenda'
              : `Não foi possível gerar a legenda de “${label}”`
          pushError(error, fallback)
          return null
        } finally {
          inFlightRef.current.delete(input.trackId)
        }
      })()

      inFlightRef.current.set(input.trackId, run)
      return run
    },
    [api, push, pushError, recordResult],
  )

  const isGenerating = useCallback(
    (trackId: string) => activeJobs.some((job) => job.trackId === trackId),
    [activeJobs],
  )

  const jobFor = useCallback(
    (trackId: string) => activeJobs.find((job) => job.trackId === trackId) ?? null,
    [activeJobs],
  )

  const latestResultFor = useCallback(
    (trackId: string) => latestResultsByTrackId[trackId] ?? null,
    [latestResultsByTrackId],
  )

  const value = useMemo<MusicCaptionGenerationValue>(
    () => ({
      activeJobs,
      hasActiveGeneration: activeJobs.length > 0,
      isGenerating,
      jobFor,
      latestResultFor,
      generateCaptions,
    }),
    [activeJobs, generateCaptions, isGenerating, jobFor, latestResultFor],
  )

  return (
    <MusicCaptionGenerationContext.Provider value={value}>
      {children}
    </MusicCaptionGenerationContext.Provider>
  )
}

export function useMusicCaptionGeneration(): MusicCaptionGenerationValue {
  const value = useContext(MusicCaptionGenerationContext)
  if (!value) {
    throw new Error('useMusicCaptionGeneration precisa estar dentro de MusicCaptionGenerationProvider')
  }
  return value
}
