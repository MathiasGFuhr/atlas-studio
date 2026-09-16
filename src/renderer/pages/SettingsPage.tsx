import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Database, Info, Monitor, Bot, Save, LogOut, Link as LinkIcon, RefreshCw, User, Sparkles, LogIn } from 'lucide-react'
import type { AntigravityStatus, AppSettings } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { ConfirmDialog } from '../components/Modal'
import { AntigravityLinkModal } from '../components/AntigravityLinkModal'
import { UpdatesSettingsCard } from '../components/UpdatesSettingsCard'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import type { CodexAuth } from '../hooks/useCodexAuth'

export function SettingsPage({
  onSettingsSaved,
  codexAuth,
  onRequestLink,
}: {
  onSettingsSaved?: (settings: AppSettings) => void
  codexAuth?: CodexAuth
  onRequestLink?: () => void
}) {
  const api = getAtlasApi()
  const { push } = useToast()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [niches, setNiches] = useState<Array<{ id: string; name: string }>>([])
  const [codexModels, setCodexModels] = useState<Array<{ id: string; label: string }>>([])
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [testing, setTesting] = useState(false)
  const [antigravity, setAntigravity] = useState<AntigravityStatus | null>(null)
  const [testingAgy, setTestingAgy] = useState(false)
  const [agyLinkOpen, setAgyLinkOpen] = useState(false)
  const [confirmAgyLogout, setConfirmAgyLogout] = useState(false)
  const [searchParams] = useSearchParams()
  const updatesHighlight = searchParams.get('secao') === 'atualizacoes'

  useEffect(() => {
    void (async () => {
      const [s, n, modelsPayload, agy] = await Promise.all([
        api.settings.get(),
        api.niches.list(),
        api.codex.listModels().catch(() => ({ models: [], configured: null, effective: '' })),
        api.antigravity.status().catch(() => null),
      ])
      setSettings(s)
      setNiches(n.map((item) => ({ id: item.id, name: item.name })))
      const opts = modelsPayload.models.map((m) => ({ id: m.id, label: m.label }))
      if (modelsPayload.effective && !opts.some((o) => o.id === modelsPayload.effective)) {
        opts.unshift({ id: modelsPayload.effective, label: modelsPayload.effective })
      }
      setCodexModels(opts)
      if (modelsPayload.effective && s.codexModel !== modelsPayload.effective) {
        setSettings({ ...s, codexModel: modelsPayload.effective })
      }
      setAntigravity(agy)
    })()
  }, [api])

  useEffect(() => {
    return api.antigravity.onAuthStateChanged((next) => {
      setAntigravity(next)
    })
  }, [api])

  useEffect(() => {
    if (!updatesHighlight || !settings) return
    document.getElementById('atualizacoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [updatesHighlight, settings])

  async function handleLogout() {
    setConfirmLogout(false)
    if (codexAuth) {
      await codexAuth.logout()
      push('Codex desvinculado.', 'default')
    }
  }

  async function handleTestConnection() {
    if (!codexAuth) return
    setTesting(true)
    try {
      await codexAuth.testConnection()
      const status = await api.codex.status()
      if (status.connected) {
        push('Codex pronto.', 'success')
      } else if (status.authState === 'not_found') {
        push('Codex não instalado.', 'error')
      } else {
        push('Codex encontrado, mas ainda não vinculado.', 'default')
      }
      await codexAuth.refresh()
    } catch {
      push('Não foi possível testar a conexão.', 'error')
    } finally {
      setTesting(false)
    }
  }

  async function handleTestAntigravity() {
    setTestingAgy(true)
    try {
      const status = await api.antigravity.healthCheck()
      setAntigravity(status)
      if (status.connected) {
        push('Antigravity pronto para analisar títulos.', 'success')
      } else if (status.authState === 'not_found') {
        push('Antigravity CLI (`agy`) não encontrado.', 'error')
      } else if (status.authState === 'not_authenticated') {
        push('CLI encontrado. Faça login no terminal com `agy`.', 'default')
      } else {
        push(status.message || 'Não foi possível conectar.', 'error')
      }
    } catch {
      push('Não foi possível testar o Antigravity.', 'error')
    } finally {
      setTestingAgy(false)
    }
  }

  async function pickAntigravityBinary() {
    if (!settings) return
    const file = await api.dialog.selectExecutable()
    if (!file) return
    const next = { ...settings, antigravityBinaryPath: file }
    setSettings(next)
    const saved = await api.settings.update({ antigravityBinaryPath: file })
    setSettings(saved)
    onSettingsSaved?.(saved)
    push('Caminho do Antigravity salvo.', 'success')
    await handleTestAntigravity()
  }

  async function handleAntigravityLogout() {
    setConfirmAgyLogout(false)
    const next = await api.antigravity.logout()
    setAntigravity(next)
    push('Antigravity desvinculado.', 'default')
  }

  async function save() {
    if (!settings) return
    const { notificationReadKeys, ...patch } = settings
    void notificationReadKeys
    const next = await api.settings.update(patch)
    setSettings(next)
    onSettingsSaved?.(next)
    push('Alterações salvas.', 'success')
  }

  if (!settings) {
    return <div className="p-8 text-sm text-muted">Carregando configurações...</div>
  }

  const authState = codexAuth?.authState
  const statusLabel = codexAuth?.isConnected
    ? 'Pronto'
    : authState === 'not_found'
      ? 'Não instalado'
      : authState === 'authenticating'
        ? 'Vinculando...'
        : 'Não vinculado'

  const accountDisplay =
    codexAuth?.account?.loginType === 'api_key'
      ? 'API Key vinculada'
      : codexAuth?.isConnected || codexAuth?.account?.loginType === 'chatgpt'
        ? 'ChatGPT vinculada'
        : '—'

  const versionLabel = codexAuth?.status?.codexVersion ?? '—'

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb="Atlas / Configurações"
        title="Configurações"
        subtitle="Ajuste o sistema para o seu fluxo de trabalho."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusMini
          icon={Bot}
          title="Codex"
          value={statusLabel}
          ok={Boolean(codexAuth?.isConnected)}
        />
        <StatusMini
          icon={Sparkles}
          title="Antigravity"
          value={
            antigravity?.connected
              ? 'Pronto'
              : antigravity?.authState === 'authenticating'
                ? 'Entrando...'
                : antigravity?.authState === 'not_found'
                ? 'Não instalado'
                : antigravity?.authState === 'not_authenticated'
                  ? 'Sem login'
                  : '—'
          }
          ok={Boolean(antigravity?.connected)}
        />
        <StatusMini icon={Monitor} title="Sistema" value="Estável" ok />
        <StatusMini
          icon={Database}
          title="Backup"
          value={settings.backupEnabled ? 'Ativo' : 'Inativo'}
          ok={settings.backupEnabled}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsCard title="Conta" icon={Bot}>
          <Row
            label="Foto"
            control={
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-gradient-to-br from-[#2b3a44] to-[#10161a]">
                  {settings.accountPhotoDataUrl ? (
                    <img
                      src={settings.accountPhotoDataUrl}
                      alt="Foto de perfil"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-6 w-6 text-muted" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="h-9 px-3 text-xs"
                    onClick={() => {
                      void (async () => {
                        try {
                          const file = await api.dialog.selectImage()
                          if (!file) return
                          const next = await api.settings.setProfilePhoto(file)
                          setSettings(next)
                          onSettingsSaved?.(next)
                          push('Foto de perfil atualizada.', 'success')
                        } catch (error) {
                          push(
                            error instanceof Error ? error.message : 'Não foi possível usar esta imagem.',
                            'error',
                          )
                        }
                      })()
                    }}
                  >
                    Escolher foto
                  </Button>
                  {settings.accountPhotoPath ? (
                    <Button
                      variant="ghost"
                      className="h-9 px-3 text-xs"
                      onClick={() => {
                        void (async () => {
                          const next = await api.settings.clearProfilePhoto()
                          setSettings(next)
                          onSettingsSaved?.(next)
                          push('Foto de perfil removida.', 'default')
                        })()
                      }}
                    >
                      Remover
                    </Button>
                  ) : null}
                </div>
              </div>
            }
          />
          <Row
            label="Nome"
            control={
              <Input
                value={settings.accountName}
                onChange={(e) => setSettings({ ...settings, accountName: e.target.value })}
              />
            }
          />
          <Row
            label="Função"
            control={
              <Input
                value={settings.accountRole}
                onChange={(e) => setSettings({ ...settings, accountRole: e.target.value })}
              />
            }
          />
          <Row
            label="E-mail"
            control={
              <Input
                value={settings.accountEmail}
                onChange={(e) => setSettings({ ...settings, accountEmail: e.target.value })}
              />
            }
          />
        </SettingsCard>

        <SettingsCard title="Codex" icon={Bot}>
          <KV
            label="Status"
            value={
              codexAuth?.isConnected
                ? '● Pronto'
                : authState === 'not_found'
                  ? 'Não instalado'
                  : '○ Não vinculado'
            }
            accent={codexAuth?.isConnected}
          />
          <KV label="Versão" value={versionLabel} />
          <KV label="Conta" value={accountDisplay} />
          {codexAuth?.isConnected && codexAuth.account?.email ? (
            <KV label="E-mail" value={codexAuth.account.email} />
          ) : null}
          <Row
            label="Modelo"
            control={
              <Select
                value={settings.codexModel}
                onChange={(e) => setSettings({ ...settings, codexModel: e.target.value })}
                options={
                  codexModels.length > 0
                    ? codexModels.map((m) => ({ value: m.id, label: m.label }))
                    : [{ value: settings.codexModel || 'gpt-5.6-sol', label: settings.codexModel || 'gpt-5.6-sol' }]
                }
              />
            }
          />
          <p className="mt-1 text-xs text-muted">
            Modelo real do Codex CLI (`~/.codex/config.toml`). Ao salvar, o Atlas sincroniza com o
            Codex.
          </p>
          <Row
            label="Auto-approval"
            control={
              <Select
                value={settings.autoApproval ? 'sim' : 'nao'}
                onChange={(e) =>
                  setSettings({ ...settings, autoApproval: e.target.value === 'sim' })
                }
                options={[
                  { value: 'nao', label: 'Desligado' },
                  { value: 'sim', label: 'Ligado' },
                ]}
              />
            }
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {codexAuth?.isConnected ? (
              <Button
                variant="secondary"
                icon={<LogOut className="h-4 w-4" />}
                onClick={() => setConfirmLogout(true)}
              >
                Desvincular
              </Button>
            ) : authState === 'not_found' ? null : (
              <Button icon={<LinkIcon className="h-4 w-4" />} onClick={onRequestLink}>
                Vincular com ChatGPT
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />}
              onClick={() => void handleTestConnection()}
              disabled={testing}
            >
              Reconectar
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Antigravity" icon={Sparkles}>
          <KV
            label="Status"
            value={
              antigravity?.connected
                ? '● Pronto'
                : antigravity?.authState === 'not_found'
                  ? 'Não instalado'
                  : antigravity?.authState === 'not_authenticated'
                    ? 'Sem login'
                    : antigravity?.message || '—'
            }
            accent={Boolean(antigravity?.connected)}
          />
          <KV label="Versão" value={antigravity?.version || '—'} />
          <KV label="CLI" value={antigravity?.runtimePath || settings.antigravityBinaryPath || '—'} />
          <p className="text-xs leading-relaxed text-muted">
            Entre com sua conta Google no Antigravity para analisar a força dos títulos no
            calendário do canal.
          </p>
          <Row
            label="Executável"
            control={
              <div className="flex gap-2">
                <Input
                  value={settings.antigravityBinaryPath}
                  onChange={(e) =>
                    setSettings({ ...settings, antigravityBinaryPath: e.target.value })
                  }
                  placeholder="Caminho do agy.exe"
                />
                <Button variant="secondary" className="h-11 shrink-0" onClick={() => void pickAntigravityBinary()}>
                  Arquivo
                </Button>
              </div>
            }
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {antigravity?.connected ? (
              <Button
                variant="secondary"
                icon={<LogOut className="h-4 w-4" />}
                onClick={() => setConfirmAgyLogout(true)}
              >
                Desvincular Google
              </Button>
            ) : antigravity?.authState === 'not_found' ? null : (
              <Button icon={<LogIn className="h-4 w-4" />} onClick={() => setAgyLinkOpen(true)}>
                Entrar com o Google
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<RefreshCw className={`h-4 w-4 ${testingAgy ? 'animate-spin' : ''}`} />}
              onClick={() => void handleTestAntigravity()}
              disabled={testingAgy}
            >
              Testar conexão
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard title="Projeto" icon={Monitor}>
          <Row
            label="Pasta padrão"
            control={
              <Input
                value={settings.workspacePath}
                onChange={(e) => setSettings({ ...settings, workspacePath: e.target.value })}
              />
            }
          />
          <Row
            label="Pastas dos projetos"
            control={
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    value={settings.projectsRoot}
                    onChange={(e) => setSettings({ ...settings, projectsRoot: e.target.value })}
                    placeholder="Ex.: C:\Users\voce\Documents\Atlas Studio"
                  />
                  <Button
                    variant="secondary"
                    className="h-11 shrink-0"
                    onClick={() => {
                      void api.dialog.selectFolder().then((folder) => {
                        if (!folder) return
                        setSettings({ ...settings, projectsRoot: folder })
                      })
                    }}
                  >
                    Pasta
                  </Button>
                </div>
                <p className="text-xs text-muted-2">
                  O Atlas cria as pastas dos projetos em Historia/ e Musica/ dentro desta raiz.
                </p>
              </div>
            }
          />
          <Row
            label="Biblioteca de skills"
            control={
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={settings.skillLibraryRoot}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        skillLibraryRoot: e.target.value,
                        skillsPath: e.target.value,
                      })
                    }
                  />
                  <Button
                    variant="secondary"
                    className="h-11 shrink-0"
                    onClick={() => {
                      void api.dialog.selectFolder().then((folder) => {
                        if (!folder) return
                        setSettings({
                          ...settings,
                          skillLibraryRoot: folder,
                          skillsPath: folder,
                        })
                      })
                    }}
                  >
                    Pasta
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  className="h-9 w-full text-xs"
                  onClick={() => {
                    void (async () => {
                      try {
                        const next = await api.settings.update({
                          skillLibraryRoot: settings.skillLibraryRoot,
                          skillsPath: settings.skillLibraryRoot,
                        })
                        setSettings(next)
                        const result = await api.skills.rescan(settings.skillLibraryRoot)
                        push(
                          `Biblioteca atualizada: ${result.total} skills (+${result.added} / -${result.removed})`,
                          'success',
                        )
                      } catch (error) {
                        push(
                          error instanceof Error ? error.message : 'Falha ao rescanear skills',
                          'error',
                        )
                      }
                    })()
                  }}
                >
                  Rescanear skills
                </Button>
              </div>
            }
          />
          <Row
            label="Pasta dos roteiros"
            control={
              <Input
                value={settings.scriptsPath}
                onChange={(e) => setSettings({ ...settings, scriptsPath: e.target.value })}
              />
            }
          />
          <Row
            label="Idioma padrão"
            control={
              <Select
                value={settings.defaultLanguage}
                onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
                options={['Alemão', 'Inglês', 'Português'].map((l) => ({ value: l, label: l }))}
              />
            }
          />
          <Row
            label="Nicho padrão"
            control={
              <Select
                value={settings.defaultNicheId ?? ''}
                onChange={(e) =>
                  setSettings({ ...settings, defaultNicheId: e.target.value || null })
                }
                options={[
                  { value: '', label: 'Nenhum' },
                  ...niches.map((n) => ({ value: n.id, label: n.name })),
                ]}
              />
            }
          />
        </SettingsCard>

        <SettingsCard title="Saída" icon={Database}>
          <Row
            label="Estilo padrão"
            control={
              <Select
                value={settings.defaultOutputStyle}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultOutputStyle: e.target.value as AppSettings['defaultOutputStyle'],
                  })
                }
                options={[
                  { value: 'original', label: 'Original' },
                  { value: 'profissional', label: 'Profissional' },
                  { value: 'alta_retencao', label: 'Alta retenção' },
                ]}
              />
            }
          />
          <Row
            label="Duração"
            control={
              <Select
                value={settings.defaultDuration}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultDuration: e.target.value as AppSettings['defaultDuration'],
                  })
                }
                options={[
                  { value: '10', label: '10 min' },
                  { value: '15', label: '15 min / Médio' },
                  { value: '20', label: '20 min' },
                  { value: '30', label: '30 min' },
                ]}
              />
            }
          />
          <Row
            label="Auditoria final"
            control={
              <Select
                value={settings.finalAuditEnabled ? 'sim' : 'nao'}
                onChange={(e) =>
                  setSettings({ ...settings, finalAuditEnabled: e.target.value === 'sim' })
                }
                options={[
                  { value: 'sim', label: 'Ativa' },
                  { value: 'nao', label: 'Desligada' },
                ]}
              />
            }
          />
          <Row
            label="Backup"
            control={
              <Select
                value={settings.backupEnabled ? 'sim' : 'nao'}
                onChange={(e) =>
                  setSettings({ ...settings, backupEnabled: e.target.value === 'sim' })
                }
                options={[
                  { value: 'sim', label: 'Ativo' },
                  { value: 'nao', label: 'Inativo' },
                ]}
              />
            }
          />
        </SettingsCard>
      </div>

      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Sistema</p>
        <UpdatesSettingsCard
          settings={settings}
          highlight={updatesHighlight}
          onSettingsChange={(next) => {
            setSettings(next)
            onSettingsSaved?.(next)
          }}
        />
      </div>

      <Card className="mt-5 flex items-start gap-3" padding="sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-sm text-muted">
          O nicho escolhido carrega automaticamente a skill associada (caminho absoluto na sua
          biblioteca). As skills continuam sendo editadas fora do Atlas Studio.
        </p>
      </Card>

      <div className="mt-5 flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            void api.settings.get().then(setSettings)
          }}
        >
          Cancelar
        </Button>
        <Button icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
          Salvar alterações
        </Button>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Desvincular Codex"
        message="Tem certeza que deseja desvincular o Codex? Você precisará vincular novamente para gerar roteiros."
        confirmLabel="Desvincular"
        onConfirm={() => void handleLogout()}
        onClose={() => setConfirmLogout(false)}
      />

      <ConfirmDialog
        open={confirmAgyLogout}
        title="Desvincular Google"
        message="O Antigravity deixa de analisar títulos até você entrar de novo com o Google."
        confirmLabel="Desvincular"
        onConfirm={() => void handleAntigravityLogout()}
        onClose={() => setConfirmAgyLogout(false)}
      />

      <AntigravityLinkModal
        open={agyLinkOpen}
        status={antigravity}
        onClose={() => setAgyLinkOpen(false)}
        onStatus={setAntigravity}
      />
    </div>
  )
}

function StatusMini({
  icon: Icon,
  title,
  value,
  ok,
}: {
  icon: typeof Bot
  title: string
  value: string
  ok?: boolean
}) {
  return (
    <Card className="flex flex-col items-center gap-2 py-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-dark text-accent">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-medium text-text">{title}</div>
      <div className="inline-flex items-center gap-2 text-xs text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-accent' : 'bg-danger'}`} />
        {value}
      </div>
    </Card>
  )
}

function SettingsCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Bot
  children: ReactNode
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  )
}

function Row({ label, control }: { label: string; control: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm text-muted">{label}</span>
      <div>{control}</div>
    </div>
  )
}

function KV({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border-soft py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span
        className={`max-w-[60%] truncate text-right ${accent ? 'font-medium text-accent' : 'font-medium text-text'}`}
      >
        {value}
      </span>
    </div>
  )
}
