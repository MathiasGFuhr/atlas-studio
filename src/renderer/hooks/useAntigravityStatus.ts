import { useEffect, useState } from 'react'
import type { AntigravityStatus } from '@shared/types'
import { getAtlasApi } from '../lib/api'

/** Espelha o status real do Antigravity via IPC — sem estado fictício. */
export function useAntigravityStatus(): AntigravityStatus | null {
  const api = getAtlasApi()
  const [status, setStatus] = useState<AntigravityStatus | null>(null)

  useEffect(() => {
    void api.antigravity.status().then(setStatus).catch(() => setStatus(null))
  }, [api])

  useEffect(() => {
    return api.antigravity.onAuthStateChanged(setStatus)
  }, [api])

  useEffect(() => {
    const timer = setInterval(() => {
      void api.antigravity.status().then(setStatus).catch(() => undefined)
    }, 30000)
    return () => clearInterval(timer)
  }, [api])

  return status
}
