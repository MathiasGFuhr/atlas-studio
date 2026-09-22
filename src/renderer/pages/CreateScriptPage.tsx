import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ChevronDown, Sparkles } from 'lucide-react'
import type {
  GenerationStep,
  Niche,
  OutputStyle,
  Project,
  ResearchMode,
  ScriptRecord,
} from '@shared/types'
import { GENERATION_STEPS } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Card } from '../components/Card'
import { Select } from '../components/Select'
import { Textarea } from '../components/Textarea'
import { Button } from '../components/Button'
import { GenerationProgress } from '../components/GenerationProgress'
import { ScriptCard } from '../components/ScriptCard'
import { CodexRequiredModal } from '../components/CodexLinkModal'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { environmentBreadcrumb } from '../lib/environments'
import { cn } from '../lib/utils'
import type { CodexAuth } from '../hooks/useCodexAuth'

const languages = ['Alemão', 'Inglês', 'Português', 'Espanhol', 'Francês']

export function CreateScriptPage({
  codexAuth,
  onRequestLink: _onRequestLink,
}: {
  codexAuth?: CodexAuth
  onRequestLink?: () => void
}) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const [searchParams] = useSearchParams()
  // Quando a tela é aberta de dentro de um projeto, o roteiro nasce vinculado a ele.
  const projectId = searchParams.get('projectId')

  const [project, setProject] = useState<Project | null>(null)
  const [niches, setNiches] = useState<Niche[]>([])
  const [nicheId, setNicheId] = useState('')
  const [language, setLanguage] = useState('Alemão')
  const [topic, setTopic] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [duration, setDuration] = useState('15')
  const [outputStyle, setOutputStyle] = useState<OutputStyle>('profissional')
  const [researchMode, setResearchMode] = useState<ResearchMode>('automatica')
  const [generating, setGenerating] = useState(false)
  const [failed, setFailed] = useState(false)
  const [failMessage, setFailMessage] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [cancellable, setCancellable] = useState(false)
  const [progressTitle, setProgressTitle] = useState('Criando seu roteiro...')
  const [steps, setSteps] = useState<GenerationStep[]>(
    GENERATION_STEPS.map((s) => ({ id: s.id, label: s.label, state: 'pending' })),
  )
  const [recent, setRecent] = useState<ScriptRecord[]>([])
  const [interruptedHint, setInterruptedHint] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const pendingGeneration = useRef(false)

  useEffect(() => {
    void (async () => {
      const [nicheList, recentScripts, settings, interrupted] = await Promise.all([
        api.niches.list(),
        api.scripts.recent(3),
        api.settings.get(),
        api.generation.interrupted(),
      ])
      setNiches(nicheList)
      setRecent(recentScripts)
      const preferred =
        settings.defaultNicheId && nicheList.some((n) => n.id === settings.defaultNicheId)
          ? settings.defaultNicheId
          : nicheList[0]?.id ?? ''
      setNicheId(preferred)
      if (settings.defaultLanguage) setLanguage(settings.defaultLanguage)
      if (settings.defaultOutputStyle) setOutputStyle(settings.defaultOutputStyle)

      const recoverable = interrupted.find((r) => r.nicheId === preferred || !r.nicheId)
      if (recoverable) {
        setInterruptedHint('Há uma geração anterior interrompida. Você pode executar novamente.')
      }
    })()
  }, [api])

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      return
    }
    void api.projects.get(projectId).then(setProject)
  }, [api, projectId])

  useEffect(() => {
    return api.generation.onProgress((event) => {
      setSteps(event.steps)
      if (event.message) setProgressTitle(event.message)
      if (typeof event.cancellable === 'boolean') setCancellable(event.cancellable)
    })
  }, [api])

  useEffect(() => {
    if (!generating) return
    const started = Date.now()
    setElapsedMs(0)
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - started)
    }, 500)
    return () => clearInterval(timer)
  }, [generating])

  const howItWorks = useMemo(
    () =>
      [
        'Skill carregada',
        'Memória editorial consultada',
        'Pesquisa e escrita',
        'Auditoria de unicidade',
        'Roteiro salvo',
      ].map((label, index) => ({ id: String(index), label })),
    [],
  )

  async function handleGenerate() {
    if (!nicheId || !topic.trim()) {
      push('Escolha o nicho e escreva o tema.', 'error')
      return
    }
    // Check if Codex is connected before generating
    if (codexAuth && !codexAuth.isConnected) {
      pendingGeneration.current = true
      setShowAuthModal(true)
      return
    }
    setGenerating(true)
    setFailed(false)
    setFailMessage('')
    setInterruptedHint(null)
    setElapsedMs(0)
    setCancellable(true)
    setProgressTitle('Criando seu roteiro...')
    setSteps(
      GENERATION_STEPS.map((s, i) => ({
        id: s.id,
        label: s.label,
        state: i === 0 ? 'running' : 'pending',
      })),
    )
    try {
      const result = await api.generation.start({
        nicheId,
        language,
        topic: topic.trim(),
        durationMinutes: Number(duration) || 15,
        outputStyle,
        researchMode,
        projectId,
      })
      push('Roteiro gerado com sucesso.', 'success')
      navigate(`/historia/roteiros/${result.script.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao gerar roteiro'
      if (/cancelad/i.test(message)) {
        push('Geração cancelada.', 'default')
        setFailed(false)
      } else {
        setFailed(true)
        setFailMessage(message)
        push(message, 'error')
      }
    } finally {
      setGenerating(false)
      setCancellable(false)
    }
  }

  async function handleCancel() {
    try {
      await api.generation.cancel()
      push('Cancelando geração...', 'default')
    } catch {
      push('Não foi possível cancelar.', 'error')
    }
  }

  function handleAuthLinked() {
    setShowAuthModal(false)
    if (pendingGeneration.current) {
      pendingGeneration.current = false
      void handleGenerate()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageShell className="flex-1">
        <PageHeader
          breadcrumb={environmentBreadcrumb(
            'history',
            ...(project ? [project.name, 'Criar roteiro'] : ['Criar roteiro']),
          )}
          title="Criar novo roteiro"
          subtitle={
            project
              ? `O roteiro será salvo no projeto “${project.name}”.`
              : 'Escolha o nicho, o idioma, escreva o tema e deixe o sistema fazer o resto.'
          }
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            <Card data-tour="page-actions" className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                  label="Nicho"
                  value={nicheId}
                  onChange={(e) => {
                    const id = e.target.value
                    setNicheId(id)
                    const niche = niches.find((n) => n.id === id)
                    if (niche) setLanguage(niche.defaultLanguage)
                  }}
                  options={niches.map((n) => ({ value: n.id, label: n.name }))}
                  disabled={generating}
                />
                {nicheId && niches.find((n) => n.id === nicheId && !n.skillPath?.trim()) && (
                  <p className="col-span-full flex items-center gap-1.5 text-xs text-yellow-500/80">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Este nicho não possui skill associada. A geração será bloqueada.
                  </p>
                )}
                <Select
                  label="Idioma"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  options={languages.map((l) => ({ value: l, label: l }))}
                  disabled={generating}
                />
              </div>

              <Textarea
                label="Tema"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="min-h-[140px] text-[15px]"
                placeholder="Descreva o tema do roteiro..."
                disabled={generating}
              />

              <Button
                fullWidth
                className="h-12 text-[15px]"
                icon={<Sparkles className="h-4 w-4" />}
                onClick={() => void handleGenerate()}
                disabled={generating || !niches.find((n) => n.id === nicheId)?.skillPath?.trim()}
              >
                {generating ? 'Gerando roteiro...' : 'Gerar roteiro'}
              </Button>

              {interruptedHint && !generating && !failed ? (
                <div className="rounded-xl border border-border-soft bg-card-2 px-4 py-3 text-sm text-muted">
                  <p>{interruptedHint}</p>
                  <Button
                    className="mt-3 h-9 px-3 text-xs"
                    variant="secondary"
                    onClick={() => void handleGenerate()}
                  >
                    Executar novamente
                  </Button>
                </div>
              ) : null}

              {failed && !generating ? (
                <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text">
                  <p className="font-medium">Não foi possível concluir o roteiro.</p>
                  <p className="mt-1 text-muted">{failMessage}</p>
                  <Button className="mt-3 h-9 px-3 text-xs" onClick={() => void handleGenerate()}>
                    Tentar novamente
                  </Button>
                </div>
              ) : null}

              <button
                type="button"
                className="mx-auto flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                Opções avançadas
                <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
              </button>

              {advancedOpen ? (
                <div className="grid grid-cols-1 gap-4 border-t border-border-soft pt-4 md:grid-cols-3">
                  <Select
                    label="Duração aproximada"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    options={[
                      { value: '10', label: '10 min' },
                      { value: '15', label: '15 min' },
                      { value: '20', label: '20 min' },
                      { value: '30', label: '30 min' },
                    ]}
                  />
                  <Select
                    label="Estilo de saída"
                    value={outputStyle}
                    onChange={(e) => setOutputStyle(e.target.value as OutputStyle)}
                    options={[
                      { value: 'original', label: 'Original' },
                      { value: 'profissional', label: 'Profissional' },
                      { value: 'alta_retencao', label: 'Alta retenção' },
                    ]}
                  />
                  <Select
                    label="Pesquisa web"
                    value={researchMode}
                    onChange={(e) => setResearchMode(e.target.value as ResearchMode)}
                    options={[
                      { value: 'automatica', label: 'Automática' },
                      { value: 'sempre', label: 'Sempre' },
                      { value: 'nunca', label: 'Nunca' },
                    ]}
                  />
                </div>
              ) : null}
            </Card>

            {generating || failed ? (
              <GenerationProgress
                steps={steps}
                title={progressTitle}
                elapsedMs={elapsedMs}
                cancellable={cancellable && generating}
                onCancel={() => void handleCancel()}
              />
            ) : null}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-text">Últimos roteiros</h2>
                <button
                  type="button"
                  className="text-sm text-muted hover:text-accent"
                  onClick={() => navigate('/historia/roteiros')}
                >
                  Ver todos &gt;
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {recent.map((script, index) => (
                  <ScriptCard
                    key={script.id}
                    script={script}
                    index={index}
                    onOpen={() => navigate(`/historia/roteiros/${script.id}`)}
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-text">Como funciona</h3>
              <ul className="space-y-3">
                {howItWorks.map((step, index) => (
                  <li key={step.id} className="relative flex items-center gap-3 text-sm text-muted">
                    {index < howItWorks.length - 1 ? (
                      <span className="absolute left-[11px] top-6 h-4 w-px bg-accent/40" />
                    ) : null}
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-black">
                      ✓
                    </span>
                    {step.label}
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-text">Padrão de saída</h3>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['original', 'Original'],
                    ['profissional', 'Profissional'],
                    ['alta_retencao', 'Alta retenção'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOutputStyle(value)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      outputStyle === value
                        ? 'border-accent text-accent bg-accent-dark/40'
                        : 'border-border text-muted hover:border-[#334049] hover:text-text',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </PageShell>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft px-4 py-3 text-xs text-muted-2 sm:px-6 lg:px-8">
        <span>Atlas Studio v1.0.0 | Criadores constroem o amanhã.</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Mais histórias para um mundo mais curioso.
        </span>
      </footer>

      {codexAuth ? (
        <CodexRequiredModal
          open={showAuthModal}
          codexAuth={codexAuth}
          onClose={() => {
            setShowAuthModal(false)
            pendingGeneration.current = false
          }}
          onLinked={handleAuthLinked}
        />
      ) : null}
    </div>
  )
}
