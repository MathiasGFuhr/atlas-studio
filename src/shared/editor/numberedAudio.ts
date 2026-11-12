/** Nomes de áudio de trecho: `6.mp3`, `06 - Trecho 6.mp3`, `Trecho 6.mp3`. */

const AUDIO_EXT = 'mp3|wav|m4a|aac|flac|ogg'
const MAX_SCENE = 500

function validScene(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SCENE) return null
  return value
}

function fileBaseName(fileName: string): string {
  return fileName.replace(/^.*[/\\]/, '').trim()
}

/** Extrai o número do trecho a partir do nome do arquivo de áudio. */
export function sceneNumberFromAudioFileName(fileName: string): number | null {
  const name = fileBaseName(fileName)
  if (!name) return null

  // 6.mp3 / 06.wav
  let match = new RegExp(`^(\\d+)\\.(?:${AUDIO_EXT})$`, 'i').exec(name)
  if (match) return validScene(Number(match[1]))

  // 06 - Trecho 6.mp3 (export oficial do módulo Cortes)
  match = new RegExp(`^(\\d+)\\s*[-–—.]\\s*.+\\.(?:${AUDIO_EXT})$`, 'i').exec(name)
  if (match) return validScene(Number(match[1]))

  // Trecho 6.mp3 / Corte 6.wav
  match = new RegExp(`^(?:trecho|corte)\\s*(\\d+)\\.(?:${AUDIO_EXT})$`, 'i').exec(name)
  if (match) return validScene(Number(match[1]))

  return null
}

/** Preferência: `6.mp3` > `06 - Trecho 6.mp3` (nome mais curto vence). */
export function pickPreferredAudioPath(paths: string[]): string | null {
  if (paths.length === 0) return null
  return [...paths].sort((a, b) => {
    const baseA = fileBaseName(a)
    const baseB = fileBaseName(b)
    const simpleA = /^\d+\./.test(baseA) ? 0 : 1
    const simpleB = /^\d+\./.test(baseB) ? 0 : 1
    if (simpleA !== simpleB) return simpleA - simpleB
    return baseA.length - baseB.length || baseA.localeCompare(baseB)
  })[0]
}
