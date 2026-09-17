import type { ShortsLocalCandidate } from './shorts'

/** Sobreposição (interseção / duração do mais curto) acima disso = essencialmente o mesmo trecho. */
export const SHORTS_OVERLAP_LIMIT = 0.4
/** Pool interno pode guardar vizinhos um pouco mais parecidos; a seleção final é mais estrita. */
export const SHORTS_POOL_OVERLAP_LIMIT = 0.55
/** A IA pode afinar o timestamp no máximo nesta distância do candidato. */
export const SHORTS_AI_ADJUST_SECONDS = 3

export type ShortsTimeWindow = {
  start: number
  end: number
}

export type ShortsRankedWindow = ShortsTimeWindow & {
  id: string
  score: number
  reason: string
  hook?: string
  source?: ShortsLocalCandidate['source'] | 'ai'
}

export type ShortsDiscardedWindow = {
  id: string
  reason: string
  overlapWith?: string
  overlapPct?: number
}

export type ShortsDiversityResult = {
  selected: ShortsRankedWindow[]
  discarded: ShortsDiscardedWindow[]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function shortsCandidatePoolSize(clipCount: number): number {
  return Math.min(24, Math.max(12, Math.max(1, clipCount) * 3))
}

export function windowDuration(window: ShortsTimeWindow): number {
  return Math.max(0, window.end - window.start)
}

export function temporalOverlapSeconds(a: ShortsTimeWindow, b: ShortsTimeWindow): number {
  const from = Math.max(a.start, b.start)
  const to = Math.min(a.end, b.end)
  return Math.max(0, to - from)
}

/** Interseção / duração do mais curto. 1 = um trecho contém o outro (ou são iguais). */
export function overlapRatio(a: ShortsTimeWindow, b: ShortsTimeWindow): number {
  const overlap = temporalOverlapSeconds(a, b)
  const shorter = Math.min(windowDuration(a), windowDuration(b))
  return shorter <= 0 ? 0 : overlap / shorter
}

/** Intersection-over-Union temporal. */
export function temporalIoU(a: ShortsTimeWindow, b: ShortsTimeWindow): number {
  const overlap = temporalOverlapSeconds(a, b)
  const union = windowDuration(a) + windowDuration(b) - overlap
  return union <= 0 ? 0 : overlap / union
}

export function windowsConflict(
  a: ShortsTimeWindow,
  b: ShortsTimeWindow,
  limit = SHORTS_OVERLAP_LIMIT,
): boolean {
  return overlapRatio(a, b) > limit || temporalIoU(a, b) > limit
}

export function formatInsufficientShortsNote(found: number, requested: number): string {
  if (found >= requested) return ''
  const noun = found === 1 ? 'trecho realmente distinto' : 'trechos realmente distintos'
  return `Encontramos ${found} ${noun} com qualidade suficiente.`
}

function midpoint(window: ShortsTimeWindow): number {
  return (window.start + window.end) / 2
}

function diversityScore(
  candidate: ShortsRankedWindow,
  selected: ShortsRankedWindow[],
  videoDuration: number,
): number {
  if (selected.length === 0) return candidate.score
  const mid = midpoint(candidate)
  const minDist = Math.min(...selected.map((item) => Math.abs(mid - midpoint(item))))
  const span = Math.max(1, videoDuration)
  const bonus = Math.min(10, (minDist / span) * 18)
  return candidate.score + bonus
}

function qualityFloor(candidates: ShortsRankedWindow[]): number {
  const best = candidates.reduce((max, item) => Math.max(max, item.score), 0)
  return Math.max(40, best - 50)
}

export function selectDiverseClips(input: {
  candidates: ShortsRankedWindow[]
  count: number
  videoDuration: number
  overlapLimit?: number
}): ShortsDiversityResult {
  const limit = input.overlapLimit ?? SHORTS_OVERLAP_LIMIT
  const wanted = Math.max(0, input.count)
  const discarded: ShortsDiscardedWindow[] = []
  const unique: ShortsRankedWindow[] = []

  for (const candidate of input.candidates) {
    if (!Number.isFinite(candidate.start) || !Number.isFinite(candidate.end)) {
      discarded.push({ id: candidate.id, reason: 'timestamp inválido' })
      continue
    }
    if (candidate.end - candidate.start < 0.8) {
      discarded.push({ id: candidate.id, reason: 'duração inválida' })
      continue
    }
    const duplicate = unique.find(
      (item) => Math.abs(item.start - candidate.start) < 0.05 && Math.abs(item.end - candidate.end) < 0.05,
    )
    if (duplicate) {
      discarded.push({
        id: candidate.id,
        reason: 'duplicata exata',
        overlapWith: duplicate.id,
        overlapPct: 100,
      })
      continue
    }
    unique.push(candidate)
  }

  const floor = qualityFloor(unique)
  const viable = unique.filter((item) => {
    if (item.score >= floor) return true
    discarded.push({ id: item.id, reason: `score abaixo do piso (${floor})` })
    return false
  })
  const pool = viable.length > 0 ? viable : unique

  const remaining = [...pool].sort((a, b) => b.score - a.score || a.start - b.start)
  const selected: ShortsRankedWindow[] = []

  while (selected.length < wanted && remaining.length > 0) {
    remaining.sort(
      (a, b) =>
        diversityScore(b, selected, input.videoDuration) - diversityScore(a, selected, input.videoDuration) ||
        b.score - a.score ||
        a.start - b.start,
    )
    const next = remaining.shift()
    if (!next) break
    const conflict = selected.find((item) => windowsConflict(item, next, limit))
    if (conflict) {
      discarded.push({
        id: next.id,
        reason: 'overlap excessivo',
        overlapWith: conflict.id,
        overlapPct: Math.round(overlapRatio(conflict, next) * 100),
      })
      continue
    }
    selected.push(next)
  }

  selected.sort((a, b) => a.start - b.start || b.score - a.score)
  return { selected, discarded }
}

export function withCandidateIds<T extends object>(candidates: T[]): Array<T & { id: string }> {
  return candidates.map((item, index) => {
    const currentId = 'id' in item ? String((item as { id?: unknown }).id ?? '').trim() : ''
    return {
      ...item,
      id: currentId || `c${index + 1}`,
    }
  })
}

export function toRankedWindows(
  candidates: Array<{
    id?: string
    start: number
    end: number
    score: number
    reason: string
    hook?: string
    source?: ShortsRankedWindow['source']
  }>,
): ShortsRankedWindow[] {
  return withCandidateIds(candidates).map((item) => ({
    ...item,
    id: item.id,
    hook: item.hook ?? '',
    source: item.source ?? 'speech',
  }))
}

export function clampAiAdjust(
  candidate: ShortsTimeWindow,
  suggested: Partial<ShortsTimeWindow>,
  maxDelta = SHORTS_AI_ADJUST_SECONDS,
): ShortsTimeWindow {
  const startHint = Number.isFinite(suggested.start) ? (suggested.start as number) : candidate.start
  const endHint = Number.isFinite(suggested.end) ? (suggested.end as number) : candidate.end
  const start = clamp(startHint, candidate.start - maxDelta, candidate.start + maxDelta)
  const end = clamp(endHint, candidate.end - maxDelta, candidate.end + maxDelta)
  if (end <= start) return { start: candidate.start, end: candidate.end }
  return { start, end }
}
