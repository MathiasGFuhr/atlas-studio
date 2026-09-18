import fs from 'node:fs'
import path from 'node:path'
import type { ShortsClip, ShortsJob } from '../../../shared/shorts'
import { clipPosterSeekSeconds } from '../../../shared/shorts'
import { getUserDataPath } from '../../paths'
import { toAtlasMediaUrl } from '../media/atlasMediaProtocol'
import { extractVideoThumbnail } from '../media/ffmpegVideo'

export function shortsJobCacheDir(jobId: string): string {
  return path.join(getUserDataPath(), 'shorts', jobId)
}

export function shortsThumbnailFile(jobId: string): string {
  return path.join(shortsJobCacheDir(jobId), 'thumb.jpg')
}

export function shortsClipPosterFile(jobId: string, clipId: string, atSeconds: number): string {
  const stamp = Math.round(Math.max(0, atSeconds) * 1000)
  return path.join(shortsJobCacheDir(jobId), 'posters', `${clipId}-${stamp}.jpg`)
}

export function presentShortsJob(job: ShortsJob): ShortsJob {
  const thumb = shortsThumbnailFile(job.id)
  return {
    ...job,
    sourceExists: fs.existsSync(job.sourcePath),
    thumbnailUrl: fs.existsSync(thumb) ? toAtlasMediaUrl(thumb) : null,
    clips: job.clips.map((clip) => {
      const poster = shortsClipPosterFile(job.id, clip.id, clipPosterSeekSeconds(clip))
      return {
        ...clip,
        posterUrl: fs.existsSync(poster) ? toAtlasMediaUrl(poster) : null,
      }
    }),
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

export async function ensureShortsClipPoster(job: ShortsJob, clip: ShortsClip): Promise<string | null> {
  if (!clip.id || !fs.existsSync(job.sourcePath)) return null
  const at = clipPosterSeekSeconds(clip)
  const output = shortsClipPosterFile(job.id, clip.id, at)
  if (fs.existsSync(output)) return toAtlasMediaUrl(output)
  try {
    await extractVideoThumbnail({ sourcePath: job.sourcePath, outputPath: output, atSeconds: at })
  } catch {
    try {
      await extractVideoThumbnail({ sourcePath: job.sourcePath, outputPath: output, atSeconds: clip.start })
    } catch {
      return null
    }
  }
  return fs.existsSync(output) ? toAtlasMediaUrl(output) : null
}

export async function ensureShortsClipPosters(job: ShortsJob): Promise<void> {
  for (const clip of job.clips) {
    await ensureShortsClipPoster(job, clip)
  }
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
