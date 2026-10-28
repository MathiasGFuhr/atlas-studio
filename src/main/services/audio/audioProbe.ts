import fs from 'node:fs'
import path from 'node:path'
import { parseClock } from '../media/ffmpegParse'
import { runFfmpegResult } from './ffmpeg'

/** Duração em segundos do cabeçalho do FFmpeg (`Duration: 00:00:21.43`). */
export function parseAudioDuration(stderr: string): number | null {
  const match = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/i)
  if (!match || !/Stream #.*Audio:/i.test(stderr)) return null
  const seconds = parseClock(match[1])
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

export async function probeAudioDuration(filePath: string): Promise<number | null> {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return null
  try {
    const result = await runFfmpegResult(['-hide_banner', '-i', resolved], {
      timeoutMs: 30_000,
      allowNonZero: true,
      timeoutMessage: 'O FFmpeg demorou demais para ler o áudio.',
      failMessage: 'Não foi possível ler o áudio.',
    })
    return parseAudioDuration(`${result.stderr}\n${result.stdout}`)
  } catch {
    return null
  }
}
