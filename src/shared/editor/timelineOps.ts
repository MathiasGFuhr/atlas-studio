import {
  EDITOR_ASPECTS,
  EDITOR_DEFAULT_CLIP_ANIMATION,
  EDITOR_DEFAULT_EFFECT_DURATION,
  EDITOR_DEFAULT_IMAGE_DURATION,
  EDITOR_DEFAULT_TEXT_DURATION,
  EDITOR_DEFAULT_WATERMARK,
  EDITOR_MAX_WATERMARKS,
  EDITOR_WATERMARK_CORNERS,
  type EditorAspect,
  type EditorAsset,
  type EditorAssetKind,
  type EditorClip,
  type EditorClipAnimation,
  type EditorClipEffect,
  type EditorClipFit,
  type EditorClipRole,
  type EditorTextContent,
  type EditorTimeline,
  type EditorTrack,
  type EditorTrackKind,
  type EditorWatermark,
  type EditorWatermarkCorner,
} from './types'
import {
  EDITOR_DEFAULT_ANIM_IN_DURATION,
  EDITOR_DEFAULT_ANIM_OUT_DURATION,
  editorAnimationById,
  type EditorAnimationKind,
} from './animationsCatalog'
import { editorEffectById, type EditorEffectId } from './effectsCatalog'
import { normalizeTextMotionId } from './textMotionsCatalog'
import { editorTextTemplateById } from './textTemplatesCatalog'

export const EDITOR_EFFECT_ASSET_PREFIX = 'effect:'
export const EDITOR_TEXT_ASSET_PREFIX = 'text:'

export function effectAssetId(effectId: string): string {
  return `${EDITOR_EFFECT_ASSET_PREFIX}${effectId}`
}

export function textAssetId(templateId: string): string {
  return `${EDITOR_TEXT_ASSET_PREFIX}${templateId}`
}

export function isEffectClip(clip: Pick<EditorClip, 'role' | 'effectId'>): boolean {
  return clip.role === 'effect' && Boolean(clip.effectId)
}

export function isTextClip(clip: Pick<EditorClip, 'role' | 'text'>): boolean {
  return clip.role === 'text' && Boolean(clip.text?.templateId)
}

export const MIN_CLIP_DURATION = 0.1
export const MAX_CLIP_VOLUME = 2
export const MIN_CLIP_SCALE = 0.1
export const MAX_CLIP_SCALE = 3
const EPS = 1e-6

export function createEditorId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clipDuration(clip: Pick<EditorClip, 'inPoint' | 'outPoint'>): number {
  return Math.max(0, clip.outPoint - clip.inPoint)
}

export function clipEnd(clip: Pick<EditorClip, 'start' | 'inPoint' | 'outPoint'>): number {
  return clip.start + clipDuration(clip)
}

export function timelineDuration(timeline: EditorTimeline): number {
  return timeline.clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0)
}

export function trackKindForAsset(kind: EditorAssetKind): EditorTrackKind {
  return kind === 'audio' ? 'audio' : 'video'
}

export function makeTrack(kind: EditorTrackKind, name: string): EditorTrack {
  return { id: createEditorId(), kind, name, muted: false, locked: false, hidden: false }
}

function nextTrackName(timeline: EditorTimeline, kind: EditorTrackKind): string {
  const count = timeline.tracks.filter((track) => track.kind === kind).length
  if (kind === 'effect') return `Efeito ${count + 1}`
  if (kind === 'text') return `Texto ${count + 1}`
  return `${kind === 'video' ? 'Vídeo' : 'Áudio'} ${count + 1}`
}

function asTrackKind(value: unknown): EditorTrackKind {
  if (value === 'audio' || value === 'effect' || value === 'text') return value
  return 'video'
}

function asClipRole(value: unknown): EditorClipRole {
  if (value === 'effect') return 'effect'
  if (value === 'text') return 'text'
  return 'media'
}

function normalizeStyleOverride(raw: unknown): EditorTextContent['titleStyle'] {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const next: NonNullable<EditorTextContent['titleStyle']> = {}
  if (typeof source.fontFamily === 'string') next.fontFamily = source.fontFamily
  if (typeof source.fontSizePercent === 'number' && Number.isFinite(source.fontSizePercent)) {
    next.fontSizePercent = Math.max(1, Math.min(40, source.fontSizePercent))
  }
  if (typeof source.fontWeight === 'number' || typeof source.fontWeight === 'string') {
    next.fontWeight = source.fontWeight
  }
  if (typeof source.color === 'string') next.color = source.color
  if (typeof source.letterSpacing === 'string') next.letterSpacing = source.letterSpacing
  if (source.textTransform === 'none' || source.textTransform === 'uppercase' || source.textTransform === 'lowercase') {
    next.textTransform = source.textTransform
  }
  if (source.textShadow === null) next.textShadow = null
  else if (typeof source.textShadow === 'string') next.textShadow = source.textShadow
  return Object.keys(next).length > 0 ? next : null
}

export function normalizeTextContent(raw: unknown): EditorTextContent | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<EditorTextContent>
  const templateId = typeof source.templateId === 'string' ? source.templateId.trim() : ''
  if (!templateId || !editorTextTemplateById(templateId)) return null
  const template = editorTextTemplateById(templateId)!
  const motionRaw =
    source.motionId !== undefined ? source.motionId : (template.defaultMotionId ?? 'none')
  const motionId = normalizeTextMotionId(motionRaw)
  const align =
    source.align === 'left' || source.align === 'center' || source.align === 'right' ? source.align : null
  const xPercent =
    typeof source.xPercent === 'number' && Number.isFinite(source.xPercent)
      ? Math.max(0, Math.min(100, source.xPercent))
      : null
  const yPercent =
    typeof source.yPercent === 'number' && Number.isFinite(source.yPercent)
      ? Math.max(0, Math.min(100, source.yPercent))
      : null
  return {
    templateId,
    title: typeof source.title === 'string' ? source.title : template.defaultTitle,
    subtitle: typeof source.subtitle === 'string' ? source.subtitle : template.defaultSubtitle,
    motionId: motionId === 'none' ? null : motionId,
    xPercent,
    yPercent,
    align,
    titleStyle: normalizeStyleOverride(source.titleStyle),
    subtitleStyle: normalizeStyleOverride(source.subtitleStyle),
    showPlate: typeof source.showPlate === 'boolean' ? source.showPlate : null,
  }
}

export function createEmptyTimeline(aspect: EditorAspect = '16:9', fps = 30): EditorTimeline {
  return {
    aspect,
    fps,
    tracks: [makeTrack('video', 'Vídeo 1'), makeTrack('audio', 'Áudio 1')],
    clips: [],
    watermarks: [],
  }
}

function asWatermarkCorner(value: unknown): EditorWatermarkCorner {
  return EDITOR_WATERMARK_CORNERS.includes(value as EditorWatermarkCorner)
    ? (value as EditorWatermarkCorner)
    : EDITOR_DEFAULT_WATERMARK.corner
}

export function normalizeClipAnimation(raw: unknown): EditorClipAnimation {
  const source = raw && typeof raw === 'object' ? (raw as Partial<EditorClipAnimation>) : {}
  const inId =
    typeof source.inId === 'string' && editorAnimationById(source.inId)?.kind === 'in'
      ? source.inId
      : null
  const outId =
    typeof source.outId === 'string' && editorAnimationById(source.outId)?.kind === 'out'
      ? source.outId
      : null
  const comboId =
    typeof source.comboId === 'string' && editorAnimationById(source.comboId)?.kind === 'combo'
      ? source.comboId
      : null
  return {
    inId,
    outId,
    comboId,
    inDuration: clamp(
      asNumber(source.inDuration, EDITOR_DEFAULT_ANIM_IN_DURATION),
      0.1,
      5,
    ),
    outDuration: clamp(
      asNumber(source.outDuration, EDITOR_DEFAULT_ANIM_OUT_DURATION),
      0.1,
      5,
    ),
  }
}

export function normalizeWatermark(raw: unknown): EditorWatermark | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<EditorWatermark>
  if (typeof source.assetId !== 'string' || !source.assetId.trim()) return null
  const parsedMargin = asNumber(source.margin, EDITOR_DEFAULT_WATERMARK.margin)
  // Margem antiga (3%) deixava a logo longe da borda; puxa para o padrão novo.
  const margin =
    Math.abs(parsedMargin - 0.03) < 1e-6 ? EDITOR_DEFAULT_WATERMARK.margin : parsedMargin
  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : createEditorId(),
    assetId: source.assetId,
    corner: asWatermarkCorner(source.corner),
    scale: clamp(asNumber(source.scale, EDITOR_DEFAULT_WATERMARK.scale), 0.05, 0.45),
    opacity: clamp(asNumber(source.opacity, EDITOR_DEFAULT_WATERMARK.opacity), 0.05, 1),
    margin: clamp(margin, 0, 0.12),
    animation: normalizeClipAnimation(source.animation),
  }
}

/** Aceita `watermarks[]` novo ou o campo legado `watermark` singular. */
export function normalizeWatermarks(source: {
  watermarks?: unknown
  watermark?: unknown
}): EditorWatermark[] {
  const fromArray = Array.isArray(source.watermarks)
    ? source.watermarks.map(normalizeWatermark).filter((item): item is EditorWatermark => Boolean(item))
    : []
  if (fromArray.length > 0) return fromArray.slice(0, EDITOR_MAX_WATERMARKS)
  const single = normalizeWatermark(source.watermark)
  return single ? [single] : []
}

export function makeWatermark(
  assetId: string,
  patch: Partial<Omit<EditorWatermark, 'id' | 'assetId'>> = {},
): EditorWatermark {
  return {
    id: createEditorId(),
    assetId,
    corner: patch.corner ?? EDITOR_DEFAULT_WATERMARK.corner,
    scale: patch.scale ?? EDITOR_DEFAULT_WATERMARK.scale,
    opacity: patch.opacity ?? EDITOR_DEFAULT_WATERMARK.opacity,
    margin: patch.margin ?? EDITOR_DEFAULT_WATERMARK.margin,
    animation: normalizeClipAnimation(patch.animation ?? EDITOR_DEFAULT_WATERMARK.animation),
  }
}

export function findWatermark(timeline: EditorTimeline, watermarkId: string): EditorWatermark | undefined {
  return timeline.watermarks.find((item) => item.id === watermarkId)
}

export function upsertWatermark(timeline: EditorTimeline, watermark: EditorWatermark): EditorTimeline {
  const index = timeline.watermarks.findIndex((item) => item.id === watermark.id)
  if (index < 0) {
    if (timeline.watermarks.length >= EDITOR_MAX_WATERMARKS) return timeline
    return { ...timeline, watermarks: [...timeline.watermarks, watermark] }
  }
  const watermarks = timeline.watermarks.map((item) => (item.id === watermark.id ? watermark : item))
  return { ...timeline, watermarks }
}

export function removeWatermark(timeline: EditorTimeline, watermarkId: string): EditorTimeline {
  if (!timeline.watermarks.some((item) => item.id === watermarkId)) return timeline
  return {
    ...timeline,
    watermarks: timeline.watermarks.filter((item) => item.id !== watermarkId),
  }
}

export function removeWatermarksUsingAsset(timeline: EditorTimeline, assetId: string): EditorTimeline {
  if (!timeline.watermarks.some((item) => item.assetId === assetId)) return timeline
  return {
    ...timeline,
    watermarks: timeline.watermarks.filter((item) => item.assetId !== assetId),
  }
}

export function findTrack(timeline: EditorTimeline, trackId: string): EditorTrack | undefined {
  return timeline.tracks.find((track) => track.id === trackId)
}

export function findClip(timeline: EditorTimeline, clipId: string): EditorClip | undefined {
  return timeline.clips.find((clip) => clip.id === clipId)
}

export function clipsInTrack(
  timeline: EditorTimeline,
  trackId: string,
  exclude?: ReadonlySet<string>,
): EditorClip[] {
  return timeline.clips
    .filter((clip) => clip.trackId === trackId && !exclude?.has(clip.id))
    .sort((a, b) => a.start - b.start)
}

/**
 * Posição livre mais próxima de `desired` onde cabe um clipe de `duration`
 * sem sobrepor os clipes da faixa (que devem vir ordenados por início).
 */
export function findFreeStart(sortedClips: EditorClip[], desired: number, duration: number): number {
  const target = Math.max(0, desired)
  const gaps: Array<[number, number]> = []
  let cursor = 0
  for (const clip of sortedClips) {
    if (clip.start > cursor + EPS) gaps.push([cursor, clip.start])
    cursor = Math.max(cursor, clipEnd(clip))
  }
  gaps.push([cursor, Number.POSITIVE_INFINITY])

  let best = cursor
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [from, to] of gaps) {
    if (to - from + EPS < duration) continue
    const position = clamp(target, from, to - duration)
    const distance = Math.abs(position - target)
    if (distance < bestDistance) {
      best = position
      bestDistance = distance
    }
  }
  return roundTime(best)
}

function replaceClip(timeline: EditorTimeline, next: EditorClip): EditorTimeline {
  return { ...timeline, clips: timeline.clips.map((clip) => (clip.id === next.id ? next : clip)) }
}

function isTrackEditable(timeline: EditorTimeline, trackId: string): boolean {
  const track = findTrack(timeline, trackId)
  return Boolean(track && !track.locked)
}

export function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB - EPS && startB < endA - EPS
}

export function clipOverlapsRange(
  clips: readonly EditorClip[],
  start: number,
  duration: number,
): boolean {
  const end = start + duration
  return clips.some((clip) => rangesOverlap(start, end, clip.start, clipEnd(clip)))
}

export function addTrack(
  timeline: EditorTimeline,
  kind: EditorTrackKind,
  options: { beforeTrackId?: string | null } = {},
): { timeline: EditorTimeline; trackId: string } {
  const track = makeTrack(kind, nextTrackName(timeline, kind))
  const beforeId = options.beforeTrackId
  if (beforeId) {
    const index = timeline.tracks.findIndex((item) => item.id === beforeId)
    if (index >= 0) {
      const tracks = [...timeline.tracks]
      tracks.splice(index, 0, track)
      return { timeline: { ...timeline, tracks }, trackId: track.id }
    }
  }
  // Efeito, texto e vídeo novos entram no topo; áudio novo entra no fim.
  const tracks =
    kind === 'video' || kind === 'effect' || kind === 'text'
      ? [track, ...timeline.tracks]
      : [...timeline.tracks, track]
  return { timeline: { ...timeline, tracks }, trackId: track.id }
}

/** Garante pelo menos uma faixa de texto no topo. */
export function ensureTextTrack(timeline: EditorTimeline): { timeline: EditorTimeline; trackId: string } {
  const existing = timeline.tracks.find((track) => track.kind === 'text' && !track.locked)
  if (existing) return { timeline, trackId: existing.id }
  return addTrack(timeline, 'text')
}

export function insertTextClip(
  timeline: EditorTimeline,
  templateId: string,
  options: {
    start?: number | null
    duration?: number | null
    trackId?: string | null
    exactStart?: boolean
    title?: string
    subtitle?: string
  } = {},
): { timeline: EditorTimeline; clipId: string } {
  const template = editorTextTemplateById(templateId)
  if (!template) return { timeline, clipId: '' }
  let next = timeline
  let trackId = options.trackId ?? null
  if (trackId) {
    const track = findTrack(next, trackId)
    if (!track || track.kind !== 'text' || track.locked) trackId = null
  }
  if (!trackId) {
    const ensured = ensureTextTrack(next)
    next = ensured.timeline
    trackId = ensured.trackId
  }

  const duration = Math.max(
    MIN_CLIP_DURATION,
    options.duration != null && Number.isFinite(options.duration)
      ? options.duration
      : EDITOR_DEFAULT_TEXT_DURATION,
  )
  const existing = clipsInTrack(next, trackId)
  const desired =
    options.start != null && Number.isFinite(options.start)
      ? options.start
      : existing.length > 0
        ? clipEnd(existing[existing.length - 1])
        : 0
  const start = options.exactStart
    ? roundTime(Math.max(0, desired))
    : findFreeStart(existing, desired, duration)

  const defaultMotion = normalizeTextMotionId(template.defaultMotionId ?? 'none')
  const text: EditorTextContent = {
    templateId,
    title: options.title ?? template.defaultTitle,
    subtitle: options.subtitle ?? template.defaultSubtitle,
    motionId: defaultMotion === 'none' ? null : defaultMotion,
    xPercent: null,
    yPercent: null,
    align: null,
    titleStyle: null,
    subtitleStyle: null,
    showPlate: null,
  }

  const clip: EditorClip = {
    id: createEditorId(),
    assetId: textAssetId(templateId),
    trackId,
    start,
    inPoint: 0,
    outPoint: roundTime(duration),
    sourceDuration: null,
    volume: 1,
    muted: true,
    fit: 'contain',
    scale: 1,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: [],
    animation: {
      ...EDITOR_DEFAULT_CLIP_ANIMATION,
      inId: template.defaultInId ?? null,
      outId: template.defaultOutId ?? null,
    },
    role: 'text',
    effectId: null,
    text,
  }
  return { timeline: { ...next, clips: [...next.clips, clip] }, clipId: clip.id }
}

/** Garante pelo menos uma faixa de efeito no topo. */
export function ensureEffectTrack(timeline: EditorTimeline): { timeline: EditorTimeline; trackId: string } {
  const existing = timeline.tracks.find((track) => track.kind === 'effect' && !track.locked)
  if (existing) return { timeline, trackId: existing.id }
  return addTrack(timeline, 'effect')
}

export function insertEffectClip(
  timeline: EditorTimeline,
  effectId: EditorEffectId,
  options: {
    start?: number | null
    duration?: number | null
    trackId?: string | null
    exactStart?: boolean
    /** Sempre cria uma faixa nova (ex.: drop na área vazia / “nova faixa”). */
    forceNewTrack?: boolean
  } = {},
): { timeline: EditorTimeline; clipId: string } {
  if (!editorEffectById(effectId)) return { timeline, clipId: '' }
  let next = timeline
  let trackId = options.trackId ?? null
  if (trackId) {
    const track = findTrack(next, trackId)
    if (!track || track.kind !== 'effect' || track.locked) trackId = null
  }

  const duration = Math.max(
    MIN_CLIP_DURATION,
    options.duration != null && Number.isFinite(options.duration)
      ? options.duration
      : EDITOR_DEFAULT_EFFECT_DURATION,
  )
  const desired =
    options.start != null && Number.isFinite(options.start) ? Math.max(0, options.start) : null

  if (options.forceNewTrack) {
    const created = addTrack(next, 'effect', trackId ? { beforeTrackId: trackId } : {})
    next = created.timeline
    trackId = created.trackId
  } else if (trackId) {
    const existing = clipsInTrack(next, trackId)
    const tentativeStart =
      desired != null
        ? options.exactStart
          ? roundTime(desired)
          : findFreeStart(existing, desired, duration)
        : existing.length > 0
          ? clipEnd(existing[existing.length - 1])
          : 0
    // Em cima de outro efeito no mesmo tempo → nova linha acima, sem sobrepor.
    if (clipOverlapsRange(existing, tentativeStart, duration)) {
      const created = addTrack(next, 'effect', { beforeTrackId: trackId })
      next = created.timeline
      trackId = created.trackId
    }
  } else {
    const startHint = roundTime(desired ?? 0)
    const freeTrack = next.tracks.find(
      (track) =>
        track.kind === 'effect' &&
        !track.locked &&
        !clipOverlapsRange(clipsInTrack(next, track.id), startHint, duration),
    )
    if (freeTrack) {
      trackId = freeTrack.id
    } else {
      const created = addTrack(next, 'effect')
      next = created.timeline
      trackId = created.trackId
    }
  }

  const existing = clipsInTrack(next, trackId)
  const startDesired =
    desired != null ? desired : existing.length > 0 ? clipEnd(existing[existing.length - 1]) : 0
  // Nunca sobrepõe na faixa escolhida: se pediu tempo exato numa faixa livre, usa-o;
  // caso contrário encaixa no buraco mais próximo.
  const start = options.exactStart && !clipOverlapsRange(existing, roundTime(startDesired), duration)
    ? roundTime(Math.max(0, startDesired))
    : findFreeStart(existing, startDesired, duration)

  const clip: EditorClip = {
    id: createEditorId(),
    assetId: effectAssetId(effectId),
    trackId,
    start,
    inPoint: 0,
    outPoint: roundTime(duration),
    sourceDuration: null,
    volume: 1,
    muted: false,
    fit: 'contain',
    scale: 1,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: [{ id: effectId, intensity: 1 }],
    animation: { ...EDITOR_DEFAULT_CLIP_ANIMATION },
    role: 'effect',
    effectId,
    text: null,
  }
  return { timeline: { ...next, clips: [...next.clips, clip] }, clipId: clip.id }
}

/** Duração do conteúdo de mídia (ignora blocos de efeito). */
export function mediaTimelineDuration(timeline: EditorTimeline): number {
  return timeline.clips.reduce(
    (max, clip) => (isEffectClip(clip) ? max : Math.max(max, clipEnd(clip))),
    0,
  )
}

/**
 * Aplica o efeito do início ao fim do projeto (um bloco cobrindo toda a mídia).
 * Remove blocos anteriores do mesmo efeito.
 */
export function applyEffectToFullTimeline(
  timeline: EditorTimeline,
  effectId: EditorEffectId,
): { timeline: EditorTimeline; clipId: string } {
  if (!editorEffectById(effectId)) return { timeline, clipId: '' }
  const existingIds = timeline.clips
    .filter((clip) => isEffectClip(clip) && clip.effectId === effectId)
    .map((clip) => clip.id)
  let next = existingIds.length > 0 ? deleteClips(timeline, existingIds, false) : timeline
  const duration = Math.max(mediaTimelineDuration(next), EDITOR_DEFAULT_EFFECT_DURATION)
  return insertEffectClip(next, effectId, { start: 0, duration, exactStart: true })
}

/** Estica um bloco de efeito para cobrir toda a mídia (0 → fim). */
export function stretchEffectToFullTimeline(timeline: EditorTimeline, clipId: string): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !isEffectClip(clip) || !isTrackEditable(timeline, clip.trackId)) return timeline
  const duration = Math.max(mediaTimelineDuration(timeline), EDITOR_DEFAULT_EFFECT_DURATION)
  const outPoint = roundTime(duration)
  if (clip.start === 0 && Math.abs(clip.outPoint - outPoint) < EPS && clip.inPoint === 0) return timeline
  return replaceClip(timeline, { ...clip, start: 0, inPoint: 0, outPoint })
}

export function removeTrack(timeline: EditorTimeline, trackId: string): EditorTimeline {
  if (!findTrack(timeline, trackId)) return timeline
  return {
    ...timeline,
    tracks: timeline.tracks.filter((track) => track.id !== trackId),
    clips: timeline.clips.filter((clip) => clip.trackId !== trackId),
  }
}

export function updateTrack(
  timeline: EditorTimeline,
  trackId: string,
  patch: Partial<Pick<EditorTrack, 'name' | 'muted' | 'locked' | 'hidden'>>,
): EditorTimeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            ...patch,
            name: patch.name !== undefined ? patch.name.trim() || track.name : track.name,
          }
        : track,
    ),
  }
}

/**
 * Reordena uma faixa (vídeo/efeito/texto). Áudio/música fica fixo no fim e não se move.
 * `beforeTrackId` null = colocar no fim do bloco móvel (logo acima da música).
 */
export function moveTrack(
  timeline: EditorTimeline,
  trackId: string,
  beforeTrackId: string | null,
): EditorTimeline {
  const fromIndex = timeline.tracks.findIndex((track) => track.id === trackId)
  if (fromIndex < 0) return timeline
  const moving = timeline.tracks[fromIndex]
  if (!moving || moving.kind === 'audio') return timeline

  const movable = timeline.tracks.filter((track) => track.kind !== 'audio')
  const audioTracks = timeline.tracks.filter((track) => track.kind === 'audio')
  const without = movable.filter((track) => track.id !== trackId)

  let insertAt = without.length
  if (beforeTrackId && beforeTrackId !== trackId) {
    const target = timeline.tracks.find((track) => track.id === beforeTrackId)
    if (target?.kind === 'audio') {
      insertAt = without.length
    } else {
      const idx = without.findIndex((track) => track.id === beforeTrackId)
      if (idx >= 0) insertAt = idx
    }
  }

  const nextMovable = [...without]
  nextMovable.splice(insertAt, 0, moving)
  const nextTracks = [...nextMovable, ...audioTracks]
  if (
    nextTracks.length === timeline.tracks.length &&
    nextTracks.every((track, index) => track.id === timeline.tracks[index]?.id)
  ) {
    return timeline
  }
  return { ...timeline, tracks: nextTracks }
}

export function insertAssetClip(
  timeline: EditorTimeline,
  asset: Pick<EditorAsset, 'id' | 'kind' | 'duration'>,
  options: { trackId?: string | null; start?: number | null; exactStart?: boolean } = {},
): { timeline: EditorTimeline; clipId: string } {
  const kind = trackKindForAsset(asset.kind)
  let next = timeline
  let track = options.trackId
    ? next.tracks.find((item) => item.id === options.trackId && item.kind === kind && !item.locked)
    : undefined
  if (!track) track = next.tracks.find((item) => item.kind === kind && !item.locked)
  if (!track) {
    const created = makeTrack(kind, nextTrackName(next, kind))
    next = {
      ...next,
      tracks: kind === 'video' ? [created, ...next.tracks] : [...next.tracks, created],
    }
    track = created
  }

  const isImage = asset.kind === 'image'
  const duration = isImage ? EDITOR_DEFAULT_IMAGE_DURATION : Math.max(MIN_CLIP_DURATION, asset.duration)
  const existing = clipsInTrack(next, track.id)
  const desired =
    options.start != null && Number.isFinite(options.start)
      ? options.start
      : existing.length > 0
        ? clipEnd(existing[existing.length - 1])
        : 0
  const start = options.exactStart
    ? roundTime(Math.max(0, desired))
    : findFreeStart(existing, desired, duration)
  const clip: EditorClip = {
    id: createEditorId(),
    assetId: asset.id,
    trackId: track.id,
    start,
    inPoint: 0,
    outPoint: roundTime(duration),
    sourceDuration: isImage ? null : asset.duration,
    volume: 1,
    muted: false,
    fit: 'contain',
    scale: 1,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: [],
    animation: { ...EDITOR_DEFAULT_CLIP_ANIMATION },
    role: 'media',
    effectId: null,
    text: null,
  }
  return { timeline: { ...next, clips: [...next.clips, clip] }, clipId: clip.id }
}

export function moveClip(
  timeline: EditorTimeline,
  clipId: string,
  target: { start: number; trackId?: string | null },
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !isTrackEditable(timeline, clip.trackId)) return timeline
  const currentTrack = findTrack(timeline, clip.trackId)
  const wanted = target.trackId ? findTrack(timeline, target.trackId) : undefined
  const trackId =
    wanted && !wanted.locked && wanted.kind === currentTrack?.kind ? wanted.id : clip.trackId
  const others = clipsInTrack(timeline, trackId, new Set([clipId]))
  const start = findFreeStart(others, target.start, clipDuration(clip))
  if (start === clip.start && trackId === clip.trackId) return timeline
  return replaceClip(timeline, { ...clip, start, trackId })
}

/** Posiciona o clipe no tempo exato (ex.: sync com corte da música), sem empurrar para o próximo buraco. */
export function placeClipAt(timeline: EditorTimeline, clipId: string, start: number): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !isTrackEditable(timeline, clip.trackId)) return timeline
  const nextStart = roundTime(Math.max(0, start))
  if (Math.abs(clip.start - nextStart) < EPS) return timeline
  return replaceClip(timeline, { ...clip, start: nextStart })
}

export function trimClip(
  timeline: EditorTimeline,
  clipId: string,
  edge: 'start' | 'end',
  time: number,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !isTrackEditable(timeline, clip.trackId)) return timeline
  const others = clipsInTrack(timeline, clip.trackId, new Set([clipId]))
  const isImage = clip.sourceDuration == null
  const end = clipEnd(clip)

  if (edge === 'start') {
    const previousEnd = others
      .filter((other) => clipEnd(other) <= clip.start + EPS)
      .reduce((max, other) => Math.max(max, clipEnd(other)), 0)
    const sourceLimit = isImage ? 0 : clip.start - clip.inPoint
    const minStart = Math.max(previousEnd, sourceLimit, 0)
    const maxStart = end - MIN_CLIP_DURATION
    const start = roundTime(clamp(time, minStart, maxStart))
    if (isImage) {
      return replaceClip(timeline, { ...clip, start, inPoint: 0, outPoint: roundTime(end - start) })
    }
    const inPoint = roundTime(clip.inPoint + (start - clip.start))
    return replaceClip(timeline, { ...clip, start, inPoint })
  }

  const nextStart = others
    .filter((other) => other.start >= end - EPS)
    .reduce((min, other) => Math.min(min, other.start), Number.POSITIVE_INFINITY)
  const sourceLimit = isImage
    ? Number.POSITIVE_INFINITY
    : clip.start + ((clip.sourceDuration ?? 0) - clip.inPoint)
  const maxEnd = Math.min(nextStart, sourceLimit)
  const minEnd = clip.start + MIN_CLIP_DURATION
  const nextEnd = clamp(time, minEnd, maxEnd)
  const outPoint = roundTime(clip.inPoint + (nextEnd - clip.start))
  return replaceClip(timeline, { ...clip, outPoint })
}

export function splitClip(
  timeline: EditorTimeline,
  clipId: string,
  time: number,
): { timeline: EditorTimeline; rightId: string | null } {
  const clip = findClip(timeline, clipId)
  if (!clip || !isTrackEditable(timeline, clip.trackId)) return { timeline, rightId: null }
  const end = clipEnd(clip)
  if (time <= clip.start + MIN_CLIP_DURATION - EPS || time >= end - MIN_CLIP_DURATION + EPS) {
    return { timeline, rightId: null }
  }
  const local = roundTime(time - clip.start)
  const cut = roundTime(clip.inPoint + local)
  const left: EditorClip = { ...clip, outPoint: cut }
  const right: EditorClip = { ...clip, id: createEditorId(), start: roundTime(time), inPoint: cut }
  const clips: EditorClip[] = []
  for (const item of timeline.clips) {
    if (item.id === clip.id) clips.push(left, right)
    else clips.push(item)
  }
  return { timeline: { ...timeline, clips }, rightId: right.id }
}

/** Divide os clipes indicados (ou todos sob o playhead) no tempo informado. */
export function splitAt(
  timeline: EditorTimeline,
  time: number,
  clipIds?: readonly string[],
): EditorTimeline {
  const targets =
    clipIds && clipIds.length > 0
      ? clipIds
      : clipsAt(timeline, time)
          .filter((clip) => isTrackEditable(timeline, clip.trackId))
          .map((clip) => clip.id)
  let next = timeline
  for (const id of targets) next = splitClip(next, id, time).timeline
  return next
}

export function deleteClips(
  timeline: EditorTimeline,
  clipIds: readonly string[],
  ripple = false,
): EditorTimeline {
  const removable = timeline.clips.filter(
    (clip) => clipIds.includes(clip.id) && isTrackEditable(timeline, clip.trackId),
  )
  if (removable.length === 0) return timeline
  const removedIds = new Set(removable.map((clip) => clip.id))
  let clips = timeline.clips.filter((clip) => !removedIds.has(clip.id))
  if (ripple) {
    const ordered = [...removable].sort((a, b) => b.start - a.start)
    for (const removed of ordered) {
      const gap = clipDuration(removed)
      const from = clipEnd(removed) - EPS
      clips = clips.map((clip) =>
        clip.trackId === removed.trackId && clip.start >= from
          ? { ...clip, start: roundTime(Math.max(0, clip.start - gap)) }
          : clip,
      )
    }
  }
  return { ...timeline, clips }
}

export function removeAssetClips(timeline: EditorTimeline, assetId: string): EditorTimeline {
  if (!timeline.clips.some((clip) => clip.assetId === assetId)) return timeline
  return { ...timeline, clips: timeline.clips.filter((clip) => clip.assetId !== assetId) }
}

/**
 * Corta o clipe para a duração do trecho na música (remove 1s/ms a mais do vídeo).
 * Mantém o início alinhado e corta o excedente no final.
 */
export function fitClipToMusicDuration(
  timeline: EditorTimeline,
  clipId: string,
  musicDuration: number,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !(musicDuration > 0)) return timeline
  const sourceLimit =
    clip.sourceDuration != null && Number.isFinite(clip.sourceDuration)
      ? Math.max(0, clip.sourceDuration)
      : Number.POSITIVE_INFINITY
  // Do início da fonte até a duração da música — corta o excedente no final.
  const target = roundTime(Math.max(MIN_CLIP_DURATION, Math.min(musicDuration, sourceLimit)))
  const inPoint = 0
  const outPoint = target
  if (Math.abs(outPoint - clip.outPoint) < EPS && Math.abs(inPoint - clip.inPoint) < EPS) {
    return timeline
  }
  return replaceClip(timeline, { ...clip, inPoint, outPoint })
}

function normalizeClipEffects(raw: unknown): EditorClipEffect[] {
  if (!Array.isArray(raw)) return []
  const out: EditorClipEffect[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = typeof (item as EditorClipEffect).id === 'string' ? (item as EditorClipEffect).id : ''
    if (!id || !editorEffectById(id)) continue
    out.push({
      id,
      intensity: clamp(asNumber((item as EditorClipEffect).intensity, 1), 0.1, 2),
    })
  }
  return out
}

export function setEffectIntensity(
  timeline: EditorTimeline,
  clipId: string,
  intensity: number,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !isEffectClip(clip) || !clip.effectId) return timeline
  return updateClip(timeline, clipId, {
    effects: [{ id: clip.effectId, intensity: clamp(intensity, 0.1, 2) }],
  })
}

export function updateClip(
  timeline: EditorTimeline,
  clipId: string,
  patch: Partial<
    Pick<
      EditorClip,
      'volume' | 'muted' | 'fit' | 'scale' | 'opacity' | 'fadeIn' | 'fadeOut' | 'effects' | 'animation'
    >
  >,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip) return timeline
  const duration = clipDuration(clip)
  const volume =
    patch.volume !== undefined && Number.isFinite(patch.volume)
      ? clamp(patch.volume, 0, MAX_CLIP_VOLUME)
      : clip.volume
  const scale =
    patch.scale !== undefined && Number.isFinite(patch.scale)
      ? clamp(patch.scale, MIN_CLIP_SCALE, MAX_CLIP_SCALE)
      : clip.scale
  const opacity =
    patch.opacity !== undefined && Number.isFinite(patch.opacity)
      ? clamp(patch.opacity, 0, 1)
      : clip.opacity
  const fadeIn =
    patch.fadeIn !== undefined && Number.isFinite(patch.fadeIn)
      ? clamp(patch.fadeIn, 0, Math.max(0, duration))
      : clip.fadeIn
  const fadeOut =
    patch.fadeOut !== undefined && Number.isFinite(patch.fadeOut)
      ? clamp(patch.fadeOut, 0, Math.max(0, duration))
      : clip.fadeOut
  const effects =
    patch.effects !== undefined ? normalizeClipEffects(patch.effects) : normalizeClipEffects(clip.effects)
  const animation =
    patch.animation !== undefined ? normalizeClipAnimation(patch.animation) : normalizeClipAnimation(clip.animation)
  return replaceClip(timeline, {
    ...clip,
    ...patch,
    volume,
    scale,
    opacity,
    fadeIn,
    fadeOut,
    effects,
    animation,
  })
}

export function updateTextContent(
  timeline: EditorTimeline,
  clipId: string,
  patch: Partial<EditorTextContent>,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !isTextClip(clip) || !clip.text) return timeline
  const merged: EditorTextContent = {
    ...clip.text,
    ...patch,
    titleStyle:
      patch.titleStyle === undefined
        ? clip.text.titleStyle
        : patch.titleStyle == null
          ? null
          : { ...(clip.text.titleStyle ?? {}), ...patch.titleStyle },
    subtitleStyle:
      patch.subtitleStyle === undefined
        ? clip.text.subtitleStyle
        : patch.subtitleStyle == null
          ? null
          : { ...(clip.text.subtitleStyle ?? {}), ...patch.subtitleStyle },
  }
  const nextText = normalizeTextContent(merged)
  if (!nextText) return timeline
  return replaceClip(timeline, {
    ...clip,
    text: nextText,
    assetId: textAssetId(nextText.templateId),
  })
}

/** Define ou remove (toggle) uma animação de entrada/saída/combo no clipe. */
export function setClipAnimationSlot(
  timeline: EditorTimeline,
  clipId: string,
  kind: EditorAnimationKind,
  animationId: string | null,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || isEffectClip(clip)) return timeline
  const current = normalizeClipAnimation(clip.animation)
  const def = animationId ? editorAnimationById(animationId) : undefined
  if (animationId && (!def || def.kind !== kind)) return timeline
  const next: EditorClipAnimation = { ...current }
  if (kind === 'in') next.inId = current.inId === animationId ? null : animationId
  if (kind === 'out') next.outId = current.outId === animationId ? null : animationId
  if (kind === 'combo') next.comboId = current.comboId === animationId ? null : animationId
  return updateClip(timeline, clipId, { animation: next })
}

export function setWatermarkAnimationSlot(
  timeline: EditorTimeline,
  kind: EditorAnimationKind,
  animationId: string | null,
  watermarkId?: string | null,
): EditorTimeline {
  const watermark =
    (watermarkId ? findWatermark(timeline, watermarkId) : undefined) ?? timeline.watermarks[0]
  if (!watermark) return timeline
  const current = normalizeClipAnimation(watermark.animation)
  const def = animationId ? editorAnimationById(animationId) : undefined
  if (animationId && (!def || def.kind !== kind)) return timeline
  const next: EditorClipAnimation = { ...current }
  if (kind === 'in') next.inId = current.inId === animationId ? null : animationId
  if (kind === 'out') next.outId = current.outId === animationId ? null : animationId
  if (kind === 'combo') next.comboId = current.comboId === animationId ? null : animationId
  return upsertWatermark(timeline, { ...watermark, animation: normalizeClipAnimation(next) })
}

export function patchClipAnimation(
  timeline: EditorTimeline,
  clipId: string,
  patch: Partial<EditorClipAnimation>,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip) return timeline
  return updateClip(timeline, clipId, {
    animation: normalizeClipAnimation({ ...clip.animation, ...patch }),
  })
}

export function patchWatermarkAnimation(
  timeline: EditorTimeline,
  patch: Partial<EditorClipAnimation>,
  watermarkId?: string | null,
): EditorTimeline {
  const watermark =
    (watermarkId ? findWatermark(timeline, watermarkId) : undefined) ?? timeline.watermarks[0]
  if (!watermark) return timeline
  return upsertWatermark(timeline, {
    ...watermark,
    animation: normalizeClipAnimation({ ...watermark.animation, ...patch }),
  })
}

/** Adiciona (ou reforça) um efeito no clipe. */
export function addClipEffect(
  timeline: EditorTimeline,
  clipId: string,
  effectId: EditorEffectId,
  intensity = 1,
): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip || !editorEffectById(effectId)) return timeline
  const existing = normalizeClipEffects(clip.effects).filter((item) => item.id !== effectId)
  return updateClip(timeline, clipId, {
    effects: [...existing, { id: effectId, intensity: clamp(intensity, 0.1, 2) }],
  })
}

export function removeClipEffect(timeline: EditorTimeline, clipId: string, effectId: string): EditorTimeline {
  const clip = findClip(timeline, clipId)
  if (!clip) return timeline
  return updateClip(timeline, clipId, {
    effects: normalizeClipEffects(clip.effects).filter((item) => item.id !== effectId),
  })
}

export function clipsAt(timeline: EditorTimeline, time: number): EditorClip[] {
  return timeline.clips.filter((clip) => clip.start <= time + EPS && time < clipEnd(clip) - EPS)
}

export function sourceTimeAt(clip: EditorClip, time: number): number {
  return clip.inPoint + (time - clip.start)
}

export function snapCandidates(
  timeline: EditorTimeline,
  excludeClipId: string | null,
  extra: number[] = [],
): number[] {
  const values = new Set<number>([0, ...extra.filter((value) => Number.isFinite(value))])
  for (const clip of timeline.clips) {
    if (clip.id === excludeClipId) continue
    values.add(roundTime(clip.start))
    values.add(roundTime(clipEnd(clip)))
  }
  return [...values].sort((a, b) => a - b)
}

function nearestCandidate(time: number, candidates: number[], threshold: number): number | null {
  let best: number | null = null
  let bestDistance = threshold
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - time)
    if (distance <= bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

export function snapTime(time: number, candidates: number[], threshold: number): number {
  return nearestCandidate(time, candidates, threshold) ?? time
}

/** Encaixa o início ou o fim do clipe, o que estiver mais perto de um ponto de snap. */
export function snapClipStart(
  start: number,
  duration: number,
  candidates: number[],
  threshold: number,
): number {
  const byStart = nearestCandidate(start, candidates, threshold)
  const byEndPoint = nearestCandidate(start + duration, candidates, threshold)
  if (byStart == null && byEndPoint == null) return start
  if (byEndPoint == null) return byStart!
  const byEnd = roundTime(byEndPoint - duration)
  if (byStart == null) return byEnd
  return Math.abs(byStart - start) <= Math.abs(byEndPoint - (start + duration)) ? byStart : byEnd
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asFit(value: unknown): EditorClipFit {
  return value === 'cover' ? 'cover' : 'contain'
}

/** Lê o JSON persistido sem confiar no formato: descarta o que estiver quebrado. */
export function normalizeTimeline(raw: unknown, fallbackAspect: EditorAspect = '16:9'): EditorTimeline {
  if (!raw || typeof raw !== 'object') return createEmptyTimeline(fallbackAspect)
  const source = raw as Partial<EditorTimeline>
  const aspect = EDITOR_ASPECTS.includes(source.aspect as EditorAspect)
    ? (source.aspect as EditorAspect)
    : fallbackAspect
  const fps = clamp(Math.round(asNumber(source.fps, 30)), 12, 60)

  const parsedTracks: EditorTrack[] = []
  for (const item of Array.isArray(source.tracks) ? source.tracks : []) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue
    const kind = asTrackKind(item.kind)
    parsedTracks.push({
      id: item.id,
      kind,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name
          : kind === 'audio'
            ? 'Áudio'
            : kind === 'effect'
              ? 'Efeito'
              : kind === 'text'
                ? 'Texto'
                : 'Vídeo',
      muted: Boolean(item.muted),
      locked: Boolean(item.locked),
      hidden: Boolean(item.hidden),
    })
  }
  if (parsedTracks.length === 0) {
    return { ...createEmptyTimeline(aspect, fps), watermarks: normalizeWatermarks(source) }
  }

  // Música/áudio sempre no fim (mesma invariante de moveTrack).
  const tracks = [
    ...parsedTracks.filter((track) => track.kind !== 'audio'),
    ...parsedTracks.filter((track) => track.kind === 'audio'),
  ]

  const trackIds = new Set(tracks.map((track) => track.id))
  const trackById = new Map(tracks.map((track) => [track.id, track]))
  const clips: EditorClip[] = []
  for (const item of Array.isArray(source.clips) ? source.clips : []) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.id !== 'string') continue
    if (!trackIds.has(item.trackId)) continue
    const track = trackById.get(item.trackId)
    let role: EditorClipRole =
      asClipRole(item.role) === 'effect' || track?.kind === 'effect'
        ? 'effect'
        : asClipRole(item.role) === 'text' || track?.kind === 'text'
          ? 'text'
          : 'media'
    if (
      role === 'media' &&
      typeof item.assetId === 'string' &&
      item.assetId.startsWith(EDITOR_TEXT_ASSET_PREFIX)
    ) {
      role = 'text'
    }
    const effectIdRaw =
      typeof item.effectId === 'string' && item.effectId.trim()
        ? item.effectId.trim()
        : typeof item.assetId === 'string' && item.assetId.startsWith(EDITOR_EFFECT_ASSET_PREFIX)
          ? item.assetId.slice(EDITOR_EFFECT_ASSET_PREFIX.length)
          : null
    const effectId = role === 'effect' && effectIdRaw && editorEffectById(effectIdRaw) ? effectIdRaw : null
    const textFromAsset =
      typeof item.assetId === 'string' && item.assetId.startsWith(EDITOR_TEXT_ASSET_PREFIX)
        ? { templateId: item.assetId.slice(EDITOR_TEXT_ASSET_PREFIX.length) }
        : null
    const text = role === 'text' ? normalizeTextContent(item.text ?? textFromAsset) : null
    if (role === 'effect' && !effectId) continue
    if (role === 'text' && !text) continue
    if (role === 'media' && (typeof item.assetId !== 'string' || !item.assetId)) continue

    const inPoint = Math.max(0, asNumber(item.inPoint, 0))
    const outPoint = asNumber(item.outPoint, 0)
    if (outPoint - inPoint < MIN_CLIP_DURATION - EPS) continue
    const sourceDuration =
      role === 'effect' || role === 'text' || item.sourceDuration == null
        ? null
        : Math.max(0, asNumber(item.sourceDuration, outPoint))
    const rawEffects = Array.isArray(item.effects) ? item.effects : []
    const firstIntensity =
      rawEffects[0] && typeof rawEffects[0] === 'object'
        ? asNumber((rawEffects[0] as { intensity?: unknown }).intensity, 1)
        : 1
    const effects =
      role === 'effect' && effectId
        ? normalizeClipEffects([{ id: effectId, intensity: firstIntensity }])
        : normalizeClipEffects(item.effects)
    clips.push({
      id: item.id,
      assetId:
        role === 'effect' && effectId
          ? effectAssetId(effectId)
          : role === 'text' && text
            ? textAssetId(text.templateId)
            : item.assetId,
      trackId: item.trackId,
      start: Math.max(0, asNumber(item.start, 0)),
      inPoint,
      outPoint,
      sourceDuration,
      volume: clamp(asNumber(item.volume, 1), 0, MAX_CLIP_VOLUME),
      muted: Boolean(item.muted),
      fit: asFit(item.fit),
      scale: clamp(asNumber(item.scale, 1), MIN_CLIP_SCALE, MAX_CLIP_SCALE),
      opacity: clamp(asNumber(item.opacity, 1), 0, 1),
      fadeIn: clamp(asNumber(item.fadeIn, 0), 0, Math.max(0, outPoint - inPoint)),
      fadeOut: clamp(asNumber(item.fadeOut, 0), 0, Math.max(0, outPoint - inPoint)),
      effects,
      animation: normalizeClipAnimation(item.animation),
      role,
      effectId,
      text,
    })
  }
  return { aspect, fps, tracks, clips, watermarks: normalizeWatermarks(source) }
}
