import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clapperboard, Loader2, Pencil, Scissors, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Project } from '@shared/types'
import type {
  ShortsAspectMode,
  ShortsClip,
  ShortsClipCount,
  ShortsClipPatch,
  ShortsCopyFields,
  ShortsDurationMode,
  ShortsJob,
  ShortsProfile,
  ShortsProgressEvent,
} from '@shared/shorts'
import {
  SHORTS_CLIP_COUNTS,
  SHORTS_PROGRESS_LABEL,
  SHORTS_ANALYSIS_MODE_LABEL,
  formatShortsCopy,
  formatShortsTimecode,
  type ShortsModelDecision,
} from '@shared/shorts'
import { buildClipFramingPlan } from '@shared/shortsExport'
import {
  DEFAULT_FRAMING_SETTINGS,
  assignSubjectFromClick,
  verticalFramingMode,
  type ShortsFramingMode,
} from '@shared/shortsFraming'
import {
  DEFAULT_LOGO_SETTINGS,
  applyLogoPosition,
  normalizeLogoSettings,
  type ShortsLogoSettings,
} from '@shared/shortsLogo'
import type { ShortsAnalysisPlan } from '@shared/shorts/analysisPlan'
import {
  SHORTS_CONTENT_LANGUAGE_OPTIONS,
  contentLanguageLabel,
} from '@shared/shortsLanguage'
import {
  SHORTS_DURATION_SHORTCUTS,
  capRequestedDuration,
  evaluateShortsFeasibility,
  formatDurationInput,
  isDurationShortcut,
  parseDurationInput,
} from '@shared/shortsDuration'
import { formatDistinctCountSummary } from '@shared/shortsDiversity'
import { isProtectedShortsClip } from '@shared/shortsProjectIdentity'
import {
  exportedShortsCount,
  shortsClipDeleteMessage,
  shortsProjectDeleteMessage,
} from '@shared/shortsProject'
import { mergeShortsJobSnapshot, shortsAnalyzeProgressLabel } from '@shared/shortsGeneration'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Modal, ConfirmDialog } from '../components/Modal'
import { ShortsAdjustModal } from '../components/shorts/ShortsAdjustModal'
import { ShortsFramingPanel } from '../components/shorts/ShortsFramingPanel'
import { ShortsLogoPanel } from '../components/shorts/ShortsLogoPanel'
import { ShortsResultCard } from '../components/shorts/ShortsResultCard'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { useShortsGeneration } from '../hooks/useShortsGeneration'

function FieldSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-xl border border-border bg-elevated px-3.5 text-sm text-text transition-colors hover:border-border-strong focus:border-accent/60 focus:outline-none"
      >
        {children}
      </select>
    </label>
  )
}

export function ShortsStudioPage() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const generation = useShortsGeneration()
  const navigate = useNavigate()
  const { jobId } = useParams<{ jobId: string }>()
  const [params] = useSearchParams()
  const projectId = params.get('projectId')
  const listPath = projectId ? `/shorts?projectId=${encodeURIComponent(projectId)}` : '/shorts'

  const [project, setProject] = useState<Project | null>(null)
  const [job, setJob] = useState<ShortsJob | null>(null)
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ShortsProfile>('music')
  const [clipCount, setClipCount] = useState<ShortsClipCount>(5)
  const [requestedDuration, setRequestedDuration] = useState(30)
  const [durationInput, setDurationInput] = useState('00:30')
  const [durationMode, setDurationMode] = useState<ShortsDurationMode>('approximate')
  const [durationWarning, setDurationWarning] = useState<string | null>(null)
  const [aspectMode, setAspectMode] = useState<ShortsAspectMode>('auto')
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ShortsProgressEvent | null>(null)
  const [previewClip, setPreviewClip] = useState<ShortsClip | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [playingClipId, setPlayingClipId] = useState<string | null>(null)
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  const [deletingClip, setDeletingClip] = useState<ShortsClip | null>(null)
  const [allowExternalVideoAnalysis, setAllowExternalVideoAnalysis] = useState(false)
  const [analysisPlan, setAnalysisPlan] = useState<ShortsAnalysisPlan | null>(null)
  const [modelChoiceOpen, setModelChoiceOpen] = useState(false)
  const [placingLogo, setPlacingLogo] = useState(false)

  const analyzingJob = Boolean(jobId && generation.isAnalyzing(jobId))
  const analyzeProgress = jobId ? generation.progressFor(jobId) : null
  const liveJob = jobId ? generation.jobFor(jobId) : null
  const displayProgress = progress ?? analyzeProgress
  const analyzing = analyzingJob || job?.status === 'analyzing' || (busy && progress?.stage !== 'exporting')
  const pageBusy = busy || analyzingJob

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      return
    }
    void api.projects.get(projectId).then((found) => {
      setProject(found)
      if (found) setProfile(found.projectType)
    })
  }, [api, projectId])

  async function loadJob() {
    if (!jobId) {
      setJob(null)
      setMissing(true)
      setLoading(false)
      return
    }
    const requested = jobId
    const found = await api.shorts.get(requested)
    // Trocar de projeto no meio da leitura não pode aplicar o job anterior.
    if (jobIdRef.current !== requested) return
    setJob((current) => mergeShortsJobSnapshot(current, found))
    setMissing(!found)
    setLoading(false)
  }

  const jobIdRef = useRef(jobId)
  jobIdRef.current = jobId
  useEffect(() => {
    void loadJob().catch((error) => {
      if (jobIdRef.current !== jobId) return
      pushError(error, 'Não foi possível abrir o projeto de shorts.')
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  useEffect(() => {
    if (!liveJob) return
    setJob((current) => mergeShortsJobSnapshot(current, liveJob))
  }, [liveJob])

  useEffect(() => {
    if (!jobId) return
    if (job?.status === 'analyzing' || generation.isAnalyzing(jobId)) {
      generation.watchJob(jobId)
    }
  }, [generation, job?.status, jobId])

  useEffect(() => {
    void api.settings.get().then((settings) => {
      setAllowExternalVideoAnalysis(Boolean(settings.allowExternalVideoAnalysis))
    })
    void api.shorts.getAnalysisPlan().then(setAnalysisPlan).catch(() => setAnalysisPlan(null))
  }, [api])

  useEffect(() => {
    if (missing) navigate(listPath, { replace: true })
  }, [missing, listPath, navigate])

  // Progresso de exportação continua local; a análise usa o provider em background.
  useEffect(() => {
    return api.shorts.onProgress((event) => {
      if (event.stage !== 'exporting') return
      if (jobId && event.jobId !== jobId) return
      setProgress(event)
    })
  }, [api, jobId])

  useEffect(() => {
    if (!job) return
    setProfile(job.profile)
    setClipCount(job.clipCount)
    setRequestedDuration(job.requestedDuration)
    setDurationInput(formatDurationInput(job.requestedDuration))
    setDurationMode(job.durationMode)
    setAspectMode(job.aspectMode)
    setCaptionsEnabled(job.captionsEnabled)
    setRenameValue(job.name)
  }, [job?.id])

  async function persistSettings(
    patch: Partial<{
      name: string
      profile: ShortsProfile
      clipCount: ShortsClipCount
      requestedDuration: number
      durationMode: ShortsDurationMode
      aspectMode: ShortsAspectMode
      framingSettings: ShortsJob['framingSettings']
      logoSettings: ShortsLogoSettings
      captionsEnabled: boolean
      languageOverride: string | null
    }>,
  ) {
    if (!job) return
    const next = await api.shorts.updateSettings(job.id, patch)
    if (next) setJob(next)
  }

  function persistFraming(patch: Partial<ShortsJob['framingSettings']>) {
    if (!job) return
    const framingSettings = { ...(job.framingSettings ?? DEFAULT_FRAMING_SETTINGS), ...patch }
    setJob({ ...job, framingSettings })
    void persistSettings({ framingSettings })
  }

  function persistLogo(patch: Partial<ShortsLogoSettings>) {
    if (!job) return
    let logoSettings = normalizeLogoSettings({ ...(job.logoSettings ?? DEFAULT_LOGO_SETTINGS), ...patch })
    if (patch.position) logoSettings = applyLogoPosition(logoSettings, patch.position)
    setJob({ ...job, logoSettings })
    void persistSettings({ logoSettings })
  }

  async function pickLogo() {
    if (!job) return
    try {
      const file = await api.dialog.selectImage()
      if (!file) return
      const next = await api.shorts.setLogo(job.id, file)
      if (next) {
        setJob(next)
        push('Logo adicionada. Ela será gravada no Short gerado.', 'success')
      }
    } catch (error) {
      pushError(error, 'Falha ao importar a logo')
    }
  }

  async function clearLogo() {
    if (!job) return
    try {
      const next = await api.shorts.clearLogo(job.id)
      if (next) setJob(next)
      setPlacingLogo(false)
    } catch (error) {
      pushError(error, 'Falha ao remover a logo')
    }
  }

  function placeLogo(x: number, y: number) {
    persistLogo({ position: 'custom', x, y, enabled: true })
    setPlacingLogo(false)
  }

  function persistFramingMode(mode: ShortsFramingMode) {
    setAspectMode(mode)
    void persistSettings({ aspectMode: mode })
  }

  function assignFramingPoint(clip: ShortsClip, x: number, y: number, time: number) {
    if (!job) return
    const current = job.framingSettings ?? DEFAULT_FRAMING_SETTINGS
    const role = current.picking ?? 'lead'
    const framingSettings = assignSubjectFromClick({
      settings: current,
      track: job.framingTrack ?? [],
      time,
      x,
      y,
      role,
    })
    setJob({ ...job, framingSettings })
    void persistSettings({ framingSettings })
  }

  function clipFramingPlan(clip: ShortsClip) {
    if (!job) return null
    return buildClipFramingPlan(job, clip)
  }

  function applyRequestedDuration(seconds: number) {
    const cap = capRequestedDuration(seconds, job?.probe?.duration)
    setRequestedDuration(cap.requested)
    setDurationInput(formatDurationInput(cap.requested))
    setDurationWarning(cap.message)
    if (cap.capped && cap.message) push(cap.message, 'error')
    void persistSettings({ requestedDuration: cap.requested })
  }

  function commitDurationInput() {
    const parsed = parseDurationInput(durationInput)
    if (parsed == null) {
      setDurationInput(formatDurationInput(requestedDuration))
      return
    }
    applyRequestedDuration(parsed)
  }

  async function saveRename() {
    const name = renameValue.trim()
    if (!name) {
      push('Informe o nome do projeto.', 'error')
      return
    }
    await persistSettings({ name })
    setRenameOpen(false)
    push('Projeto renomeado.', 'success')
  }

  async function relinkVideo() {
    if (!job) return
    setBusy(true)
    try {
      const next = await api.shorts.relink(job.id)
      if (!next) return
      setJob(next)
      push('Arquivo original localizado.', 'success')
    } catch (error) {
      pushError(error, 'Falha ao localizar o arquivo')
    } finally {
      setBusy(false)
    }
  }

  async function requestAnalyze() {
    if (!job) {
      push('Abra um projeto com vídeo para analisar.', 'error')
      return
    }
    if (job.clips.some(isProtectedShortsClip)) {
      setReanalyzeOpen(true)
      return
    }
    await continueAnalyzeAfterConfirm()
  }

  async function continueAnalyzeAfterConfirm() {
    let plan = analysisPlan
    try {
      plan = await api.shorts.getAnalysisPlan()
      setAnalysisPlan(plan)
    } catch {
      /* usa o plano em cache se a descoberta falhar */
    }
    if (plan?.needsModelChoice) {
      setModelChoiceOpen(true)
      return
    }
    await analyze('current')
  }

  async function analyze(decision: ShortsModelDecision = 'current') {
    if (!job) {
      push('Abra um projeto com vídeo para analisar.', 'error')
      return
    }
    const jobKey = job.id
    const preservedCount = job.clips.filter(isProtectedShortsClip).length
    try {
      // A geração vive no ShortsGenerationProvider: navegar para outra aba não cancela o processo.
      const next = await generation.analyze(
        {
          jobId: jobKey,
          profile,
          clipCount,
          requestedDuration,
          durationMode,
          aspectMode,
          captionsEnabled,
          allowExternalVideoAnalysis,
          modelDecision: decision,
          modelOverride: decision === 'use_compatible' ? analysisPlan?.compatibleVideoModels[0]?.id ?? null : null,
        },
        { preservedCount },
      )
      setJob((current) => mergeShortsJobSnapshot(current, next))
    } catch {
      try {
        const latest = await api.shorts.get(jobKey)
        if (latest) setJob((current) => mergeShortsJobSnapshot(current, latest))
      } catch {
        /* o provider já notificou o erro */
      }
    }
  }

  useEffect(() => {
    if (!job) {
      setMediaUrl(null)
      return
    }
    let active = true
    void api.shorts
      .mediaUrl(job.id)
      .then((url) => {
        if (active) setMediaUrl(url)
      })
      .catch(() => {
        if (active) setMediaUrl(null)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, job?.id, job?.sourcePath])

  useEffect(() => {
    setPlayingClipId(null)
    setPreviewClip(null)
  }, [job?.id])

  async function exportClip(clip: ShortsClip) {
    if (!job) return
    setBusy(true)
    setProgress({
      jobId: job.id,
      clipId: clip.id,
      stage: 'exporting',
      message: SHORTS_PROGRESS_LABEL.exporting,
      percent: null,
    })
    try {
      const output = await api.shorts.export({ jobId: job.id, clipId: clip.id })
      if (!output) return
      const latest = await api.shorts.get(job.id)
      if (latest) setJob(latest)
      push('Short gerado. Use Abrir pasta para ver o arquivo.', 'success')
    } catch (error) {
      pushError(error, 'Falha ao exportar o Short')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function openClipFolder(clip: ShortsClip) {
    if (!job) return
    try {
      await api.shorts.openExportsFolder(job.id, clip.id)
    } catch (error) {
      pushError(error, 'Não foi possível abrir a pasta do Short')
    }
  }

  async function persistClip(clip: ShortsClip, patch: ShortsClipPatch) {
    if (!job) return
    const next = await api.shorts.updateClip(job.id, clip.id, patch)
    if (!next) return
    setJob(next)
    const updated = next.clips.find((item) => item.id === clip.id) ?? null
    setPreviewClip((current) => (current?.id === clip.id ? updated : current))
  }

  async function copyClip(clip: ShortsClip, part: 'title' | 'description' | 'all') {
    const text = formatShortsCopy(clip, part)
    if (!text) {
      push('Nada para copiar ainda.', 'error')
      return
    }
    await api.system.copyText(text)
    push(
      part === 'title' ? 'Título copiado.' : part === 'description' ? 'Descrição copiada.' : 'Título e descrição copiados.',
      'success',
    )
  }

  async function regenerateClip(clip: ShortsClip, fields: ShortsCopyFields) {
    if (!job) return
    setCopyBusyId(clip.id)
    setProgress({ jobId: job.id, stage: 'writing_copy', message: SHORTS_PROGRESS_LABEL.writing_copy })
    try {
      const next = await api.shorts.regenerateCopy({ jobId: job.id, clipId: clip.id, fields })
      setJob(next)
      const updated = next.clips.find((item) => item.id === clip.id) ?? null
      setPreviewClip((current) => (current?.id === clip.id ? updated : current))
      push(
        fields === 'title'
          ? 'Novo título gerado.'
          : fields === 'description'
            ? 'Nova descrição gerada.'
            : 'Título e descrição gerados.',
        'success',
      )
    } catch (error) {
      pushError(error, 'Falha ao regenerar título/descrição')
    } finally {
      setCopyBusyId(null)
      setProgress(null)
    }
  }

  async function confirmDeleteProject() {
    if (!job) return
    try {
      await api.shorts.remove(job.id)
      push('Projeto excluído. O vídeo original e os exports foram preservados.', 'success')
      navigate(listPath)
    } catch (error) {
      pushError(error, 'Falha ao excluir o projeto')
    } finally {
      setDeletingProject(false)
    }
  }

  async function confirmDeleteClip() {
    if (!job || !deletingClip) return
    try {
      const next = await api.shorts.removeClip(job.id, deletingClip.id)
      if (next) setJob(next)
      if (previewClip?.id === deletingClip.id) {
        setPreviewClip(null)
        setPlayingClipId(null)
      }
      setDeletingClip(null)
      push(
        deletingClip.exportedPath
          ? 'Short removido do projeto. O MP4 exportado permanece no computador.'
          : 'Short removido do projeto.',
        'success',
      )
    } catch (error) {
      pushError(error, 'Falha ao excluir o Short')
    }
  }

  const probe = job?.probe
  const feasibility = useMemo(() => {
    if (!probe?.duration) return null
    return evaluateShortsFeasibility({
      videoDuration: probe.duration,
      requestedCount: clipCount,
      requestedDuration,
      durationMode,
    })
  }, [probe?.duration, clipCount, requestedDuration, durationMode])

  if (loading && !job) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    )
  }

  if (missing) {
    return (
      <PageShell>
        <button
          type="button"
          onClick={() => navigate(listPath)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar aos projetos
        </button>
        <Card className="flex flex-col items-center py-14 text-center">
          <Clapperboard className="mb-3 h-10 w-10 text-muted" />
          <p className="text-sm text-muted">Projeto de Shorts não encontrado.</p>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <button
        type="button"
        onClick={() => navigate(listPath)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos projetos
      </button>

      <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PageHeader
            breadcrumb={project ? `Atlas / Shorts Studio / ${project.name}` : 'Atlas / Shorts Studio'}
            title={job?.name || 'Shorts Studio'}
            subtitle="Importe um vídeo completo, deixe o Atlas sugerir os melhores trechos e exporte Shorts 9:16 com corte, crop e legenda. Sem editor complexo."
            hint={
              project
                ? `Vinculado ao projeto ${project.name} (Música).`
                : undefined
            }
          />
        </div>
        <div data-tour="page-actions" className="mt-7 flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="h-9 px-3 text-xs"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            disabled={!job || pageBusy}
            onClick={() => setDeletingProject(true)}
          >
            Excluir
          </Button>
          <Button
            variant="secondary"
            className="h-9 px-3 text-xs"
            icon={<Pencil className="h-3.5 w-3.5" />}
            disabled={!job}
            onClick={() => {
              setRenameValue(job?.name ?? '')
              setRenameOpen(true)
            }}
          >
            Renomear
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Card className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted">Arquivo</p>
                  <p className="mt-1 truncate text-sm text-text">{job?.sourceName || 'Nenhum vídeo importado'}</p>
                  {job && !job.sourceExists ? (
                    <p className="mt-1 text-xs text-danger">Arquivo original não encontrado.</p>
                  ) : null}
                </div>
                {job && !job.sourceExists ? (
                  <Button variant="secondary" disabled={pageBusy} onClick={() => void relinkVideo()}>
                    Localizar arquivo
                  </Button>
                ) : null}
              </div>
            </div>
            <FieldSelect
              label="Perfil"
              value={profile}
              onChange={(value) => {
                const next = value as ShortsProfile
                setProfile(next)
                void persistSettings({ profile: next })
              }}
            >
              <option value="music">Música</option>
            </FieldSelect>
            <FieldSelect
              label="Idioma do conteúdo"
              value={job?.languageOverride || 'auto'}
              onChange={(value) => {
                void persistSettings({ languageOverride: value === 'auto' ? null : value })
              }}
            >
              <option value="auto">
                Automático
                {job?.detectedLanguage || job?.contentLanguage
                  ? ` · ${contentLanguageLabel(job.detectedLanguage || job.contentLanguage)}`
                  : ''}
              </option>
              {SHORTS_CONTENT_LANGUAGE_OPTIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
              {job?.contentLanguage &&
              !SHORTS_CONTENT_LANGUAGE_OPTIONS.some((item) => item.code === job.contentLanguage) ? (
                <option value={job.contentLanguage}>{contentLanguageLabel(job.contentLanguage)}</option>
              ) : null}
            </FieldSelect>
            <FieldSelect
              label="Quantidade"
              value={String(clipCount)}
              onChange={(value) => {
                const next = Number(value) as ShortsClipCount
                setClipCount(next)
                void persistSettings({ clipCount: next })
              }}
            >
              {SHORTS_CLIP_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count} Shorts
                </option>
              ))}
            </FieldSelect>
            <div className="md:col-span-2 space-y-3">
              <Input
                id="shorts-desired-duration"
                label="Duração desejada"
                value={durationInput}
                placeholder="00:30"
                onChange={(event) => setDurationInput(event.target.value)}
                onBlur={commitDurationInput}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitDurationInput()
                  }
                }}
              />
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Atalhos</p>
                <div className="flex flex-wrap gap-2">
                  {SHORTS_DURATION_SHORTCUTS.map((seconds) => (
                    <Button
                      key={seconds}
                      type="button"
                      variant={isDurationShortcut(requestedDuration) && requestedDuration === seconds ? 'primary' : 'secondary'}
                      className="h-9 px-3 text-xs"
                      onClick={() => applyRequestedDuration(seconds)}
                    >
                      {seconds}s
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant={!isDurationShortcut(requestedDuration) ? 'primary' : 'secondary'}
                    className="h-9 px-3 text-xs"
                    onClick={() => {
                      const field = document.getElementById('shorts-desired-duration') as HTMLInputElement | null
                      field?.focus()
                      field?.select()
                    }}
                  >
                    Personalizado
                  </Button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Modo</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={durationMode === 'approximate' ? 'primary' : 'secondary'}
                    className="h-9 px-3 text-xs"
                    onClick={() => {
                      setDurationMode('approximate')
                      void persistSettings({ durationMode: 'approximate' })
                    }}
                  >
                    Aproximada
                  </Button>
                  <Button
                    type="button"
                    variant={durationMode === 'exact' ? 'primary' : 'secondary'}
                    className="h-9 px-3 text-xs"
                    onClick={() => {
                      setDurationMode('exact')
                      void persistSettings({ durationMode: 'exact' })
                    }}
                  >
                    Exata
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-2">
                  {durationMode === 'exact'
                    ? 'Cada Short terá a duração pedida, com a precisão do frame.'
                    : 'Recomendado. A IA pode variar ±15% (mínimo 3s) para terminar num refrão ou numa conclusão natural.'}
                </p>
              </div>
              {job?.probe ? (
                <p className="text-xs text-muted">
                  Vídeo original: {formatShortsTimecode(job.probe.duration)}
                </p>
              ) : null}
              {feasibility?.overlapHint ? (
                <p className="text-xs leading-relaxed text-muted">{feasibility.overlapHint}</p>
              ) : null}
              {feasibility?.countHint && !durationWarning ? (
                <p className="text-xs leading-relaxed text-muted">{feasibility.countHint}</p>
              ) : null}
              {durationWarning ? <p className="text-xs text-danger">{durationWarning}</p> : null}
            </div>
            <FieldSelect
              label="Formato"
              value={aspectMode === 'original' ? 'original' : 'vertical'}
              onChange={(value) => {
                if (value === 'original') {
                  setAspectMode('original')
                  void persistSettings({ aspectMode: 'original' })
                  return
                }
                const next = aspectMode === 'original' ? 'auto' : verticalFramingMode(aspectMode)
                persistFramingMode(next)
              }}
            >
              <option value="original">Original</option>
              <option value="vertical">9:16</option>
            </FieldSelect>
            {aspectMode !== 'original' ? (
              <ShortsFramingPanel
                aspectMode={aspectMode}
                settings={job?.framingSettings ?? DEFAULT_FRAMING_SETTINGS}
                subjects={previewClip ? clipFramingPlan(previewClip)?.subjects ?? [] : job?.clips[0] ? clipFramingPlan(job.clips[0])?.subjects ?? [] : []}
                usedFallback={job?.clips.some((clip) => clipFramingPlan(clip)?.usedFallback) ?? false}
                disabled={pageBusy}
                onModeChange={persistFramingMode}
                onSettingsChange={persistFraming}
              />
            ) : null}
            <ShortsLogoPanel
              settings={job?.logoSettings ?? DEFAULT_LOGO_SETTINGS}
              logoUrl={job?.logoUrl ?? null}
              placing={placingLogo}
              disabled={pageBusy}
              onPick={() => void pickLogo()}
              onClear={() => void clearLogo()}
              onChange={persistLogo}
              onTogglePlacing={() => setPlacingLogo((value) => !value)}
            />
            <label className="flex items-start gap-3 md:col-span-2">
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(event) => {
                  const next = event.target.checked
                  setCaptionsEnabled(next)
                  void persistSettings({ captionsEnabled: next })
                }}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span className="text-sm text-text">Legendas</span>
            </label>
            <label className="flex items-start gap-3 md:col-span-2">
              <input
                type="checkbox"
                checked={allowExternalVideoAnalysis}
                onChange={(event) => {
                  const next = event.target.checked
                  setAllowExternalVideoAnalysis(next)
                  void api.settings.update({ allowExternalVideoAnalysis: next })
                }}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span className="text-sm text-text">
                Permitir que a IA analise o vídeo
                <span className="mt-1 block text-xs leading-relaxed text-muted-2">
                  O Atlas poderá enviar uma versão otimizada do vídeo ao provedor de IA selecionado. O FFmpeg continua local. Sem esta opção, a análise usa frames + áudio + transcrição.
                </span>
              </span>
            </label>
            <div className="md:col-span-2">
              <Button
                fullWidth
                disabled={pageBusy || Boolean(copyBusyId) || !job || job.sourceExists === false}
                icon={analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                onClick={() => void requestAnalyze()}
              >
                Analisar vídeo
              </Button>
              {displayProgress ? (
                <p className="mt-3 text-sm text-accent" role="status">
                  {shortsAnalyzeProgressLabel(displayProgress)}
                </p>
              ) : null}
            </div>
          </Card>

          {probe ? (
            <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-5">
              <Meta label="Nome" value={probe.name} />
              <Meta label="Duração" value={formatShortsTimecode(probe.duration)} />
              <Meta label="Resolução" value={`${probe.width}×${probe.height}`} />
              <Meta label="FPS" value={probe.fps ? String(probe.fps) : '—'} />
              <Meta label="Proporção" value={probe.aspectRatio} />
            </Card>
          ) : null}

          {job?.errorMessage ? (
            <Card className="border-danger/30 text-sm text-danger">{job.errorMessage}</Card>
          ) : null}
          {job?.analysisMode ? (
            <p className="text-xs text-muted-2">
              Análise: {SHORTS_ANALYSIS_MODE_LABEL[job.analysisMode]}
            </p>
          ) : null}
          {job?.analysisNotes ? (
            <Card padding="sm">
              <p className="text-sm leading-relaxed text-pretty break-words text-muted">{job.analysisNotes}</p>
            </Card>
          ) : null}

          {job?.clips.length ? (
            <div className="grid gap-5">
              <p className="text-xs leading-relaxed text-muted">
                {formatDistinctCountSummary(job.clips.length, job.clipCount)}
                {job.clips.length < job.clipCount ? ' · geramos menos para evitar repetições.' : ''}
              </p>
              {job.clips.map((clip) => {
                const exporting = progress?.stage === 'exporting' && progress.clipId === clip.id
                return (
                  <ShortsResultCard
                    key={clip.id}
                    clip={clip}
                    mediaUrl={mediaUrl}
                    aspectMode={aspectMode}
                    sourceWidth={probe?.width ?? 1920}
                    sourceHeight={probe?.height ?? 1080}
                    framingPlan={clipFramingPlan(clip)}
                    picking={Boolean(job.framingSettings?.picking)}
                    placingLogo={placingLogo}
                    logo={job.logoSettings}
                    logoUrl={job.logoUrl}
                    playing={playingClipId === clip.id && previewClip?.id !== clip.id}
                    busy={pageBusy || Boolean(copyBusyId)}
                    regenerating={copyBusyId === clip.id}
                    exporting={exporting}
                    exportPercent={exporting ? (progress?.percent ?? null) : null}
                    onPlayingChange={(playing) => setPlayingClipId(playing ? clip.id : null)}
                    onAssignPoint={(x, y, time) => assignFramingPoint(clip, x, y, time)}
                    onPlaceLogo={placeLogo}
                    onAdjust={() => {
                      setPlayingClipId(null)
                      setPreviewClip(clip)
                    }}
                    onExport={() => void exportClip(clip)}
                    onOpenFolder={() => void openClipFolder(clip)}
                    onPersist={(patch) => void persistClip(clip, patch)}
                    onCopy={(part) => void copyClip(clip, part)}
                    onRegenerate={(fields) => void regenerateClip(clip, fields)}
                    onDelete={() => setDeletingClip(clip)}
                  />
                )
              })}
            </div>
          ) : (
            <Card className="flex flex-col items-center py-14 text-center">
              <Clapperboard className="mb-3 h-10 w-10 text-muted" />
              <p className="text-sm text-muted">Analise o vídeo para ver os cortes sugeridos.</p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card padding="sm" className="space-y-2 text-xs text-muted">
            <p className="font-medium text-text">Como funciona</p>
            <p>O FFmpeg roda localmente. O vídeo original nunca é alterado.</p>
            <p>
              Se você permitir, o Atlas envia um proxy otimizado ao Antigravity para análise audiovisual. Sem permissão, ou se o modelo não suportar vídeo, a IA recebe frames-chave, áudio e transcrição — e o resultado deixa isso explícito.
            </p>
            <p>
              {profile === 'music'
                ? 'Perfil Música: performance, banda, público, luz, solo, refrão, clímax, dinâmica — não só o trecho mais alto.'
                : 'Perfil Música: refrão, solo, clímax, entrada vocal e mudança de dinâmica.'}
            </p>
          </Card>
        </aside>
      </div>

      <Modal
        open={renameOpen}
        title="Renomear projeto"
        onClose={() => setRenameOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveRename()}>Salvar</Button>
          </>
        }
      >
        <Input
          id="shorts-editor-rename"
          label="Nome do projeto"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void saveRename()
            }
          }}
        />
      </Modal>

      <ShortsAdjustModal
        open={Boolean(previewClip && job)}
        job={job}
        clip={previewClip}
        mediaUrl={mediaUrl}
        aspectMode={aspectMode}
        framingPlan={previewClip ? clipFramingPlan(previewClip) : null}
        picking={Boolean(job?.framingSettings?.picking)}
        placingLogo={placingLogo}
        logo={job?.logoSettings}
        logoUrl={job?.logoUrl}
        playing={Boolean(previewClip && playingClipId === previewClip.id)}
        busy={pageBusy}
        regenerating={Boolean(previewClip && copyBusyId === previewClip.id)}
        exporting={Boolean(previewClip && progress?.stage === 'exporting' && progress.clipId === previewClip.id)}
        exportPercent={
          previewClip && progress?.stage === 'exporting' && progress.clipId === previewClip.id
            ? (progress.percent ?? null)
            : null
        }
        onClose={() => {
          setPreviewClip(null)
          setPlayingClipId(null)
        }}
        onPlayingChange={(playing) => {
          if (!previewClip) return
          setPlayingClipId(playing ? previewClip.id : null)
        }}
        onAssignPoint={(x, y, time) => {
          if (!previewClip) return
          assignFramingPoint(previewClip, x, y, time)
        }}
        onPlaceLogo={placeLogo}
        onChange={async (patch) => {
          if (!previewClip) return
          await persistClip(previewClip, patch)
        }}
        onCopy={(part) => {
          if (previewClip) void copyClip(previewClip, part)
        }}
        onRegenerate={(fields) => {
          if (previewClip) void regenerateClip(previewClip, fields)
        }}
        onExport={() => {
          if (previewClip) void exportClip(previewClip)
        }}
        onOpenFolder={() => {
          if (previewClip) void openClipFolder(previewClip)
        }}
        onDelete={() => {
          if (previewClip) setDeletingClip(previewClip)
        }}
      />

      <ConfirmDialog
        open={deletingProject}
        title="Excluir projeto de Shorts?"
        message={job ? shortsProjectDeleteMessage(exportedShortsCount(job.clips)) : ''}
        confirmLabel="Excluir projeto"
        onConfirm={() => void confirmDeleteProject()}
        onClose={() => setDeletingProject(false)}
      />

      <ConfirmDialog
        open={Boolean(deletingClip)}
        title="Excluir este Short?"
        message={deletingClip ? shortsClipDeleteMessage(Boolean(deletingClip.exportedPath)) : ''}
        confirmLabel="Excluir Short"
        onConfirm={() => void confirmDeleteClip()}
        onClose={() => setDeletingClip(null)}
      />

      <ConfirmDialog
        open={reanalyzeOpen}
        title="Analisar o vídeo novamente?"
        message="Novos candidatos serão gerados neste mesmo projeto. Shorts já exportados ou aceitos serão preservados."
        confirmLabel="Reanalisar"
        onConfirm={() => {
          setReanalyzeOpen(false)
          void continueAnalyzeAfterConfirm()
        }}
        onClose={() => setReanalyzeOpen(false)}
      />

      <Modal
        open={modelChoiceOpen}
        title="O modelo atual não suporta análise direta de vídeo."
        onClose={() => setModelChoiceOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setModelChoiceOpen(false)
                void analyze('continue_frames')
              }}
            >
              Continuar com análise por frames
            </Button>
            <Button
              onClick={() => {
                setModelChoiceOpen(false)
                void analyze('use_compatible')
              }}
            >
              Usar modelo compatível
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          {analysisPlan?.currentModel
            ? `O modelo ${analysisPlan.currentModel} não declara suporte a vídeo.`
            : 'O modelo atual não declara suporte a vídeo.'}
          {analysisPlan?.compatibleVideoModels[0]
            ? ` Você pode usar ${analysisPlan.compatibleVideoModels[0].label} nesta análise, sem trocar o padrão das Configurações, ou continuar com frames + áudio + transcrição.`
            : ' Continue com frames + áudio + transcrição.'}
        </p>
      </Modal>
    </PageShell>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-1 break-words text-text" title={value}>
        {value}
      </p>
    </div>
  )
}

