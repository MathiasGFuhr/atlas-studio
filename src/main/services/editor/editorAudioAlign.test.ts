import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { candidateSegmentAudioDirs } from './editorAudioAlign'

describe('candidateSegmentAudioDirs', () => {
  it('inclui pasta da música, lipsync do vídeo e pasta pai do projeto', () => {
    const dirs = candidateSegmentAudioDirs({
      musicAsset: { sourcePath: 'D:/musica/faixa.wav' },
      videoAssets: [{ sourcePath: 'D:/projeto/lipsync/3.mp4' }],
    })
    const normalized = dirs.map((dir) => dir.replace(/\\/g, '/').toLowerCase())
    expect(normalized).toContain(path.resolve('D:/musica').replace(/\\/g, '/').toLowerCase())
    expect(normalized).toContain(path.resolve('D:/projeto/lipsync').replace(/\\/g, '/').toLowerCase())
    expect(normalized).toContain(path.resolve('D:/projeto').replace(/\\/g, '/').toLowerCase())
  })
})
