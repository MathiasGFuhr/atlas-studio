import fs from 'node:fs'
import path from 'node:path'
import { enrichAudioAnalysis, type AudioFeatureAnalysis } from '../../../shared/shorts/audioFeatures'
import { analyzeMusic, type MusicAnalysis } from '../../../shared/musicAnalysis'
import { decodeWavPcm } from '../../../shared/decodeWav'
import { detectSilence, extractAudioWav } from '../media/ffmpegVideo'

export class AudioAnalysisService {
  async extractWav(sourcePath: string, outputPath: string): Promise<string> {
    await extractAudioWav(sourcePath, outputPath)
    return outputPath
  }

  async analyze(audioPath: string, fallbackDuration: number, extraSilence?: Array<{ start: number; end: number }>): Promise<AudioFeatureAnalysis> {
    const silence = extraSilence ?? (await detectSilence(audioPath))
    try {
      const wav = fs.readFileSync(audioPath)
      const decoded = decodeWavPcm(wav)
      let analysis: MusicAnalysis = analyzeMusic(decoded.samples, decoded.sampleRate)
      if (silence.length > 0) analysis = { ...analysis, silence }
      return enrichAudioAnalysis(analysis, decoded.samples)
    } catch {
      return enrichAudioAnalysis({
        duration: fallbackDuration,
        sampleRate: 16000,
        energy: [],
        frameDuration: 0.046,
        silence,
        onsets: [],
      })
    }
  }
}

export function audioWorkPath(dir: string) {
  return path.join(dir, 'audio.wav')
}
