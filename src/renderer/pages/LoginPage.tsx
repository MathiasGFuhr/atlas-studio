import { useState } from 'react'
import type { AtlasSession } from '@shared/account'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { getAtlasApi } from '../lib/api'

export function LoginPage({
  onSignedIn,
}: {
  onSignedIn: (session: AtlasSession) => void
}) {
  const api = getAtlasApi()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setError('')
    setBusy(true)
    try {
      const session =
        mode === 'signup'
          ? await api.account.signUp({ name, email, password })
          : await api.account.signIn({ email, password })
      if (!session.user) throw new Error('Não foi possível entrar.')
      onSignedIn(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-bg px-4 text-text">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card-2 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-dark text-accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 18L12 4L20 18H15.5L12 11.5L8.5 18H4Z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Atlas Studio</h1>
            <p className="text-xs text-muted">
              {mode === 'signup' ? 'Crie sua conta para continuar' : 'Entre para continuar'}
            </p>
          </div>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {mode === 'signup' ? (
            <Input
              label="Nome"
              value={name}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          ) : null}
          <Input
            label="E-mail"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" fullWidth disabled={busy} className="h-11">
            {busy ? 'Aguarde...' : mode === 'signup' ? 'Criar conta' : 'Entrar'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted hover:text-text"
          onClick={() => {
            setError('')
            setMode(mode === 'signup' ? 'signin' : 'signup')
          }}
        >
          {mode === 'signup' ? 'Já tem conta? Entrar' : 'Não tem conta? Criar agora'}
        </button>
      </div>
    </div>
  )
}
