import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/types'
import type {
  ShortsAnalyzeInput,
  ShortsClip,
  ShortsCopyFields,
  ShortsJob,
  ShortsProgressEvent,
} from '../../../shared/shorts'
import { capRequestedDuration } from '../../../shared/shortsDuration'
import { analyzeMusic } from '../../../shared/musicAnalysis'
import { decodeWavPcm } from '../../../shared/decodeWav'
import { shortsCandidatePoolSize, toRankedWindows } from '../../../shared/shortsDiversity'
import { buildLocalShortsCandidates } from '../../../shared/shortsMoments'
import { finalizeShortsSelection } from '../../../shared/shortsSelection'
import {
  normalizeShortsAnalysis,
  SHORTS_ANALYSIS_FAIL_MESSAGE,
  shortsAiClipsToRanked,
} from '../../../shared/antigravity/shortsAnalysis'
import { logger } from '../logging/logger'
import {
  fallbackShortsCopy,
  type ShortsCopyClipInput,
} from '../../../shared/antigravity/shortsCopy'
import { cuesForClip } from '../../../shared/shortsExport'
import { mergeReanalysisClips } from '../../../shared/shortsProjectIdentity'
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
import { resolveShortsEditorialContext, resolveShortsLanguageFields, shortsLanguageAnalysisNote } from './editorialContext'

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
  raw: Array<{
    start: number
    end: number
    score: number
    reason: string
    hook?: string
    title?: string
    description?: string
    hashtags?: string[]
  }>,
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
    title: item.title ?? '',
    description: item.description ?? '',
    hashtags: item.hashtags ?? [],
    accepted: false,
    exportedPath: null,
    focusStrategy: 'center',
  }))
}

function toCopyInputs(
  clips: ShortsClip[],
  transcript: ShortsJob['transcript'],
  focus?: ShortsClip,
): ShortsCopyClipInput[] {
  const targets = focus ? [focus] : clips
  return targets.map((clip) => ({
    index: clip.index,
    start: clip.start,
    end: clip.end,
    score: clip.score,
    reason: clip.reason,
    hook: clip.hook,
    transcript: transcript.filter(
      (cue) => cue.end > clip.start && cue.start < clip.end && cue.text.trim(),
    ),
    currentTitle: clip.title,
    currentDescription: clip.description,
    usedTitles: clips
      .filter((item) => item.id !== clip.id)
      .map((item) => item.title.trim())
      .filter(Boolean),
  }))
}

async function attachShortsCopies(input: {
  job: ShortsJob
  clips: ShortsClip[]
  fields: ShortsCopyFields
  focus?: ShortsClip
  antigravity: AntigravityService
  send: (stage: ShortsProgressEvent['stage'], message: string) => void
}): Promise<ShortsClip[]> {
  const editorial = resolveShortsEditorialContext(input.job)
  input.send('writing_copy', 'Gerando títulos e descrições...')
  try {
    const copies = await input.antigravity.generateShortsCopies({
      profile: input.job.profile,
      editorial,
      fileName: input.job.sourceName,
      videoDuration: input.job.probe?.duration ?? Math.max(...input.clips.map((clip) => clip.end), 0),
      fields: input.fields,
      clips: toCopyInputs(input.clips, input.job.transcript, input.focus),
    })
    const byIndex = new Map(copies.map((item) => [item.index, item]))
    return input.clips.map((clip) => {
      const copy = byIndex.get(clip.index)
      if (!copy || (input.focus && clip.id !== input.focus.id)) return clip
      const next = { ...clip }
      if (input.fields !== 'description') next.title = copy.title.trim() || next.title
      if (input.fields !== 'title') {
        next.description = copy.description.trim() || next.description
        if (copy.hashtags.length) next.hashtags = copy.hashtags
      }
      if (!next.title.trim() || !next.description.trim()) {
        const fallback = fallbackShortsCopy({
          index: clip.index,
          hook: clip.hook,
          reason: clip.reason,
          transcript: cuesForClip(input.job.transcript, clip.start, clip.end),
        })
        if (!next.title.trim()) next.title = fallback.title
        if (!next.description.trim()) next.description = fallback.description
      }
      return next
    })
  } catch {
    return input.clips.map((clip) => {
      if (input.focus && clip.id !== input.focus.id) return clip
      if (clip.title.trim() && clip.description.trim() && input.fields === 'all') return clip
      const fallback = fallbackShortsCopy({
        index: clip.index,
        hook: clip.hook,
        reason: clip.reason,
        transcript: cuesForClip(input.job.transcript, clip.start, clip.end),
      })
      return {
        ...clip,
        title: input.fields === 'description' ? clip.title : clip.title.trim() || fallback.title,
        description: input.fields === 'title' ? clip.description : clip.description.trim() || fallback.description,
      }
    })
  }
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
    const transcriptLanguage = localTranscript.language
    const languageSeed = {
      ...(shortsRepository.get(job.id) ?? job),
      probe,
      transcript,
      transcriptSource,
      transcriptLanguage,
    }
    const languageFields = resolveShortsLanguageFields(languageSeed)
    shortsRepository.update(job.id, {
      probe,
      transcript,
      transcriptSource,
      ...languageFields,
    })

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
    const editorial = resolveShortsEditorialContext({
      ...(shortsRepository.get(job.id) ?? job),
      profile: input.request.profile,
      probe,
      transcript,
      transcriptSource,
      ...languageFields,
    })
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
        editorial,
      })
      aiClips = analyzed.clips
      notes = [notes, analyzed.notes].filter(Boolean).join('\n') || null
    } catch (error) {
      const fail = error instanceof Error ? error.message : SHORTS_ANALYSIS_FAIL_MESSAGE
      notes = [notes, fail].filter(Boolean).join('\n')
    }

    const fallback = toRankedWindows(localCandidates)
    const ranked = aiClips.length > 0 ? shortsAiClipsToRanked(aiClips) : fallback
    const selection = finalizeShortsSelection({
      ranked,
      fallback,
      clipCount: input.request.clipCount,
      videoDuration: probe.duration,
      requestedDuration,
      durationMode,
      profile: input.request.profile,
      cues: transcript,
    })
    logger.info('shorts.selection', {
      jobId: job.id,
      poolSize: shortsCandidatePoolSize(input.request.clipCount),
      generated: selection.diagnostics.generated,
      selected: selection.diagnostics.selected,
      discarded: selection.diagnostics.discarded,
    })

    const clips = toClips(
      selection.clips.map((clip) => ({
        start: clip.start,
        end: clip.end,
        score: clip.score,
        reason: clip.reason,
        hook: clip.hook,
      })),
      probe.duration,
    )
    if (selection.note) notes = notes ? `${notes}\n${selection.note}` : selection.note
    if (transcriptSource !== 'whisper') {
      const extra =
        'Transcrição local completa não encontrada. Os cortes usaram áudio, cenas e o Antigravity só com timestamps — o vídeo original não foi enviado.'
      notes = notes ? `${notes}\n${extra}` : extra
    }
    const languageNote = shortsLanguageAnalysisNote({
      ...(shortsRepository.get(job.id) ?? job),
      transcript,
      transcriptSource,
      ...languageFields,
    })
    if (languageNote) notes = notes ? `${notes}\n${languageNote}` : languageNote

    const latest = shortsRepository.get(job.id) ?? job
    const withCopy =
      clips.length > 0
        ? await attachShortsCopies({
            job: {
              ...latest,
              profile: input.request.profile,
              probe,
              clips,
              requestedDuration,
              durationMode,
              transcript,
              transcriptSource,
              ...languageFields,
            },
            clips,
            fields: 'all',
            antigravity: input.antigravity,
            send,
          })
        : clips

    const latestClips = shortsRepository.get(job.id)?.clips ?? job.clips
    const mergedClips = mergeReanalysisClips(latestClips, withCopy)

    return shortsRepository.update(job.id, {
      probe,
      clips: mergedClips,
      requestedDuration,
      durationMode,
      transcript,
      transcriptSource,
      ...languageFields,
      analysisNotes: notes,
      errorMessage: null,
      status: mergedClips.length > 0 ? 'ready' : 'error',
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

export async function regenerateShortsClipCopy(input: {
  jobId: string
  clipId: string
  fields: ShortsCopyFields
  antigravity: AntigravityService
  getWindow: () => BrowserWindow | null
}): Promise<ShortsJob> {
  const job = shortsRepository.get(input.jobId)
  if (!job) throw new Error('Projeto de Shorts não encontrado.')
  const clip = job.clips.find((item) => item.id === input.clipId)
  if (!clip) throw new Error('Corte não encontrado.')

  const send = (stage: ShortsProgressEvent['stage'], message: string) =>
    emitProgress(input.getWindow, { jobId: job.id, stage, message })

  const clips = await attachShortsCopies({
    job,
    clips: job.clips,
    fields: input.fields,
    focus: clip,
    antigravity: input.antigravity,
    send,
  })
  return shortsRepository.update(job.id, { clips })!
}
