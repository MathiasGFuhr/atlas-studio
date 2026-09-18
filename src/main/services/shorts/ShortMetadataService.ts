import type {
  ShortsClip,
  ShortsCopyFields,
  ShortsEditorialContext,
  ShortsJob,
  ShortsProfile,
} from '../../../shared/shorts'
import { cuesForClip } from '../../../shared/shortsExport'
import {
  fallbackShortsCopy,
  type ShortsCopyClipInput,
} from '../../../shared/antigravity/shortsCopy'
import type { AudioFeatureAnalysis } from '../../../shared/shorts/audioFeatures'
import { audioEventsNear, summarizeAudioEvents } from '../../../shared/shorts/audioFeatures'
import type { AntigravityService } from '../antigravity/AntigravityService'
import type { ExtractedKeyframe } from './SceneAnalysisService'

export class ShortMetadataService {
  constructor(private readonly antigravity: AntigravityService) {}

  toCopyInputs(input: {
    clips: ShortsClip[]
    transcript: ShortsJob['transcript']
    focus?: ShortsClip
    audio?: AudioFeatureAnalysis | null
    frames?: ExtractedKeyframe[]
    clipMediaByIndex?: Map<number, string>
    watchedVideo?: boolean
    sceneFrames?: (start: number, end: number) => ExtractedKeyframe[]
  }): ShortsCopyClipInput[] {
    const targets = input.focus ? [input.focus] : input.clips
    return targets.map((clip) => {
      const events = input.audio ? audioEventsNear(input.audio, clip.start, clip.end) : []
      const frames = input.sceneFrames?.(clip.start, clip.end) ?? []
      return {
        index: clip.index,
        start: clip.start,
        end: clip.end,
        score: clip.score,
        reason: clip.reason,
        hook: clip.hook,
        transcript: input.transcript.filter(
          (cue) => cue.end > clip.start && cue.start < clip.end && cue.text.trim(),
        ),
        currentTitle: clip.title,
        currentDescription: clip.description,
        usedTitles: input.clips
          .filter((item) => item.id !== clip.id)
          .map((item) => item.title.trim())
          .filter(Boolean),
        audioSummary: events.length ? summarizeAudioEvents({ ...(input.audio as AudioFeatureAnalysis), events }, 8) : '',
        keyframePaths: frames.map((item) => item.path),
        clipMediaPath: input.clipMediaByIndex?.get(clip.index) ?? null,
        watchedClip: Boolean(input.watchedVideo && input.clipMediaByIndex?.get(clip.index)),
      }
    })
  }

  async generate(input: {
    job: ShortsJob
    clips: ShortsClip[]
    fields: ShortsCopyFields
    editorial: ShortsEditorialContext
    copyInputs: ShortsCopyClipInput[]
    focus?: ShortsClip
    model?: string | null
    addDirs?: string[]
  }): Promise<ShortsClip[]> {
    if (input.copyInputs.length === 0) return input.clips
    try {
      const copies = await this.antigravity.generateShortsCopies({
        profile: input.job.profile as ShortsProfile,
        editorial: input.editorial,
        fileName: input.job.sourceName,
        videoDuration: input.job.probe?.duration ?? Math.max(...input.clips.map((clip) => clip.end), 0),
        fields: input.fields,
        clips: input.copyInputs,
        model: input.model,
        addDirs: input.addDirs,
      })
      const byIndex = new Map(copies.map((item) => [item.index, item]))
      return input.clips.map((clip) => {
        const copy = byIndex.get(clip.index)
        if (!copy || (input.focus && clip.id !== input.focus.id)) return clip
        const next = { ...clip }
        if (copy.hook?.trim() && input.fields === 'all') next.hook = copy.hook.trim()
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
}
