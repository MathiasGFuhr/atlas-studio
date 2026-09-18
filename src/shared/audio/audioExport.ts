export type AudioExportFormat = 'mp3' | 'wav' | 'flac'
export type Mp3Bitrate = 192 | 256 | 320

export interface AudioExportOptions {
  sourcePath: string
  targetPath: string
  start: number
  end: number
  format: AudioExportFormat
  bitrate?: Mp3Bitrate
}

export function buildFfmpegExportArgs(options: AudioExportOptions): string[] {
  const start = Math.max(0, options.start)
  const end = Math.max(start + 0.05, options.end)
  const duration = end - start
  const fadeOutStart = Math.max(0, duration - 0.05)
  const fade = `afade=t=in:st=0:d=0.02,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.04`

  const codec =
    options.format === 'wav'
      ? ['-c:a', 'pcm_s16le']
      : options.format === 'flac'
        ? ['-c:a', 'flac']
        : ['-c:a', 'libmp3lame', '-b:a', `${options.bitrate ?? 320}k`]

  return [
    '-y',
    '-ss',
    start.toFixed(3),
    '-to',
    end.toFixed(3),
    '-i',
    options.sourcePath,
    '-af',
    fade,
    ...codec,
    options.targetPath,
  ]
}

export function exportExtension(format: AudioExportFormat): string {
  return format
}
