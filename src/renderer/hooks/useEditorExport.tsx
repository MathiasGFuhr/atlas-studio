import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from 'react'
import {
  applyEditorExportProgress,
  isExportJobInFlight,
  type EditorExportJob,
} from '@shared/editor/exportJob'
import type { EditorExportResolution } from '@shared/editor/types'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

export type StartEditorExportInput =
  | {
      mode: 'single'
      projectId: string
      projectName: string
      resolution: EditorExportResolution
      videoOnly: boolean
      maxQuality: boolean
      onBeforeExport: () => Promise<void>
    }
  | {
      mode: 'clips'
      projectId: string
      projectName: string
      clipIds?: string[]
      stripAudio: boolean
      maxQuality: boolean
      onBeforeExport: () => Promise<void>
    }

type EditorExportContextValue = {
  jobs: Record<string, EditorExportJob>
  hasActiveExport: boolean
  jobFor: (projectId: string) => EditorExportJob | null
  isExporting: (projectId: string) => boolean
  startExport: (input: StartEditorExportInput) => Promise<string | null>
  dismissJob: (projectId: string) => void
  setModalOpen: (projectId: string, open: boolean) => void
  requestOpenModal: (projectId: string) => void
  onOpenModalRequested: (projectId: string, callback: () => void) => () => void
}

const AUTO_DISMISS_DONE_MS = 18_000
const AUTO_DISMISS_FAILED_MS = 12_000
const EDITOR_EXPORT_CONTEXT_KEY = '__atlasEditorExportContext__'

function getEditorExportContext(): Context<EditorExportContextValue | null> {
  const store = globalThis as Record<string, unknown>
  const existing = store[EDITOR_EXPORT_CONTEXT_KEY] as
    | Context<EditorExportContextValue | null>
    | undefined
  if (existing) return existing
  const created = createContext<EditorExportContextValue | null>(null)
  store[EDITOR_EXPORT_CONTEXT_KEY] = created
  return created
}

const EditorExportContext = getEditorExportContext()

export function EditorExportProvider({ children }: { children: ReactNode }) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [jobs, setJobs] = useState<Record<string, EditorExportJob>>({})
  const inFlightRef = useRef(new Map<string, Promise<string | null>>())
  const modalOpenProjectsRef = useRef(new Set<string>())
  const openModalListenersRef = useRef(new Map<string, Set<() => void>>())
  const dismissTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const clearDismissTimer = useCallback((projectId: string) => {
    const timer = dismissTimersRef.current.get(projectId)
    if (timer) {
      clearTimeout(timer)
      dismissTimersRef.current.delete(projectId)
    }
  }, [])

  const scheduleAutoDismiss = useCallback(
    (projectId: string, delayMs: number) => {
      clearDismissTimer(projectId)
      const timer = setTimeout(() => {
        dismissTimersRef.current.delete(projectId)
        setJobs((current) => {
          const existing = current[projectId]
          if (!existing || isExportJobInFlight(existing)) return current
          const next = { ...current }
          delete next[projectId]
          return next
        })
      }, delayMs)
      dismissTimersRef.current.set(projectId, timer)
    },
    [clearDismissTimer],
  )

  useEffect(() => {
    const timers = dismissTimersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    return api.editor.onExportProgress((event) => {
      setJobs((current) => applyEditorExportProgress(current, event))
    })
  }, [api])

  const dismissJob = useCallback(
    (projectId: string) => {
      clearDismissTimer(projectId)
      setJobs((current) => {
        const existing = current[projectId]
        if (!existing || isExportJobInFlight(existing)) return current
        const next = { ...current }
        delete next[projectId]
        return next
      })
    },
    [clearDismissTimer],
  )

  const setModalOpen = useCallback((projectId: string, open: boolean) => {
    if (open) modalOpenProjectsRef.current.add(projectId)
    else modalOpenProjectsRef.current.delete(projectId)
  }, [])

  const requestOpenModal = useCallback((projectId: string) => {
    const listeners = openModalListenersRef.current.get(projectId)
    if (!listeners) return
    for (const listener of listeners) listener()
  }, [])

  const onOpenModalRequested = useCallback((projectId: string, callback: () => void) => {
    let set = openModalListenersRef.current.get(projectId)
    if (!set) {
      set = new Set()
      openModalListenersRef.current.set(projectId, set)
    }
    set.add(callback)
    return () => {
      const current = openModalListenersRef.current.get(projectId)
      if (!current) return
      current.delete(callback)
      if (current.size === 0) openModalListenersRef.current.delete(projectId)
    }
  }, [])

  const startExport = useCallback(
    (input: StartEditorExportInput): Promise<string | null> => {
      const existing = inFlightRef.current.get(input.projectId)
      if (existing) return existing

      clearDismissTimer(input.projectId)
      const label = input.projectName.trim()

      setJobs((current) => ({
        ...current,
        [input.projectId]: {
          projectId: input.projectId,
          projectName: label,
          mode: input.mode,
          status: 'picking',
          percent: null,
          message: 'Escolhendo destino...',
          outputPath: null,
          error: null,
          updatedAt: Date.now(),
        },
      }))

      const run = (async (): Promise<string | null> => {
        try {
          await input.onBeforeExport()

          let outputPath: string | null = null
          let doneMessage = 'Vídeo exportado.'

          if (input.mode === 'clips') {
            const exported = await api.editor.exportClips({
              projectId: input.projectId,
              clipIds: input.clipIds,
              stripAudio: input.stripAudio,
              maxQuality: input.maxQuality,
            })
            if (!exported) {
              setJobs((current) => {
                const next = { ...current }
                delete next[input.projectId]
                return next
              })
              return null
            }
            outputPath = exported.directory
            doneMessage = `${exported.files.length} ${exported.files.length === 1 ? 'cena exportada' : 'cenas exportadas'}.`
          } else {
            const exportedPath = await api.editor.export({
              projectId: input.projectId,
              resolution: input.resolution,
              videoOnly: input.videoOnly,
              maxQuality: input.maxQuality,
            })
            if (!exportedPath) {
              setJobs((current) => {
                const next = { ...current }
                delete next[input.projectId]
                return next
              })
              return null
            }
            outputPath = exportedPath
          }

          setJobs((current) => ({
            ...current,
            [input.projectId]: {
              projectId: input.projectId,
              projectName: label || current[input.projectId]?.projectName || '',
              mode: input.mode,
              status: 'done',
              percent: 100,
              message: doneMessage,
              outputPath,
              error: null,
              updatedAt: Date.now(),
            },
          }))

          if (!modalOpenProjectsRef.current.has(input.projectId)) {
            const toastText =
              input.mode === 'clips'
                ? label
                  ? `Cenas de “${label}” exportadas.`
                  : 'Cenas exportadas.'
                : label
                  ? `Vídeo “${label}” exportado.`
                  : 'Vídeo exportado.'
            push(toastText, 'success')
            scheduleAutoDismiss(input.projectId, AUTO_DISMISS_DONE_MS)
          }

          return outputPath
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          setJobs((current) => {
            const prev = current[input.projectId]
            return {
              ...current,
              [input.projectId]: {
                projectId: input.projectId,
                projectName: label || prev?.projectName || '',
                mode: input.mode,
                status: 'failed',
                percent: prev?.percent ?? null,
                message,
                outputPath: null,
                error: message,
                updatedAt: Date.now(),
              },
            }
          })
          pushError(
            error,
            input.mode === 'clips' ? 'Falha ao exportar as cenas cortadas' : 'Falha ao exportar o vídeo',
          )
          if (!modalOpenProjectsRef.current.has(input.projectId)) {
            scheduleAutoDismiss(input.projectId, AUTO_DISMISS_FAILED_MS)
          }
          return null
        } finally {
          inFlightRef.current.delete(input.projectId)
        }
      })()

      inFlightRef.current.set(input.projectId, run)
      return run
    },
    [api, clearDismissTimer, push, pushError, scheduleAutoDismiss],
  )

  const jobFor = useCallback((projectId: string) => jobs[projectId] ?? null, [jobs])
  const isExporting = useCallback(
    (projectId: string) => isExportJobInFlight(jobs[projectId]),
    [jobs],
  )
  const hasActiveExport = useMemo(
    () => Object.values(jobs).some((job) => isExportJobInFlight(job)),
    [jobs],
  )

  const value = useMemo<EditorExportContextValue>(
    () => ({
      jobs,
      hasActiveExport,
      jobFor,
      isExporting,
      startExport,
      dismissJob,
      setModalOpen,
      requestOpenModal,
      onOpenModalRequested,
    }),
    [
      dismissJob,
      hasActiveExport,
      isExporting,
      jobFor,
      jobs,
      onOpenModalRequested,
      requestOpenModal,
      setModalOpen,
      startExport,
    ],
  )

  return <EditorExportContext.Provider value={value}>{children}</EditorExportContext.Provider>
}

export function useOptionalEditorExport(): EditorExportContextValue | null {
  return useContext(EditorExportContext)
}

export function useEditorExport(): EditorExportContextValue {
  const value = useContext(EditorExportContext)
  if (!value) {
    throw new Error('useEditorExport precisa estar dentro de EditorExportProvider')
  }
  return value
}

