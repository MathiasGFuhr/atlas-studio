import { describe, expect, it } from 'vitest'
import { parseAudioDuration } from './audioProbe'

describe('parseAudioDuration', () => {
  it('lê a duração do cabeçalho do FFmpeg', () => {
    const stderr = [
      "Input #0, mp3, from '2.MP3':",
      '  Duration: 00:00:21.43, start: 0.025057, bitrate: 192 kb/s',
      '  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 192 kb/s',
    ].join('\n')
    expect(parseAudioDuration(stderr)).toBeCloseTo(21.43)
  })

  it('ignora arquivos sem faixa de áudio ou sem duração', () => {
    expect(parseAudioDuration("Input #0, png_pipe, from '1.png':\n  Duration: N/A\n  Stream #0:0: Video: png")).toBeNull()
    expect(parseAudioDuration('  Duration: 00:00:05.00\n  Stream #0:0: Video: h264')).toBeNull()
    expect(parseAudioDuration('arquivo inválido')).toBeNull()
  })
})
