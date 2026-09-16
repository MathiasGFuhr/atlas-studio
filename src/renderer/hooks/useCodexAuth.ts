import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CodexAuthState,
  CodexAccountInfo,
  CodexStatus,
  CodexLoginStartResult,
  CodexDeviceCodeInfo,
} from '@shared/types'
import { getAtlasApi } from '../lib/api'

export interface CodexAuth {
  authState: CodexAuthState
  account: CodexAccountInfo | null
  status: CodexStatus | null
  isConnected: boolean
  isLinking: boolean
  showOnboarding: boolean
  deviceCode: CodexDeviceCodeInfo | null
  /** URL de autenticação do fluxo browser (quando disponível). */
  pendingAuthUrl: string | null

  /** Inicia o fluxo de vinculação com ChatGPT (browser). */
  startLink: (type?: string) => Promise<CodexLoginStartResult>
  /** Inicia vinculação via device code (fallback). */
  startDeviceCodeLink: () => Promise<CodexLoginStartResult>
  /** Cancela a vinculação em andamento. */
  cancelLink: () => Promise<void>
  /** Desvincula a conta Codex. */
  logout: () => Promise<void>
  /** Força uma atualização do status / health check. */
  refresh: () => Promise<void>
  /** Descarta o onboarding. */
  dismissOnboarding: () => void
  /** Testa a conexão com o runtime Codex. */
  testConnection: () => Promise<void>
  /** Reabre a URL de autenticação no navegador. */
  openPendingAuthUrl: () => Promise<void>
}

export function useCodexAuth(): CodexAuth {
  const api = getAtlasApi()
  const [status, setStatus] = useState<CodexStatus | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [deviceCode, setDeviceCode] = useState<CodexDeviceCodeInfo | null>(null)
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null)
  const initialized = useRef(false)

  // Fetch initial status + onboarding state
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    void (async () => {
      const [s, dismissed] = await Promise.all([
        api.codex.status(),
        api.codex.isOnboardingDismissed(),
      ])
      setStatus(s)
      if (!dismissed && s.authState !== 'connected' && s.authState !== 'initializing') {
        setShowOnboarding(true)
      }
    })()
  }, [api])

  // Listen for auth state changes from main process
  useEffect(() => {
    const cleanupAuth = api.codex.onAuthStateChanged((newStatus) => {
      setStatus(newStatus)
      if (newStatus.authState === 'connected') {
        setShowOnboarding(false)
        setDeviceCode(null)
        setPendingAuthUrl(null)
      }
    })
    const cleanupUrl = api.codex.onLoginUrl?.(({ authUrl, userCode }) => {
      setPendingAuthUrl(authUrl)
      if (userCode) {
        setDeviceCode({ userCode, verificationUrl: authUrl })
      }
    })
    return () => {
      cleanupAuth()
      cleanupUrl?.()
    }
  }, [api])

  // Periodic health check
  useEffect(() => {
    const timer = setInterval(() => {
      void api.codex.status().then(setStatus)
    }, 30000)
    return () => clearInterval(timer)
  }, [api])

  const startLink = useCallback(
    async (type: string = 'chatgpt') => {
      setDeviceCode(null)
      setPendingAuthUrl('https://auth.openai.com/codex/device')
      // Abre na hora — o main também abre; reforço no renderer.
      void api.system.openPath('https://auth.openai.com/codex/device')
      const result = await api.codex.loginStart(type)
      if (result.authUrl) setPendingAuthUrl(result.authUrl)
      if (result.userCode && (result.verificationUrl || result.authUrl)) {
        setDeviceCode({
          userCode: result.userCode,
          verificationUrl: result.verificationUrl || result.authUrl!,
        })
      }
      return result
    },
    [api],
  )

  const startDeviceCodeLink = useCallback(async () => {
    setPendingAuthUrl('https://auth.openai.com/codex/device')
    void api.system.openPath('https://auth.openai.com/codex/device')
    const result = await api.codex.loginStart('chatgptDeviceCode')
    if (result.userCode && result.verificationUrl) {
      setDeviceCode({
        userCode: result.userCode,
        verificationUrl: result.verificationUrl,
      })
    } else if (result.authUrl) {
      setPendingAuthUrl(result.authUrl)
    }
    return result
  }, [api])

  const cancelLink = useCallback(async () => {
    try { await api.codex.loginCancel() } catch { /* ignore */ }
    setDeviceCode(null)
    setPendingAuthUrl(null)
  }, [api])

  const logout = useCallback(async () => {
    await api.codex.logout()
    setDeviceCode(null)
    setPendingAuthUrl(null)
  }, [api])

  const refresh = useCallback(async () => {
    const s = await api.codex.status()
    setStatus(s)
  }, [api])

  const testConnection = useCallback(async () => {
    const s = await api.codex.healthCheck()
    setStatus(s)
  }, [api])

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false)
    void api.codex.dismissOnboarding()
  }, [api])

  const openPendingAuthUrl = useCallback(async () => {
    const url =
      pendingAuthUrl ||
      deviceCode?.verificationUrl ||
      'https://auth.openai.com/codex/device'
    await api.system.openPath(url)
  }, [api, pendingAuthUrl, deviceCode])

  const authState = status?.authState ?? 'initializing'

  return {
    authState,
    account: status?.account ?? null,
    status,
    isConnected: authState === 'connected',
    isLinking: authState === 'authenticating',
    showOnboarding,
    deviceCode,
    pendingAuthUrl,
    startLink,
    startDeviceCodeLink,
    cancelLink,
    logout,
    refresh,
    dismissOnboarding,
    testConnection,
    openPendingAuthUrl,
  }
}
