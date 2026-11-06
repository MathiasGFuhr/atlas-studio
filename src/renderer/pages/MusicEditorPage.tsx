import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Captions,
  Download,
  FolderOpen,
  Mic2,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { MUSIC_LIPSYNC_PATH } from '@shared/workspaceCapabilities'
import {
  MUSIC_CAPTION_LANGUAGES,
  MUSIC_CAPTION_MODELS,
  parseMusicCaptionLanguage,
  parseMusicCaptionModel,
  type AutoCutPreset,
  type MusicAnalysis,
  type MusicCaptionLanguage,
  type MusicCaptionModel,
  type MusicSegment,
  type MusicTrack,
} from '@shared/musicAnalysis'
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
  nextSelectedAfterRemove,
  renameCut,
  sanitizeExportName,
  getCutMarkers,
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
import {
  autoCutByVocals,
  normalizeVocalCutBounds,
} from '@shared/audio/vocalAutoCut'
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
  const { push, pushError } = useToast()
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
  const [pendingVocalAutoCut, setPendingVocalAutoCut] = useState(false)
  const [autoCutMinSec, setAutoCutMinSec] = useState(15)
  const [autoCutMaxSec, setAutoCutMaxSec] = useState(25)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [splitFlash, setSplitFlash] = useState(false)
  const [captionBusy, setCaptionBusy] = useState(false)
  const [captionLanguage, setCaptionLanguage] = useState<MusicCaptionLanguage>('pt')
  const [captionModel, setCaptionModel] = useState<MusicCaptionModel>('medium')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selected = useMemo(
    () => track?.cuts.find((cut) => cut.id === selectedId) ?? null,
    [track, selectedId],
  )
  const nextCutSeconds = useMemo(() => {
    if (!track || track.duration <= 0) return 0
    const markers = getCutMarkers(track.cuts, track.duration)
    const origin = markers.reduce((last, marker) => (marker.time <= playhead + 0.001 ? marker.time : last), 0)
    return Math.max(0, playhead - origin)
  }, [playhead, track])

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
        const generated = current.cutMode !== 'manual'
        if (generated) {
          nextTrack = {
            ...nextTrack,
            cutMode: 'manual',
            appliedPreset: null,
            cuts: [],
            selectedId: null,
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
        if (generated) {
          await api.music.update(id, {
            duration: nextTrack.duration,
            cutMode: 'manual',
            cuts: [],
            appliedPreset: null,
            selectedId: null,
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
        setCaptionLanguage(parseMusicCaptionLanguage(nextTrack.captionsLanguage))
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
          pushError(error, 'Não foi possível abrir a música')
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
  }, [api, id, navigate, push, pushError])

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
      void persist(patch).catch((error) => pushError(error, 'Não foi possível salvar os cortes'))
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
      pushError(error, 'Não foi possível reproduzir o áudio')
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
    const audio = audioRef.current
    const limit = track.duration
    const time =
      audio && Number.isFinite(audio.currentTime) ? Math.min(Math.max(audio.currentTime, 0), limit) : playhead
    const cuts = splitAtPlayhead(track.cuts, time, limit)
    const right = cuts.find((cut) => Math.abs(cut.start - time) <= 0.2)
    applyLocal(
      {
        cuts,
        cutMode: 'manual',
        selectedId: right?.id ?? selectedId,
        appliedPreset: track.appliedPreset ?? null,
      },
      true,
    )
    setSplitFlash(true)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setSplitFlash(false), 260)
  }

  async function generateCaptions() {
    if (!track || captionBusy) return
    setCaptionBusy(true)
    try {
      const updated = await api.music.transcribe(track.id, captionLanguage, captionModel)
      if (updated) {
        setTrack((current) =>
          current
            ? {
                ...current,
                captions: updated.captions ?? [],
                captionsLanguage: updated.captionsLanguage ?? captionLanguage,
              }
            : updated,
        )
      }
      push(updated?.captions.length ? 'Legenda gerada.' : 'Nenhuma fala encontrada.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível gerar a legenda')
    } finally {
      setCaptionBusy(false)
    }
  }

  async function saveCaptionsFile() {
    if (!track) return
    setBusy(true)
    try {
      const saved = await api.music.exportSrt(track.id)
      if (saved) push('Legenda salva.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível salvar a legenda')
    } finally {
      setBusy(false)
    }
  }

  async function importCaptionsFile() {
    if (!track || captionBusy) return
    setBusy(true)
    try {
      const updated = await api.music.importSrt(track.id)
      if (!updated) return
      setTrack((current) =>
        current
          ? {
              ...current,
              captions: updated.captions ?? [],
              captionsLanguage: updated.captionsLanguage ?? current.captionsLanguage,
            }
          : updated,
      )
      push(
        updated.captions.length
          ? `Legenda importada · ${updated.captions.length} trechos.`
          : 'Nenhuma legenda encontrada no SRT.',
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível importar o SRT')
    } finally {
      setBusy(false)
    }
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

  function deleteSelectedCut(cutId = selectedId) {
    if (!track || !cutId) return
    if (!track.cuts.some((cut) => cut.id === cutId)) return
    applyLocal(
      {
        cuts: removeCutFromList(track.cuts, cutId),
        cutMode: 'manual',
        selectedId: nextSelectedAfterRemove(track.cuts, cutId),
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

  function applyVocalAutoCut() {
    if (!track || !analysis) return
    setIaError(null)
    setBusy(true)
    try {
      setIaProgress('Detectando canto e instrumentais...')
      const bounds = normalizeVocalCutBounds(autoCutMinSec, autoCutMaxSec)
      setAutoCutMinSec(bounds.minSec)
      setAutoCutMaxSec(bounds.maxSec)
      setIaProgress('Criando cortes conforme a música...')
      const rawCuts = autoCutByVocals(analysis, {
        minSec: bounds.minSec,
        maxSec: bounds.maxSec,
        captions: track.captions ?? [],
        samples: samplesRef.current,
      })
      const cuts = fitCutsToExactDuration(rawCuts, analysis.duration)
      if (cuts.length === 0) {
        setIaError('Não foi possível criar cortes com esses tempos. Ajuste o mínimo e o máximo.')
        return
      }
      applyLocal(
        {
          cuts,
          cutMode: 'automatico',
          selectedId: cuts[0]?.id ?? null,
          appliedPreset: null,
        },
        true,
      )
      setCodexNotice(
        (track.captions?.length ?? 0) > 0
          ? 'Cortes baseados na legenda e na dinâmica da faixa. Durações variam dentro do mínimo e do máximo.'
          : 'Cortes pela análise de áudio (sem legenda). Gere a legenda para afinar a detecção de canto.',
      )
      push(`Corte automático · ${cuts.length} trechos.`, 'success')
    } catch (error) {
      pushError(error, 'Falha no corte automático')
    } finally {
      setBusy(false)
      setIaProgress(null)
    }
  }

  function requestVocalAutoCut() {
    if (!track || !analysis) return
    if (track.cuts.length > 0) {
      setPendingVocalAutoCut(true)
      return
    }
    applyVocalAutoCut()
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
      pushError(error, 'Falha ao exportar o corte')
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
      pushError(error, 'Falha ao exportar os cortes')
    } finally {
      setBusy(false)
    }
  }

  async function chooseFolder() {
    const folder = await api.music.chooseExportFolder()
    if (folder) setExportFolder(folder)
  }

  async function sendCutsToLipSync(cuts?: MusicSegment[]) {
    if (!track) return
    const selectedCuts = cuts?.length ? cuts : track.cuts
    if (selectedCuts.length === 0) {
      push('Faça pelo menos um corte antes de enviar ao LipSync.', 'error')
      return
    }
    if (!track.projectId) {
      push('Vincule esta faixa a um projeto de música antes de enviar ao LipSync.', 'error')
      return
    }
    setBusy(true)
    try {
      const result = await api.music.exportCutsToLipSync({
        trackId: track.id,
        format: exportFormat,
        bitrate,
        cuts: selectedCuts.map((cut) => ({ start: cut.start, end: cut.end, label: cut.label })),
      })
      if (!result) return
      setExportFolder(result.folder)
      push(
        `${result.refs.length} corte${result.refs.length === 1 ? '' : 's'} baixados na pasta e enviados ao LipSync.`,
        'success',
      )
      navigate(MUSIC_LIPSYNC_PATH)
    } catch (error) {
      pushError(error, 'Não foi possível enviar ao LipSync')
    } finally {
      setBusy(false)
    }
  }

  // O handler lê o estado mais recente via ref; o listener é registrado uma vez só
  // (antes era recriado a cada render, inclusive a cada frame do playhead).
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  keyHandlerRef.current = onKey
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event)
    window.addEventListener('keydown', listener, true)
    return () => {
      window.removeEventListener('keydown', listener, true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  function onKey(event: KeyboardEvent) {
    if (isTypingTarget(event.target)) return
    if (event.code === 'Space') {
      event.preventDefault()
      togglePlayPause()
      return
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      if (event.repeat) return
      cutAtPlayhead()
      return
    }
    if ((event.key === 's' || event.key === 'S') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      cutAtPlayhead()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!selectedId || !track) return
      event.preventDefault()
      deleteSelectedCut(selectedId)
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
  const captions = track.captions ?? []
  const liveCaption = captions.find((caption) => playhead >= caption.start && playhead < caption.end)?.text ?? ''

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
        subtitle="Ouça a faixa, marque o ponto e corte. O arquivo original não é alterado."
      />

      <div data-tour="page-actions" className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-border-soft bg-card px-4 py-3">
        <Button
          variant="ghost"
          onClick={() =>
            navigate(track.projectId ? `/musica/projetos/${track.projectId}` : '/musica/faixas')
          }
        >
          ← Voltar
        </Button>
        <Button
          type="button"
          className="h-12 px-5"
          icon={playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          onClick={togglePlayPause}
          title="Espaço: play/pause"
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <div className="min-w-[8.5rem]">
          <p className="font-mono text-2xl leading-none text-text tabular-nums">{formatTimecode(playhead)}</p>
          <p className="mt-1 text-xs text-muted">de {formatTimecode(track.duration)}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Ctrl+Z" icon={<Undo2 className="h-4 w-4" />}>
            Desfazer
          </Button>
          <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Ctrl+Y" icon={<Redo2 className="h-4 w-4" />}>
            Refazer
          </Button>
          <div className="flex h-11 items-center gap-1 rounded-xl border border-border-soft bg-elevated px-2 text-sm text-muted">
            <button type="button" className="px-2 py-1 hover:text-text" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} aria-label="Diminuir zoom">
              −
            </button>
            <span className="min-w-[3.5rem] text-center font-medium text-text">{Math.round(zoom * 100)}%</span>
            <button type="button" className="px-2 py-1 hover:text-text" onClick={() => setZoom((value) => Math.min(8, Number((value + 0.25).toFixed(2))))} aria-label="Aumentar zoom">
              +
            </button>
          </div>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border-soft bg-elevated px-3 text-muted">
            <button type="button" onClick={() => setMuted((value) => !value)} title={muted ? 'Ativar som' : 'Mudo'}>
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              className="w-24"
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
          trackName={track.name}
          captions={captions}
          flash={splitFlash}
          onSeek={scrubTo}
          onSelect={(cutId, time) => {
            setSelectedId(cutId)
            scrubTo(time)
          }}
          onDeleteCut={(cutId) => deleteSelectedCut(cutId)}
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
        {liveCaption ? (
          <p className="mt-4 min-h-12 rounded-xl bg-elevated px-4 py-3 text-center text-lg leading-snug text-text">
            {liveCaption}
          </p>
        ) : null}
        {captionBusy ? (
          <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
            Gerando com {MUSIC_CAPTION_MODELS.find((item) => item.value === captionModel)?.label ?? captionModel}.
            A primeira vez do modelo pode baixar os arquivos. Em CPU, Medium e Large demoram mais.
          </p>
        ) : null}
      </Card>

      <Card className="mb-5">
        <p className="text-sm font-semibold text-text">Corte automático</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Separa trechos com canto e sem canto. Você define o mínimo e o máximo; o Atlas corta
          conforme a música — sem fatias iguais em sequência. Depois, clique num trecho e remova
          com Delete se quiser juntar de novo.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-[120px]">
            <Input
              label="Mínimo (s)"
              type="number"
              min={3}
              max={180}
              step={1}
              value={autoCutMinSec}
              disabled={busy || captionBusy}
              onChange={(event) => setAutoCutMinSec(Number(event.target.value))}
            />
          </div>
          <div className="w-[120px]">
            <Input
              label="Máximo (s)"
              type="number"
              min={4}
              max={240}
              step={1}
              value={autoCutMaxSec}
              disabled={busy || captionBusy}
              onChange={(event) => setAutoCutMaxSec(Number(event.target.value))}
            />
          </div>
          <Button
            className="h-11"
            icon={<Sparkles className="h-4 w-4" />}
            disabled={busy || captionBusy || !analysis}
            onClick={() => requestVocalAutoCut()}
          >
            {busy && iaProgress ? 'Analisando...' : 'Analisar e criar cortes'}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Com legenda, a detecção de canto fica mais precisa. Sem legenda, o Atlas usa a dinâmica do
          áudio.
        </p>
      </Card>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold text-text">Cortar</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Clique na faixa para escolher o ponto. O corte vai do último corte até o indicador.
          </p>
          <p className="mt-4 font-mono text-3xl leading-none text-text tabular-nums">{formatTimecode(nextCutSeconds)}</p>
          <p className="mt-1 text-xs text-muted">duração do próximo corte</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="h-12 px-5" icon={<Scissors className="h-4 w-4" />} onClick={cutAtPlayhead} title="Ctrl+B">
              Cortar aqui
            </Button>
            <Button variant="secondary" className="h-12" icon={<Plus className="h-4 w-4" />} onClick={addManualCut}>
              Novo trecho
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Ctrl+B corta. Delete remove o trecho selecionado. Espaço dá play e pause. Arraste as
            bordas para ajustar.
          </p>
          {selected ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-soft pt-4 text-sm text-muted">
              <span>
                Selecionado: <strong className="text-text">{selected.label}</strong>
              </span>
              <span>{formatTimecode(selected.end - selected.start)}</span>
              <label className="flex items-center gap-2 sm:ml-auto">
                <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
                Repetir
              </label>
              <Button variant="secondary" onClick={() => playSelectedRegion(selected)}>
                Ouvir corte
              </Button>
              <Button
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => deleteSelectedCut(selected.id)}
                title="Delete"
              >
                Remover
              </Button>
            </div>
          ) : null}
        </Card>

        <Card>
          <p className="text-sm font-semibold text-text">Legenda</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Gere aqui ou importe o SRT do CapCut. A legenda entra no tempo da faixa.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <Select
                label="Idioma"
                aria-label="Idioma da música"
                value={captionLanguage}
                disabled={captionBusy}
                options={MUSIC_CAPTION_LANGUAGES}
                onChange={(event) => setCaptionLanguage(parseMusicCaptionLanguage(event.target.value))}
              />
            </div>
            <div className="min-w-[240px] flex-[1.4]">
              <Select
                label="Modelo"
                aria-label="Modelo da legenda"
                value={captionModel}
                disabled={captionBusy}
                options={MUSIC_CAPTION_MODELS.map((item) => ({ value: item.value, label: item.label }))}
                onChange={(event) => setCaptionModel(parseMusicCaptionModel(event.target.value))}
              />
            </div>
            <Button
              className="h-11"
              icon={<Captions className="h-4 w-4" />}
              disabled={captionBusy}
              onClick={() => void generateCaptions()}
            >
              {captionBusy ? 'Gerando...' : captions.length ? 'Gerar de novo' : 'Gerar legenda'}
            </Button>
            <Button
              variant="secondary"
              className="h-11"
              icon={<Upload className="h-4 w-4" />}
              disabled={busy || captionBusy}
              onClick={() => void importCaptionsFile()}
            >
              Importar SRT
            </Button>
            {captions.length > 0 ? (
              <Button variant="secondary" className="h-11" disabled={busy} onClick={() => void saveCaptionsFile()}>
                Salvar SRT
              </Button>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {MUSIC_CAPTION_MODELS.find((item) => item.value === captionModel)?.hint}
            {captionLanguage === 'en' &&
            (captionModel === 'tiny' ||
              captionModel === 'base' ||
              captionModel === 'small' ||
              captionModel === 'medium')
              ? ' Em inglês, o Atlas usa a variante só-inglês (.en), que costuma acertar mais.'
              : null}
          </p>
        </Card>
      </div>

      <Card className="mb-5">
        <p className="mb-4 text-sm font-semibold text-text">Exportar</p>
        <div className="flex flex-wrap items-end gap-3">
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
          <Button variant="secondary" className="h-11 max-w-full" icon={<FolderOpen className="h-4 w-4" />} onClick={() => void chooseFolder()}>
            <span className="max-w-[240px] truncate">{folderLabel}</span>
          </Button>
          <Button className="h-11" icon={<Download className="h-4 w-4" />} disabled={busy || track.cuts.length === 0} onClick={() => void exportAll()}>
            Exportar todos
          </Button>
          <Button
            variant="secondary"
            className="h-11"
            icon={<Mic2 className="h-4 w-4" />}
            disabled={busy || track.cuts.length === 0}
            onClick={() => void sendCutsToLipSync()}
            title="Escolhe a pasta, baixa os cortes e cria um card no LipSync para cada trecho"
          >
            Enviar ao LipSync
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Ao enviar, você escolhe a pasta: os áudios são baixados ali e cada corte vira um card no LipSync.
        </p>
      </Card>

      <div className="space-y-3">
        {track.cuts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-sm text-muted">
            Nenhum corte ainda. A faixa está inteira — corte no ponto que quiser.
          </p>
        ) : null}
        {track.cuts.map((cut, index) => (
          <Card key={cut.id} className={cut.id === selected?.id ? 'border-accent/50' : ''}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm font-semibold text-text">Corte {index + 1}</p>
              <p className="font-mono text-sm text-muted">{formatTimecode(cut.end - cut.start)}</p>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_150px_150px]">
              <Input
                label="Nome"
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
              <TimeField
                label="Início"
                value={cut.start}
                onCommit={(value) => changeCut(cut.id, value, cut.end, true)}
              />
              <TimeField
                label="Fim"
                value={cut.end}
                onCommit={(value) => changeCut(cut.id, cut.start, value, true)}
              />
            </div>
            {cut.reason ? (
              <p className="mt-3 text-xs text-muted">
                Corte sugerido pela IA{cut.confidence != null ? ` · ${Math.round(cut.confidence * 100)}%` : ''}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => playSelectedRegion(cut)}>
                Ouvir
              </Button>
              <Button icon={<Download className="h-4 w-4" />} disabled={busy} onClick={() => void exportOne(cut)}>
                Exportar
              </Button>
              <Button
                variant="secondary"
                icon={<Mic2 className="h-4 w-4" />}
                disabled={busy}
                onClick={() => void sendCutsToLipSync([cut])}
              >
                LipSync
              </Button>
              <Button
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => deleteSelectedCut(cut.id)}
                title="Delete"
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
      <ConfirmDialog
        open={pendingVocalAutoCut}
        title="Substituir os cortes atuais?"
        message="Os cortes atuais serão substituídos pelo corte automático (canto e instrumental). Você pode ajustar e desfazer depois."
        confirmLabel="Criar cortes"
        onClose={() => setPendingVocalAutoCut(false)}
        onConfirm={() => {
          setPendingVocalAutoCut(false)
          applyVocalAutoCut()
        }}
      />
    </PageShell>
  )
}
