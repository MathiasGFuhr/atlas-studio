import path from 'node:path'
import { createAnalysisProxy, createClipProxy } from '../media/ffmpegVideo'
import type { VideoProbeInfo } from '../../../shared/shorts'

export class VideoProxyService {
  async createAnalysisProxy(input: {
    sourcePath: string
    dir: string
    probe: VideoProbeInfo
  }): Promise<string> {
    const outputPath = path.join(input.dir, 'analysis-proxy.mp4')
    return createAnalysisProxy({
      sourcePath: input.sourcePath,
      outputPath,
      probe: input.probe,
    })
  }

  async createClipProxy(input: {
    sourcePath: string
    dir: string
    index: number
    start: number
    end: number
  }): Promise<string> {
    const outputPath = path.join(input.dir, `clip-proxy-${input.index}.mp4`)
    return createClipProxy({
      sourcePath: input.sourcePath,
      outputPath,
      start: input.start,
      end: input.end,
    })
  }
}
