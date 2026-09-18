import path from 'node:path'
import { planClipKeyframeTimes, planKeyframeTimes } from '../../../shared/shorts/keyframePlan'
import type { AudioFeatureAnalysis } from '../../../shared/shorts/audioFeatures'
import { detectScenes, extractKeyframe } from '../media/ffmpegVideo'

export interface ExtractedKeyframe {
  time: number
  path: string
}

export class SceneAnalysisService {
  async detect(sourcePath: string): Promise<number[]> {
    return detectScenes(sourcePath)
  }

  planTimes(input: {
    duration: number
    scenes: number[]
    audio: AudioFeatureAnalysis | null
    candidateEdges?: number[]
  }): number[] {
    const energyPeaks = (input.audio?.events ?? [])
      .filter((event) => event.type === 'peak' || event.type === 'drop')
      .map((event) => event.time)
    return planKeyframeTimes({
      duration: input.duration,
      scenes: input.scenes,
      energyPeaks,
      audioEvents: input.audio?.events ?? [],
      candidateEdges: input.candidateEdges,
    })
  }

  async extract(input: {
    sourcePath: string
    dir: string
    times: number[]
  }): Promise<ExtractedKeyframe[]> {
    const frames: ExtractedKeyframe[] = []
    for (const [index, time] of input.times.entries()) {
      const outputPath = path.join(input.dir, `frame-${String(index + 1).padStart(3, '0')}.jpg`)
      try {
        await extractKeyframe({ sourcePath: input.sourcePath, outputPath, atSeconds: time })
        frames.push({ time, path: outputPath })
      } catch {
        /* frame pontual pode falhar no fim do arquivo */
      }
    }
    return frames
  }

  clipFrames(frames: ExtractedKeyframe[], start: number, end: number): ExtractedKeyframe[] {
    const times = planClipKeyframeTimes({
      start,
      end,
      globalTimes: frames.map((item) => item.time),
    })
    return times.map((time) => {
      const exact = frames.find((item) => Math.abs(item.time - time) < 0.2)
      return exact ?? { time, path: '' }
    }).filter((item) => item.path)
  }
}
