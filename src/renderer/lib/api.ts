import type { AtlasApi } from '../../preload/index'
import { mockApi } from '@mocks/mockApi'

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.atlas)
}

export function getAtlasApi(): AtlasApi {
  if (isElectronRuntime()) {
    return window.atlas
  }
  // Navegador / preview sem preload — nunca fingir integração real com Codex.
  return mockApi as unknown as AtlasApi
}
