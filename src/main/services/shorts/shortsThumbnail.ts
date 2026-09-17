import fs from 'node:fs'
import path from 'node:path'
import type { ShortsJob } from '../../../shared/shorts'
import { getUserDataPath } from '../../paths'
import { toAtlasMediaUrl } from '../media/atlasMediaProtocol'
import { extractVideoThumbnail } from '../media/ffmpegVideo'

export function shortsJobCacheDir(jobId: string): string {
  return path.join(getUserDataPath(), 'shorts', jobId)
}

export function shortsThumbnailFile(jobId: string): string {
  return path.join(shortsJobCacheDir(jobId), 'thumb.jpg')
}

export function presentShortsJob(job: ShortsJob): ShortsJob {
  const thumb = shortsThumbnailFile(job.id)
  return {
    ...job,
    sourceExists: fs.existsSync(job.sourcePath),
    thumbnailUrl: fs.existsSync(thumb) ? toAtlasMediaUrl(thumb) : null,
  }
}

export async function ensureShortsThumbnail(job: ShortsJob): Promise<string | null> {
  const thumb = shortsThumbnailFile(job.id)
  if (fs.existsSync(thumb)) return toAtlasMediaUrl(thumb)
  if (!fs.existsSync(job.sourcePath)) return null
  const at = thumbnailSeekSeconds(job)
  try {
    await extractVideoThumbnail({ sourcePath: job.sourcePath, outputPath: thumb, atSeconds: at })
  } catch {
    if (at > 0) {
      try {
        await extractVideoThumbnail({ sourcePath: job.sourcePath, outputPath: thumb, atSeconds: 0 })
      } catch {
        return null
      }
    } else {
      return null
    }
  }
  return fs.existsSync(thumb) ? toAtlasMediaUrl(thumb) : null
}

function thumbnailSeekSeconds(job: ShortsJob): number {
  const firstClip = job.clips[0]
  if (firstClip && Number.isFinite(firstClip.start) && firstClip.start > 0.2) {
    return firstClip.start
  }
  const duration = job.probe?.duration ?? 0
  if (duration > 6) return Math.min(3, duration / 4)
  if (duration > 1) return Math.min(1, duration / 3)
  return 0
}
