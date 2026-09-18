export interface AnalysisProxySpec {
  maxWidth: number
  fps: number
  videoCrf: number
  audioKbps: number
  audioRate: number
}

export function analysisProxySpec(duration: number, width: number, height: number): AnalysisProxySpec {
  const long = duration > 20 * 60
  const veryLong = duration > 45 * 60
  const maxDim = Math.max(width || 0, height || 0)
  return {
    maxWidth: veryLong ? 640 : long ? 720 : maxDim >= 1920 ? 960 : Math.min(960, maxDim || 960),
    fps: veryLong ? 6 : long ? 8 : 12,
    videoCrf: veryLong ? 32 : 28,
    audioKbps: 96,
    audioRate: 44100,
  }
}

export function buildAnalysisProxyArgs(input: {
  sourcePath: string
  outputPath: string
  duration: number
  width: number
  height: number
  hasAudio: boolean
}): string[] {
  const spec = analysisProxySpec(input.duration, input.width, input.height)
  const vf = `fps=${spec.fps},scale='min(${spec.maxWidth},iw)':-2:flags=bicubic,format=yuv420p`
  const args = ['-y', '-i', input.sourcePath, '-map', '0:v:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(spec.videoCrf), '-pix_fmt', 'yuv420p']
  if (input.hasAudio) {
    args.push('-map', '0:a:0?', '-c:a', 'aac', '-b:a', `${spec.audioKbps}k`, '-ac', '2', '-ar', String(spec.audioRate))
  } else {
    args.push('-an')
  }
  args.push('-movflags', '+faststart', '-avoid_negative_ts', 'make_zero', input.outputPath)
  return args
}

export function buildClipProxyArgs(input: {
  sourcePath: string
  outputPath: string
  start: number
  end: number
}): string[] {
  const duration = Math.max(0.4, input.end - input.start)
  return [
    '-y',
    '-ss',
    input.start.toFixed(3),
    '-i',
    input.sourcePath,
    '-t',
    duration.toFixed(3),
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    input.outputPath,
  ]
}

export function buildKeyframeArgs(input: { sourcePath: string; outputPath: string; atSeconds: number; width?: number }): string[] {
  return [
    '-y',
    '-ss',
    Math.max(0, input.atSeconds).toFixed(3),
    '-i',
    input.sourcePath,
    '-frames:v',
    '1',
    '-vf',
    `scale=${input.width ?? 640}:-2`,
    '-q:v',
    '3',
    input.outputPath,
  ]
}
