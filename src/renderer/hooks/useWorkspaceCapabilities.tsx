import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ContentArea, WorkspaceCapabilities } from '@shared/workspaceCapabilities'
import {
  BOTH_AREAS_ENABLED,
  preferenceEnablingArea,
  preferenceToSettings,
} from '@shared/workspaceCapabilities'
import { getAtlasApi } from '../lib/api'
import { onChannelsChanged } from '../lib/channelEvents'
import { onProjectsChanged } from '../lib/projectEvents'
import { notifySettingsChanged, onSettingsChanged } from '../lib/settingsEvents'

type WorkspaceCapabilitiesValue = {
  capabilities: WorkspaceCapabilities
  ready: boolean
  refresh: () => Promise<void>
  enableArea: (area: ContentArea) => Promise<void>
}

const WorkspaceCapabilitiesContext = createContext<WorkspaceCapabilitiesValue | null>(null)

export function WorkspaceCapabilitiesProvider({ children }: { children: ReactNode }) {
  const api = getAtlasApi()
  const [capabilities, setCapabilities] = useState<WorkspaceCapabilities>(BOTH_AREAS_ENABLED)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const next = await api.workspace.capabilities()
    setCapabilities(next)
    setReady(true)
  }, [api])

  useEffect(() => {
    void refresh()
    const stop = [
      onProjectsChanged(() => {
        void refresh()
      }),
      onChannelsChanged(() => {
        void refresh()
      }),
      onSettingsChanged(() => {
        void refresh()
      }),
    ]
    return () => {
      for (const unbind of stop) unbind()
    }
  }, [refresh])

  const enableArea = useCallback(
    async (area: ContentArea) => {
      const saved = await api.settings.update(preferenceToSettings(preferenceEnablingArea(capabilities, area)))
      void saved
      notifySettingsChanged()
      await refresh()
    },
    [api, capabilities, refresh],
  )

  const value = useMemo(
    () => ({ capabilities, ready, refresh, enableArea }),
    [capabilities, ready, refresh, enableArea],
  )

  return (
    <WorkspaceCapabilitiesContext.Provider value={value}>
      {children}
    </WorkspaceCapabilitiesContext.Provider>
  )
}

export function useWorkspaceCapabilities(): WorkspaceCapabilitiesValue {
  const value = useContext(WorkspaceCapabilitiesContext)
  if (!value) {
    throw new Error('useWorkspaceCapabilities precisa estar dentro de WorkspaceCapabilitiesProvider')
  }
  return value
}
