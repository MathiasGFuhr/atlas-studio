import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Loader2, Copy, AlertCircle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import type { CodexAuth } from '../hooks/useCodexAuth'
import { useToast } from './Toast'
import { getAtlasApi } from '../lib/api'

export function CodexLinkModal({
  open,
  codexAuth,
  onClose,
  onLinked,
  required = false,
}: {
  open: boolean
  codexAuth: CodexAuth
  onClose: () => void
  onLinked?: () => void
  required?: boolean
}) {
  const { push } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const prevAuthState = useRef(codexAuth.authState)

  const { authState, deviceCode, pendingAuthUrl } = codexAuth

  // Handle auto-close when connected — via effect, not during render
  useEffect(() => {
    if (
      authState === 'connected' &&
      prevAuthState.current !== 'connected' &&
      open
    ) {
      push('Codex vinculado com sucesso.', 'success')
      setLoading(false)
      onLinked?.()
      onClose()
    }
    prevAuthState.current = authState
  }, [authState, open, push, onLinked, onClose])

  // Sync local loading with auth state
  useEffect(() => {
    if (authState === 'authenticating') {
      setLoading(true)
    } else if (authState !== 'initializing') {
      setLoading(false)
    }
  }, [authState])

  // Clear error + loading when modal opens
  useEffect(() => {
    if (open) {
      setError(null)
      setLoading(false)
    }
  }, [open])

  async function handleStartLink() {
    setError(null)
    setLoading(true)
    try {
      await codexAuth.startLink('chatgpt')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar vinculação'
      setError(friendlyError(msg))
      setLoading(false)
      push(friendlyError(msg), 'error')
    }
  }

  async function handleDeviceCode() {
    setError(null)
    setLoading(true)
    try {
      await codexAuth.startDeviceCodeLink()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar vinculação'
      setError(friendlyError(msg))
      setLoading(false)
      push(friendlyError(msg), 'error')
    }
  }

  async function handleCancel() {
    try {
      await codexAuth.cancelLink()
    } catch {
      /* ignore */
    }
    setError(null)
    setLoading(false)
  }

  async function handleConfigure() {
    setError(null)
    setLoading(true)
    try {
      await codexAuth.testConnection()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível localizar o Codex'
      setError(friendlyError(msg))
      push(friendlyError(msg), 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (loading) {
      void handleCancel()
    }
    setError(null)
    setLoading(false)
    onClose()
  }

  const isLinking = loading || authState === 'authenticating'
  const title =
    authState === 'not_found'
      ? 'Codex não instalado'
      : required
        ? 'Vincule o Codex para continuar'
        : 'Vincular com ChatGPT'

  return (
    <Modal open={open} title={title} onClose={handleClose}>
      {authState === 'not_found' ? (
        <NotFoundContent loading={loading} onConfigure={() => void handleConfigure()} />
      ) : isLinking && deviceCode ? (
        <DeviceCodeContent
          userCode={deviceCode.userCode}
          verificationUrl={deviceCode.verificationUrl}
          onCancel={() => void handleCancel()}
        />
      ) : isLinking ? (
        <LinkingContent
          authUrl={pendingAuthUrl || 'https://auth.openai.com/codex/device'}
          onOpenBrowser={() => void codexAuth.openPendingAuthUrl()}
          onCancel={() => void handleCancel()}
        />
      ) : (
        <ReadyToLinkContent
          error={error}
          loading={loading}
          required={required}
          onStartLink={() => void handleStartLink()}
          onDeviceCode={() => void handleDeviceCode()}
        />
      )}
    </Modal>
  )
}

function friendlyError(msg: string): string {
  if (/token|authorization|cookie|api[_-]?key|bearer|spawn|enoent|eacces/i.test(msg)) {
    return 'Não foi possível concluir a vinculação. Tente novamente.'
  }
  return msg
}

function NotFoundContent({
  loading,
  onConfigure,
}: {
  loading: boolean
  onConfigure: () => void
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
        <AlertCircle className="h-7 w-7 text-amber-500" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text">Codex não instalado</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          O Atlas Studio não encontrou o Codex neste computador. Instale o Codex e depois toque em
          Reconectar.
        </p>
      </div>
      <Button fullWidth className="h-11" onClick={onConfigure} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Procurando...
          </>
        ) : (
          'Reconectar'
        )}
      </Button>
      <Button
        fullWidth
        variant="secondary"
        className="h-11"
        onClick={() => {
          void getAtlasApi().system.openPath('https://openai.com/codex')
        }}
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        Saiba mais sobre o Codex
      </Button>
    </div>
  )
}

function ReadyToLinkContent({
  error,
  loading,
  required,
  onStartLink,
  onDeviceCode,
}: {
  error: string | null
  loading: boolean
  required?: boolean
  onStartLink: () => void
  onDeviceCode: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dark">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 18L12 4L20 18H15.5L12 11.5L8.5 18H4Z" fill="currentColor" className="text-accent" />
          </svg>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          {required
            ? 'Vincule sua conta ChatGPT para continuar gerando roteiros. Seu nicho, idioma e tema serão mantidos.'
            : 'Vincule sua conta ChatGPT para usar o Codex no Atlas Studio.'}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <Button
        fullWidth
        className="h-12 text-[15px] font-semibold"
        onClick={onStartLink}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Conectando...
          </>
        ) : (
          'Vincular com ChatGPT'
        )}
      </Button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border-soft" />
        <span className="text-xs text-muted">ou</span>
        <div className="h-px flex-1 bg-border-soft" />
      </div>

      <button
        type="button"
        onClick={onDeviceCode}
        disabled={loading}
        className="w-full text-center text-sm text-muted transition-colors hover:text-accent disabled:opacity-50"
      >
        Usar código de dispositivo
      </button>
    </div>
  )
}

function LinkingContent({
  authUrl,
  onOpenBrowser,
  onCancel,
}: {
  authUrl: string | null
  onOpenBrowser: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dark">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text">Vinculando com Codex</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {authUrl
            ? 'Finalize o acesso na janela do navegador. Se ela não abriu, use o botão abaixo.'
            : 'Aguardando a página de autenticação do ChatGPT...'}
        </p>
      </div>
      {authUrl ? (
        <Button fullWidth className="h-11" onClick={onOpenBrowser}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Abrir navegador
        </Button>
      ) : null}
      <Button fullWidth variant="secondary" className="h-11" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  )
}

function DeviceCodeContent({
  userCode,
  verificationUrl,
  onCancel,
}: {
  userCode: string
  verificationUrl: string
  onCancel: () => void
}) {
  const { push } = useToast()

  function copyCode() {
    void getAtlasApi().system.copyText(userCode)
    push('Código copiado.', 'success')
  }

  return (
    <div className="space-y-5 text-center">
      <div>
        <h3 className="text-base font-semibold text-text">Código de verificação</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Acesse a página de autenticação e insira o código abaixo.
        </p>
      </div>

      <div className="flex items-center justify-center gap-3">
        <code className="rounded-xl border border-border bg-card-2 px-6 py-3 text-2xl font-bold tracking-[0.3em] text-accent">
          {userCode}
        </code>
        <button
          type="button"
          onClick={copyCode}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-white/5 hover:text-text"
          title="Copiar código"
        >
          <Copy className="h-5 w-5" />
        </button>
      </div>

      <Button
        fullWidth
        className="h-11"
        icon={<ExternalLink className="h-4 w-4" />}
        onClick={() => {
          void getAtlasApi().system.openPath(verificationUrl)
        }}
      >
        Abrir página de autenticação
      </Button>

      <p className="text-xs text-muted">Aguardando confirmação...</p>

      <Button fullWidth variant="secondary" className="h-10" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  )
}

/** Modal that asks for Codex auth before proceeding with generation. */
export function CodexRequiredModal({
  open,
  codexAuth,
  onClose,
  onLinked,
}: {
  open: boolean
  codexAuth: CodexAuth
  onClose: () => void
  onLinked: () => void
}) {
  const didFireRef = useRef(false)

  // Handle auto-trigger in effect, not during render
  useEffect(() => {
    if (open && codexAuth.authState === 'connected' && !didFireRef.current) {
      didFireRef.current = true
      onLinked()
    }
  }, [open, codexAuth.authState, onLinked])

  useEffect(() => {
    if (!open) didFireRef.current = false
  }, [open])

  if (codexAuth.authState === 'connected' && !open) return null

  return (
    <CodexLinkModal
      open={open}
      codexAuth={codexAuth}
      onClose={onClose}
      onLinked={onLinked}
      required
    />
  )
}
