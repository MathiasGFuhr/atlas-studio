import path from 'node:path'
import { formatAspectRatio, type VideoProbeInfo } from '../../../shared/shorts'

function parseClock(value: string): number {
  const parts = value.split(':').map((part) => Number(part))
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(value) || 0
}

export function parseFfmpegProbe(stderr: string, filePath: string): VideoProbeInfo {
  const durationMatch = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/i)
  const videoMatch = stderr.match(/Stream #.*Video:[\s\S]*?(\d{2,5})x(\d{2,5})/i)
  const fpsMatch = stderr.match(/([\d.]+)\s*fps/i) || stderr.match(/([\d.]+)\s*tbr/i)
  const darMatch = stderr.match(/DAR\s+(\d+:\d+)/i)
  const formatMatch = stderr.match(/Input #\d+,\s*([^,]+),/i)
  const duration = durationMatch ? parseClock(durationMatch[1]) : 0
  const width = videoMatch ? Number(videoMatch[1]) : 0
  const height = videoMatch ? Number(videoMatch[2]) : 0
  const fps = fpsMatch ? Number(fpsMatch[1]) : 0
  return {
    name: path.basename(filePath),
    path: filePath,
    duration,
    width,
    height,
    fps,
    aspectRatio: darMatch?.[1] || (width && height ? formatAspectRatio(width, height) : '—'),
    format: (formatMatch?.[1] || path.extname(filePath).replace('.', '') || 'vídeo').trim(),
    hasAudio: /Stream #.*Audio:/i.test(stderr),
  }
}

export function parseSceneTimes(stderr: string): number[] {
  const times: number[] = []
  const regex = /pts_time:([\d.]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(stderr))) {
    const time = Number(match[1])
    if (!Number.isFinite(time)) continue
    const last = times[times.length - 1]
    if (last == null || time - last >= 0.8) times.push(time)
  }
  return times
}

export function parseSilenceRegions(stderr: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = []
  let current: number | null = null
  for (const line of stderr.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*([\d.]+)/)
    const end = line.match(/silence_end:\s*([\d.]+)/)
    if (start) current = Number(start[1])
    if (end && current != null) {
      const close = Number(end[1])
      if (close > current) regions.push({ start: current, end: close })
      current = null
    }
  }
  return regions
}
