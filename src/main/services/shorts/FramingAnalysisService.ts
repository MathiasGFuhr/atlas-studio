import path from 'node:path'
import fs from 'node:fs'
import type { AudioFeatureAnalysis } from '../../../shared/shorts/audioFeatures'
import {
  detectSubjectsInRgb,
  planFramingSampleTimes,
  trackSubjects,
  type ShortsFramingSample,
} from '../../../shared/shortsFraming'
import { extractRgbSequence, FRAMING_RGB_HEIGHT, FRAMING_RGB_WIDTH } from '../media/ffmpegVideo'
import { logger } from '../logging/logger'

function vocalActivityAt(audio: AudioFeatureAnalysis | null, time: number): number {
  if (!audio?.energy?.length || !audio.frameDuration) return 0.45
  const idx = Math.max(0, Math.min(audio.energy.length - 1, Math.floor(time / audio.frameDuration)))
  let peak = 0.0001
  for (const value of audio.energy) if (value > peak) peak = value
  let activity = Math.min(1, (audio.energy[idx] ?? 0) / peak)
  if (
    audio.events.some(
      (event) =>
        (event.type === 'vocal_entry' || event.type === 'peak') && Math.abs(event.time - time) < 1.1,
    )
  ) {
    activity = Math.min(1, activity + 0.18)
  }
  return activity
}

export class FramingAnalysisService {
  async analyze(input: {
    sourcePath: string
    dir: string
    duration: number
    audio?: AudioFeatureAnalysis | null
  }): Promise<ShortsFramingSample[]> {
    const times = planFramingSampleTimes(input.duration)
    const interval = Math.max(0.75, times[1] ? times[1] - times[0] : 2)
    const outputPath = path.join(input.dir, 'framing.rgb')
    try {
      const sequence = await extractRgbSequence({
        sourcePath: input.sourcePath,
        outputPath,
        duration: input.duration,
        interval,
      })
      const frames = sequence.times.map((time, index) => {
        const start = index * sequence.frameSize
        const slice = sequence.buffer.subarray(start, start + sequence.frameSize)
        const boxes = detectSubjectsInRgb(new Uint8Array(slice), FRAMING_RGB_WIDTH, FRAMING_RGB_HEIGHT)
        return {
          time,
          boxes,
          vocalActivity: vocalActivityAt(input.audio ?? null, time),
        }
      })
      return trackSubjects(frames)
    } catch (error) {
      logger.warn('shorts.framing.failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    } finally {
      if (fs.existsSync(outputPath)) {
        try {
          fs.unlinkSync(outputPath)
        } catch {
          /* cache temporário */
        }
      }
    }
  }
}
