import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Download,
  FolderOpen,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { AutoCutPreset, MusicAnalysis, MusicSegment, MusicTrack } from '@shared/musicAnalysis'
import {
  analyzeMusic,
  autoCutMusic,
  clipAnalysisToAudible,
  computePeaks,
  formatTimecode,
  mixToMono,
  sliceSamplesToDuration,
} from '@shared/musicAnalysis'
import {
  addManualSelection,
  fitCutsToExactDuration,
  removeCut as removeCutFromList,
  renameCut,
  sanitizeExportName,
  splitAtPlayhead,
  updateCutBounds,
  moveMarker,
} from '@shared/audio/audioCutService'
import type { CutMarker } from '@shared/audio/audioCutService'
import {
  candidateEdgeTrims,
  candidateSplits,
  candidateWindows,
  summarizeMusicAnalysis,
} from '@shared/audio/audioAnalysisService'
import {
  adviseCutsLocally,
  buildMusicAdviseRequest,
} from '@shared/audio/audioCutAdvisor'
import { createEditorHistory } from '@shared/audio/history'
import { isTypingTarget, nextPlaybackTime, seekStep } from '@shared/audio/playback'
import { parseTimecodeInput } from '@shared/audio/time'
import type { AudioExportFormat, Mp3Bitrate } from '@shared/audio/audioExport'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Select } from '../components/Select'
import { Waveform } from '../components/Waveform'
import { ConfirmDialog } from '../components/Modal'
import { getAtlasApi } from '../lib/api'
import { decodeWavPcm } from '../lib/decodeWav'
import { useToast } from '../components/Toast'
import { environmentBreadcrumb } from '../lib/environments'

const PRESETS: Array<{ id: AutoCutPreset; label: string; hint: string }> = [
  { id: 'completo', label: 'Cortes automáticos', hint: 'Análise local + Codex escolhe transições naturais' },
  { id: 'silencio', label: 'Só as pontas', hint: 'Remove silêncio/fade do começo e do fim' },
  { id: 'gancho15', label: 'Gancho 15s', hint: 'Janela forte de cerca de 15 segundos' },
  { id: 'gancho30', label: 'Gancho 30s', hint: 'Janela forte de cerca de 30 segundos' },
  { id: 'estrutura', label: 'IA · Estrutura musical', hint: 'Blocos coerentes nas transições da faixa' },
]

function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (next: number) => void
}) {
  const [text, setText] = useState(formatTimecode(value))
  useEffect(() => {
    setText(formatTimecode(value))
  }, [value])
  return (
    <Input
      label={label}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const parsed = parseTimecodeInput(text)
        if (parsed == null) {
          setText(formatTimecode(value))
          return
        }
        onCommit(parsed)
      }}
    />
  )
}

function asBytes(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return Uint8Array.from(value)
}

type HistorySnapshot = {
  cuts: MusicSegment[]
  cutMode: MusicTrack['cutMode']
  selectedId: string | null
  appliedPreset: AutoCutPreset | null
}

export function MusicEditorPage() {
  const { id } = useParams()
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const samplesRef = useRef<Float32Array | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const playbackModeRef = useRef<'full' | 'region'>('full')
  const playAuthorizedRef = useRef(false)
  const historyRef = useRef(createEditorHistory<HistorySnapshot>())
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [track, setTrack] = useState<MusicTrack | null>(null)
  const [analysis, setAnalysis] = useState<MusicAnalysis | null>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loop, setLoop] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [exportFormat, setExportFormat] = useState<AudioExportFormat>('mp3')
  const [bitrate, setBitrate] = useState<Mp3Bitrate>(320)
  const [exportFolder, setExportFolder] = useState('')
  const [iaProgress, setIaProgress] = useState<string | null>(null)
  const [iaError, setIaError] = useState<string | null>(null)
  const [codexNotice, setCodexNotice] = useState<string | null>(null)
  const [pendingPreset, setPendingPreset] = useState<AutoCutPreset | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const selected = useMemo(
    () => track?.cuts.find((cut) => cut.id === selectedId) ?? null,
    [track, selectedId],
  )

  function refreshHistoryFlags() {
    setCanUndo(historyRef.current.canUndo())
    setCanRedo(historyRef.current.canRedo())
  }

  function snapshotFrom(current: MusicTrack, nextSelected = selectedId): HistorySnapshot {
    return {
      cuts: current.cuts,
      cutMode: current.cutMode,
      selectedId: nextSelected,
      appliedPreset: current.appliedPreset ?? null,
    }
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const current = await api.music.get(id)
        if (!current) throw new Error('Música não encontrada')
        const preview = asBytes(await api.music.preview(id))
        const { samples, sampleRate } = decodeWavPcm(preview)
        const mono = mixToMono({
          numberOfChannels: 1,
          length: samples.length,
          getChannelData: () => samples,
        })
        const nextAnalysis = clipAnalysisToAudible(analyzeMusic(mono, sampleRate))
        const audibleMono = sliceSamplesToDuration(mono, sampleRate, nextAnalysis.duration)
        let nextTrack = { ...current, duration: nextAnalysis.duration }
        if (nextTrack.cuts.length === 0) {
          nextTrack = {
            ...nextTrack,
            cutMode: 'automatico',
            appliedPreset: 'completo',
            cuts: autoCutMusic(nextAnalysis, 'completo'),
          }
        } else {
          nextTrack = {
            ...nextTrack,
            cuts: fitCutsToExactDuration(nextTrack.cuts, nextTrack.duration),
          }
        }
        const lastCutEnd = nextTrack.cuts.reduce((max, cut) => Math.max(max, cut.end), 0)
        if (
          current.cuts.length > 0 &&
          lastCutEnd > 0 &&
          nextTrack.duration - lastCutEnd > 0.25
        ) {
          nextTrack = { ...nextTrack, duration: lastCutEnd }
        }
        const editorialAnalysis =
          nextTrack.duration < nextAnalysis.duration - 0.05
            ? clipAnalysisToAudible(nextAnalysis, nextTrack.duration)
            : nextAnalysis
        const editorialSamples = sliceSamplesToDuration(audibleMono, sampleRate, nextTrack.duration)
        const durationChanged = Math.abs((current.duration || 0) - nextTrack.duration) > 0.05
        if (!current.cuts.length) {
          await api.music.update(id, {
            duration: nextTrack.duration,
            cutMode: nextTrack.cutMode,
            cuts: nextTrack.cuts,
            appliedPreset: nextTrack.appliedPreset ?? 'completo',
          })
        } else if (durationChanged) {
          await api.music.update(id, { duration: nextTrack.duration, cuts: nextTrack.cuts })
        }
        if (cancelled) return
        let nextUrl: string | null = null
        try {
          if (typeof api.music.previewUrl === 'function') {
            nextUrl = await api.music.previewUrl(id)
          }
        } catch {
          nextUrl = null
        }
        if (!nextUrl) {
          const copy = new Uint8Array(preview.byteLength)
          copy.set(preview)
          nextUrl = URL.createObjectURL(new Blob([copy], { type: 'audio/wav' }))
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = nextUrl
        }
        if (cancelled) {
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
            objectUrlRef.current = null
          }
          return
        }
        setPreviewUrl(nextUrl)
        samplesRef.current = editorialSamples
        historyRef.current.clear()
        setTrack(nextTrack)
        setAnalysis(editorialAnalysis)
        setPeaks(computePeaks(editorialSamples, 1200))
        setSelectedId(nextTrack.selectedId ?? nextTrack.cuts[0]?.id ?? null)
        refreshHistoryFlags()
        const settings = await api.settings.get()
        if (!cancelled) setExportFolder(settings.musicExportFolder || '')
        const status = await api.codex.status()
        if (!cancelled && !(status.connected && status.authenticated)) {
          setCodexNotice('Codex não está conectado. Usando análise local.')
        }
      } catch (error) {
        if (!cancelled) {
          push(error instanceof Error ? error.message : 'Não foi possível abrir a música', 'error')
          navigate('/musica/faixas')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setPreviewUrl(null)
    }
  }, [api, id, navigate, push])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (previewUrl && !audio.getAttribute('src')) audio.src = previewUrl
    const onPlay = () => {
      if (!playAuthorizedRef.current) {
        audio.pause()
        setPlaying(false)
        return
      }
      setPlaying(true)
    }
    const onPause = () => setPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [previewUrl, track])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = muted ? 0 : volume
  }, [volume, muted, track])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const audio = audioRef.current
      if (audio) {
        const limit = track?.duration ?? audio.duration ?? 0
        const time = Math.min(audio.currentTime, limit)
        if (audio.currentTime > limit) audio.currentTime = limit
        setPlayhead(time)
        const region = playbackModeRef.current === 'region' ? selected : null
        const next = nextPlaybackTime({
          currentTime: time,
          duration: limit,
          mode: playbackModeRef.current,
          loop,
          region: region ? { start: region.start, end: region.end } : null,
        })
        if (next.looped) audio.currentTime = next.currentTime
        if (!next.playing && !audio.paused) audio.pause()
      }
      raf = requestAnimationFrame(tick)
    }
    if (playing) raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, loop, selected, track?.duration])

  async function persist(patch: Partial<MusicTrack>) {
    if (!track) return
    const updated = await api.music.update(track.id, patch)
    if (updated) setTrack(updated)
  }

  function queuePersist(patch: Partial<MusicTrack>) {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void persist(patch)
    }, 180)
  }

  function applyLocal(next: HistorySnapshot, recordHistory: boolean) {
    if (!track) return
    if (recordHistory) historyRef.current.push(snapshotFrom(track))
    const updated = {
      ...track,
      cuts: next.cuts,
      cutMode: next.cutMode,
      selectedId: next.selectedId,
      appliedPreset: next.appliedPreset,
    }
    setTrack(updated)
    setSelectedId(next.selectedId)
    queuePersist({
      cuts: next.cuts,
      cutMode: next.cutMode,
      selectedId: next.selectedId,
      appliedPreset: next.appliedPreset,
    })
    refreshHistoryFlags()
  }

  function seekTo(time: number) {
    const audio = audioRef.current
    const limit = track?.duration ?? audio?.duration ?? 0
    const next = Math.max(0, Math.min(time, limit))
    if (audio) audio.currentTime = next
    setPlayhead(next)
  }

  function stopAudio() {
    playAuthorizedRef.current = false
    const audio = audioRef.current
    if (audio && !audio.paused) audio.pause()
    setPlaying(false)
  }

  function scrubTo(time: number) {
    stopAudio()
    seekTo(time)
  }

  async function playAudio() {
    const audio = audioRef.current
    if (!audio) return
    if (previewUrl && !audio.getAttribute('src')) {
      audio.src = previewUrl
    }
    playAuthorizedRef.current = true
    setPlaying(true)
    try {
      await audio.play()
      if (!playAuthorizedRef.current) {
        audio.pause()
        setPlaying(false)
      }
    } catch (error) {
      playAuthorizedRef.current = false
      setPlaying(false)
      if (error instanceof DOMException && error.name === 'AbortError') return
      push(error instanceof Error ? error.message : 'Não foi possível reproduzir o áudio', 'error')
    }
  }

  function togglePlayPause() {
    const audio = audioRef.current
    if (!audio) return
    const isPlaying = !audio.paused || playing
    if (isPlaying) {
      stopAudio()
      return
    }
    playbackModeRef.current = 'full'
    void playAudio()
  }

  function playSelectedRegion(cut = selected) {
    const audio = audioRef.current
    if (!audio || !cut) return
    playbackModeRef.current = 'region'
    setSelectedId(cut.id)
    audio.currentTime = cut.start
    void playAudio()
  }

  function cutAtPlayhead() {
    if (!track) return
    applyLocal(
      {
        cuts: splitAtPlayhead(track.cuts, playhead, track.duration),
        cutMode: 'manual',
        selectedId,
        appliedPreset: track.appliedPreset ?? null,
      },
      true,
    )
  }

  function addManualCut() {
    if (!track) return
    const next = addManualSelection(track.cuts, playhead, track.duration)
    applyLocal(
      {
        cuts: next.cuts,
        cutMode: 'manual',
        selectedId: next.selectedId,
        appliedPreset: track.appliedPreset ?? null,
      },
      true,
    )
  }

  function changeCut(cutId: string, start: number, end: number, recordHistory = false) {
    if (!track) return
    applyLocal(
      {
        cuts: updateCutBounds(track.cuts, cutId, start, end, track.duration),
        cutMode: 'manual',
        selectedId: cutId,
        appliedPreset: track.appliedPreset ?? null,
      },
      recordHistory,
    )
  }

  function commitMarker(marker: CutMarker, time: number, recordHistory = false) {
    if (!track) return
    applyLocal(
      {
        cuts: moveMarker(track.cuts, marker, time, track.duration),
        cutMode: 'manual',
        selectedId: marker.rightId ?? marker.leftId,
        appliedPreset: track.appliedPreset ?? null,
      },
      recordHistory,
    )
  }

  function undo() {
    if (!track) return
    const previous = historyRef.current.undo(snapshotFrom(track))
    if (!previous) return
    setTrack({ ...track, ...previous })
    setSelectedId(previous.selectedId)
    queuePersist(previous)
    refreshHistoryFlags()
  }

  function redo() {
    if (!track) return
    const next = historyRef.current.redo(snapshotFrom(track))
    if (!next) return
    setTrack({ ...track, ...next })
    setSelectedId(next.selectedId)
    queuePersist(next)
    refreshHistoryFlags()
  }

  async function applyPreset(preset: AutoCutPreset) {
    if (!track || !analysis) return
    setIaError(null)
    setBusy(true)
    try {
      setIaProgress('Analisando áudio...')
      const { enriched, summary } = summarizeMusicAnalysis(analysis, samplesRef.current)
      setIaProgress('Detectando transições...')
      const candidates =
        preset === 'gancho15' || preset === 'gancho30'
          ? candidateWindows(analysis, enriched, preset === 'gancho15' ? 15 : 30)
          : preset === 'silencio'
            ? candidateEdgeTrims(analysis)
            : candidateSplits(analysis, enriched, preset === 'estrutura' ? 'estrutura' : 'completo')
      const request = buildMusicAdviseRequest(summary, candidates, preset)
      setIaProgress('Codex avaliando cortes...')
      let result
      try {
        result = await api.music.adviseCuts(request)
      } catch {
        result = adviseCutsLocally(request)
        result = {
          ...result,
          error: 'Não foi possível analisar a faixa com o Codex.',
          message: 'Não foi possível analisar a faixa com o Codex. Usando análise local.',
        }
      }
      setIaProgress('Aplicando sugestões...')
      const rawCuts = result.cuts.length > 0 ? result.cuts : autoCutMusic(analysis, preset)
      const cuts = fitCutsToExactDuration(rawCuts, analysis.duration)
      applyLocal(
        {
          cuts,
          cutMode: 'automatico',
          selectedId: cuts[0]?.id ?? null,
          appliedPreset: preset,
        },
        true,
      )
      if (!result.usedCodex) {
        setCodexNotice(result.message || 'Codex não está conectado. Usando análise local.')
      } else {
        setCodexNotice(result.message || null)
      }
      if (result.error) setIaError(result.error)
      else push(result.usedCodex ? 'Cortes da IA aplicados.' : 'Cortes automáticos atualizados.', 'success')
    } finally {
      setBusy(false)
      setIaProgress(null)
    }
  }

  async function requestPreset(preset: AutoCutPreset) {
    if (!track) return
    if (track.cuts.length > 0) {
      setPendingPreset(preset)
      return
    }
    await applyPreset(preset)
  }

  async function exportOne(cut: MusicSegment) {
    if (!track) return
    setBusy(true)
    try {
      const base = sanitizeExportName(cut.label, cut.label || 'corte')
      const saved = await api.music.export({
        id: track.id,
        start: cut.start,
        end: cut.end,
        filename: `${base}.${exportFormat}`,
        format: exportFormat,
        bitrate,
        directory: exportFolder || undefined,
      })
      if (saved) {
        setExportFolder(saved.replace(/[/\\][^/\\]+$/, ''))
        push('Corte exportado.', 'success')
      }
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao exportar o corte', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function exportAll() {
    if (!track) return
    setBusy(true)
    try {
      const saved = await api.music.exportAll({
        id: track.id,
        format: exportFormat,
        bitrate,
        directory: exportFolder || undefined,
        cuts: track.cuts.map((cut) => ({ start: cut.start, end: cut.end, label: cut.label })),
      })
      if (saved?.length) {
        push(`${saved.length} cortes exportados.`, 'success')
        const folder = saved[0].replace(/[/\\][^/\\]+$/, '')
        if (folder) setExportFolder(folder)
      }
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao exportar os cortes', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function chooseFolder() {
    const folder = await api.music.chooseExportFolder()
    if (folder) setExportFolder(folder)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlayPause()
        return
      }
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault()
        cutAtPlayhead()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selectedId || !track) return
        event.preventDefault()
        applyLocal(
          {
            cuts: removeCutFromList(track.cuts, selectedId),
            cutMode: 'manual',
            selectedId: track.cuts.find((cut) => cut.id !== selectedId)?.id ?? null,
            appliedPreset: track.appliedPreset ?? null,
          },
          true,
        )
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const next = seekStep(playhead, event.key === 'ArrowLeft' ? -1 : 1, event.shiftKey, track?.duration ?? 0)
        seekTo(next)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (loading || !track) {
    return (
      <>
        <audio
          ref={audioRef}
          src={previewUrl ?? undefined}
          preload="auto"
          controls={false}
          tabIndex={-1}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
        <div className="flex h-full items-center justify-center text-sm text-muted">
          Analisando a música...
        </div>
      </>
    )
  }

  const folderLabel = exportFolder ? exportFolder.split(/[/\\]/).filter(Boolean).slice(-2).join('/') : 'Escolher pasta'

  return (
    <PageShell>
      <audio
        ref={audioRef}
        src={previewUrl ?? undefined}
        preload="auto"
        controls={false}
        tabIndex={-1}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', track.name, 'Editor de cortes')}
        title={track.name}
        subtitle="Edite ouvindo a faixa. O áudio original nunca é alterado — o Atlas guarda só os pontos de corte e o FFmpeg gera os arquivos na exportação."
      />

      <div data-tour="page-actions" className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            navigate(track.projectId ? `/musica/projetos/${track.projectId}` : '/musica/faixas')
          }
        >
          ← Voltar
        </Button>
        <Button
          type="button"
          icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          onClick={togglePlayPause}
          title="Espaço: play/pause"
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <span className="rounded-xl border border-border-soft bg-card px-3 py-2 font-mono text-xs text-text">
          {formatTimecode(playhead)} / {formatTimecode(track.duration)}
        </span>
        <Button
          variant="secondary"
          icon={<Scissors className="h-4 w-4" />}
          onClick={cutAtPlayhead}
          title="S: cortar no playhead"
        >
          Cortar aqui
        </Button>
        <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Ctrl+Z" icon={<Undo2 className="h-4 w-4" />}>
          Desfazer
        </Button>
        <Button
          variant="ghost"
          onClick={redo}
          disabled={!canRedo}
          title="Ctrl+Y / Ctrl+Shift+Z"
          icon={<Redo2 className="h-4 w-4" />}
        >
          Refazer
        </Button>
        <div className="flex items-center gap-1 rounded-xl border border-border-soft bg-card px-2 py-1 text-xs text-muted">
          <button type="button" className="px-2 py-1 hover:text-text" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}>
            −
          </button>
          <span className="min-w-[3.5rem] text-center font-medium text-text">{Math.round(zoom * 100)}%</span>
          <button type="button" className="px-2 py-1 hover:text-text" onClick={() => setZoom((value) => Math.min(8, Number((value + 0.25).toFixed(2))))}>
            +
          </button>
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <button type="button" onClick={() => setMuted((value) => !value)} title={muted ? 'Ativar som' : 'Mudo'}>
            {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => {
              const next = Number(event.target.value)
              setVolume(next)
              if (next > 0) setMuted(false)
            }}
            aria-label="Volume"
          />
        </label>
      </div>

      {codexNotice ? (
        <p className="mb-3 rounded-xl border border-border-soft bg-card px-3 py-2 text-xs text-muted">{codexNotice}</p>
      ) : null}
      {iaProgress ? (
        <p className="mb-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">{iaProgress}</p>
      ) : null}
      {iaError ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span>{iaError}</span>
          <Button variant="secondary" className="h-8 px-3 py-1 text-xs" onClick={() => void applyPreset(track.appliedPreset ?? 'completo')}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <Card className="mb-5">
        <Waveform
          peaks={peaks}
          duration={track.duration}
          cuts={track.cuts}
          selectedId={selected?.id ?? null}
          playhead={playhead}
          zoom={zoom}
          onSeek={scrubTo}
          onSelect={(cutId, time) => {
            setSelectedId(cutId)
            scrubTo(time)
          }}
          onChangeCut={(cutId, start, end) => changeCut(cutId, start, end, false)}
          onCommitCut={() => undefined}
          onMoveMarker={(marker, time) => commitMarker(marker, time, false)}
          onCommitMarker={() => undefined}
          onBeginGesture={() => {
            stopAudio()
            if (!track) return
            historyRef.current.push(snapshotFrom(track))
            refreshHistoryFlags()
          }}
          onZoom={setZoom}
        />
        {selected ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              Selecionado: <strong className="text-text">{selected.label}</strong>
            </span>
            <span>Início {formatTimecode(selected.start)}</span>
            <span>Fim {formatTimecode(selected.end)}</span>
            <span>Duração {formatTimecode(selected.end - selected.start)}</span>
            {selected.reason ? (
              <span className="rounded-full bg-white/5 px-2 py-1">
                Corte sugerido pela IA{selected.confidence != null ? ` · ${Math.round(selected.confidence * 100)}%` : ''}
              </span>
            ) : null}
            <label className="ml-auto flex items-center gap-2">
              <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
              Repetir corte
            </label>
            <Button variant="secondary" className="h-9" onClick={() => playSelectedRegion(selected)}>
              Ouvir corte
            </Button>
          </div>
        ) : null}
      </Card>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addManualCut}>
          Novo corte manual
        </Button>
        <div className="w-[140px]">
          <Select
            label="Formato"
            value={exportFormat}
            options={[
              { value: 'mp3', label: 'MP3' },
              { value: 'wav', label: 'WAV' },
            ]}
            onChange={(event) => setExportFormat(event.target.value as AudioExportFormat)}
          />
        </div>
        {exportFormat === 'mp3' ? (
          <div className="w-[160px]">
            <Select
              label="Qualidade"
              value={String(bitrate)}
              options={[
                { value: '192', label: '192 kbps' },
                { value: '256', label: '256 kbps' },
                { value: '320', label: '320 kbps' },
              ]}
              onChange={(event) => setBitrate(Number(event.target.value) as Mp3Bitrate)}
            />
          </div>
        ) : null}
        <Button variant="secondary" icon={<FolderOpen className="h-4 w-4" />} onClick={() => void chooseFolder()}>
          {folderLabel}
        </Button>
        <Button icon={<Download className="h-4 w-4" />} disabled={busy || track.cuts.length === 0} onClick={() => void exportAll()}>
          Exportar todos
        </Button>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={busy}
            className="rounded-2xl border border-border-soft bg-card p-4 text-left hover:border-accent/40 disabled:opacity-50"
            onClick={() => void requestPreset(preset.id)}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              {preset.id === 'estrutura' ? <Sparkles className="h-4 w-4 text-accent" /> : <Scissors className="h-4 w-4 text-accent" />}
              {preset.label}
            </div>
            <p className="mt-1 text-xs text-muted">{preset.hint}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {track.cuts.map((cut, index) => (
          <Card key={cut.id} className={cut.id === selected?.id ? 'border-accent/40' : ''}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <Input
                  label={`Corte ${index + 1}`}
                  value={cut.label}
                  onChange={(event) => {
                    applyLocal(
                      {
                        cuts: renameCut(track.cuts, cut.id, event.target.value),
                        cutMode: track.cutMode,
                        selectedId: cut.id,
                        appliedPreset: track.appliedPreset ?? null,
                      },
                      false,
                    )
                  }}
                />
              </div>
              <div className="w-[150px]">
                <TimeField
                  label="Início"
                  value={cut.start}
                  onCommit={(value) => changeCut(cut.id, value, cut.end, true)}
                />
              </div>
              <div className="w-[150px]">
                <TimeField
                  label="Fim"
                  value={cut.end}
                  onCommit={(value) => changeCut(cut.id, cut.start, value, true)}
                />
              </div>
              <p className="pb-3 text-xs text-muted">{formatTimecode(cut.end - cut.start)}</p>
              {cut.reason ? (
                <p className="pb-3 text-[11px] text-muted">
                  Corte sugerido pela IA{cut.confidence != null ? ` · ${Math.round(cut.confidence * 100)}%` : ''}
                </p>
              ) : null}
              <Button
                variant="secondary"
                className="h-11"
                onClick={() => playSelectedRegion(cut)}
              >
                Ouvir
              </Button>
              <Button
                className="h-11"
                icon={<Download className="h-4 w-4" />}
                disabled={busy}
                onClick={() => void exportOne(cut)}
              >
                Exportar
              </Button>
              <Button
                variant="ghost"
                className="h-11"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  applyLocal(
                    {
                      cuts: removeCutFromList(track.cuts, cut.id),
                      cutMode: 'manual',
                      selectedId: selectedId === cut.id ? track.cuts.find((item) => item.id !== cut.id)?.id ?? null : selectedId,
                      appliedPreset: track.appliedPreset ?? null,
                    },
                    true,
                  )
                }}
              >
                Remover
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={pendingPreset != null}
        title="Substituir os cortes atuais?"
        message="Os cortes atuais serão substituídos pelas sugestões automáticas. Você poderá ajustar tudo depois, inclusive com desfazer."
        confirmLabel="Aplicar"
        onClose={() => setPendingPreset(null)}
        onConfirm={() => {
          const preset = pendingPreset
          setPendingPreset(null)
          if (preset) void applyPreset(preset)
        }}
      />
    </PageShell>
  )
}
