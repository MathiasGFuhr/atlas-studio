import path from 'node:path'
import fs from 'node:fs'
import type { VideoProbeInfo } from '../../../shared/shorts'
import { buildAnalysisProxyArgs, buildClipProxyArgs, buildKeyframeArgs } from '../../../shared/shorts/analysisProxy'
import { runFfmpegResult } from '../audio/ffmpeg'
import { parseFfmpegProbe, parseSceneTimes, parseSilenceRegions } from './ffmpegParse'

export { parseFfmpegProbe, parseSceneTimes, parseSilenceRegions } from './ffmpegParse'
export { buildAnalysisProxyArgs, buildClipProxyArgs, buildKeyframeArgs } from '../../../shared/shorts/analysisProxy'

export async function probeVideo(filePath: string): Promise<VideoProbeInfo> {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) throw new Error('Arquivo de vídeo não encontrado.')
  const result = await runFfmpegResult(['-hide_banner', '-i', resolved], {
    timeoutMs: 30_000,
    allowNonZero: true,
    timeoutMessage: 'O FFmpeg demorou demais para ler o vídeo.',
    failMessage: 'Não foi possível ler o vídeo.',
  })
  const combined = `${result.stderr}\n${result.stdout}`
  if (/no such file|invalid data found|unknown format/i.test(combined) && !/Duration:/i.test(combined)) {
    throw new Error('Formato de vídeo não suportado pelo FFmpeg.')
  }
  const info = parseFfmpegProbe(combined, resolved)
  if (!info.duration || !info.width) {
    throw new Error('Não foi possível ler duração e resolução deste vídeo.')
  }
  try {
    const stat = fs.statSync(resolved)
    return { ...info, fileSize: stat.size, mtimeMs: stat.mtimeMs }
  } catch {
    return info
  }
}

export async function extractAudioWav(sourcePath: string, outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  await runFfmpegResult(
    ['-y', '-i', sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outputPath],
    {
      timeoutMs: 10 * 60_000,
      timeoutMessage: 'O FFmpeg demorou demais para extrair o áudio.',
      failMessage: 'Falha ao extrair o áudio do vídeo.',
    },
  )
}

export async function detectScenes(sourcePath: string): Promise<number[]> {
  const result = await runFfmpegResult(
    ['-hide_banner', '-i', sourcePath, '-an', '-vf', "fps=2,select='gt(scene,0.28)',showinfo", '-f', 'null', '-'],
    {
      timeoutMs: 12 * 60_000,
      allowNonZero: true,
      timeoutMessage: 'O FFmpeg demorou demais para detectar cenas.',
    },
  )
  return parseSceneTimes(`${result.stderr}\n${result.stdout}`)
}

export async function detectSilence(audioPath: string): Promise<Array<{ start: number; end: number }>> {
  const result = await runFfmpegResult(
    ['-hide_banner', '-i', audioPath, '-af', 'silencedetect=noise=-32dB:d=0.45', '-f', 'null', '-'],
    {
      timeoutMs: 6 * 60_000,
      allowNonZero: true,
      timeoutMessage: 'O FFmpeg demorou demais para analisar silêncios.',
    },
  )
  return parseSilenceRegions(`${result.stderr}\n${result.stdout}`)
}

export async function exportVideoClip(input: {
  sourcePath: string
  outputPath: string
  start: number
  end: number
  videoFilter?: string
  filterComplex?: string
  subtitlePath?: string | null
}): Promise<void> {
  const duration = Math.max(0.4, input.end - input.start)
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true })
  const subtitleFilter =
    input.subtitlePath && fs.existsSync(input.subtitlePath)
      ? `subtitles='${input.subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}':force_style='FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=80'`
      : null
  const args = [
    '-y',
    '-ss',
    input.start.toFixed(3),
    '-i',
    input.sourcePath,
    '-t',
    duration.toFixed(3),
  ]
  if (input.filterComplex) {
    let graph = input.filterComplex
    let videoMap = '[vout]'
    if (subtitleFilter) {
      graph = `${graph};[vout]${subtitleFilter}[vsub]`
      videoMap = '[vsub]'
    }
    args.push('-filter_complex', graph, '-map', videoMap, '-map', '0:a?')
  } else {
    const filters: string[] = []
    if (input.videoFilter) filters.push(input.videoFilter)
    if (subtitleFilter) filters.push(subtitleFilter)
    if (filters.length > 0) args.push('-vf', filters.join(','))
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    input.outputPath,
  )
  try {
    await runFfmpegResult(args, {
      timeoutMs: 15 * 60_000,
      timeoutMessage: 'O FFmpeg demorou demais para exportar o Short.',
      failMessage: 'Falha ao exportar o Short.',
    })
  } catch (error) {
    if (input.subtitlePath) {
      await exportVideoClip({ ...input, subtitlePath: null })
      return
    }
    if (input.filterComplex && input.videoFilter) {
      await exportVideoClip({ ...input, filterComplex: undefined })
      return
    }
    throw error
  }
}

export const FRAMING_RGB_WIDTH = 160
export const FRAMING_RGB_HEIGHT = 90

/** Sequência RGB compacta para detectar sujeitos sem ML. */
export async function extractRgbSequence(input: {
  sourcePath: string
  outputPath: string
  duration: number
  interval: number
}): Promise<{ times: number[]; buffer: Buffer; frameSize: number }> {
  const resolved = path.resolve(input.sourcePath)
  if (!fs.existsSync(resolved)) throw new Error('Arquivo de vídeo não encontrado.')
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true })
  const interval = Math.max(0.75, input.interval)
  const fps = 1 / interval
  const timeoutMs = Math.min(12 * 60_000, Math.max(45_000, Math.round(input.duration * 800)))
  await runFfmpegResult(
    [
      '-y',
      '-i',
      resolved,
      '-an',
      '-vf',
      `fps=${fps.toFixed(4)},scale=${FRAMING_RGB_WIDTH}:${FRAMING_RGB_HEIGHT}`,
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      input.outputPath,
    ],
    {
      timeoutMs,
      timeoutMessage: 'O FFmpeg demorou demais para amostrar o enquadramento.',
      failMessage: 'Falha ao amostrar frames para o enquadramento.',
    },
  )
  const buffer = fs.readFileSync(input.outputPath)
  const frameSize = FRAMING_RGB_WIDTH * FRAMING_RGB_HEIGHT * 3
  const count = Math.floor(buffer.length / frameSize)
  const times = Array.from({ length: count }, (_, index) => Math.round(index * interval * 100) / 100)
  return { times, buffer, frameSize }
}

/** Frame estático pequeno para cards. Não usa o vídeo inteiro. */
export async function extractVideoThumbnail(input: {
  sourcePath: string
  outputPath: string
  atSeconds?: number
}): Promise<void> {
  const resolved = path.resolve(input.sourcePath)
  if (!fs.existsSync(resolved)) throw new Error('Arquivo de vídeo não encontrado.')
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true })
  const seek = Math.max(0, input.atSeconds ?? 1)
  await runFfmpegResult(
    [
      '-y',
      '-ss',
      seek.toFixed(3),
      '-i',
      resolved,
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-2',
      '-q:v',
      '4',
      input.outputPath,
    ],
    {
      timeoutMs: 30_000,
      timeoutMessage: 'O FFmpeg demorou demais para gerar a thumbnail.',
      failMessage: 'Falha ao gerar a thumbnail do vídeo.',
    },
  )
}

export async function createAnalysisProxy(input: {
  sourcePath: string
  outputPath: string
  probe: Pick<VideoProbeInfo, 'duration' | 'width' | 'height' | 'hasAudio'>
}): Promise<string> {
  const resolved = path.resolve(input.sourcePath)
  if (!fs.existsSync(resolved)) throw new Error('Arquivo de vídeo não encontrado.')
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true })
  const timeoutMs = Math.min(20 * 60_000, Math.max(90_000, Math.round(input.probe.duration * 2500)))
  await runFfmpegResult(
    buildAnalysisProxyArgs({
      sourcePath: resolved,
      outputPath: input.outputPath,
      duration: input.probe.duration,
      width: input.probe.width,
      height: input.probe.height,
      hasAudio: input.probe.hasAudio,
    }),
    {
      timeoutMs,
      timeoutMessage: 'O FFmpeg demorou demais para preparar o proxy de análise.',
      failMessage: 'Falha ao criar o proxy de análise. O vídeo original não foi alterado.',
    },
  )
  if (!fs.existsSync(input.outputPath)) {
    throw new Error('O proxy de análise não foi gerado.')
  }
  return input.outputPath
}

export async function createClipProxy(input: {
  sourcePath: string
  outputPath: string
  start: number
  end: number
}): Promise<string> {
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true })
  try {
    await runFfmpegResult(buildClipProxyArgs(input), {
      timeoutMs: 3 * 60_000,
      timeoutMessage: 'O FFmpeg demorou demais para recortar o proxy do Short.',
      failMessage: 'Falha ao recortar o proxy do Short.',
    })
  } catch {
    await runFfmpegResult(
      [
        '-y',
        '-ss',
        input.start.toFixed(3),
        '-i',
        input.sourcePath,
        '-t',
        Math.max(0.4, input.end - input.start).toFixed(3),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '30',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        input.outputPath,
      ],
      {
        timeoutMs: 6 * 60_000,
        timeoutMessage: 'O FFmpeg demorou demais para recortar o proxy do Short.',
        failMessage: 'Falha ao recortar o proxy do Short.',
      },
    )
  }
  return input.outputPath
}

export async function extractKeyframe(input: {
  sourcePath: string
  outputPath: string
  atSeconds: number
}): Promise<void> {
  const resolved = path.resolve(input.sourcePath)
  if (!fs.existsSync(resolved)) throw new Error('Arquivo de vídeo não encontrado.')
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true })
  await runFfmpegResult(buildKeyframeArgs({ ...input, sourcePath: resolved }), {
    timeoutMs: 30_000,
    timeoutMessage: 'O FFmpeg demorou demais para extrair um frame.',
    failMessage: 'Falha ao extrair frame-chave.',
  })
}
