import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/types'
import type { ShortsAnalyzeInput, ShortsClip, ShortsJob, ShortsProgressEvent } from '../../../shared/shorts'
import { capRequestedDuration, constrainClipWindow } from '../../../shared/shortsDuration'
import { analyzeMusic } from '../../../shared/musicAnalysis'
import { decodeWavPcm } from '../../../shared/decodeWav'
import { buildLocalShortsCandidates, snapClipToCues } from '../../../shared/shortsMoments'
import { normalizeShortsAnalysis, SHORTS_ANALYSIS_FAIL_MESSAGE } from '../../../shared/antigravity/shortsAnalysis'
import { shortsRepository } from '../../repositories/shortsRepository'
import { getUserDataPath } from '../../paths'
import type { AntigravityService } from '../antigravity/AntigravityService'
import {
  detectScenes,
  detectSilence,
  extractAudioWav,
  probeVideo,
} from '../media/ffmpegVideo'
import { cuesFromSilence, transcribeLocalAudio } from './transcribeLocal'

function jobDir(id: string) {
  return path.join(getUserDataPath(), 'shorts', id)
}

function emitProgress(getWindow: () => BrowserWindow | null, event: ShortsProgressEvent) {
  const win = getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.shorts.progress, event)
  }
}

function toClips(
  raw: Array<{ start: number; end: number; score: number; reason: string; hook?: string }>,
  duration: number,
): ShortsClip[] {
  return raw.map((item, index) => ({
    id: randomUUID(),
    index: index + 1,
    start: item.start,
    end: Math.min(duration, item.end),
    score: item.score,
    reason: item.reason,
    hook: item.hook ?? '',
    accepted: false,
    exportedPath: null,
    focusStrategy: 'center',
  }))
}

export async function analyzeShortsJob(input: {
  request: ShortsAnalyzeInput
  antigravity: AntigravityService
  getWindow: () => BrowserWindow | null
}): Promise<ShortsJob> {
  const job = shortsRepository.get(input.request.jobId)
  if (!job) throw new Error('Projeto de Shorts não encontrado.')
  if (!fs.existsSync(job.sourcePath)) {
    throw new Error('O vídeo original não está mais neste caminho. Importe de novo.')
  }

  const send = (stage: ShortsProgressEvent['stage'], message: string) =>
    emitProgress(input.getWindow, { jobId: job.id, stage, message })

  shortsRepository.update(job.id, {
    profile: input.request.profile,
    clipCount: input.request.clipCount,
    requestedDuration: input.request.requestedDuration,
    durationMode: input.request.durationMode,
    aspectMode: input.request.aspectMode,
    captionsEnabled: input.request.captionsEnabled,
    status: 'analyzing',
    errorMessage: null,
  })

  try {
    send('analyzing', 'Analisando vídeo...')
    const probe = await probeVideo(job.sourcePath)
    shortsRepository.update(job.id, { probe })

    send('extracting_audio', 'Extraindo áudio...')
    const dir = jobDir(job.id)
    fs.mkdirSync(dir, { recursive: true })
    const audioPath = path.join(dir, 'audio.wav')
    await extractAudioWav(job.sourcePath, audioPath)

    send('transcribing', 'Transcrevendo...')
    const silence = await detectSilence(audioPath)
    const localTranscript = await transcribeLocalAudio(audioPath, dir)
    const transcript =
      localTranscript.cues.length > 0 ? localTranscript.cues : cuesFromSilence(probe.duration, silence)
    const transcriptSource = localTranscript.cues.length > 0 ? localTranscript.source : silence.length > 0 ? 'silence' : 'none'

    send('detecting_moments', 'Analisando melhores momentos...')
    const scenes = (await detectScenes(job.sourcePath)).map((time) => ({ time }))
    let analysis = null
    try {
      const wav = fs.readFileSync(audioPath)
      const decoded = decodeWavPcm(wav)
      analysis = analyzeMusic(decoded.samples, decoded.sampleRate)
      if (silence.length > 0) analysis = { ...analysis, silence }
    } catch {
      analysis = {
        duration: probe.duration,
        sampleRate: 16000,
        energy: [],
        frameDuration: 0.046,
        silence,
        onsets: [],
      }
    }

    const durationCap = capRequestedDuration(input.request.requestedDuration, probe.duration)
    const requestedDuration = durationCap.requested
    const durationMode = input.request.durationMode

    const localCandidates = buildLocalShortsCandidates({
      profile: input.request.profile,
      duration: probe.duration,
      requestedDuration,
      durationMode,
      count: input.request.clipCount,
      analysis,
      scenes,
      cues: transcript.filter((cue) => cue.text.trim()),
    })

    send('preparing_cuts', 'Preparando cortes...')
    let aiClips = [] as ReturnType<typeof normalizeShortsAnalysis>['clips']
    let notes: string | null = durationCap.capped ? durationCap.message : null
    try {
      const analyzed = await input.antigravity.analyzeShorts({
        profile: input.request.profile,
        duration: probe.duration,
        clipCount: input.request.clipCount,
        requestedDuration,
        durationMode,
        fileName: job.sourceName,
        transcript: transcript.filter((cue) => cue.text.trim()).slice(0, 220),
        scenes,
        localCandidates,
        hasTranscript: transcriptSource === 'whisper',
      })
      aiClips = analyzed.clips
      notes = [notes, analyzed.notes].filter(Boolean).join('\n') || null
    } catch (error) {
      const fail = error instanceof Error ? error.message : SHORTS_ANALYSIS_FAIL_MESSAGE
      notes = [notes, fail].filter(Boolean).join('\n')
    }

    const merged =
      aiClips.length > 0
        ? aiClips
        : localCandidates.map((item) => ({
            start: item.start,
            end: item.end,
            score: item.score,
            reason: item.reason,
            hook: '',
          }))

    const snapped = merged.map((clip) => {
      const next = snapClipToCues(clip.start, clip.end, transcript, probe.duration, input.request.profile)
      const window = constrainClipWindow({
        start: next.start,
        end: durationMode === 'exact' ? next.start + requestedDuration : next.end,
        videoDuration: probe.duration,
        requestedDuration,
        mode: durationMode,
        moved: durationMode === 'exact' ? 'start' : 'both',
      })
      return { ...clip, start: window.start, end: window.end }
    })

    const clips = toClips(snapped.slice(0, input.request.clipCount), probe.duration)
    if (transcriptSource !== 'whisper') {
      const extra =
        'Transcrição local completa não encontrada. Os cortes usaram áudio, cenas e o Antigravity só com timestamps — o vídeo original não foi enviado.'
      notes = notes ? `${notes}\n${extra}` : extra
    }

    return shortsRepository.update(job.id, {
      probe,
      clips,
      requestedDuration,
      durationMode,
      transcript,
      transcriptSource,
      analysisNotes: notes,
      errorMessage: null,
      status: clips.length > 0 ? 'ready' : 'error',
    })!
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao analisar o vídeo.'
    const current = shortsRepository.update(job.id, {
      status: 'error',
      errorMessage: message,
    })
    return current ?? job
  }
}
