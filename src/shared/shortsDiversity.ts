import type { ShortsLocalCandidate } from './shorts'

/** Limite legado (vídeos longos). A seleção usa `adaptiveOverlapPolicy`. */
export const SHORTS_OVERLAP_LIMIT = 0.28
/** Pool interno só remove quase-duplicatas; a seleção final aplica a política adaptativa. */
export const SHORTS_POOL_OVERLAP_LIMIT = 0.72
/** A IA pode afinar o timestamp no máximo nesta distância do candidato. */
export const SHORTS_AI_ADJUST_SECONDS = 3

const NEAR_DUPLICATE_RATIO = 0.72
const NEAR_DUPLICATE_IOU = 0.58
const NEAR_DUPLICATE_START_DELTA = 4

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

export type ShortsOverlapRole = 'final' | 'pool'

export type ShortsOverlapPolicy = {
  role: ShortsOverlapRole
  maxOverlapRatio: number
  maxIoU: number
  maxOverlapSeconds: number
  nearDuplicateOnly: boolean
  shortVideo: boolean
}

export type ShortsConflictLimit = number | ShortsOverlapPolicy

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function shortsCandidatePoolSize(clipCount: number): number {
  return Math.min(25, Math.max(15, Math.max(1, clipCount) * 4))
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

export function typicalClipDuration(candidates: ShortsTimeWindow[], fallback = 30): number {
  const durations = candidates.map(windowDuration).filter((item) => item >= 0.8)
  if (durations.length === 0) return fallback
  const sorted = [...durations].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? fallback
}

export function adaptiveOverlapPolicy(input: {
  videoDuration: number
  requestedDuration: number
  requestedCount?: number
  role?: ShortsOverlapRole
}): ShortsOverlapPolicy {
  const role = input.role ?? 'final'
  const video = Math.max(0.5, input.videoDuration)
  const length = Math.max(1, input.requestedDuration)
  const shortVideo = video < length * 2

  if (role === 'pool') {
    return {
      role,
      maxOverlapRatio: NEAR_DUPLICATE_RATIO,
      maxIoU: NEAR_DUPLICATE_IOU,
      maxOverlapSeconds: Number.POSITIVE_INFINITY,
      nearDuplicateOnly: true,
      shortVideo,
    }
  }

  const minPairOverlap = Math.max(0, 2 * length - video)
  const slackRatio = shortVideo ? 0.33 : 0.22
  const maxOverlapSeconds = minPairOverlap + slackRatio * length
  return {
    role,
    maxOverlapRatio: clamp(maxOverlapSeconds / length, 0.18, 0.55),
    maxIoU: shortVideo ? 0.32 : 0.2,
    maxOverlapSeconds,
    nearDuplicateOnly: false,
    shortVideo,
  }
}

export function resolveOverlapPolicy(
  limit: ShortsConflictLimit | undefined,
  fallback: ShortsOverlapPolicy,
): ShortsOverlapPolicy {
  if (limit && typeof limit === 'object') return limit
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    return {
      ...fallback,
      maxOverlapRatio: limit,
      maxIoU: limit,
      maxOverlapSeconds: fallback.maxOverlapSeconds,
      nearDuplicateOnly: false,
    }
  }
  return fallback
}

export function isNearDuplicate(
  a: ShortsTimeWindow,
  b: ShortsTimeWindow,
  loose = false,
): boolean {
  const ratio = overlapRatio(a, b)
  const iou = temporalIoU(a, b)
  const startDelta = Math.abs(a.start - b.start)
  const endDelta = Math.abs(a.end - b.end)
  if (startDelta <= 0.05 && endDelta <= 0.05) return true
  if (loose) {
    if (startDelta < 3 && ratio > 0.8) return true
    if (iou > 0.78) return true
    return false
  }
  if (startDelta < NEAR_DUPLICATE_START_DELTA && ratio > 0.65) return true
  if (ratio > NEAR_DUPLICATE_RATIO) return true
  if (iou > NEAR_DUPLICATE_IOU) return true
  return false
}

export function windowsConflict(
  a: ShortsTimeWindow,
  b: ShortsTimeWindow,
  limit: ShortsConflictLimit = SHORTS_OVERLAP_LIMIT,
): boolean {
  const policy =
    typeof limit === 'object'
      ? limit
      : resolveOverlapPolicy(limit, {
          role: 'final',
          maxOverlapRatio: typeof limit === 'number' ? limit : SHORTS_OVERLAP_LIMIT,
          maxIoU: typeof limit === 'number' ? limit : SHORTS_OVERLAP_LIMIT,
          maxOverlapSeconds: Number.POSITIVE_INFINITY,
          nearDuplicateOnly: false,
          shortVideo: false,
        })
  if (isNearDuplicate(a, b, policy.nearDuplicateOnly)) return true
  if (policy.nearDuplicateOnly) return false
  const overlap = temporalOverlapSeconds(a, b)
  const ratio = overlapRatio(a, b)
  const iou = temporalIoU(a, b)
  if (iou > policy.maxIoU) return true
  if (overlap > policy.maxOverlapSeconds) return true
  if (ratio > policy.maxOverlapRatio) return true
  return false
}

export function formatInsufficientShortsNote(found: number, requested: number): string {
  if (found >= requested) return ''
  if (found <= 0) return 'Não encontramos trechos com qualidade suficiente para este vídeo.'
  const noun = found === 1 ? 'trecho realmente distinto' : 'trechos distintos'
  return `Encontramos ${found} ${noun} com qualidade suficiente para este vídeo.`
}

const COUNT_CLAIM_NOTE =
  /selecionad|melhores trechos|trecho(?:s)? (?:realmente )?distint|encontramos \d+/i

/** Evita a IA contradizer o resultado local da diversidade. */
export function sanitizeProposedShortsNotes(
  proposed: string | null | undefined,
  selection: { found: number; requested: number; note: string },
): string | null {
  const text = String(proposed ?? '').trim()
  if (!text) return null
  if (COUNT_CLAIM_NOTE.test(text)) return null
  if (selection.note && selection.found !== selection.requested) return text
  return text
}

export function composeShortsAnalysisNotes(parts: Array<string | null | undefined>): string | null {
  const text = parts.map((item) => String(item ?? '').trim()).filter(Boolean).join('\n')
  return text || null
}

function midpoint(window: ShortsTimeWindow): number {
  return (window.start + window.end) / 2
}

function uniqueCoverageSeconds(candidate: ShortsTimeWindow, selected: ShortsTimeWindow[]): number {
  let unique = windowDuration(candidate)
  for (const item of selected) unique -= temporalOverlapSeconds(candidate, item)
  return Math.max(0, unique)
}

/** editorialScore + diversityScore + coverageScore */
export function selectionScore(
  candidate: ShortsRankedWindow,
  selected: ShortsRankedWindow[],
  videoDuration: number,
): number {
  if (selected.length === 0) return candidate.score
  const mid = midpoint(candidate)
  const minDist = Math.min(...selected.map((item) => Math.abs(mid - midpoint(item))))
  const span = Math.max(1, videoDuration)
  const diversity = Math.min(10, (minDist / span) * 18)
  const coverage = Math.min(12, (uniqueCoverageSeconds(candidate, selected) / span) * 20)
  return candidate.score + diversity + coverage
}

function qualityFloor(candidates: ShortsRankedWindow[]): number {
  const best = candidates.reduce((max, item) => Math.max(max, item.score), 0)
  return Math.max(40, best - 50)
}

export function selectDiverseClips(input: {
  candidates: ShortsRankedWindow[]
  count: number
  videoDuration: number
  requestedDuration?: number
  overlapLimit?: ShortsConflictLimit
  role?: ShortsOverlapRole
}): ShortsDiversityResult {
  const typical = input.requestedDuration ?? typicalClipDuration(input.candidates)
  const policy = resolveOverlapPolicy(
    input.overlapLimit,
    adaptiveOverlapPolicy({
      videoDuration: input.videoDuration,
      requestedDuration: typical,
      requestedCount: input.count,
      role: input.role ?? 'final',
    }),
  )
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
        selectionScore(b, selected, input.videoDuration) - selectionScore(a, selected, input.videoDuration) ||
        b.score - a.score ||
        a.start - b.start,
    )
    const next = remaining.shift()
    if (!next) break
    const conflict = selected.find((item) => windowsConflict(item, next, policy))
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
