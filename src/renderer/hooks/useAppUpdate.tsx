import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppUpdateStatus } from '@shared/updates'
import {
  SIDEBAR_UPDATE_MINIMIZED_KEY,
  SIDEBAR_UPDATE_TOAST_PREFIX,
  shouldToastAvailableUpdate,
  sidebarUpdateToastMessage,
} from '@shared/updates'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

type AppUpdateContextValue = {
  status: AppUpdateStatus | null
  busy: boolean
  userDownloadError: boolean
  sidebarMinimized: boolean
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  minimizeSidebarCard: () => void
  expandSidebarCard: () => void
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null)

function readToastedVersion(version: string): boolean {
  try {
    return sessionStorage.getItem(`${SIDEBAR_UPDATE_TOAST_PREFIX}${version}`) === '1'
  } catch {
    return false
  }
}

function markToastedVersion(version: string) {
  try {
    sessionStorage.setItem(`${SIDEBAR_UPDATE_TOAST_PREFIX}${version}`, '1')
  } catch {
    /* ignore quota / private mode */
  }
}

function readMinimizedVersion(): string | null {
  try {
    return localStorage.getItem(SIDEBAR_UPDATE_MINIMIZED_KEY)
  } catch {
    return null
  }
}

function writeMinimizedVersion(version: string | null) {
  try {
    if (!version) localStorage.removeItem(SIDEBAR_UPDATE_MINIMIZED_KEY)
    else localStorage.setItem(SIDEBAR_UPDATE_MINIMIZED_KEY, version)
  } catch {
    /* ignore */
  }
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const api = getAtlasApi()
  const { push } = useToast()
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [userDownloadError, setUserDownloadError] = useState(false)
  const [sidebarMinimized, setSidebarMinimized] = useState(false)

  useEffect(() => {
    void api.updates.status().then((next) => {
      setStatus(next)
      const version = next.availableVersion?.trim()
      if (version && readMinimizedVersion() === version) setSidebarMinimized(true)
    })
    return api.updates.onChanged((next) => {
      setStatus(next)
    })
  }, [api])

  useEffect(() => {
    const version = status?.availableVersion?.trim() ?? null
    if (!version) {
      setSidebarMinimized(false)
      return
    }
    setSidebarMinimized(readMinimizedVersion() === version)
  }, [status?.availableVersion])

  useEffect(() => {
    const version = shouldToastAvailableUpdate(status, null)
    if (!version) return
    if (readToastedVersion(version)) return
    markToastedVersion(version)
    push(sidebarUpdateToastMessage(version), 'success')
  }, [status, push])

  const run = useCallback(
    async (action: () => Promise<AppUpdateStatus>, kind: 'check' | 'download' | 'install') => {
      setBusy(true)
      if (kind === 'download') {
        setUserDownloadError(false)
        setSidebarMinimized(false)
      }
      try {
        const next = await action()
        setStatus(next)
        if (kind === 'download' && next.state === 'error') setUserDownloadError(true)
      } catch {
        if (kind === 'download') setUserDownloadError(true)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const check = useCallback(() => run(() => api.updates.check(), 'check'), [api, run])
  const download = useCallback(() => run(() => api.updates.download(), 'download'), [api, run])
  const install = useCallback(() => run(() => api.updates.install(), 'install'), [api, run])

  const minimizeSidebarCard = useCallback(() => {
    const version = status?.availableVersion?.trim()
    if (!version) return
    writeMinimizedVersion(version)
    setSidebarMinimized(true)
  }, [status?.availableVersion])

  const expandSidebarCard = useCallback(() => {
    writeMinimizedVersion(null)
    setSidebarMinimized(false)
  }, [])

  const value = useMemo(
    () => ({
      status,
      busy,
      userDownloadError,
      sidebarMinimized,
      check,
      download,
      install,
      minimizeSidebarCard,
      expandSidebarCard,
    }),
    [
      status,
      busy,
      userDownloadError,
      sidebarMinimized,
      check,
      download,
      install,
      minimizeSidebarCard,
      expandSidebarCard,
    ],
  )

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>
}

export function useAppUpdate(): AppUpdateContextValue {
  const value = useContext(AppUpdateContext)
  if (!value) {
    throw new Error('useAppUpdate precisa estar dentro de AppUpdateProvider')
  }
  return value
}
