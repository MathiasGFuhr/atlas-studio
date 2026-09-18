import { describe, expect, it } from 'vitest'
import { numberedExportName, sanitizeExportName } from './audioCutService'
import { buildFfmpegExportArgs } from './audioExport'

describe('audio export', () => {
  it('exporta MP3 com bitrate configurável', () => {
    const args = buildFfmpegExportArgs({
      sourcePath: 'D:/music/original.wav',
      targetPath: 'D:/out/corte.mp3',
      start: 12.5,
      end: 27.5,
      format: 'mp3',
      bitrate: 320,
    })
    expect(args).toContain('12.500')
    expect(args).toContain('27.500')
    expect(args).toContain('libmp3lame')
    expect(args).toContain('320k')
    expect(args.at(-1)).toBe('D:/out/corte.mp3')
    expect(args).not.toContain('-c:a copy')
  })

  it('exporta WAV em PCM', () => {
    const args = buildFfmpegExportArgs({
      sourcePath: 'D:/music/original.mp3',
      targetPath: 'D:/out/corte.wav',
      start: 0,
      end: 4,
      format: 'wav',
    })
    expect(args).toContain('pcm_s16le')
    expect(args).toContain('D:/out/corte.wav')
  })

  it('nomeia exportar todos com índice', () => {
    expect(numberedExportName(1, 'Intro', 'mp3')).toBe('01 - Intro.mp3')
    expect(numberedExportName(2, 'Refrão', 'wav')).toBe('02 - Refrão.wav')
    expect(sanitizeExportName('a/b:c', 'Corte 1')).toBe('abc')
  })
})
