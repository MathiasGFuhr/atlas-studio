import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, LogIn } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import type { AntigravityStatus } from '@shared/types'
import { getAtlasApi } from '../lib/api'
import { useToast } from './Toast'

export function AntigravityLinkModal({
  open,
  status,
  onClose,
  onStatus,
}: {
  open: boolean
  status: AntigravityStatus | null
  onClose: () => void
  onStatus: (status: AntigravityStatus) => void
}) {
  const api = getAtlasApi()
  const { push } = useToast()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const linking = status?.authState === 'authenticating'

  useEffect(() => {
    if (open && status?.authState === 'connected') {
      push('Antigravity vinculado com o Google.', 'success')
      onClose()
    }
  }, [open, status?.authState, push, onClose])

  useEffect(() => {
    if (open) {
      setError(null)
      setStarting(false)
    }
  }, [open])

  async function startLogin() {
    setError(null)
    setStarting(true)
    try {
      await api.antigravity.loginStart()
      const next = await api.antigravity.status()
      onStatus(next)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível iniciar o login Google.'
      setError(message)
      push(message, 'error')
    } finally {
      setStarting(false)
    }
  }

  async function confirmLogin() {
    setStarting(true)
    try {
      const next = await api.antigravity.loginConfirm()
      onStatus(next)
      if (next.connected) {
        push('Conta Google vinculada.', 'success')
        onClose()
      } else {
        setError(next.message || 'O login ainda não foi concluído no Antigravity.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível confirmar o login.'
      setError(message)
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
    await api.antigravity.loginCancel()
    const next = await api.antigravity.status()
    onStatus(next)
    onClose()
  }

  function handleClose() {
    if (status?.authState === 'authenticating') {
      void cancel()
      return
    }
    onClose()
  }

  return (
    <Modal open={open} title="Entrar com o Google" onClose={handleClose}>
      {status?.authState === 'not_found' ? (
        <div className="space-y-4 text-center">
          <p className="text-sm leading-relaxed text-muted">
            O Atlas não encontrou o Antigravity CLI (`agy.exe`) neste computador. Instale o CLI e
            volte aqui, ou informe o caminho em Executável.
          </p>
          <p className="rounded-xl border border-border-soft bg-card-2 px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-text">
            irm https://antigravity.google/cli/install.ps1 | iex
          </p>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => void api.system.openPath('https://antigravity.google/docs/cli/install/')}
          >
            <ExternalLink className="h-4 w-4" />
            Como instalar o Antigravity CLI
          </Button>
        </div>
      ) : linking ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dark">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text">Entre com o Google no navegador</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Uma janela do Antigravity abriu e o navegador deve pedir sua conta Google. Depois de
              concluir, volte aqui.
            </p>
            <ul className="mt-3 space-y-2 text-left text-sm leading-relaxed text-muted">
              <li>
                Se o navegador não abrir, na janela preta escolha{' '}
                <strong className="text-text">Google OAuth</strong> e cole o código se pedir.
              </li>
              <li>
                Se já aparecer um prompt tipo <strong className="text-text">you:</strong>, o login
                concluiu. Toque em <strong className="text-text">Já entrei com o Google</strong>.
              </li>
            </ul>
          </div>
          {error ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
          <Button fullWidth className="h-11" onClick={() => void confirmLogin()} disabled={starting}>
            Já entrei com o Google
          </Button>
          <Button fullWidth variant="secondary" className="h-11" onClick={() => void cancel()}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <div className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-dark">
            <LogIn className="h-7 w-7 text-accent" />
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Vincule sua conta Google no Antigravity para analisar a força dos títulos dos vídeos.
          </p>
          {error ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
          <Button fullWidth className="h-12" onClick={() => void startLogin()} disabled={starting}>
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Abrindo Antigravity...
              </>
            ) : (
              'Entrar com o Google'
            )}
          </Button>
        </div>
      )}
    </Modal>
  )
}
