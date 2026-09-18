import type {
  ShortsDurationMode,
  ShortsLocalCandidate,
  ShortsProfile,
  TranscriptCue,
} from '../../../shared/shorts'
import type { AudioFeatureAnalysis } from '../../../shared/shorts/audioFeatures'
import { summarizeAudioEvents } from '../../../shared/shorts/audioFeatures'
import { fallbackScoreFromSignals, normalizeScoreDimensions, scoreFromDimensions } from '../../../shared/shorts/clipScoring'
import { formatUnderstandingForPrompt, normalizeProposedCandidates, type VideoUnderstanding } from '../../../shared/shorts/videoUnderstanding'
import { toRankedWindows, type ShortsRankedWindow } from '../../../shared/shortsDiversity'
import { durationBounds } from '../../../shared/shortsDuration'
import { buildLocalShortsCandidates } from '../../../shared/shortsMoments'
import { finalizeShortsSelection } from '../../../shared/shortsSelection'
import {
  buildCandidateProposalPrompt,
  SHORTS_CANDIDATE_SCHEMA,
} from '../../../shared/antigravity/shortsUnderstanding'
import type { AntigravityService } from '../antigravity/AntigravityService'
import type { ExtractedKeyframe } from './SceneAnalysisService'

export class ShortCandidateService {
  constructor(private readonly antigravity: AntigravityService) {}

  buildLocal(input: {
    profile: ShortsProfile
    duration: number
    requestedDuration: number
    durationMode: ShortsDurationMode
    count: number
    analysis: AudioFeatureAnalysis | null
    scenes: Array<{ time: number }>
    cues: TranscriptCue[]
  }): ShortsLocalCandidate[] {
    return buildLocalShortsCandidates(input)
  }

  async propose(input: {
    profile: ShortsProfile
    duration: number
    clipCount: number
    requestedDuration: number
    durationMode: ShortsDurationMode
    fileName: string
    mediaPath: string | null
    watchedVideo: boolean
    understanding: VideoUnderstanding
    keyframes?: ExtractedKeyframe[]
    audio?: AudioFeatureAnalysis | null
    transcript: TranscriptCue[]
    localCandidates: ShortsLocalCandidate[]
    model?: string | null
    addDirs?: string[]
  }): Promise<{ ranked: ShortsRankedWindow[]; notes: string | null }> {
    const localHints = input.localCandidates
      .slice(0, 18)
      .map((item) => `${item.id}: ${item.start.toFixed(1)}–${item.end.toFixed(1)}s ${item.reason}`)
      .join('\n')
    try {
      const raw = await this.antigravity.runMediaStructuredPrompt({
        schemaFile: 'shorts-candidates-schema.json',
        schema: SHORTS_CANDIDATE_SCHEMA,
        prompt: buildCandidateProposalPrompt({
          profile: input.profile,
          duration: input.duration,
          clipCount: input.clipCount,
          requestedDuration: input.requestedDuration,
          durationMode: input.durationMode,
          fileName: input.fileName,
          mediaPath: input.mediaPath,
          watchedVideo: input.watchedVideo,
          understanding: input.understanding,
          keyframeIndex: input.keyframes?.map((item) => ({ time: item.time, path: item.path })),
          audioSummary: input.audio ? summarizeAudioEvents(input.audio, 18) : '',
          transcriptPreview: input.transcript
            .filter((cue) => cue.text.trim())
            .slice(0, 160)
            .map((cue) => `[${cue.start.toFixed(1)}-${cue.end.toFixed(1)}] ${cue.text.trim()}`)
            .join('\n'),
          localHints,
        }),
        invalidMessage: 'A IA não devolveu candidatos válidos.',
        timeoutMs: input.watchedVideo ? 10 * 60_000 : 4 * 60_000,
        printTimeout: input.watchedVideo ? '8m' : '4m',
        model: input.model,
        addDirs: input.addDirs,
        skipPermissions: Boolean(input.addDirs?.length),
      })
      const proposed = normalizeProposedCandidates(raw, {
        duration: input.duration,
        maxCount: input.clipCount + 4,
      })
      const ranked = proposed.map((item, index) => {
        const dims = normalizeScoreDimensions(item.dimensions)
        const overlapHint = 0
        const score = dims
          ? scoreFromDimensions(dims, { overlapPenalty: overlapHint })
          : fallbackScoreFromSignals({
              visualValue: item.visualReason ? 75 : 50,
              audioValue: item.audioReason ? 75 : 50,
              speechValue: item.reason ? 60 : 40,
              durationFit: 75,
            })
        return {
          id: `ai-${index + 1}`,
          start: item.start,
          end: item.end,
          score: item.score && item.score > 0 ? Math.max(0, Math.min(100, Math.round(item.score))) : score,
          reason: [item.reason, item.visualReason, item.audioReason].filter(Boolean).join(' · '),
          source: 'ai' as const,
        }
      })
      const notes = typeof raw.notes === 'string' ? raw.notes.trim() : ''
      return { ranked: toRankedWindows(ranked), notes: notes || null }
    } catch (error) {
      return {
        ranked: [],
        notes: error instanceof Error ? error.message : 'A IA não devolveu candidatos válidos.',
      }
    }
  }

  finalize(input: {
    ranked: ShortsRankedWindow[]
    fallback: ShortsRankedWindow[]
    clipCount: number
    videoDuration: number
    requestedDuration: number
    durationMode: ShortsDurationMode
    profile: ShortsProfile
    cues: TranscriptCue[]
  }) {
    return finalizeShortsSelection(input)
  }

  constrainToDuration(
    clip: { start: number; end: number },
    input: { duration: number; requestedDuration: number; durationMode: ShortsDurationMode },
  ) {
    const bounds = durationBounds(input.requestedDuration, input.duration, input.durationMode)
    let start = Math.max(0, Math.min(input.duration, clip.start))
    let end = Math.max(0, Math.min(input.duration, clip.end))
    if (end < start) {
      const swap = start
      start = end
      end = swap
    }
    if (input.durationMode === 'exact') {
      end = Math.min(input.duration, start + bounds.target)
      if (end - start < bounds.target - 0.12) start = Math.max(0, end - bounds.target)
    } else {
      if (end - start < bounds.min) end = Math.min(input.duration, start + bounds.min)
      if (end - start > bounds.max) end = Math.min(input.duration, start + bounds.max)
      if (end - start < bounds.min) start = Math.max(0, end - bounds.min)
    }
    return { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 }
  }

  understandingHint(understanding: VideoUnderstanding): string {
    return formatUnderstandingForPrompt(understanding)
  }
}
