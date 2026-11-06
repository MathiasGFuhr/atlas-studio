import fs from 'node:fs'
import path from 'node:path'
import type { AudioExportFormat, Mp3Bitrate } from '../../../shared/audio/audioExport'
import { numberedExportName, sanitizeExportName } from '../../../shared/audio/audioCutService'
import type { LipSyncRef, LipSyncSubject } from '../../../shared/lipSyncRefs'
import type { MusicCaption, MusicSegment } from '../../../shared/musicAnalysis'
import { buildSrt, cuesForClip } from '../../../shared/shortsExport'
import { lipSyncRefRepository } from '../../repositories/lipSyncRefRepository'
import { musicRepository } from '../../repositories/musicRepository'
import { exportMusicSegment } from './AudioExportService'

export type MusicCutLipSyncInput = {
  trackId: string
  /** Pasta escolhida pelo usuário para baixar os cortes. */
  directory?: string
  cuts?: Array<{ start: number; end: number; label: string }>
  format?: AudioExportFormat
  bitrate?: Mp3Bitrate
  subject?: LipSyncSubject
}

export type MusicCutLipSyncResult = {
  folder: string
  files: string[]
  refs: LipSyncRef[]
}

function lyricsForCut(captions: MusicCaption[], start: number, end: number): string {
  return cuesForClip(captions, start, end)
    .map((cue) => cue.text.trim())
    .filter(Boolean)
    .join('\n')
}

function writeCutSidecars(
  audioPath: string,
  captions: MusicCaption[],
  cut: { start: number; end: number },
  lyrics: string,
) {
  const relative = cuesForClip(captions, cut.start, cut.end).filter((cue) => cue.text.trim())
  const srt = buildSrt(relative)
  const stem = audioPath.replace(/\.[^.]+$/, '')
  if (srt.trim()) fs.writeFileSync(`${stem}.srt`, `${srt}\n`, 'utf8')
  if (lyrics.trim()) fs.writeFileSync(`${stem}.txt`, `${lyrics.trim()}\n`, 'utf8')
}

/** Baixa os cortes na pasta escolhida e cria um card LipSync por trecho. */
export async function exportMusicCutsToLipSync(
  input: MusicCutLipSyncInput,
): Promise<MusicCutLipSyncResult> {
  const track = musicRepository.get(input.trackId)
  if (!track) throw new Error('Música não encontrada')
  if (!track.projectId) {
    throw new Error('Vincule esta faixa a um projeto de música antes de enviar ao LipSync.')
  }
  const directory = input.directory?.trim()
  if (!directory) throw new Error('Escolha a pasta onde os cortes serão baixados.')
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error('A pasta escolhida não foi encontrada.')
  }

  const cuts: MusicSegment[] =
    input.cuts && input.cuts.length > 0
      ? input.cuts.map((cut, index) => ({
          id: `temp-${index}`,
          start: cut.start,
          end: cut.end,
          label: cut.label,
          source: 'manual' as const,
        }))
      : track.cuts
  if (cuts.length === 0) throw new Error('Não há cortes para enviar ao LipSync.')

  const format: AudioExportFormat = input.format === 'wav' ? 'wav' : 'mp3'
  const bitrate = input.bitrate === 192 || input.bitrate === 256 ? input.bitrate : 320
  const subject = input.subject === 'band' ? 'band' : 'singer'
  const folder = path.resolve(directory)
  fs.mkdirSync(folder, { recursive: true })

  const files: string[] = []
  const refs: LipSyncRef[] = []

  for (let index = 0; index < cuts.length; index += 1) {
    const cut = cuts[index]
    const orderedLabel = `Trecho ${index + 1}`
    const filename = numberedExportName(index + 1, sanitizeExportName(orderedLabel, orderedLabel), format)
    const targetPath = path.join(folder, filename)
    await exportMusicSegment({
      id: track.id,
      start: cut.start,
      end: cut.end,
      targetPath,
      format,
      bitrate,
    })
    const lyrics = lyricsForCut(track.captions ?? [], cut.start, cut.end)
    writeCutSidecars(targetPath, track.captions ?? [], cut, lyrics)

    const created = lipSyncRefRepository.create({
      projectId: track.projectId,
      label: orderedLabel,
      lyrics,
      subject,
    })
    const withAudio = await lipSyncRefRepository.setAudio(created.id, targetPath)
    if (!withAudio) throw new Error(`Não foi possível vincular o áudio do corte ${index + 1}.`)
    files.push(targetPath)
    refs.push(withAudio)
  }

  return { folder, files, refs }
}
