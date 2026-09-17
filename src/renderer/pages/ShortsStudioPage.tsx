import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clapperboard, Film, Loader2, Pause, Play, Scissors } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Project } from '@shared/types'
import type {
  ShortsAspectMode,
  ShortsClip,
  ShortsClipCount,
  ShortsDurationMode,
  ShortsJob,
  ShortsProfile,
  ShortsProgressEvent,
} from '@shared/shorts'
import {
  SHORTS_ASPECT_MODES,
  SHORTS_CLIP_COUNTS,
  SHORTS_PROGRESS_LABEL,
  clipDuration,
  formatShortsTimecode,
} from '@shared/shorts'
import {
  SHORTS_DURATION_SHORTCUTS,
  capRequestedDuration,
  formatClipLength,
  formatDurationInput,
  isDurationShortcut,
  parseDurationInput,
} from '@shared/shortsDuration'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { cn } from '../lib/utils'

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
    <label className="flex w-full flex-col gap-2">
      <span className="text-sm font-medium text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-card-2 px-3.5 text-sm text-text transition-colors hover:border-[#334049] focus:border-accent/60 focus:outline-none"
      >
        {children}
      </select>
    </label>
  )
}

export function ShortsStudioPage() {
  const api = getAtlasApi()
  const { push } = useToast()
  const [params] = useSearchParams()
  const projectId = params.get('projectId')

  const [project, setProject] = useState<Project | null>(null)
  const [job, setJob] = useState<ShortsJob | null>(null)
  const [jobs, setJobs] = useState<ShortsJob[]>([])
  const [profile, setProfile] = useState<ShortsProfile>('history')
  const [clipCount, setClipCount] = useState<ShortsClipCount>(5)
  const [requestedDuration, setRequestedDuration] = useState(30)
  const [durationInput, setDurationInput] = useState('00:30')
  const [durationMode, setDurationMode] = useState<ShortsDurationMode>('approximate')
  const [durationWarning, setDurationWarning] = useState<string | null>(null)
  const [aspectMode, setAspectMode] = useState<ShortsAspectMode>('center_9_16')
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ShortsProgressEvent | null>(null)
  const [previewClip, setPreviewClip] = useState<ShortsClip | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)

  const analyzing = job?.status === 'analyzing' || (busy && progress?.stage !== 'exporting')

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

  async function loadJobs(currentId?: string) {
    const list = await api.shorts.list(projectId ? { projectId } : undefined)
    setJobs(list)
    if (currentId) {
      setJob(list.find((item) => item.id === currentId) ?? list[0] ?? null)
      return
    }
    setJob((current) => list.find((item) => item.id === current?.id) ?? list[0] ?? null)
  }

  useEffect(() => {
    void loadJobs()
  }, [projectId])

  useEffect(() => {
    return api.shorts.onProgress((event) => {
      setProgress(event)
    })
  }, [api])

  useEffect(() => {
    if (!job) return
    setProfile(job.profile)
    setClipCount(job.clipCount)
    setRequestedDuration(job.requestedDuration)
    setDurationInput(formatDurationInput(job.requestedDuration))
    setDurationMode(job.durationMode)
    setAspectMode(job.aspectMode)
    setCaptionsEnabled(job.captionsEnabled)
  }, [job?.id])

  async function persistSettings(
    patch: Partial<{
      profile: ShortsProfile
      clipCount: ShortsClipCount
      requestedDuration: number
      durationMode: ShortsDurationMode
      aspectMode: ShortsAspectMode
      captionsEnabled: boolean
    }>,
  ) {
    if (!job) return
    const next = await api.shorts.updateSettings(job.id, patch)
    if (next) setJob(next)
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

  async function importVideo() {
    setBusy(true)
    try {
      const next = await api.shorts.import(projectId)
      if (!next) return
      const cap = capRequestedDuration(requestedDuration, next.probe?.duration)
      const saved =
        (await api.shorts.updateSettings(next.id, {
          requestedDuration: cap.requested,
          durationMode,
          profile,
          clipCount,
          aspectMode,
          captionsEnabled,
        })) ?? next
      setRequestedDuration(cap.requested)
      setDurationInput(formatDurationInput(cap.requested))
      setDurationWarning(cap.message)
      if (cap.capped && cap.message) push(cap.message, 'error')
      setJob(saved)
      setProgress(null)
      await loadJobs(saved.id)
      push('Vídeo importado. O arquivo original permanece no lugar.', 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao importar o vídeo', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function analyze() {
    if (!job) {
      push('Importe um vídeo primeiro.', 'error')
      return
    }
    setBusy(true)
    setProgress({ jobId: job.id, stage: 'analyzing', message: SHORTS_PROGRESS_LABEL.analyzing })
    try {
      const next = await api.shorts.analyze({
        jobId: job.id,
        profile,
        clipCount,
        requestedDuration,
        durationMode,
        aspectMode,
        captionsEnabled,
      })
      setJob(next)
      await loadJobs(next.id)
      if (next.status === 'error') {
        push(next.errorMessage || 'A análise falhou. O vídeo original foi preservado.', 'error')
      } else {
        push(`${next.clips.length} Shorts sugeridos.`, 'success')
      }
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao analisar o vídeo', 'error')
      const latest = await api.shorts.get(job.id)
      if (latest) setJob(latest)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function openPreview(clip: ShortsClip) {
    if (!job) return
    try {
      const url = await api.shorts.mediaUrl(job.id)
      setMediaUrl(url)
      setPreviewClip(clip)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível abrir a prévia', 'error')
    }
  }

  async function exportClip(clip: ShortsClip) {
    if (!job) return
    setBusy(true)
    setProgress({ jobId: job.id, stage: 'exporting', message: SHORTS_PROGRESS_LABEL.exporting })
    try {
      const output = await api.shorts.export({ jobId: job.id, clipId: clip.id })
      if (!output) return
      const latest = await api.shorts.get(job.id)
      if (latest) setJob(latest)
      push('Short exportado em MP4. O vídeo original não foi alterado.', 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao exportar o Short', 'error')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const probe = job?.probe

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb={project ? `Atlas / Shorts Studio / ${project.name}` : 'Atlas / Shorts Studio'}
        title="Shorts Studio"
        subtitle="Importe um vídeo completo, deixe o Atlas sugerir os melhores trechos e exporte Shorts 9:16 com corte, crop e legenda. Sem editor complexo."
        hint={
          project
            ? `Vinculado ao projeto ${project.name} (${project.projectType === 'music' ? 'Música' : 'História'}).`
            : 'Aberto globalmente — funciona sem projeto.'
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted">Arquivo</p>
                  <p className="mt-1 text-sm text-text">{job?.sourceName || 'Nenhum vídeo importado'}</p>
                </div>
                <Button variant="secondary" disabled={busy} onClick={() => void importVideo()}>
                  {job ? 'Trocar vídeo' : 'Importar vídeo'}
                </Button>
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
              <option value="history">História</option>
              <option value="music">Música</option>
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
              {durationWarning ? <p className="text-xs text-danger">{durationWarning}</p> : null}
            </div>
            <FieldSelect
              label="Formato"
              value={aspectMode}
              onChange={(value) => {
                const next = value as ShortsAspectMode
                setAspectMode(next)
                void persistSettings({ aspectMode: next })
              }}
            >
              {SHORTS_ASPECT_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </FieldSelect>
            <label className="flex items-center gap-3 md:col-span-2">
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(event) => {
                  const next = event.target.checked
                  setCaptionsEnabled(next)
                  void persistSettings({ captionsEnabled: next })
                }}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-sm text-text">Legendas</span>
            </label>
            <div className="md:col-span-2">
              <Button
                fullWidth
                disabled={busy || !job}
                icon={analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                onClick={() => void analyze()}
              >
                Analisar vídeo
              </Button>
              {progress ? (
                <p className="mt-3 text-sm text-accent" role="status">
                  {progress.message || SHORTS_PROGRESS_LABEL[progress.stage]}
                </p>
              ) : null}
            </div>
          </Card>

          {probe ? (
            <Card className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
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
          {job?.analysisNotes ? (
            <p className="text-xs leading-relaxed text-muted-2 whitespace-pre-line">{job.analysisNotes}</p>
          ) : null}

          {job?.clips.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {job.clips.map((clip) => (
                <Card key={clip.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-2">Short #{clip.index}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-text">
                        {formatShortsTimecode(clip.start)} → {formatShortsTimecode(clip.end)}
                      </p>
                      <p className="text-sm text-muted">{formatClipLength(clipDuration(clip))}</p>
                    </div>
                    <div className="rounded-xl bg-accent-dark px-3 py-2 text-center">
                      <p className="text-[10px] uppercase text-muted-2">Score</p>
                      <p className="text-lg font-semibold text-accent">{clip.score}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted">
                    <span className="text-muted-2">Motivo: </span>
                    {clip.reason}
                  </p>
                  {clip.hook ? <p className="text-sm text-text">{clip.hook}</p> : null}
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => void openPreview(clip)}>
                      Assistir
                    </Button>
                    <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => void openPreview(clip)}>
                      Ajustar
                    </Button>
                    <Button
                      className="h-9 px-3 text-xs"
                      disabled={busy}
                      onClick={() => void exportClip(clip)}
                    >
                      Gerar Short
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center py-14 text-center">
              <Clapperboard className="mb-3 h-10 w-10 text-muted" />
              <p className="text-sm text-muted">Importe um vídeo e analise para ver os cortes sugeridos.</p>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card padding="sm" className="space-y-2 text-xs text-muted">
            <p className="font-medium text-text">Como funciona</p>
            <p>O FFmpeg roda localmente. O Antigravity recebe só transcrição, timestamps e contexto — nunca o arquivo bruto por padrão.</p>
            <p>
              {profile === 'music'
                ? 'Perfil Música: refrão, clímax, solo, entrada forte, plateia, dinâmica, final.'
                : 'Perfil História: gancho, curiosidade, revelação, conflito, frase memorável, virada.'}
            </p>
          </Card>
          {jobs.length > 1 ? (
            <Card padding="sm" className="space-y-2">
              <p className="text-xs font-medium text-muted">Recentes</p>
              {jobs.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setJob(item)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs hover:bg-white/5',
                    item.id === job?.id ? 'bg-white/5 text-text' : 'text-muted',
                  )}
                >
                  <Film className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.sourceName}</span>
                </button>
              ))}
            </Card>
          ) : null}
        </aside>
      </div>

      <ShortsPreviewModal
        open={Boolean(previewClip && job)}
        job={job}
        clip={previewClip}
        mediaUrl={mediaUrl}
        onClose={() => setPreviewClip(null)}
        onChange={async (patch) => {
          if (!job || !previewClip) return
          const next = await api.shorts.updateClip(job.id, previewClip.id, patch)
          if (!next) return
          setJob(next)
          const updated = next.clips.find((item) => item.id === previewClip.id) ?? null
          setPreviewClip(updated)
        }}
        onExport={() => {
          if (previewClip) void exportClip(previewClip)
        }}
      />
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-1 truncate text-text">{value}</p>
    </div>
  )
}

function ShortsPreviewModal({
  open,
  job,
  clip,
  mediaUrl,
  onClose,
  onChange,
  onExport,
}: {
  open: boolean
  job: ShortsJob | null
  clip: ShortsClip | null
  mediaUrl: string | null
  onClose: () => void
  onChange: (patch: { start: number; end: number }) => Promise<void>
  onExport: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const duration = job?.probe?.duration ?? clip?.end ?? 0

  useEffect(() => {
    const video = videoRef.current
    if (!video || !clip) return
    video.currentTime = clip.start
  }, [clip?.id, clip?.start, mediaUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !clip) return
    function onTime() {
      if (!clip || !videoRef.current) return
      if (videoRef.current.currentTime >= clip.end - 0.04) {
        videoRef.current.pause()
        videoRef.current.currentTime = clip.end
        setPlaying(false)
      }
    }
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [clip])

  const start = clip?.start ?? 0
  const end = clip?.end ?? 0

  return (
    <Modal
      open={open}
      title={clip ? `Short #${clip.index}` : 'Prévia'}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={onExport}>Gerar Short</Button>
        </>
      }
    >
      {clip && mediaUrl ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              src={mediaUrl}
              className="mx-auto max-h-[420px] w-full bg-black"
              controls={false}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 px-3"
              icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              onClick={() => {
                const video = videoRef.current
                if (!video) return
                if (playing) {
                  video.pause()
                  setPlaying(false)
                  return
                }
                if (video.currentTime < start || video.currentTime >= end) video.currentTime = start
                void video.play()
                setPlaying(true)
              }}
            >
              {playing ? 'Pausar' : 'Assistir trecho'}
            </Button>
            <span className="text-sm tabular-nums text-muted">
              {formatShortsTimecode(start)} → {formatShortsTimecode(end)}
            </span>
            <span className="text-sm font-medium tabular-nums text-text">
              Duração: {formatClipLength(end - start)}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Início (s)"
              type="number"
              min={0}
              max={end}
              step={0.1}
              value={start}
              onChange={(event) => void onChange({ start: Number(event.target.value), end })}
            />
            <Input
              label="Fim (s)"
              type="number"
              min={start}
              max={duration}
              step={0.1}
              value={end}
              onChange={(event) => void onChange({ start, end: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={start}
              onChange={(event) => void onChange({ start: Number(event.target.value), end })}
              className="w-full accent-accent"
              aria-label="Início"
            />
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={end}
              onChange={(event) => void onChange({ start, end: Number(event.target.value) })}
              className="w-full accent-accent"
              aria-label="Fim"
            />
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
