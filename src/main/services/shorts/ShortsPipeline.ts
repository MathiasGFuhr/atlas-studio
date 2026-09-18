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
import { toRankedWindows } from '../../../shared/shortsDiversity'
import { logger } from '../logging/logger'
import { mergeReanalysisClips } from '../../../shared/shortsProjectIdentity'
import { shortsRepository } from '../../repositories/shortsRepository'
import { getUserDataPath } from '../../paths'
import { settingsRepository } from '../../repositories/settingsRepository'
import type { AntigravityService } from '../antigravity/AntigravityService'
import type { AgentModelCatalog } from '../agents/AgentModelCatalog'
import { probeVideo } from '../media/ffmpegVideo'
import { resolveShortsEditorialContext, resolveShortsLanguageFields, shortsLanguageAnalysisNote } from './editorialContext'
import { loadShortsAnalysisPlan } from './ShortsAnalysisPlanner'
import { resolveAnalysisRuntime } from '../../../shared/shorts/analysisPlan'
import { AudioAnalysisService, audioWorkPath } from './AudioAnalysisService'
import { SceneAnalysisService } from './SceneAnalysisService'
import { TranscriptService } from './TranscriptService'
import { VideoProxyService } from './VideoProxyService'
import { VideoUnderstandingService } from './VideoUnderstandingService'
import { ShortCandidateService } from './ShortCandidateService'
import { ShortMetadataService } from './ShortMetadataService'
import { understandingHasSignal } from '../../../shared/shorts/videoUnderstanding'

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

export async function analyzeShortsJob(input: {
  request: ShortsAnalyzeInput
  antigravity: AntigravityService
  catalog: AgentModelCatalog
  getWindow: () => BrowserWindow | null
}): Promise<ShortsJob> {
  const job = shortsRepository.get(input.request.jobId)
  if (!job) throw new Error('Projeto de Shorts não encontrado.')
  if (!fs.existsSync(job.sourcePath)) {
    throw new Error('O vídeo original não está mais neste caminho. Importe de novo.')
  }

  const send = (stage: ShortsProgressEvent['stage'], message: string) =>
    emitProgress(input.getWindow, { jobId: job.id, stage, message })

  const allow =
    input.request.allowExternalVideoAnalysis ?? Boolean(settingsRepository.get().allowExternalVideoAnalysis)
  if (input.request.allowExternalVideoAnalysis != null) {
    settingsRepository.update({ allowExternalVideoAnalysis: Boolean(input.request.allowExternalVideoAnalysis) })
  }

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

  const audio = new AudioAnalysisService()
  const scenes = new SceneAnalysisService()
  const transcript = new TranscriptService()
  const proxy = new VideoProxyService()
  const understanding = new VideoUnderstandingService(input.antigravity)
  const candidates = new ShortCandidateService(input.antigravity)
  const metadata = new ShortMetadataService(input.antigravity)

  try {
    send('preparing_video', 'Preparando vídeo...')
    const plan = await loadShortsAnalysisPlan({
      antigravity: input.antigravity,
      catalog: input.catalog,
      allowExternalVideoAnalysis: allow,
    })
    const runtime = resolveAnalysisRuntime({
      plan,
      modelDecision: input.request.modelDecision,
      modelOverride: input.request.modelOverride,
      allowExternalVideoAnalysis: allow,
    })

    const probe = await probeVideo(job.sourcePath)
    shortsRepository.update(job.id, { probe })
    const dir = jobDir(job.id)
    fs.mkdirSync(dir, { recursive: true })
    const originalPath = job.sourcePath

    let proxyPath: string | null = null
    if (runtime.sendVideo) {
      try {
        proxyPath = await proxy.createAnalysisProxy({ sourcePath: originalPath, dir, probe })
      } catch (error) {
        logger.warn('shorts.proxy.failed', {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        })
        runtime.sendVideo = false
        runtime.mode = 'frames_audio_transcript'
        runtime.watchedVideoClaimAllowed = false
      }
    }

    send('analyzing_audio', 'Analisando áudio...')
    const audioPath = audioWorkPath(dir)
    await audio.extractWav(originalPath, audioPath)
    const audioAnalysis = await audio.analyze(audioPath, probe.duration)

    const localTranscript = await transcript.transcribe({
      audioPath,
      dir,
      duration: probe.duration,
    })
    send('detecting_language', 'Detectando idioma...')
    const languageSeed = {
      ...(shortsRepository.get(job.id) ?? job),
      probe,
      transcript: localTranscript.cues,
      transcriptSource: localTranscript.source,
      transcriptLanguage: localTranscript.language,
    }
    const languageFields = resolveShortsLanguageFields(languageSeed)
    shortsRepository.update(job.id, {
      probe,
      transcript: localTranscript.cues,
      transcriptSource: localTranscript.source,
      ...languageFields,
    })

    send('analyzing_visual', 'Analisando conteúdo visual...')
    const sceneTimes = await scenes.detect(originalPath)
    const durationCap = capRequestedDuration(input.request.requestedDuration, probe.duration)
    const requestedDuration = durationCap.requested
    const durationMode = input.request.durationMode
    const localCandidates = candidates.buildLocal({
      profile: input.request.profile,
      duration: probe.duration,
      requestedDuration,
      durationMode,
      count: input.request.clipCount,
      analysis: audioAnalysis,
      scenes: sceneTimes.map((time) => ({ time })),
      cues: localTranscript.cues.filter((cue) => cue.text.trim()),
    })
    const keyframeTimes = scenes.planTimes({
      duration: probe.duration,
      scenes: sceneTimes,
      audio: audioAnalysis,
      candidateEdges: localCandidates.flatMap((item) => [item.start, item.end]),
    })
    const framesDir = path.join(dir, 'frames')
    fs.mkdirSync(framesDir, { recursive: true })
    const keyframes = await scenes.extract({
      sourcePath: originalPath,
      dir: framesDir,
      times: keyframeTimes,
    })

    const editorial = resolveShortsEditorialContext({
      ...(shortsRepository.get(job.id) ?? job),
      profile: input.request.profile,
      probe,
      transcript: localTranscript.cues,
      transcriptSource: localTranscript.source,
      ...languageFields,
    })

    const addDirs: string[] = []
    if (runtime.sendVideo && proxyPath) addDirs.push(dir)
    else if (keyframes.length > 0) addDirs.push(framesDir)

    const watchedVideo = Boolean(runtime.sendVideo && proxyPath)
    send('understanding_structure', 'Compreendendo estrutura...')
    const global = await understanding.understand({
      profile: input.request.profile,
      duration: probe.duration,
      fileName: job.sourceName,
      mediaPath: watchedVideo ? proxyPath : null,
      watchedVideo,
      keyframes,
      audio: audioAnalysis,
      transcript: localTranscript.cues,
      editorial,
      model: runtime.model,
      addDirs,
    })
    if (global.language && !languageFields.contentLanguage) {
      const fromUnderstanding = resolveShortsLanguageFields({
        ...(shortsRepository.get(job.id) ?? job),
        probe,
        transcript: localTranscript.cues,
        transcriptSource: localTranscript.source,
        transcriptLanguage: localTranscript.language || global.language,
      })
      Object.assign(languageFields, fromUnderstanding)
    }

    send('selecting_moments', 'Selecionando momentos...')
    const proposed = await candidates.propose({
      profile: input.request.profile,
      duration: probe.duration,
      clipCount: input.request.clipCount,
      requestedDuration,
      durationMode,
      fileName: job.sourceName,
      mediaPath: watchedVideo ? proxyPath : null,
      watchedVideo,
      understanding: global,
      keyframes,
      audio: audioAnalysis,
      transcript: localTranscript.cues,
      localCandidates,
      model: runtime.model,
      addDirs,
    })

    send('validating_cuts', 'Validando cortes...')
    const fallback = toRankedWindows(localCandidates)
    const ranked = proposed.ranked.length > 0 ? proposed.ranked : fallback
    const selection = candidates.finalize({
      ranked,
      fallback,
      clipCount: input.request.clipCount,
      videoDuration: probe.duration,
      requestedDuration,
      durationMode,
      profile: input.request.profile,
      cues: localTranscript.cues,
    })
    logger.info('shorts.selection', {
      jobId: job.id,
      mode: runtime.mode,
      watchedVideo,
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

    let notes: string | null = durationCap.capped ? durationCap.message : null
    notes = [notes, proposed.notes, selection.note].filter(Boolean).join('\n') || null
    const languageNote = shortsLanguageAnalysisNote({
      ...(shortsRepository.get(job.id) ?? job),
      transcript: localTranscript.cues,
      transcriptSource: localTranscript.source,
      ...languageFields,
    })
    if (languageNote) notes = notes ? `${notes}\n${languageNote}` : languageNote
    if (watchedVideo && !understandingHasSignal(global)) {
      const extra = 'O proxy foi enviado à IA, mas a compreensão global veio incompleta. Os cortes ainda usaram o conteúdo audiovisual quando possível.'
      notes = notes ? `${notes}\n${extra}` : extra
    }
    if (!watchedVideo) {
      const extra = 'A IA não assistiu ao arquivo de vídeo. Análise por frames-chave, áudio e transcrição.'
      notes = notes ? `${notes}\n${extra}` : extra
    }

    const clipMediaByIndex = new Map<number, string>()
    if (watchedVideo && proxyPath) {
      for (const clip of clips) {
        try {
          const clipPath = await proxy.createClipProxy({
            sourcePath: proxyPath,
            dir,
            index: clip.index,
            start: clip.start,
            end: clip.end,
          })
          clipMediaByIndex.set(clip.index, clipPath)
        } catch {
          clipMediaByIndex.set(clip.index, proxyPath)
        }
      }
    }

    send('writing_copy', 'Criando títulos e descrições...')
    const latest = shortsRepository.get(job.id) ?? job
    const copyInputs = metadata.toCopyInputs({
      clips,
      transcript: localTranscript.cues,
      audio: audioAnalysis,
      watchedVideo,
      clipMediaByIndex,
      sceneFrames: (start, end) => scenes.clipFrames(keyframes, start, end),
    })
    const withCopy =
      clips.length > 0
        ? await metadata.generate({
            job: {
              ...latest,
              profile: input.request.profile,
              probe,
              clips,
              requestedDuration,
              durationMode,
              transcript: localTranscript.cues,
              transcriptSource: localTranscript.source,
              ...languageFields,
            },
            clips,
            fields: 'all',
            editorial,
            copyInputs,
            model: runtime.model,
            addDirs,
          })
        : clips

    const latestClips = shortsRepository.get(job.id)?.clips ?? job.clips
    const mergedClips = mergeReanalysisClips(latestClips, withCopy)
    const analysisMode = runtime.watchedVideoClaimAllowed ? 'audiovisual' : 'frames_audio_transcript'

    return shortsRepository.update(job.id, {
      probe,
      clips: mergedClips,
      requestedDuration,
      durationMode,
      transcript: localTranscript.cues,
      transcriptSource: localTranscript.source,
      ...languageFields,
      analysisMode,
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
  catalog?: AgentModelCatalog
  getWindow: () => BrowserWindow | null
}): Promise<ShortsJob> {
  const job = shortsRepository.get(input.jobId)
  if (!job) throw new Error('Projeto de Shorts não encontrado.')
  const clip = job.clips.find((item) => item.id === input.clipId)
  if (!clip) throw new Error('Corte não encontrado.')

  const send = (stage: ShortsProgressEvent['stage'], message: string) =>
    emitProgress(input.getWindow, { jobId: job.id, stage, message })
  send('writing_copy', 'Criando títulos e descrições...')

  const metadata = new ShortMetadataService(input.antigravity)
  const editorial = resolveShortsEditorialContext(job)
  const copyInputs = metadata.toCopyInputs({
    clips: job.clips,
    transcript: job.transcript,
    focus: clip,
    watchedVideo: job.analysisMode === 'audiovisual',
  })
  const clips = await metadata.generate({
    job,
    clips: job.clips,
    fields: input.fields,
    editorial,
    copyInputs,
    focus: clip,
  })
  return shortsRepository.update(job.id, { clips })!
}
