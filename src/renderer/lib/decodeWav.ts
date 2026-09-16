export function decodeWavPcm(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  if (bytes.byteLength < 44) {
    throw new Error('Arquivo de prévia inválido.')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('A prévia não está em WAV.')
  }

  let offset = 12
  let sampleRate = 22050
  let channels = 1
  let bits = 16
  let dataOffset = 0
  let dataSize = 0

  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (id === 'fmt ') {
      channels = view.getUint16(start + 2, true)
      sampleRate = view.getUint32(start + 4, true)
      bits = view.getUint16(start + 14, true)
    } else if (id === 'data') {
      dataOffset = start
      dataSize = size
      break
    }
    offset = start + size + (size % 2)
  }

  if (!dataSize) throw new Error('Chunk de áudio não encontrado.')
  if (bits !== 16) throw new Error('Formato de prévia não suportado.')

  const frameCount = Math.floor(dataSize / (2 * Math.max(1, channels)))
  const samples = new Float32Array(frameCount)
  for (let i = 0; i < frameCount; i += 1) {
    let mixed = 0
    for (let ch = 0; ch < channels; ch += 1) {
      mixed += view.getInt16(dataOffset + (i * channels + ch) * 2, true) / 32768
    }
    samples[i] = mixed / channels
  }

  return { samples, sampleRate }
}
