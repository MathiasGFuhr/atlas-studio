import type { ShortsEditorialContext, ShortsProfile, TranscriptCue } from '../../../shared/shorts'
import type { AudioFeatureAnalysis } from '../../../shared/shorts/audioFeatures'
import { summarizeAudioEvents } from '../../../shared/shorts/audioFeatures'
import {
  emptyVideoUnderstanding,
  normalizeVideoUnderstanding,
  understandingHasSignal,
  type VideoUnderstanding,
} from '../../../shared/shorts/videoUnderstanding'
import { buildVideoUnderstandingPrompt, VIDEO_UNDERSTANDING_SCHEMA } from '../../../shared/antigravity/shortsUnderstanding'
import type { AntigravityService } from '../antigravity/AntigravityService'
import type { ExtractedKeyframe } from './SceneAnalysisService'

function transcriptPreview(cues: TranscriptCue[]): string {
  return cues
    .filter((cue) => cue.text.trim())
    .slice(0, 80)
    .map((cue) => `[${cue.start.toFixed(1)}-${cue.end.toFixed(1)}] ${cue.text.trim()}`)
    .join('\n')
}

export class VideoUnderstandingService {
  constructor(private readonly antigravity: AntigravityService) {}

  async understand(input: {
    profile: ShortsProfile
    duration: number
    fileName: string
    mediaPath: string | null
    watchedVideo: boolean
    keyframes?: ExtractedKeyframe[]
    audio?: AudioFeatureAnalysis | null
    transcript: TranscriptCue[]
    editorial?: ShortsEditorialContext
    model?: string | null
    addDirs?: string[]
  }): Promise<VideoUnderstanding> {
    try {
      const raw = await this.antigravity.runMediaStructuredPrompt({
        schemaFile: 'shorts-understanding-schema.json',
        schema: VIDEO_UNDERSTANDING_SCHEMA,
        prompt: buildVideoUnderstandingPrompt({
          profile: input.profile,
          duration: input.duration,
          fileName: input.fileName,
          mediaPath: input.mediaPath,
          watchedVideo: input.watchedVideo,
          keyframeIndex: input.keyframes?.map((item) => ({ time: item.time, path: item.path })),
          audio: input.audio,
          transcriptPreview: transcriptPreview(input.transcript),
          editorial: input.editorial,
        }),
        invalidMessage: 'A IA não devolveu a compreensão global do vídeo.',
        timeoutMs: input.watchedVideo ? 12 * 60_000 : 4 * 60_000,
        printTimeout: input.watchedVideo ? '10m' : '4m',
        model: input.model,
        addDirs: input.addDirs,
        skipPermissions: Boolean(input.addDirs?.length),
      })
      const value = normalizeVideoUnderstanding(raw)
      return understandingHasSignal(value) ? value : emptyVideoUnderstanding()
    } catch {
      return emptyVideoUnderstanding()
    }
  }

  audioSummary(audio: AudioFeatureAnalysis | null): string {
    return audio ? summarizeAudioEvents(audio) : ''
  }
}
