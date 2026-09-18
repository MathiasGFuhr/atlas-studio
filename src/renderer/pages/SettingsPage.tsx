import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Database, Info, Monitor, Bot, Save, LogOut, Link as LinkIcon, RefreshCw, User, Sparkles, LogIn, LayoutGrid, ExternalLink } from 'lucide-react'
import type { AntigravityStatus, AppSettings } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
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
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'
import { notifySettingsChanged } from '../lib/settingsEvents'
import { AgentIntegrationModels } from '../components/settings/AgentIntegrationModels'
import { useAgentModels } from '../hooks/useAgentModels'
import { cn } from '../lib/utils'

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
  const { capabilities } = useWorkspaceCapabilities()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [niches, setNiches] = useState<Array<{ id: string; name: string }>>([])
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [testing, setTesting] = useState(false)
  const [antigravity, setAntigravity] = useState<AntigravityStatus | null>(null)
  const [testingAgy, setTestingAgy] = useState(false)
  const [agyLinkOpen, setAgyLinkOpen] = useState(false)
  const [confirmAgyLogout, setConfirmAgyLogout] = useState(false)
  const [searchParams] = useSearchParams()
  const section = searchParams.get('secao')
  const updatesHighlight = section === 'atualizacoes'
  const aiHighlight = section === 'ia'
  const agentModels = useAgentModels()

  useEffect(() => {
    void (async () => {
      const [s, n, agy] = await Promise.all([
        api.settings.get(),
        api.niches.list(),
        api.antigravity.status().catch(() => null),
      ])
      setSettings(s)
      setNiches(n.map((item) => ({ id: item.id, name: item.name })))
      setAntigravity(agy)
    })()
  }, [api])

  useEffect(() => {
    return api.antigravity.onAuthStateChanged((next) => {
      setAntigravity(next)
    })
  }, [api])

  useEffect(() => {
    if (!settings) return
    const target = aiHighlight ? 'ia' : updatesHighlight ? 'atualizacoes' : null
    if (!target) return
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [aiHighlight, updatesHighlight, settings])

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
      await agentModels.refresh('codex')
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
        push('Antigravity CLI (`agy`) não encontrado. Instale o CLI ou selecione o agy.exe.', 'error')
      } else if (status.authState === 'not_authenticated') {
        push('CLI encontrado. Toque em Entrar com o Google.', 'default')
      } else if (status.authState === 'error') {
        push(status.message || 'O CLI encontrou um erro. Reinstale o agy.exe.', 'error')
      } else {
        push(status.message || 'Não foi possível conectar.', 'error')
      }
      return status
    } catch {
      push('Não foi possível testar o Antigravity.', 'error')
      return null
    } finally {
      setTestingAgy(false)
      void agentModels.refresh('antigravity')
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
    const status = await handleTestAntigravity()
    if (status && status.authState === 'not_authenticated') setAgyLinkOpen(true)
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
    notifySettingsChanged()
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
    <PageShell>
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

      <div className="mb-4">
        <SettingsCard title="Áreas do Atlas" icon={LayoutGrid}>
          <p className="text-xs leading-relaxed text-muted">
            Controla só o que aparece na interface. Projetos, canais e roteiros continuam no Atlas.
          </p>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={settings.contentAreasAutoDetect}
              onChange={(e) => {
                const autoDetect = e.target.checked
                setSettings({
                  ...settings,
                  contentAreasAutoDetect: autoDetect,
                  contentAreasHistoryEnabled: autoDetect
                    ? settings.contentAreasHistoryEnabled
                    : capabilities.historyEnabled,
                  contentAreasMusicEnabled: autoDetect
                    ? settings.contentAreasMusicEnabled
                    : capabilities.musicEnabled,
                })
              }}
            />
            Detectar automaticamente
          </label>
          <label
            className={`flex items-center gap-2 text-sm ${
              settings.contentAreasAutoDetect ? 'text-muted' : 'text-text'
            }`}
          >
            <input
              type="checkbox"
              disabled={settings.contentAreasAutoDetect}
              checked={
                settings.contentAreasAutoDetect
                  ? capabilities.historyEnabled
                  : settings.contentAreasHistoryEnabled
              }
              onChange={(e) =>
                setSettings({ ...settings, contentAreasHistoryEnabled: e.target.checked })
              }
            />
            História
          </label>
          <label
            className={`flex items-center gap-2 text-sm ${
              settings.contentAreasAutoDetect ? 'text-muted' : 'text-text'
            }`}
          >
            <input
              type="checkbox"
              disabled={settings.contentAreasAutoDetect}
              checked={
                settings.contentAreasAutoDetect
                  ? capabilities.musicEnabled
                  : settings.contentAreasMusicEnabled
              }
              onChange={(e) =>
                setSettings({ ...settings, contentAreasMusicEnabled: e.target.checked })
              }
            />
            Música
          </label>
        </SettingsCard>
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

        <SettingsCard title="Codex" icon={Bot} id="ia" highlight={aiHighlight}>
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
          <div className="mt-3">
            <AgentIntegrationModels
              provider="codex"
              snapshot={agentModels.bundle.codex}
              loading={agentModels.loading.codex}
              refreshing={agentModels.refreshing === 'codex' || agentModels.refreshing === 'all'}
              onRefresh={() => void agentModels.refresh('codex')}
              onModelChange={(model) => {
                void agentModels.setDefaultModel('codex', model).then((snapshot) => {
                  setSettings((current) =>
                    current
                      ? {
                          ...current,
                          defaultCodexModel: snapshot.currentModel || model,
                          codexModel: snapshot.currentModel || model,
                        }
                      : current,
                  )
                })
              }}
              onEffortChange={(effort) => {
                void agentModels.setReasoningEffort('codex', effort).then((snapshot) => {
                  setSettings((current) =>
                    current
                      ? { ...current, defaultCodexEffort: snapshot.currentReasoningEffort || effort }
                      : current,
                  )
                })
              }}
            />
          </div>
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

        <SettingsCard title="Antigravity" icon={Sparkles} highlight={aiHighlight}>
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
          <KV label="Conta" value={antigravity?.connected ? 'Google vinculada' : '—'} />
          <KV label="CLI" value={antigravity?.runtimePath || settings.antigravityBinaryPath || '—'} />
          <div className="mt-3">
            <AgentIntegrationModels
              provider="antigravity"
              snapshot={agentModels.bundle.antigravity}
              loading={agentModels.loading.antigravity}
              refreshing={
                agentModels.refreshing === 'antigravity' || agentModels.refreshing === 'all'
              }
              onRefresh={() => void agentModels.refresh('antigravity')}
              onModelChange={(model) => {
                void agentModels.setDefaultModel('antigravity', model).then((snapshot) => {
                  setSettings((current) =>
                    current
                      ? { ...current, defaultAntigravityModel: snapshot.currentModel || model }
                      : current,
                  )
                })
              }}
              onEffortChange={(effort) => {
                void agentModels.setReasoningEffort('antigravity', effort).then((snapshot) => {
                  setSettings((current) =>
                    current
                      ? {
                          ...current,
                          defaultAntigravityEffort: snapshot.currentReasoningEffort || effort,
                        }
                      : current,
                  )
                })
              }}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted">
            {antigravity?.authState === 'not_found'
              ? 'O Atlas precisa do Antigravity CLI (`agy.exe`), não do aplicativo Antigravity. Instale o CLI e depois toque em Entrar com o Google.'
              : antigravity?.authState === 'error'
                ? 'O arquivo agy.exe foi encontrado, mas está danificado. Apague-o e instale o CLI de novo no PowerShell.'
                : 'Entre com sua conta Google no Antigravity para analisar a força dos títulos no calendário do canal.'}
          </p>
          {antigravity?.authState === 'not_found' || antigravity?.authState === 'error' ? (
            <p className="text-xs leading-relaxed text-muted-2">
              {antigravity.authState === 'error' ? (
                <>
                  No PowerShell:{' '}
                  <span className="font-mono text-text">
                    Remove-Item "$env:LOCALAPPDATA\agy\bin\agy.exe" -Force
                  </span>
                  <br />
                </>
              ) : null}
              Depois:{' '}
              <span className="font-mono text-text">irm https://antigravity.google/cli/install.ps1 | iex</span>
            </p>
          ) : null}
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
            ) : (
              <Button icon={<LogIn className="h-4 w-4" />} onClick={() => setAgyLinkOpen(true)}>
                Entrar com o Google
              </Button>
            )}
            {antigravity?.authState === 'not_found' || antigravity?.authState === 'error' ? (
              <Button
                variant="secondary"
                icon={<ExternalLink className="h-4 w-4" />}
                onClick={() => void api.system.openPath('https://antigravity.google/docs/cli/install/')}
              >
                Como instalar o CLI
              </Button>
            ) : null}
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
    </PageShell>
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
  id,
  highlight,
}: {
  title: string
  icon: typeof Bot
  children: ReactNode
  id?: string
  highlight?: boolean
}) {
  return (
    <Card id={id} className={cn(id && 'scroll-mt-4', highlight && 'ring-1 ring-accent/40')}>
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
    <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(8rem,140px)_minmax(0,1fr)] sm:items-center sm:gap-3">
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
