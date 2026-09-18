import type { ShortsLocalCandidate } from './shorts'
import { SHORTS_MIN_START_DELTA } from './shortsDuration'

/** Limite legado (vídeos longos). A seleção final usa passes progressivos. */
export const SHORTS_OVERLAP_LIMIT = 0.28
/** Pool interno só remove quase-duplicatas; a seleção final aplica a política adaptativa. */
export const SHORTS_POOL_OVERLAP_LIMIT = 0.92
/** A IA pode afinar o timestamp no máximo nesta distância do candidato. */
export const SHORTS_AI_ADJUST_SECONDS = 3

const NEAR_DUPLICATE_RATIO = 0.72
const NEAR_DUPLICATE_IOU = 0.58
const NEAR_DUPLICATE_START_DELTA = 4
const POOL_NEAR_START_DELTA = 1
const POOL_NEAR_RATIO = 0.92
const POOL_NEAR_IOU = 0.9

export const SHORTS_OVERLAP_PASSES = [
  { id: 1, maxOverlapRatio: 0.25, maxIoU: 0.18, relaxNearDuplicate: false },
  { id: 2, maxOverlapRatio: 0.45, maxIoU: 0.32, relaxNearDuplicate: false },
  { id: 3, maxOverlapRatio: 0.65, maxIoU: 0.5, relaxNearDuplicate: true },
  { id: 4, maxOverlapRatio: 0.85, maxIoU: 0.74, relaxNearDuplicate: true },
] as const

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
  title?: string
  description?: string
  language?: string
}

export type ShortsNarrativeRole = 'opening' | 'build' | 'development' | 'climax' | 'ending'
export type ShortsHookType = 'vocal' | 'instrumental' | 'crowd' | 'speech' | 'visual' | 'unknown'

export type ShortsDistinctMetadata = {
  id: string
  start: number
  end: number
  duration: number
  centerTime: number
  overlapRatio: number
  dominantSceneRange: ShortsTimeWindow
  visualSignature: string
  audioSignature: string
  narrativeRole: ShortsNarrativeRole
  hookType: ShortsHookType
  mainMomentLabel: string
  coreMomentId: string
  language: string
  confidence: number
  distinctnessScore: number
}

export type ShortsPairDistinctness = {
  distinctness: number
  sameCore: boolean
  tooSimilar: boolean
  overlapRatio: number
  centerDelta: number
  coreOverlap: number
  sameNarrativeRole: boolean
  sameMainMoment: boolean
  similarPreview: boolean
  similarCopy: boolean
  reasons: string[]
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
  pass?: number
}

export type ShortsOverlapRole = 'final' | 'pool'

export type ShortsOverlapPolicy = {
  role: ShortsOverlapRole
  maxOverlapRatio: number
  maxIoU: number
  maxOverlapSeconds: number
  nearDuplicateOnly: boolean
  shortVideo: boolean
  relaxNearDuplicate?: boolean
  exactTimestampsOnly?: boolean
  pass?: number
}

export type ShortsConflictLimit = number | ShortsOverlapPolicy

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function shortsCandidatePoolSize(clipCount: number): number {
  return Math.min(30, Math.max(18, Math.max(1, clipCount) * 6))
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

export function sameTimestamps(
  a: ShortsTimeWindow,
  b: ShortsTimeWindow,
  epsilon = 0.05,
): boolean {
  return Math.abs(a.start - b.start) <= epsilon && Math.abs(a.end - b.end) <= epsilon
}

export function minDistinctStartDelta(
  videoDuration: number,
  clipDuration: number,
  requestedCount: number,
): number {
  const spare = Math.max(0, videoDuration - Math.min(clipDuration, videoDuration))
  if (requestedCount <= 1) return Math.max(SHORTS_MIN_START_DELTA, spare)
  return Math.max(SHORTS_MIN_START_DELTA, Math.min(2, spare / Math.max(1, requestedCount - 1)))
}

export function overlapPassPolicy(
  pass: (typeof SHORTS_OVERLAP_PASSES)[number],
  fallback: ShortsOverlapPolicy,
): ShortsOverlapPolicy {
  return {
    ...fallback,
    role: 'final',
    maxOverlapRatio: pass.maxOverlapRatio,
    maxIoU: pass.maxIoU,
    maxOverlapSeconds: Number.POSITIVE_INFINITY,
    nearDuplicateOnly: false,
    relaxNearDuplicate: pass.relaxNearDuplicate,
    exactTimestampsOnly: false,
    pass: pass.id,
  }
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
      maxOverlapRatio: POOL_NEAR_RATIO,
      maxIoU: POOL_NEAR_IOU,
      maxOverlapSeconds: Number.POSITIVE_INFINITY,
      nearDuplicateOnly: true,
      shortVideo,
      relaxNearDuplicate: true,
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
  if (sameTimestamps(a, b)) return true
  if (loose) {
    if (startDelta < POOL_NEAR_START_DELTA && ratio > POOL_NEAR_RATIO) return true
    if (iou > POOL_NEAR_IOU) return true
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
  if (sameTimestamps(a, b)) return true
  if (policy.exactTimestampsOnly) {
    const delta = SHORTS_MIN_START_DELTA
    return Math.abs(a.start - b.start) < delta && Math.abs(a.end - b.end) < delta
  }
  if (policy.nearDuplicateOnly) return isNearDuplicate(a, b, true)
  if (isNearDuplicate(a, b, Boolean(policy.relaxNearDuplicate))) return true
  const overlap = temporalOverlapSeconds(a, b)
  const ratio = overlapRatio(a, b)
  const iou = temporalIoU(a, b)
  if (iou > policy.maxIoU) return true
  if (overlap > policy.maxOverlapSeconds) return true
  if (ratio > policy.maxOverlapRatio) return true
  return false
}

export function formatInsufficientShortsNote(
  found: number,
  requested: number,
  opts?: { shortVideo?: boolean },
): string {
  if (found >= requested) return ''
  if (found <= 0) return 'Não encontramos trechos com qualidade suficiente para este vídeo.'
  if (opts?.shortVideo) {
    const noun = found === 1 ? 'Short realmente distinto' : 'Shorts realmente distintos'
    return `Este vídeo permite ${found} ${noun} nesta duração. Para gerar mais, reduza a duração desejada ou aceite maior repetição.`
  }
  const label = found === 1 ? '1 Short realmente distinto' : `${found} Shorts realmente distintos`
  return `Encontramos apenas ${label} para este vídeo. Para evitar cortes repetidos ou muito parecidos, o Atlas não completou os ${requested} solicitados.`
}

export function formatDistinctCountSummary(found: number, requested: number): string {
  return `${requested} solicitados · ${found} realmente distintos encontrados`
}

const COUNT_CLAIM_NOTE =
  /selecionad|melhores trechos|trecho(?:s)? (?:realmente )?distint|encontramos(?: apenas)? \d+|este vídeo permite \d+/i

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

export const DISTINCTNESS_THRESHOLD = 0.4
const CORE_TRIM = 0.2
const MAX_OVERLAP_FOR_COEXISTENCE = 0.5
const MAX_CORE_OVERLAP = 0.48
const MAX_IOU_FOR_COEXISTENCE = 0.45
const MIN_CENTER_SEPARATION = 0.25
const PREVIEW_SIMILAR_SECONDS = 2.25
const GENERIC_COPY =
  /janela deslizante|janela distribuída|janela encurtada|janela no piso|motivo c\d|trecho falado contínuo|pico de energia/i

const NARRATIVE_ROLES: ShortsNarrativeRole[] = ['opening', 'build', 'development', 'climax', 'ending']

export function centerTime(window: ShortsTimeWindow): number {
  return (window.start + window.end) / 2
}

export function coreWindow(window: ShortsTimeWindow): ShortsTimeWindow {
  const duration = windowDuration(window)
  const pad = duration * CORE_TRIM
  return { start: window.start + pad, end: window.end - pad }
}

export function previewSeekSeconds(window: ShortsTimeWindow): number {
  const duration = windowDuration(window)
  if (duration <= 0) return Math.max(0, window.start)
  return window.start + Math.min(1.5, Math.max(0.15, duration * 0.18))
}

export function coreMomentId(window: ShortsTimeWindow, typicalDuration: number): string {
  const bucket = Math.max(6, typicalDuration * 0.28)
  return `m${Math.round(centerTime(coreWindow(window)) / bucket)}`
}

export function inferNarrativeRole(window: ShortsTimeWindow, videoDuration: number): ShortsNarrativeRole {
  const video = Math.max(0.5, videoDuration)
  if (window.start <= video * 0.08) return 'opening'
  if (window.end >= video * 0.92) return 'ending'
  const t = centerTime(window) / video
  if (t < 0.38) return 'build'
  if (t < 0.62) return 'development'
  if (t < 0.82) return 'climax'
  return 'ending'
}

export function inferHookType(text: string): ShortsHookType {
  const value = text.toLowerCase()
  if (/plateia|p[uú]blico|crowd|applause|rea[cç][aã]o/.test(value)) return 'crowd'
  if (/solo|instrument|banda|drop|explos/.test(value)) return 'instrumental'
  if (/vocal|refr[aã]o|letra|[ií]ntimo|canta/.test(value)) return 'vocal'
  if (/fala|narrat|revela|pergunta|hist[oó]ria/.test(value)) return 'speech'
  if (/cena|visual|luz|frame/.test(value)) return 'visual'
  return 'unknown'
}

export function inferMainMomentLabel(
  role: ShortsNarrativeRole,
  hookType: ShortsHookType,
  reason: string,
): string {
  const text = reason.toLowerCase()
  if (/refr[aã]o/.test(text)) return 'refrao'
  if (/solo/.test(text)) return 'solo'
  if (/plateia|p[uú]blico/.test(text)) return 'reacao-plateia'
  if (/entrada/.test(text)) return 'entrada-vocal'
  if (/final|encerr/.test(text)) return 'encerramento'
  if (/cl[ií]max/.test(text)) return 'climax'
  if (hookType === 'crowd') return 'reacao-plateia'
  if (hookType === 'instrumental') return 'explosao-instrumental'
  if (hookType === 'vocal') return 'trecho-intimo'
  if (role === 'opening') return 'abertura'
  if (role === 'build' || role === 'development') return 'desenvolvimento'
  if (role === 'climax') return 'climax'
  return 'encerramento'
}

function editorialTokens(candidate: ShortsRankedWindow): Set<string> {
  const raw = `${candidate.reason} ${candidate.hook ?? ''} ${candidate.title ?? ''} ${candidate.description ?? ''}`
  if (GENERIC_COPY.test(raw)) return new Set()
  return new Set(
    raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  )
}

function copySimilarity(a: ShortsRankedWindow, b: ShortsRankedWindow): number {
  const left = editorialTokens(a)
  const right = editorialTokens(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return shared / Math.min(left.size, right.size)
}

export function buildDistinctMetadata(
  candidate: ShortsRankedWindow,
  videoDuration: number,
  typicalDuration: number,
): ShortsDistinctMetadata {
  const duration = windowDuration(candidate)
  const core = coreWindow(candidate)
  const role = inferNarrativeRole(candidate, videoDuration)
  const hookType = inferHookType(`${candidate.reason} ${candidate.hook ?? ''} ${candidate.title ?? ''}`)
  const poster = previewSeekSeconds(candidate)
  return {
    id: candidate.id,
    start: candidate.start,
    end: candidate.end,
    duration,
    centerTime: centerTime(candidate),
    overlapRatio: 0,
    dominantSceneRange: core,
    visualSignature: `v${Math.round(poster / 2)}`,
    audioSignature: `a${Math.round(centerTime(core) / 4)}`,
    narrativeRole: role,
    hookType,
    mainMomentLabel: inferMainMomentLabel(role, hookType, candidate.reason),
    coreMomentId: coreMomentId(candidate, typicalDuration),
    language: candidate.language ?? '',
    confidence: clamp(candidate.score / 100, 0.2, 1),
    distinctnessScore: 1,
  }
}

export function pairDistinctness(
  a: ShortsRankedWindow,
  b: ShortsRankedWindow,
  videoDuration: number,
  typicalDuration?: number,
): ShortsPairDistinctness {
  const typical = typicalDuration ?? (windowDuration(a) + windowDuration(b)) / 2
  const metaA = buildDistinctMetadata(a, videoDuration, typical)
  const metaB = buildDistinctMetadata(b, videoDuration, typical)
  const ratio = overlapRatio(a, b)
  const iou = temporalIoU(a, b)
  const coreOverlap = overlapRatio(metaA.dominantSceneRange, metaB.dominantSceneRange)
  const avgDur = Math.max(1, (metaA.duration + metaB.duration) / 2)
  const centerDelta = Math.abs(metaA.centerTime - metaB.centerTime)
  const similarPreview = Math.abs(previewSeekSeconds(a) - previewSeekSeconds(b)) < PREVIEW_SIMILAR_SECONDS
  const similarCopy = copySimilarity(a, b) >= 0.75
  const sameNarrativeRole = metaA.narrativeRole === metaB.narrativeRole
  const sameMainMoment = metaA.mainMomentLabel === metaB.mainMomentLabel
  const sameCoreId = metaA.coreMomentId === metaB.coreMomentId
  const sameCore = coreOverlap >= MAX_CORE_OVERLAP || (sameCoreId && ratio >= 0.28)
  const temporal = 1 - ratio
  const center = Math.min(1, centerDelta / (avgDur * 0.5))
  const scene = 1 - coreOverlap
  const energy = metaA.audioSignature === metaB.audioSignature ? 0.25 : 1
  const roleScore = sameNarrativeRole ? 0.2 : 1
  const momentScore = sameCoreId || sameMainMoment ? 0.15 : 1
  const previewScore = similarPreview ? 0.15 : 1
  const distinctness =
    0.22 * temporal +
    0.18 * center +
    0.22 * scene +
    0.1 * energy +
    0.1 * roleScore +
    0.12 * momentScore +
    0.06 * previewScore

  const reasons: string[] = []
  if (sameTimestamps(a, b)) reasons.push('timestamps iguais')
  if (ratio >= MAX_OVERLAP_FOR_COEXISTENCE) reasons.push('overlap excessivo')
  if (coreOverlap >= MAX_CORE_OVERLAP) reasons.push('mesmo núcleo')
  if (iou > MAX_IOU_FOR_COEXISTENCE) reasons.push('IoU alto')
  if (centerDelta < avgDur * MIN_CENTER_SEPARATION && ratio >= 0.32) reasons.push('centro temporal próximo')
  if (sameCoreId && ratio >= 0.28) reasons.push('mesmo core moment')
  if (sameNarrativeRole && sameMainMoment && ratio >= 0.22) reasons.push('mesmo papel narrativo')
  if (similarPreview && ratio >= 0.25) reasons.push('preview semelhante')
  if (similarCopy && ratio >= 0.2) reasons.push('texto editorial reciclado')
  if (distinctness < DISTINCTNESS_THRESHOLD) reasons.push('distinctness baixa')

  const tooSimilar =
    reasons.length > 0 ||
    sameTimestamps(a, b) ||
    ratio >= MAX_OVERLAP_FOR_COEXISTENCE ||
    coreOverlap >= MAX_CORE_OVERLAP ||
    iou > MAX_IOU_FOR_COEXISTENCE ||
    distinctness < DISTINCTNESS_THRESHOLD

  return {
    distinctness,
    sameCore,
    tooSimilar,
    overlapRatio: ratio,
    centerDelta,
    coreOverlap,
    sameNarrativeRole,
    sameMainMoment,
    similarPreview,
    similarCopy,
    reasons,
  }
}

function regionIndex(center: number, videoDuration: number): number {
  return Math.min(4, Math.floor((center / Math.max(videoDuration, 1)) * 5))
}

function coveragePickScore(
  candidate: ShortsRankedWindow,
  selected: ShortsRankedWindow[],
  videoDuration: number,
  meta: Map<string, ShortsDistinctMetadata>,
): number {
  if (selected.length === 0) return candidate.score
  const current = meta.get(candidate.id)
  const unusedRole = current && selected.every((item) => meta.get(item.id)?.narrativeRole !== current.narrativeRole) ? 14 : 0
  const unusedRegion =
    current && selected.every((item) => regionIndex(meta.get(item.id)?.centerTime ?? 0, videoDuration) !== regionIndex(current.centerTime, videoDuration))
      ? 12
      : 0
  const minDist = Math.min(
    ...selected.map((item) => Math.abs((current?.centerTime ?? centerTime(candidate)) - (meta.get(item.id)?.centerTime ?? centerTime(item)))),
  )
  const spread = Math.min(16, (minDist / Math.max(1, videoDuration)) * 40)
  return candidate.score + unusedRole + unusedRegion + spread
}

function discardSimilar(
  candidate: ShortsRankedWindow,
  conflict: ShortsRankedWindow,
  pair: ShortsPairDistinctness,
): ShortsDiscardedWindow {
  return {
    id: candidate.id,
    reason: pair.reasons[0] ?? 'quase duplicado',
    overlapWith: conflict.id,
    overlapPct: Math.round(pair.overlapRatio * 100),
  }
}

/**
 * Etapa obrigatória após o pool: elimina pares com o mesmo núcleo editorial.
 * selected.length só chega a requestedCount se todos forem realmente distintos.
 */
export function validateDistinctShorts(
  candidates: ShortsRankedWindow[],
  requestedCount: number,
  options: { videoDuration: number; requestedDuration?: number },
): ShortsDiversityResult & { metadata: ShortsDistinctMetadata[]; groups: number } {
  const wanted = Math.max(0, requestedCount)
  const discarded: ShortsDiscardedWindow[] = []
  const unique = collectUniqueCandidates(candidates, discarded)
  const typical = options.requestedDuration ?? typicalClipDuration(unique)
  const meta = new Map<string, ShortsDistinctMetadata>()
  for (const item of unique) meta.set(item.id, buildDistinctMetadata(item, options.videoDuration, typical))

  const groups = new Map<string, ShortsRankedWindow[]>()
  for (const item of unique) {
    const key = meta.get(item.id)?.coreMomentId ?? item.id
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  const representatives: ShortsRankedWindow[] = []
  for (const [, cluster] of groups) {
    const ranked = [...cluster].sort((a, b) => b.score - a.score || a.start - b.start)
    const winner = ranked[0]
    if (!winner) continue
    representatives.push(winner)
    for (const loser of ranked.slice(1)) {
      const pair = pairDistinctness(winner, loser, options.videoDuration, typical)
      discarded.push(discardSimilar(loser, winner, { ...pair, reasons: ['mesmo core moment'] }))
    }
  }

  for (const item of representatives) {
    const others = representatives.filter((other) => other.id !== item.id)
    const current = meta.get(item.id)
    if (!current) continue
    current.distinctnessScore =
      others.length === 0
        ? 1
        : others.reduce((sum, other) => sum + pairDistinctness(item, other, options.videoDuration, typical).distinctness, 0) /
          others.length
  }

  const selected: ShortsRankedWindow[] = []
  const remaining = [...representatives]

  const takeIfDistinct = (candidate: ShortsRankedWindow | undefined) => {
    if (!candidate || selected.length >= wanted) return false
    if (selected.some((item) => item.id === candidate.id)) return false
    const conflict = selected.find((item) => pairDistinctness(item, candidate, options.videoDuration, typical).tooSimilar)
    if (conflict) {
      discarded.push(discardSimilar(candidate, conflict, pairDistinctness(conflict, candidate, options.videoDuration, typical)))
      return false
    }
    selected.push(candidate)
    return true
  }

  for (const role of NARRATIVE_ROLES) {
    if (selected.length >= wanted) break
    const pool = remaining
      .filter((item) => meta.get(item.id)?.narrativeRole === role)
      .sort((a, b) => b.score - a.score || a.start - b.start)
    takeIfDistinct(pool[0])
  }

  while (selected.length < wanted && remaining.length > 0) {
    remaining.sort(
      (a, b) =>
        coveragePickScore(b, selected, options.videoDuration, meta) -
          coveragePickScore(a, selected, options.videoDuration, meta) || b.score - a.score,
    )
    const next = remaining.find((item) => !selected.some((pick) => pick.id === item.id))
    if (!next) break
    remaining.splice(remaining.indexOf(next), 1)
    if (selected.length === 0) {
      selected.push(next)
      continue
    }
    const conflict = selected.find((item) => pairDistinctness(item, next, options.videoDuration, typical).tooSimilar)
    if (conflict) {
      discarded.push(discardSimilar(next, conflict, pairDistinctness(conflict, next, options.videoDuration, typical)))
      continue
    }
    selected.push(next)
  }

  for (const item of selected) {
    const current = meta.get(item.id)
    if (!current) continue
    current.overlapRatio = selected
      .filter((other) => other.id !== item.id)
      .reduce((max, other) => Math.max(max, overlapRatio(item, other)), 0)
  }

  selected.sort((a, b) => a.start - b.start || b.score - a.score)
  return {
    selected: selected.slice(0, wanted),
    discarded,
    pass: 1,
    metadata: [...meta.values()],
    groups: groups.size,
  }
}

function midpoint(window: ShortsTimeWindow): number {
  return (window.start + window.end) / 2
}

function uniqueCoverageSeconds(candidate: ShortsTimeWindow, selected: ShortsTimeWindow[]): number {
  let unique = windowDuration(candidate)
  for (const item of selected) unique -= temporalOverlapSeconds(candidate, item)
  return Math.max(0, unique)
}

/** editorialScore + diversityScore + coverageScore — favorece centros temporais diferentes. */
export function selectionScore(
  candidate: ShortsRankedWindow,
  selected: ShortsRankedWindow[],
  videoDuration: number,
): number {
  if (selected.length === 0) return candidate.score
  const mid = midpoint(candidate)
  const minDist = Math.min(...selected.map((item) => Math.abs(mid - midpoint(item))))
  const span = Math.max(1, videoDuration)
  const diversity = Math.min(18, (minDist / span) * 32)
  const coverage = Math.min(12, (uniqueCoverageSeconds(candidate, selected) / span) * 20)
  return candidate.score + diversity + coverage
}

function qualityFloor(candidates: ShortsRankedWindow[]): number {
  const best = candidates.reduce((max, item) => Math.max(max, item.score), 0)
  return Math.max(40, best - 50)
}

function pickWithPolicy(
  selected: ShortsRankedWindow[],
  remaining: ShortsRankedWindow[],
  wanted: number,
  policy: ShortsOverlapPolicy,
  videoDuration: number,
): ShortsRankedWindow[] {
  const rejected: ShortsRankedWindow[] = []
  const working = [...remaining]
  while (selected.length < wanted && working.length > 0) {
    working.sort(
      (a, b) =>
        selectionScore(b, selected, videoDuration) - selectionScore(a, selected, videoDuration) ||
        b.score - a.score ||
        a.start - b.start,
    )
    const next = working.shift()
    if (!next) break
    const conflict = selected.find((item) => windowsConflict(item, next, policy))
    if (conflict) {
      rejected.push(next)
      continue
    }
    selected.push(next)
  }
  return [...working, ...rejected]
}

function collectUniqueCandidates(
  candidates: ShortsRankedWindow[],
  discarded: ShortsDiscardedWindow[],
): ShortsRankedWindow[] {
  const unique: ShortsRankedWindow[] = []
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.start) || !Number.isFinite(candidate.end)) {
      discarded.push({ id: candidate.id, reason: 'timestamp inválido' })
      continue
    }
    if (candidate.end - candidate.start < 0.8) {
      discarded.push({ id: candidate.id, reason: 'duração inválida' })
      continue
    }
    const duplicate = unique.find((item) => sameTimestamps(item, candidate))
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
  return unique
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
  const role = input.role ?? 'final'
  const fallback = adaptiveOverlapPolicy({
    videoDuration: input.videoDuration,
    requestedDuration: typical,
    requestedCount: input.count,
    role,
  })
  const wanted = Math.max(0, input.count)
  const discarded: ShortsDiscardedWindow[] = []
  const unique = collectUniqueCandidates(input.candidates, discarded)
  const floor = qualityFloor(unique)
  const viable = unique.filter((item) => item.score >= floor)
  const pool = viable.length > 0 ? viable : unique
  for (const item of unique) {
    if (!pool.includes(item) && item.score < floor) {
      discarded.push({ id: item.id, reason: `score abaixo do piso (${floor})` })
    }
  }

  const useDistinctness = role === 'final' && input.overlapLimit == null

  if (useDistinctness) {
    const distinct = validateDistinctShorts(pool, wanted, {
      videoDuration: input.videoDuration,
      requestedDuration: typical,
    })
    return {
      selected: distinct.selected,
      discarded: [...discarded, ...distinct.discarded],
      pass: 1,
    }
  }

  const selected: ShortsRankedWindow[] = []
  const policy = resolveOverlapPolicy(input.overlapLimit, fallback)
  const leftover = pickWithPolicy(selected, pool, wanted, policy, input.videoDuration)
  for (const next of leftover) {
    const conflict = selected.find((item) => windowsConflict(item, next, policy))
    if (conflict) {
      discarded.push({
        id: next.id,
        reason: 'overlap excessivo',
        overlapWith: conflict.id,
        overlapPct: Math.round(overlapRatio(conflict, next) * 100),
      })
    }
  }
  selected.sort((a, b) => a.start - b.start || b.score - a.score)
  return { selected, discarded, pass: policy.pass }
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
