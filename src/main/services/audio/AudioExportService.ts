import path from 'node:path'
import type { AudioExportFormat, Mp3Bitrate } from '../../../shared/audio/audioExport'
import { buildFfmpegExportArgs } from '../../../shared/audio/audioExport'
import { numberedExportName, sanitizeExportName } from '../../../shared/audio/audioCutService'
import { runFfmpeg } from './ffmpeg'
import { musicRepository } from '../../repositories/musicRepository'

export async function exportMusicSegment(input: {
  id: string
  start: number
  end: number
  targetPath: string
  format: AudioExportFormat
  bitrate?: Mp3Bitrate
}): Promise<string> {
  const track = musicRepository.get(input.id)
  if (!track) throw new Error('Música não encontrada')
  const args = buildFfmpegExportArgs({
    sourcePath: track.originalPath,
    targetPath: input.targetPath,
    start: input.start,
    end: input.end,
    format: input.format,
    bitrate: input.bitrate,
  })
  await runFfmpeg(args)
  return input.targetPath
}

export async function exportMusicSegments(input: {
  id: string
  directory: string
  format: AudioExportFormat
  bitrate?: Mp3Bitrate
  cuts: Array<{ start: number; end: number; label: string }>
}): Promise<string[]> {
  const saved: string[] = []
  for (let index = 0; index < input.cuts.length; index += 1) {
    const cut = input.cuts[index]
    const filename = numberedExportName(index + 1, sanitizeExportName(cut.label, `Corte ${index + 1}`), input.format)
    const targetPath = path.join(input.directory, filename)
    saved.push(
      await exportMusicSegment({
        id: input.id,
        start: cut.start,
        end: cut.end,
        targetPath,
        format: input.format,
        bitrate: input.bitrate,
      }),
    )
  }
  return saved
}
