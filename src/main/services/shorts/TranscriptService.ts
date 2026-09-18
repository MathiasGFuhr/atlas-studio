import { detectSilence } from '../media/ffmpegVideo'
import { cuesFromSilence, transcribeLocalAudio } from './transcribeLocal'
import type { TranscriptCue } from '../../../shared/shorts'

export class TranscriptService {
  async transcribe(input: {
    audioPath: string
    dir: string
    duration: number
  }): Promise<{
    cues: TranscriptCue[]
    source: 'whisper' | 'silence' | 'none'
    language: string | null
  }> {
    const silence = await detectSilence(input.audioPath)
    const local = await transcribeLocalAudio(input.audioPath, input.dir)
    if (local.cues.length > 0) {
      return { cues: local.cues, source: local.source, language: local.language }
    }
    if (silence.length > 0) {
      return { cues: cuesFromSilence(input.duration, silence), source: 'silence', language: null }
    }
    return { cues: [], source: 'none', language: null }
  }
}
