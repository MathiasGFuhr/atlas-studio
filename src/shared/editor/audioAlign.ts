/** Alinhamento de trecho de áudio dentro da música completa (mesmo conteúdo). */

export type AudioAlignResult =
  | { ok: true; offset: number; score: number }
  | { ok: false; reason: string }

const MIN_NEEDLE_SECONDS = 0.35
const MIN_SCORE = 0.72
const MIN_MARGIN = 0.08
const MIN_PCM_SCORE = 0.72

/** Envelope de energia (RMS por janela) normalizado 0..1. */
export function buildEnergyEnvelope(
  samples: Int16Array,
  sampleRate: number,
  peaksPerSecond = 25,
): Float64Array {
  const window = Math.max(1, Math.round(sampleRate / peaksPerSecond))
  const count = Math.max(1, Math.ceil(samples.length / window))
  const envelope = new Float64Array(count)
  let max = 0
  for (let i = 0; i < count; i += 1) {
    const start = i * window
    const end = Math.min(samples.length, start + window)
    let sum = 0
    for (let index = start; index < end; index += 1) {
      const value = samples[index] / 32768
      sum += value * value
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start))
    envelope[i] = rms
    if (rms > max) max = rms
  }
  if (max > 0) {
    for (let i = 0; i < count; i += 1) envelope[i] /= max
  }
  return envelope
}

/** Correlação normalizada; devolve melhor e 2º melhor para medir unicidade. */
export function bestEnvelopeMatch(
  haystack: Float64Array,
  needle: Float64Array,
): { index: number; score: number; secondScore: number } | null {
  if (needle.length < 2 || haystack.length < needle.length) return null

  let needleEnergy = 0
  let needleMean = 0
  for (let i = 0; i < needle.length; i += 1) needleMean += needle[i]
  needleMean /= needle.length
  for (let i = 0; i < needle.length; i += 1) {
    const d = needle[i] - needleMean
    needleEnergy += d * d
  }
  if (needleEnergy < 1e-10) return null

  let bestIndex = 0
  let bestScore = -1
  let secondScore = -1
  const limit = haystack.length - needle.length
  for (let start = 0; start <= limit; start += 1) {
    let mean = 0
    for (let i = 0; i < needle.length; i += 1) mean += haystack[start + i]
    mean /= needle.length
    let energy = 0
    let dot = 0
    for (let i = 0; i < needle.length; i += 1) {
      const h = haystack[start + i] - mean
      const n = needle[i] - needleMean
      energy += h * h
      dot += h * n
    }
    if (energy < 1e-10) continue
    const score = dot / Math.sqrt(energy * needleEnergy)
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestIndex = start
    } else if (score > secondScore) {
      secondScore = score
    }
  }
  if (bestScore < 0) return null
  return { index: bestIndex, score: bestScore, secondScore: Math.max(0, secondScore) }
}

/** Refina o offset em amostras PCM e devolve também o score PCM. */
export function refinePcmOffset(
  haystack: Int16Array,
  needle: Int16Array,
  sampleRate: number,
  approxSeconds: number,
  windowSeconds = 2,
): { offset: number; score: number } {
  const approx = Math.round(approxSeconds * sampleRate)
  const window = Math.round(windowSeconds * sampleRate)
  const needleLen = Math.min(needle.length, Math.round(2.5 * sampleRate))
  if (needleLen < Math.round(MIN_NEEDLE_SECONDS * sampleRate)) {
    return { offset: Math.max(0, approxSeconds), score: 0 }
  }

  const searchStart = Math.max(0, approx - window)
  const searchEnd = Math.min(haystack.length - needleLen, approx + window)
  if (searchEnd <= searchStart) return { offset: Math.max(0, approxSeconds), score: 0 }

  let bestAt = approx
  let bestScore = -Infinity
  const coarseStep = Math.max(1, Math.round(sampleRate / 100))
  for (let start = searchStart; start <= searchEnd; start += coarseStep) {
    const score = pcmDot(haystack, needle, start, needleLen)
    if (score > bestScore) {
      bestScore = score
      bestAt = start
    }
  }
  const fineStart = Math.max(searchStart, bestAt - coarseStep)
  const fineEnd = Math.min(searchEnd, bestAt + coarseStep)
  for (let start = fineStart; start <= fineEnd; start += 1) {
    const score = pcmDot(haystack, needle, start, needleLen)
    if (score > bestScore) {
      bestScore = score
      bestAt = start
    }
  }
  return {
    offset: bestAt / sampleRate,
    score: Number.isFinite(bestScore) ? bestScore : 0,
  }
}

/**
 * Redistribui starts/durações dos trechos numerados para caber exatamente na música,
 * removendo o padding acumulado (ms/s a mais em cada N.mp3).
 */
export function scaleNumberedSegmentsToMusic(input: {
  segments: Array<{ scene: number; path: string; duration: number }>
  musicDuration: number
}): Array<{ scene: number; path: string; start: number; duration: number }> {
  const segments = input.segments.filter((item) => item.duration > 0)
  if (segments.length === 0 || !(input.musicDuration > 0)) return []

  const total = segments.reduce((sum, item) => sum + item.duration, 0)
  if (!(total > 0)) return []

  // Só encolhe quando a soma dos trechos passa da música (padding).
  const scale = total > input.musicDuration + 1e-3 ? input.musicDuration / total : 1
  const result: Array<{ scene: number; path: string; start: number; duration: number }> = []
  let cursor = 0
  for (let index = 0; index < segments.length; index += 1) {
    const item = segments[index]
    const isLast = index === segments.length - 1
    const duration = isLast
      ? Math.max(0.1, input.musicDuration - cursor)
      : Math.max(0.1, item.duration * scale)
    result.push({
      scene: item.scene,
      path: item.path,
      start: cursor,
      duration,
    })
    cursor += duration
  }
  return result
}

function pcmDot(haystack: Int16Array, needle: Int16Array, start: number, length: number): number {
  let dot = 0
  let hEnergy = 0
  let nEnergy = 0
  for (let i = 0; i < length; i += 1) {
    const h = haystack[start + i]
    const n = needle[i]
    dot += h * n
    hEnergy += h * h
    nEnergy += n * n
  }
  if (hEnergy < 1 || nEnergy < 1) return -Infinity
  return dot / Math.sqrt(hEnergy * nEnergy)
}

/** Localiza o trecho `needle` dentro da música `haystack` (PCM mono s16le). */
export function alignAudioSegment(input: {
  haystack: Int16Array
  needle: Int16Array
  sampleRate: number
  peaksPerSecond?: number
  minScore?: number
  minMargin?: number
  minPcmScore?: number
}): AudioAlignResult {
  const sampleRate = input.sampleRate
  const minScore = input.minScore ?? MIN_SCORE
  const minMargin = input.minMargin ?? MIN_MARGIN
  const minPcmScore = input.minPcmScore ?? MIN_PCM_SCORE
  const peaksPerSecond = input.peaksPerSecond ?? 25
  const minSamples = Math.round(MIN_NEEDLE_SECONDS * sampleRate)

  if (input.haystack.length < minSamples) {
    return { ok: false, reason: 'A música na timeline é curta demais para alinhar.' }
  }
  if (input.needle.length < minSamples) {
    return { ok: false, reason: 'O trecho de áudio é curto demais para alinhar.' }
  }
  if (input.needle.length >= input.haystack.length) {
    return { ok: true, offset: 0, score: 1 }
  }

  const haystackEnv = buildEnergyEnvelope(input.haystack, sampleRate, peaksPerSecond)
  const needleCap = Math.min(input.needle.length, Math.round(12 * sampleRate))
  const needleEnv = buildEnergyEnvelope(input.needle.subarray(0, needleCap), sampleRate, peaksPerSecond)
  const match = bestEnvelopeMatch(haystackEnv, needleEnv)
  if (!match) {
    return { ok: false, reason: 'Não encontrei este trecho de áudio dentro da música.' }
  }

  const margin = match.score - match.secondScore
  if (match.score < minScore || margin < minMargin) {
    return {
      ok: false,
      reason: `Áudio do trecho é ambíguo na música (confiança ${Math.round(match.score * 100)}%).`,
    }
  }

  const approxSeconds = match.index / peaksPerSecond
  const refined = refinePcmOffset(input.haystack, input.needle, sampleRate, approxSeconds)
  if (refined.score < minPcmScore) {
    return {
      ok: false,
      reason: `Áudio do trecho não confirma o ponto na música (${Math.round(refined.score * 100)}%).`,
    }
  }
  return {
    ok: true,
    offset: Math.max(0, refined.offset),
    score: Math.min(1, (match.score + refined.score) / 2),
  }
}
