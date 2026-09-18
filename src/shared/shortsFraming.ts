export const FRAMING_OUTPUT_WIDTH = 1080
export const FRAMING_OUTPUT_HEIGHT = 1920

export type ShortsFramingMode =
  | 'auto'
  | 'lead_singer'
  | 'active_subject'
  | 'wide_stage'
  | 'two_subjects'
  | 'split_screen'

export type ShortsFramingAspect =
  | 'original'
  | 'center_9_16'
  | 'auto_focus_9_16'
  | ShortsFramingMode

export type ShortsFramingFocus = 'center' | 'lead' | 'active' | 'pair' | 'split'

export type ShortsSubjectRole = 'lead' | 'subject1' | 'subject2'

export interface ShortsDetectedBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  motion?: number
}

export interface ShortsTrackedSubject {
  id: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  vocalActivity: number
}

export interface ShortsFramingSample {
  time: number
  subjects: ShortsTrackedSubject[]
}

export interface ShortsManualAnchor {
  id: string
  role: ShortsSubjectRole
  x: number
  y: number
  width: number
  height: number
}

export interface ShortsFramingSettings {
  lockLead: boolean
  preferSplit: boolean
  preventFocusSwitch: boolean
  leadSubjectId: string | null
  subject1Id: string | null
  subject2Id: string | null
  manualAnchors: ShortsManualAnchor[]
  picking: ShortsSubjectRole | null
}

export interface ShortsCropWindow {
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

export interface ShortsFramingKeyframe extends ShortsCropWindow {
  time: number
  layout: 'crop' | 'split'
  top?: ShortsCropWindow
  bottom?: ShortsCropWindow
  subjectIds: string[]
  focusStrategy: ShortsFramingFocus
}

export interface ShortsFramingPlan {
  mode: ShortsFramingAspect
  sourceWidth: number
  sourceHeight: number
  keyframes: ShortsFramingKeyframe[]
  subjects: Array<{ id: string; label: string }>
  usedFallback: boolean
  confidence: number
  animated: boolean
}

export interface ShortsFramingPreviewFrame {
  aspectRatio: number
  videoWidthPct: number
  videoHeightPct: number
  videoLeftPct: number
  videoTopPct: number
  cropped: boolean
  layout: 'crop' | 'split' | 'original'
  top?: { videoWidthPct: number; videoHeightPct: number; videoLeftPct: number; videoTopPct: number }
  bottom?: { videoWidthPct: number; videoHeightPct: number; videoLeftPct: number; videoTopPct: number }
}

export interface ShortsFramingExportFilter {
  videoFilter?: string
  filterComplex?: string
}

export const DEFAULT_FRAMING_SETTINGS: ShortsFramingSettings = {
  lockLead: false,
  preferSplit: false,
  preventFocusSwitch: false,
  leadSubjectId: null,
  subject1Id: null,
  subject2Id: null,
  manualAnchors: [],
  picking: null,
}

export const SHORTS_FRAMING_MODES: Array<{ id: ShortsFramingMode; label: string; hint: string }> = [
  { id: 'auto', label: 'Automático', hint: 'Escolhe crop, dois sujeitos ou split conforme a cena.' },
  { id: 'lead_singer', label: 'Focar cantor principal', hint: 'Segue o cantor com movimento suave. Rosto, boca e microfone visíveis.' },
  { id: 'active_subject', label: 'Focar sujeito ativo', hint: 'Muda o foco só quando outro sujeito fica claramente mais relevante.' },
  { id: 'wide_stage', label: 'Palco aberto', hint: '9:16 amplo, com o grupo no quadro e pouco recorte.' },
  { id: 'two_subjects', label: 'Dois sujeitos no mesmo quadro', hint: 'Mantém os dois visíveis quando estão perto o bastante.' },
  { id: 'split_screen', label: 'Tela dividida', hint: 'Dois recortes empilhados quando os sujeitos estão afastados.' },
]

export function isShortsFramingMode(value: unknown): value is ShortsFramingMode {
  return (
    value === 'auto' ||
    value === 'lead_singer' ||
    value === 'active_subject' ||
    value === 'wide_stage' ||
    value === 'two_subjects' ||
    value === 'split_screen'
  )
}

export function normalizeShortsAspectMode(value: unknown): ShortsFramingAspect {
  if (value === 'original') return 'original'
  if (value === 'center_9_16' || value === 'wide_stage') return 'wide_stage'
  if (value === 'auto_focus_9_16' || value === 'auto') return 'auto'
  if (isShortsFramingMode(value)) return value
  return 'wide_stage'
}

export function isVerticalAspectMode(mode: ShortsFramingAspect): boolean {
  return normalizeShortsAspectMode(mode) !== 'original'
}

export function verticalFramingMode(mode: ShortsFramingAspect): ShortsFramingMode {
  const normalized = normalizeShortsAspectMode(mode)
  return isShortsFramingMode(normalized) ? normalized : 'auto'
}

export function planFramingSampleTimes(duration: number, maxSamples = 48): number[] {
  const total = Math.max(0, duration)
  if (total <= 0) return [0]
  const count = Math.max(2, Math.min(maxSamples, Math.round(total / Math.max(1.5, total / maxSamples)) + 1))
  const step = total / Math.max(1, count - 1)
  const times: number[] = []
  for (let i = 0; i < count; i += 1) {
    times.push(Math.round(Math.min(total, i * step) * 100) / 100)
  }
  return times
}

export function normalizeFramingSettings(value: unknown): ShortsFramingSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const anchors = Array.isArray(record.manualAnchors)
    ? record.manualAnchors
        .map((item) => normalizeManualAnchor(item))
        .filter((item): item is ShortsManualAnchor => Boolean(item))
    : []
  const picking =
    record.picking === 'lead' || record.picking === 'subject1' || record.picking === 'subject2'
      ? record.picking
      : null
  return {
    lockLead: Boolean(record.lockLead),
    preferSplit: Boolean(record.preferSplit),
    preventFocusSwitch: Boolean(record.preventFocusSwitch),
    leadSubjectId: asId(record.leadSubjectId),
    subject1Id: asId(record.subject1Id),
    subject2Id: asId(record.subject2Id),
    manualAnchors: anchors,
    picking,
  }
}

export function normalizeFramingTrack(value: unknown): ShortsFramingSample[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const time = Number(record.time)
      if (!Number.isFinite(time)) return null
      const subjects = Array.isArray(record.subjects)
        ? record.subjects
            .map((subject) => normalizeTrackedSubject(subject))
            .filter((subject): subject is ShortsTrackedSubject => Boolean(subject))
        : []
      return { time, subjects }
    })
    .filter((item): item is ShortsFramingSample => Boolean(item))
    .sort((a, b) => a.time - b.time)
}

function asId(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeManualAnchor(value: unknown): ShortsManualAnchor | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const role = record.role === 'lead' || record.role === 'subject1' || record.role === 'subject2' ? record.role : null
  const x = Number(record.x)
  const y = Number(record.y)
  if (!role || !Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    id: asId(record.id) || `manual-${role}`,
    role,
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(Number(record.width) || 0.12),
    height: clamp01(Number(record.height) || 0.22),
  }
}

function normalizeTrackedSubject(value: unknown): ShortsTrackedSubject | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = asId(record.id)
  const x = Number(record.x)
  const y = Number(record.y)
  if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    id,
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(Number(record.width) || 0.1),
    height: clamp01(Number(record.height) || 0.18),
    confidence: clamp01(Number(record.confidence) || 0),
    vocalActivity: clamp01(Number(record.vocalActivity) || 0),
  }
}

export function evenPixel(value: number): number {
  const rounded = Math.max(2, Math.floor(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

export function maxVerticalCrop(width: number, height: number): ShortsCropWindow {
  const srcW = Math.max(2, Math.round(width))
  const srcH = Math.max(2, Math.round(height))
  const targetRatio = 9 / 16
  const srcRatio = srcW / srcH
  let cropW: number
  let cropH: number
  if (srcRatio > targetRatio) {
    cropH = evenPixel(srcH)
    cropW = evenPixel(srcH * targetRatio)
  } else {
    cropW = evenPixel(srcW)
    cropH = evenPixel(srcW / targetRatio)
  }
  cropW = Math.min(cropW, evenPixel(srcW))
  cropH = Math.min(cropH, evenPixel(srcH))
  return {
    cropWidth: cropW,
    cropHeight: cropH,
    cropX: evenPixel((srcW - cropW) / 2),
    cropY: evenPixel((srcH - cropH) / 2),
  }
}

export function splitPaneCropSize(width: number, height: number): { cropWidth: number; cropHeight: number } {
  const srcW = Math.max(2, Math.round(width))
  const srcH = Math.max(2, Math.round(height))
  const targetRatio = 1080 / 960
  let cropW: number
  let cropH: number
  if (srcW / srcH > targetRatio) {
    cropH = evenPixel(Math.min(srcH, srcW / targetRatio))
    cropW = evenPixel(cropH * targetRatio)
  } else {
    cropW = evenPixel(Math.min(srcW, srcH * targetRatio))
    cropH = evenPixel(cropW / targetRatio)
  }
  return {
    cropWidth: Math.min(cropW, evenPixel(srcW)),
    cropHeight: Math.min(cropH, evenPixel(srcH)),
  }
}

export function isSkinPixel(r: number, g: number, b: number): boolean {
  return r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15 && r - b > 15
}

export function detectSubjectsInRgb(frame: Uint8Array, width: number, height: number): ShortsDetectedBox[] {
  if (width < 8 || height < 8 || frame.length < width * height * 3) return []
  const cols = Math.max(8, Math.min(32, Math.round(width / 5)))
  const colW = width / cols
  const scores = new Array<number>(cols).fill(0)
  const ys = new Array<number>(cols).fill(0)
  const counts = new Array<number>(cols).fill(0)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3
      const r = frame[i] ?? 0
      const g = frame[i + 1] ?? 0
      const b = frame[i + 2] ?? 0
      if (!isSkinPixel(r, g, b)) continue
      const col = Math.min(cols - 1, Math.floor(x / colW))
      const weight = y < height * 0.72 ? 1.2 : 0.45
      scores[col] += weight
      ys[col] += y
      counts[col] += 1
    }
  }
  const peaks: number[] = []
  const minScore = Math.max(8, (width * height) / 900)
  for (let i = 1; i < cols - 1; i += 1) {
    const score = scores[i] ?? 0
    if (score < minScore) continue
    if (score >= (scores[i - 1] ?? 0) && score >= (scores[i + 1] ?? 0)) peaks.push(i)
  }
  if (peaks.length === 0) {
    const best = scores.indexOf(Math.max(...scores))
    if ((scores[best] ?? 0) >= minScore) peaks.push(best)
  }
  const boxes: ShortsDetectedBox[] = []
  for (const col of peaks) {
    const count = counts[col] || 1
    const cx = ((col + 0.5) * colW) / width
    const cy = (ys[col] / count) / height
    const span = Math.max(2, Math.round(width * 0.08 / colW))
    let mass = 0
    for (let k = Math.max(0, col - span); k <= Math.min(cols - 1, col + span); k += 1) mass += scores[k] ?? 0
    const widthNorm = clamp(0.08 + mass / (width * height * 0.08), 0.08, 0.22)
    const heightNorm = clamp(widthNorm * 1.7, 0.14, 0.36)
    boxes.push({
      x: clamp01(cx),
      y: clamp01(cy),
      width: widthNorm,
      height: heightNorm,
      confidence: clamp01(mass / (minScore * 8)),
    })
  }
  boxes.sort((a, b) => b.confidence - a.confidence || Math.abs(0.5 - a.x) - Math.abs(0.5 - b.x))
  return mergeNearbyBoxes(boxes).slice(0, 3)
}

function mergeNearbyBoxes(boxes: ShortsDetectedBox[]): ShortsDetectedBox[] {
  const merged: ShortsDetectedBox[] = []
  for (const box of boxes) {
    const near = merged.find((item) => Math.abs(item.x - box.x) < 0.1)
    if (!near) {
      merged.push({ ...box })
      continue
    }
    if (box.confidence > near.confidence) {
      near.x = box.x
      near.y = box.y
      near.width = box.width
      near.height = box.height
      near.confidence = box.confidence
    }
  }
  return merged
}

export function trackSubjects(
  frames: Array<{ time: number; boxes: ShortsDetectedBox[]; vocalActivity?: number }>,
): ShortsFramingSample[] {
  const tracks: Array<{ id: string; x: number; y: number; missed: number }> = []
  let nextId = 1
  const samples: ShortsFramingSample[] = []
  let prevBoxes: ShortsDetectedBox[] = []
  for (const frame of frames) {
    const subjects: ShortsTrackedSubject[] = []
    const used = new Set<string>()
    const ordered = [...frame.boxes].sort((a, b) => b.confidence - a.confidence)
    for (const box of ordered) {
      let best = -1
      let bestDist = 0.14
      for (let i = 0; i < tracks.length; i += 1) {
        const track = tracks[i]
        if (!track || used.has(track.id)) continue
        const dist = Math.hypot(track.x - box.x, track.y - box.y)
        if (dist < bestDist) {
          best = i
          bestDist = dist
        }
      }
      let id: string
      if (best >= 0 && tracks[best]) {
        const track = tracks[best]
        track.x = track.x * 0.65 + box.x * 0.35
        track.y = track.y * 0.65 + box.y * 0.35
        track.missed = 0
        id = track.id
        used.add(id)
      } else {
        id = `s${nextId}`
        nextId += 1
        tracks.push({ id, x: box.x, y: box.y, missed: 0 })
        used.add(id)
      }
      const prev = prevBoxes.find((item) => Math.abs(item.x - box.x) < 0.18)
      const motion = prev ? Math.min(1, Math.hypot(box.x - prev.x, box.y - prev.y) * 8) : 0.2
      subjects.push({
        id,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        confidence: box.confidence,
        vocalActivity: clamp01((frame.vocalActivity ?? 0.4) * (0.55 + motion * 0.45)),
      })
    }
    for (const track of tracks) {
      if (!used.has(track.id)) track.missed += 1
    }
    samples.push({ time: frame.time, subjects })
    prevBoxes = ordered
  }
  return samples
}

export function subjectsFitTogether(
  a: ShortsTrackedSubject,
  b: ShortsTrackedSubject,
  cropWidth: number,
  sourceWidth: number,
): boolean {
  const pad = Math.max(a.width, b.width) * 0.22
  const left = Math.min(a.x - a.width / 2, b.x - b.width / 2) - pad
  const right = Math.max(a.x + a.width / 2, b.x + b.width / 2) + pad
  return (right - left) * sourceWidth <= cropWidth * 0.98
}

function clampWindow(window: ShortsCropWindow, srcW: number, srcH: number): ShortsCropWindow {
  const cropWidth = evenPixel(Math.min(window.cropWidth, srcW))
  const cropHeight = evenPixel(Math.min(window.cropHeight, srcH))
  const cropX = evenPixel(clamp(window.cropX, 0, Math.max(0, srcW - cropWidth)))
  const cropY = evenPixel(clamp(window.cropY, 0, Math.max(0, srcH - cropHeight)))
  return { cropX, cropY, cropWidth, cropHeight }
}

function windowAround(
  subject: Pick<ShortsTrackedSubject, 'x' | 'y'>,
  size: { cropWidth: number; cropHeight: number },
  srcW: number,
  srcH: number,
  headroom = 0.38,
): ShortsCropWindow {
  const cropX = subject.x * srcW - size.cropWidth / 2
  const cropY = subject.y * srcH - size.cropHeight * headroom
  return clampWindow({ ...size, cropX, cropY }, srcW, srcH)
}

function pairWindow(
  a: ShortsTrackedSubject,
  b: ShortsTrackedSubject,
  size: { cropWidth: number; cropHeight: number },
  srcW: number,
  srcH: number,
): ShortsCropWindow {
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  return windowAround({ x: midX, y: midY }, size, srcW, srcH, 0.42)
}

function scoreSubject(subject: ShortsTrackedSubject, preferId: string | null): number {
  const center = 1 - Math.abs(subject.x - 0.5) * 1.4
  const size = (subject.width + subject.height) * 1.5
  const prefer = preferId && subject.id === preferId ? 0.55 : 0
  return subject.confidence * 0.35 + center * 0.2 + subject.vocalActivity * 0.25 + size * 0.2 + prefer
}

function sampleAt(track: ShortsFramingSample[], time: number): ShortsTrackedSubject[] {
  if (track.length === 0) return []
  let best = track[0]!
  for (const item of track) {
    if (Math.abs(item.time - time) < Math.abs(best.time - time)) best = item
  }
  return best.subjects
}

function injectManual(
  subjects: ShortsTrackedSubject[],
  settings: ShortsFramingSettings,
): ShortsTrackedSubject[] {
  const next = [...subjects]
  for (const anchor of settings.manualAnchors) {
    const existing = next.find((item) => item.id === anchor.id)
    if (existing) {
      existing.x = existing.x * 0.4 + anchor.x * 0.6
      existing.y = existing.y * 0.4 + anchor.y * 0.6
      existing.confidence = Math.max(existing.confidence, 0.86)
      continue
    }
    next.push({
      id: anchor.id,
      x: anchor.x,
      y: anchor.y,
      width: anchor.width,
      height: anchor.height,
      confidence: 0.9,
      vocalActivity: 0.7,
    })
  }
  return next
}

function pickLead(subjects: ShortsTrackedSubject[], settings: ShortsFramingSettings): ShortsTrackedSubject | null {
  if (subjects.length === 0) return null
  const preferred = settings.leadSubjectId
    ? subjects.find((item) => item.id === settings.leadSubjectId)
    : null
  if (preferred && (settings.lockLead || preferred.confidence >= 0.28)) return preferred
  const leadAnchor = settings.manualAnchors.find((item) => item.role === 'lead')
  if (leadAnchor) {
    return subjects.find((item) => item.id === leadAnchor.id) ?? preferred ?? subjects[0] ?? null
  }
  return [...subjects].sort((a, b) => scoreSubject(b, settings.leadSubjectId) - scoreSubject(a, settings.leadSubjectId))[0] ?? null
}

function pickPair(subjects: ShortsTrackedSubject[], settings: ShortsFramingSettings): ShortsTrackedSubject[] {
  const byId = (id: string | null) => subjects.find((item) => item.id === id)
  const first = byId(settings.subject1Id) ?? pickLead(subjects, settings)
  const rest = subjects.filter((item) => item.id !== first?.id)
  const second =
    byId(settings.subject2Id) ??
    rest.sort((a, b) => scoreSubject(b, settings.subject2Id) - scoreSubject(a, settings.subject2Id))[0]
  return [first, second].filter((item): item is ShortsTrackedSubject => Boolean(item))
}

export function buildFramingPlan(input: {
  width: number
  height: number
  mode: ShortsFramingAspect
  settings?: ShortsFramingSettings
  track?: ShortsFramingSample[]
  clipStart?: number
  clipEnd?: number
}): ShortsFramingPlan {
  const srcW = Math.max(2, Math.round(input.width))
  const srcH = Math.max(2, Math.round(input.height))
  const mode = normalizeShortsAspectMode(input.mode)
  const settings = normalizeFramingSettings(input.settings)
  const start = input.clipStart ?? 0
  const end = input.clipEnd ?? start
  const max = maxVerticalCrop(srcW, srcH)
  const pane = splitPaneCropSize(srcW, srcH)
  if (mode === 'original') {
    return {
      mode,
      sourceWidth: srcW,
      sourceHeight: srcH,
      keyframes: [],
      subjects: [],
      usedFallback: false,
      confidence: 1,
      animated: false,
    }
  }

  const track = (input.track ?? [])
    .filter((item) => item.time >= start - 0.35 && item.time <= end + 0.35)
    .map((item) => ({ ...item, subjects: injectManual(item.subjects, settings) }))
  const times =
    track.length > 0
      ? track.map((item) => item.time)
      : settings.manualAnchors.length > 0
        ? [start, (start + end) / 2, end]
        : [start]

  const subjectIds = new Set<string>()
  const raw: ShortsFramingKeyframe[] = []
  let activeId: string | null = settings.preventFocusSwitch || settings.lockLead ? settings.leadSubjectId : null
  let switchAt = start
  let confidenceSum = 0
  let fallbackCount = 0

  for (const time of times) {
    const subjects = injectManual(sampleAt(track, time), settings)
    subjects.forEach((item) => subjectIds.add(item.id))
    const lead = pickLead(subjects, settings)
    const pair = pickPair(subjects, settings)
    let focus = lead
    if (mode === 'active_subject' && !settings.lockLead && !settings.preventFocusSwitch) {
      const ranked = [...subjects].sort((a, b) => scoreSubject(b, activeId) - scoreSubject(a, activeId))
      const candidate = ranked[0]
      if (candidate && activeId && candidate.id !== activeId) {
        const current = subjects.find((item) => item.id === activeId)
        const gap = scoreSubject(candidate, null) - (current ? scoreSubject(current, activeId) : 0)
        if (gap > 0.22 && time - switchAt >= 1.35) {
          activeId = candidate.id
          switchAt = time
        }
      } else if (candidate && !activeId) {
        activeId = candidate.id
        switchAt = time
      }
      focus = subjects.find((item) => item.id === activeId) ?? candidate ?? lead
    } else if (mode === 'lead_singer' || settings.lockLead) {
      focus = lead
      if (settings.preventFocusSwitch && activeId) {
        focus = subjects.find((item) => item.id === activeId) ?? lead
      } else if (lead) {
        activeId = lead.id
      }
    } else if (focus) {
      activeId = focus.id
    }

    const two = pair.length >= 2 ? (pair as [ShortsTrackedSubject, ShortsTrackedSubject]) : null
    const far = two ? !subjectsFitTogether(two[0], two[1], max.cropWidth, srcW) : false
    const wantSplit =
      mode === 'split_screen' ||
      (mode === 'auto' && far) ||
      (mode === 'two_subjects' && far && settings.preferSplit) ||
      (settings.preferSplit && two && (far || mode === 'auto'))

    let keyframe: ShortsFramingKeyframe
    if (wantSplit && two) {
      const left = two[0].x <= two[1].x ? two[0] : two[1]
      const right = left.id === two[0].id ? two[1] : two[0]
      keyframe = {
        time,
        layout: 'split',
        ...max,
        top: windowAround(left, pane, srcW, srcH, 0.4),
        bottom: windowAround(right, pane, srcW, srcH, 0.4),
        subjectIds: [left.id, right.id],
        focusStrategy: 'split',
      }
      confidenceSum += Math.min(left.confidence, right.confidence)
    } else if ((mode === 'two_subjects' || (mode === 'auto' && two && !far)) && two && !far) {
      keyframe = {
        time,
        layout: 'crop',
        ...pairWindow(two[0], two[1], max, srcW, srcH),
        subjectIds: [two[0].id, two[1].id],
        focusStrategy: 'pair',
      }
      confidenceSum += Math.min(two[0].confidence, two[1].confidence)
    } else if (focus && mode !== 'wide_stage' && (focus.confidence >= 0.28 || settings.manualAnchors.length > 0)) {
      keyframe = {
        time,
        layout: 'crop',
        ...windowAround(focus, max, srcW, srcH, mode === 'lead_singer' ? 0.36 : 0.4),
        subjectIds: [focus.id],
        focusStrategy: mode === 'active_subject' ? 'active' : 'lead',
      }
      confidenceSum += focus.confidence
    } else if (subjects.length > 0 && mode === 'wide_stage') {
      const midX = subjects.reduce((sum, item) => sum + item.x, 0) / subjects.length
      const midY = subjects.reduce((sum, item) => sum + item.y, 0) / subjects.length
      keyframe = {
        time,
        layout: 'crop',
        ...windowAround({ x: midX, y: midY }, max, srcW, srcH, 0.45),
        subjectIds: subjects.map((item) => item.id),
        focusStrategy: 'center',
      }
      confidenceSum += 0.55
    } else {
      fallbackCount += 1
      keyframe = {
        time,
        layout: 'crop',
        ...max,
        subjectIds: [],
        focusStrategy: 'center',
      }
    }
    raw.push(keyframe)
  }

  const keyframes = smoothKeyframes(raw, srcW, start, end)
  const usedFallback = fallbackCount === times.length || keyframes.every((item) => item.subjectIds.length === 0)
  return {
    mode,
    sourceWidth: srcW,
    sourceHeight: srcH,
    keyframes,
    subjects: [...subjectIds].map((id, index) => ({ id, label: subjectLabel(id, index, settings) })),
    usedFallback,
    confidence: times.length ? confidenceSum / times.length : 0,
    animated: keyframes.some((item, index) => index > 0 && (item.cropX !== keyframes[0]?.cropX || item.layout === 'split')),
  }
}

function subjectLabel(id: string, index: number, settings: ShortsFramingSettings): string {
  if (settings.leadSubjectId === id || settings.manualAnchors.some((item) => item.role === 'lead' && item.id === id)) {
    return 'Cantor principal'
  }
  if (settings.subject1Id === id) return 'Sujeito 1'
  if (settings.subject2Id === id) return 'Sujeito 2'
  return `Sujeito ${index + 1}`
}

function smoothKeyframes(
  frames: ShortsFramingKeyframe[],
  srcW: number,
  start: number,
  end: number,
): ShortsFramingKeyframe[] {
  if (frames.length === 0) return []
  const maxDelta = srcW * 0.32
  const dead = 5
  const out: ShortsFramingKeyframe[] = []
  for (const frame of frames) {
    const prev = out[out.length - 1]
    if (!prev) {
      out.push(frame)
      continue
    }
    const dt = Math.max(0.05, frame.time - prev.time)
    let cropX = frame.cropX
    const dx = cropX - prev.cropX
    if (Math.abs(dx) < dead) cropX = prev.cropX
    else {
      const maxStep = maxDelta * dt
      if (Math.abs(dx) > maxStep) cropX = prev.cropX + Math.sign(dx) * maxStep
      cropX = prev.cropX * 0.72 + cropX * 0.28
    }
    out.push({
      ...frame,
      cropX: evenPixel(cropX),
      cropY: evenPixel(prev.cropY * 0.72 + frame.cropY * 0.28),
    })
  }
  if (out.length === 1 && end > start) {
    out.push({ ...out[0]!, time: end })
  }
  return out
}

export function interpolateFraming(plan: ShortsFramingPlan, time: number): ShortsFramingKeyframe | null {
  const frames = plan.keyframes
  if (frames.length === 0) return null
  if (time <= frames[0]!.time) return frames[0]!
  const last = frames[frames.length - 1]!
  if (time >= last.time) return last
  let nextIndex = 1
  while (nextIndex < frames.length && frames[nextIndex]!.time < time) nextIndex += 1
  const b = frames[nextIndex]!
  const a = frames[nextIndex - 1]!
  const span = Math.max(0.001, b.time - a.time)
  const t = (time - a.time) / span
  const mix = (from: number, to: number) => from + (to - from) * t
  const layout = t < 0.5 ? a.layout : b.layout
  const window: ShortsFramingKeyframe = {
    time,
    layout,
    cropX: mix(a.cropX, b.cropX),
    cropY: mix(a.cropY, b.cropY),
    cropWidth: a.cropWidth,
    cropHeight: a.cropHeight,
    subjectIds: t < 0.5 ? a.subjectIds : b.subjectIds,
    focusStrategy: t < 0.5 ? a.focusStrategy : b.focusStrategy,
  }
  if (layout === 'split' && a.top && b.top && a.bottom && b.bottom) {
    window.top = {
      cropX: mix(a.top.cropX, b.top.cropX),
      cropY: mix(a.top.cropY, b.top.cropY),
      cropWidth: a.top.cropWidth,
      cropHeight: a.top.cropHeight,
    }
    window.bottom = {
      cropX: mix(a.bottom.cropX, b.bottom.cropX),
      cropY: mix(a.bottom.cropY, b.bottom.cropY),
      cropWidth: a.bottom.cropWidth,
      cropHeight: a.bottom.cropHeight,
    }
  }
  return window
}

function cssFromCrop(srcW: number, srcH: number, crop: ShortsCropWindow) {
  return {
    videoWidthPct: (srcW / crop.cropWidth) * 100,
    videoHeightPct: (srcH / crop.cropHeight) * 100,
    videoLeftPct: -(crop.cropX / crop.cropWidth) * 100,
    videoTopPct: -(crop.cropY / crop.cropHeight) * 100,
  }
}

export function buildFramingPreviewFrame(plan: ShortsFramingPlan, time: number): ShortsFramingPreviewFrame {
  if (plan.mode === 'original') {
    return {
      aspectRatio: plan.sourceWidth / Math.max(1, plan.sourceHeight),
      videoWidthPct: 100,
      videoHeightPct: 100,
      videoLeftPct: 0,
      videoTopPct: 0,
      cropped: false,
      layout: 'original',
    }
  }
  const key = interpolateFraming(plan, time) ?? {
    time,
    layout: 'crop' as const,
    ...maxVerticalCrop(plan.sourceWidth, plan.sourceHeight),
    subjectIds: [],
    focusStrategy: 'center' as const,
  }
  if (key.layout === 'split' && key.top && key.bottom) {
    return {
      aspectRatio: 9 / 16,
      ...cssFromCrop(plan.sourceWidth, plan.sourceHeight, key.top),
      cropped: true,
      layout: 'split',
      top: cssFromCrop(plan.sourceWidth, plan.sourceHeight, key.top),
      bottom: cssFromCrop(plan.sourceWidth, plan.sourceHeight, key.bottom),
    }
  }
  return {
    aspectRatio: 9 / 16,
    ...cssFromCrop(plan.sourceWidth, plan.sourceHeight, key),
    cropped: true,
    layout: 'crop',
  }
}

function piecewise(samples: Array<{ t: number; v: number }>): string {
  if (samples.length === 0) return '0'
  if (samples.length === 1) return String(Math.round(samples[0]!.v))
  let expr = String(Math.round(samples[samples.length - 1]!.v))
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    const a = samples[i]!
    const b = samples[i + 1]!
    const dt = Math.max(0.001, b.t - a.t)
    const lerp = `${Math.round(a.v)}+(${Math.round(b.v)}-${Math.round(a.v)})*(t-${a.t.toFixed(3)})/${dt.toFixed(3)}`
    expr = `if(lt(t\\,${b.t.toFixed(3)})\\,${lerp}\\,${expr})`
  }
  return `trunc((${expr})/2)*2`
}

function simplifyAxis(frames: ShortsFramingKeyframe[], pick: (frame: ShortsFramingKeyframe) => number): Array<{ t: number; v: number }> {
  const points = frames.map((frame) => ({ t: Math.max(0, frame.time - frames[0]!.time), v: pick(frame) }))
  const out: Array<{ t: number; v: number }> = []
  for (const point of points) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.v - point.v) < 3 && out.length > 1) {
      prev.t = point.t
      prev.v = point.v
      continue
    }
    out.push({ ...point })
  }
  return out.slice(0, 36)
}

function cropExpr(window: ShortsCropWindow, xSamples: Array<{ t: number; v: number }>, ySamples: Array<{ t: number; v: number }>): string {
  const x = xSamples.length <= 1 ? String(window.cropX) : piecewise(xSamples)
  const y = ySamples.length <= 1 ? String(window.cropY) : piecewise(ySamples)
  return `crop=${window.cropWidth}:${window.cropHeight}:${x}:${y}`
}

export function buildFramingExportFilter(plan: ShortsFramingPlan, clipStart = 0): ShortsFramingExportFilter {
  if (plan.mode === 'original' || plan.keyframes.length === 0) return {}
  const frames = plan.keyframes.map((item) => ({ ...item, time: item.time - clipStart }))
  const first = frames[0]!
  const usesSplit = frames.some((item) => item.layout === 'split' && item.top && item.bottom)
  if (usesSplit && first.top && first.bottom) {
    const splitFrames = frames.map((item) => (item.layout === 'split' && item.top && item.bottom ? item : { ...item, top: first.top, bottom: first.bottom, layout: 'split' as const }))
    const topX = simplifyAxis(splitFrames, (item) => item.top?.cropX ?? first.top!.cropX)
    const topY = simplifyAxis(splitFrames, (item) => item.top?.cropY ?? first.top!.cropY)
    const botX = simplifyAxis(splitFrames, (item) => item.bottom?.cropX ?? first.bottom!.cropX)
    const botY = simplifyAxis(splitFrames, (item) => item.bottom?.cropY ?? first.bottom!.cropY)
    const top = cropExpr(first.top, topX, topY)
    const bottom = cropExpr(first.bottom, botX, botY)
    return {
      filterComplex: `[0:v]split=2[topin][botin];[topin]${top},scale=${FRAMING_OUTPUT_WIDTH}:${FRAMING_OUTPUT_HEIGHT / 2}[top];[botin]${bottom},scale=${FRAMING_OUTPUT_WIDTH}:${FRAMING_OUTPUT_HEIGHT / 2}[bot];[top][bot]vstack=inputs=2[vout]`,
    }
  }
  const x = simplifyAxis(frames, (item) => item.cropX)
  const y = simplifyAxis(frames, (item) => item.cropY)
  return {
    videoFilter: `${cropExpr(first, x, y)},scale=${FRAMING_OUTPUT_WIDTH}:${FRAMING_OUTPUT_HEIGHT}`,
  }
}

export function clickToSourcePoint(input: {
  clientX: number
  clientY: number
  rect: { left: number; top: number; width: number; height: number }
  sourceWidth: number
  sourceHeight: number
  crop: ShortsCropWindow
}): { x: number; y: number } {
  const nx = clamp01((input.clientX - input.rect.left) / Math.max(1, input.rect.width))
  const ny = clamp01((input.clientY - input.rect.top) / Math.max(1, input.rect.height))
  return {
    x: clamp01((input.crop.cropX + nx * input.crop.cropWidth) / input.sourceWidth),
    y: clamp01((input.crop.cropY + ny * input.crop.cropHeight) / input.sourceHeight),
  }
}

export function assignSubjectFromClick(input: {
  settings: ShortsFramingSettings
  track: ShortsFramingSample[]
  time: number
  x: number
  y: number
  role: ShortsSubjectRole
}): ShortsFramingSettings {
  const subjects = sampleAt(input.track, input.time)
  let nearest: ShortsTrackedSubject | null = null
  let best = 0.16
  for (const subject of subjects) {
    const dist = Math.hypot(subject.x - input.x, subject.y - input.y)
    if (dist < best) {
      nearest = subject
      best = dist
    }
  }
  const id = nearest?.id || `manual-${input.role}`
  const anchor: ShortsManualAnchor = {
    id,
    role: input.role,
    x: nearest?.x ?? input.x,
    y: nearest?.y ?? input.y,
    width: nearest?.width ?? 0.12,
    height: nearest?.height ?? 0.22,
  }
  const manualAnchors = [
    ...input.settings.manualAnchors.filter((item) => item.role !== input.role),
    anchor,
  ]
  return {
    ...input.settings,
    picking: null,
    manualAnchors,
    leadSubjectId: input.role === 'lead' ? id : input.settings.leadSubjectId,
    subject1Id: input.role === 'subject1' ? id : input.settings.subject1Id,
    subject2Id: input.role === 'subject2' ? id : input.settings.subject2Id,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  return clamp(value, 0, 1)
}
