import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Clock3,
  Copy,
  Download,
  FileText,
  FolderKanban,
  Globe,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import type { GenerationStep, ScriptRecord, ScriptVersion } from '@shared/types'
import { GENERATION_STEPS } from '@shared/types'
import {
  QUICK_ADJUST_INSTRUCTIONS,
  resolveAdjustInstruction,
  type QuickAdjustLabel,
} from '@shared/adjustInstructions'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Textarea } from '../components/Textarea'
import { StatusBadge } from '../components/StatusBadge'
import { QualityScore } from '../components/QualityScore'
import { GenerationProgress } from '../components/GenerationProgress'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { environmentBreadcrumb } from '../lib/environments'
import { cn } from '../lib/utils'

export function ScriptDetailPage() {
  const { id } = useParams()
  const api = getAtlasApi()
  const { push } = useToast()
  const navigate = useNavigate()
  const [script, setScript] = useState<ScriptRecord | null>(null)
  const [instruction, setInstruction] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [steps, setSteps] = useState<GenerationStep[]>([])
  const [progressMessage, setProgressMessage] = useState('Ajustando roteiro...')
  const [currentVersion, setCurrentVersion] = useState<ScriptVersion | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  async function load() {
    if (!id) return
    const data = await api.scripts.get(id)
    setScript(data)
    const versions = await api.scripts.versions(id)
    setCurrentVersion(versions[0] ?? null)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    return api.generation.onProgress((event) => {
      setSteps(event.steps)
      if (event.message) setProgressMessage(event.message)
    })
  }, [api])

  useEffect(() => {
    if (!exportOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setExportOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExportOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [exportOpen])

  async function handleAdjust(prompt?: string) {
    if (!script) return
    const text = resolveAdjustInstruction(prompt ?? instruction)
    if (!text) {
      push('Escreva o ajuste desejado.', 'error')
      return
    }
    setAdjusting(true)
    setProgressMessage('Ajustando roteiro...')
    setSteps(
      GENERATION_STEPS.map((s, i) => ({
        id: s.id,
        label: s.label,
        state: i < 5 ? 'done' : i === 5 ? 'running' : 'pending',
      })),
    )
    try {
      const result = await api.generation.adjust({
        scriptId: script.id,
        versionId: currentVersion?.id,
        instruction: text,
      })
      setScript(result.script)
      setCurrentVersion(result.version)
      setInstruction('')
      push(`Roteiro atualizado. Versão v${result.version.versionNumber} criada`, 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao ajustar', 'error')
    } finally {
      setAdjusting(false)
    }
  }

  async function handleCopy() {
    if (!script) return
    await api.system.copyText(script.content)
    push('Roteiro copiado.', 'success')
  }

  async function handleExport(format: 'txt' | 'md') {
    if (!script) return
    setExportOpen(false)
    const path = await api.scripts.export(script.id, format)
    if (path) push(`Exportado: ${path}`, 'success')
  }

  async function handleSaveVersion() {
    if (!script) return
    const version = await api.scripts.saveVersion(script.id)
    push(`Versão v${version.versionNumber} registrada.`, 'success')
  }

  async function handleRegenerate() {
    if (!script) return
    navigate(
      script.projectId ? `/historia/criar?projectId=${script.projectId}` : '/historia/criar',
    )
    push('Ajuste nicho/tema e gere novamente.', 'default')
  }

  if (!script) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Carregando roteiro...
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-8 pt-6">
      <PageHeader
        breadcrumb={environmentBreadcrumb(
          'history',
          ...(script.projectName ? [script.projectName] : []),
          script.title,
        )}
        title="Roteiro pronto"
        subtitle="Leia, copie, ajuste e exporte seu roteiro."
      />

      <Card className="mb-3 grid shrink-0 grid-cols-1 gap-4 md:grid-cols-5" padding="sm">
        <Meta icon={FileText} label="Título" value={script.title} />
        <Meta icon={FolderKanban} label="Nicho" value={script.nicheName ?? '—'} />
        <Meta icon={Globe} label="Idioma" value={script.language} />
        <Meta
          icon={Clock3}
          label="Duração estimada"
          value={script.durationMinutes ? `${script.durationMinutes} min` : '—'}
        />
        <div className="flex flex-col justify-center gap-1 px-2">
          <span className="text-xs text-muted">Status</span>
          <StatusBadge status={script.status} />
        </div>
      </Card>

      <div className="mb-4 shrink-0 bg-bg pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void handleCopy()}>
            Copiar tudo
          </Button>
          <div className="relative" ref={exportMenuRef}>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              onClick={() => setExportOpen((open) => !open)}
            >
              Exportar
            </Button>
            {exportOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-full z-30 mt-1.5 min-w-[188px] rounded-xl border border-border bg-card-2 p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
              >
                <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-2">
                  Exportar como
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full rounded-lg px-2.5 py-2 text-left text-sm text-text hover:bg-white/5"
                  onClick={() => void handleExport('txt')}
                >
                  TXT
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full rounded-lg px-2.5 py-2 text-left text-sm text-text hover:bg-white/5"
                  onClick={() => void handleExport('md')}
                >
                  Markdown
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-muted-2"
                >
                  DOCX
                  <span className="text-[10px]">em breve</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-muted-2"
                >
                  PDF
                  <span className="text-[10px]">em breve</span>
                </button>
              </div>
            ) : null}
          </div>
          <Button
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void handleRegenerate()}
          >
            Gerar novamente
          </Button>
          <Button icon={<Save className="h-4 w-4" />} onClick={() => void handleSaveVersion()}>
            Salvar versão
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto pb-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="flex min-h-[520px] flex-col">
          <article className="prose-script flex-1 overflow-y-auto pr-2">
            {script.content.split(/\n{2,}/).map((block, index) => {
              const trimmed = block.trim()
              const isHeading = /^\d+\.\s+\S+/.test(trimmed) || /^#+\s+/.test(trimmed)
              return (
                <p
                  key={index}
                  className={cn(
                    'mb-4 max-w-[68ch] whitespace-pre-wrap text-[15px] leading-7 text-[#d7dee3]',
                    isHeading && 'mb-3 text-[17px] font-semibold text-text',
                  )}
                >
                  {trimmed.replace(/^#+\s+/, '')}
                </p>
              )
            })}
          </article>
        </Card>

        <aside className="space-y-4">
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-text">Ajustar roteiro</h3>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ex.: deixe a abertura mais forte..."
              className="min-h-[110px]"
            />
            <Button
              fullWidth
              className="mt-3 h-11"
              icon={<Sparkles className="h-4 w-4" />}
              disabled={adjusting}
              onClick={() => void handleAdjust()}
            >
              {adjusting ? 'Ajustando roteiro...' : 'Ajustar'}
            </Button>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(QUICK_ADJUST_INSTRUCTIONS) as QuickAdjustLabel[]).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={adjusting}
                  className="rounded-full border border-accent/30 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-dark/40 disabled:opacity-50"
                  onClick={() => void handleAdjust(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-text">Qualidade</h3>
            <QualityScore
              originality={script.originalityScore}
              retention={script.retentionScore}
              naturalness={script.naturalnessScore}
              similarity={script.similarityScore}
            />
          </Card>

          {adjusting && steps.length > 0 ? (
            <GenerationProgress steps={steps} title={progressMessage} />
          ) : null}

          <p className="flex flex-col gap-1 text-xs text-muted-2">
            {script.projectId ? (
              <Link
                to={`/historia/projetos/${script.projectId}`}
                className="text-accent hover:underline"
              >
                Voltar para o projeto
              </Link>
            ) : null}
            <Link to="/historia/roteiros" className="text-accent hover:underline">
              Voltar para roteiros
            </Link>
          </p>
        </aside>
      </div>
    </div>
  )
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2.5 px-2 py-1">
      <Icon className="mt-0.5 h-4 w-4 text-accent" />
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="truncate text-sm font-medium text-text">{value}</div>
      </div>
    </div>
  )
}
