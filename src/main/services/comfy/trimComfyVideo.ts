import { comfyOutputTrimSeconds } from '../../../shared/comfy'
import { probeAudioDuration } from '../audio/audioProbe'
import { probeVideo, trimVideoToDuration } from '../media/ffmpegVideo'

/**
 * Depois do download do Comfy: o vídeo veio com folga; corta no tempo real do áudio da cena.
 * Se não houver o que cortar, ou se o FFmpeg falhar, o arquivo baixado permanece.
 */
export async function trimComfyVideoToAudio(videoPath: string, audioPath: string): Promise<boolean> {
  const audioDuration = await probeAudioDuration(audioPath)
  let videoDuration: number | null = null
  try {
    const probe = await probeVideo(videoPath)
    videoDuration = probe.duration > 0 ? probe.duration : null
  } catch {
    videoDuration = null
  }
  const trimTo = comfyOutputTrimSeconds(videoDuration, audioDuration)
  if (trimTo == null) return false
  await trimVideoToDuration(videoPath, trimTo)
  return true
}
