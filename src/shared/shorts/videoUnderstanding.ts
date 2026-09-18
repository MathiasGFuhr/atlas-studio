export interface VideoUnderstanding {
  language: string
  contentType: string
  structure: string
  majorMoments: Array<{ time: number; label: string }>
  visualHighlights: Array<{ time: number; detail: string }>
  audioHighlights: Array<{ time: number; detail: string }>
  narrativeArc: string
}

export interface ShortsProposedCandidate {
  start: number
  end: number
  type: string
  reason: string
  visualReason: string
  audioReason: string
  score?: number
  dimensions?: Record<string, number>
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asMomentList(value: unknown, detailKey: 'label' | 'detail'): Array<{ time: number; [k: string]: string | number }> {
  if (!Array.isArray(value)) return []
  const list: Array<{ time: number; label?: string; detail?: string }> = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const time = asNumber(record.time ?? record.start, NaN)
    const detail = asText(record[detailKey] ?? record.label ?? record.detail ?? record.reason)
    if (!Number.isFinite(time) || !detail) continue
    list.push({ time, [detailKey]: detail })
  }
  return list
}

export function emptyVideoUnderstanding(): VideoUnderstanding {
  return {
    language: '',
    contentType: '',
    structure: '',
    majorMoments: [],
    visualHighlights: [],
    audioHighlights: [],
    narrativeArc: '',
  }
}

export function normalizeVideoUnderstanding(raw: unknown): VideoUnderstanding {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const nested =
    record.understanding && typeof record.understanding === 'object'
      ? (record.understanding as Record<string, unknown>)
      : record
  return {
    language: asText(nested.language),
    contentType: asText(nested.contentType ?? nested.content_type),
    structure: asText(nested.structure),
    majorMoments: asMomentList(nested.majorMoments ?? nested.major_moments, 'label') as VideoUnderstanding['majorMoments'],
    visualHighlights: asMomentList(
      nested.visualHighlights ?? nested.visual_highlights,
      'detail',
    ) as VideoUnderstanding['visualHighlights'],
    audioHighlights: asMomentList(
      nested.audioHighlights ?? nested.audio_highlights,
      'detail',
    ) as VideoUnderstanding['audioHighlights'],
    narrativeArc: asText(nested.narrativeArc ?? nested.narrative_arc),
  }
}

export function understandingHasSignal(value: VideoUnderstanding): boolean {
  return Boolean(
    value.contentType ||
      value.structure ||
      value.narrativeArc ||
      value.majorMoments.length ||
      value.visualHighlights.length ||
      value.audioHighlights.length,
  )
}

export function normalizeProposedCandidates(
  raw: unknown,
  input: { duration: number; maxCount: number },
): ShortsProposedCandidate[] {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(record.candidates)
    ? record.candidates
    : Array.isArray(record.selected)
      ? record.selected
      : []
  const out: ShortsProposedCandidate[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    let start = asNumber(row.start, NaN)
    let end = asNumber(row.end, NaN)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (end < start) {
      const swap = start
      start = end
      end = swap
    }
    start = Math.max(0, Math.min(input.duration, start))
    end = Math.max(0, Math.min(input.duration, end))
    if (end - start < 0.8) continue
    out.push({
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      type: asText(row.type) || 'moment',
      reason: asText(row.reason),
      visualReason: asText(row.visualReason ?? row.visual_reason),
      audioReason: asText(row.audioReason ?? row.audio_reason),
      score: Number.isFinite(asNumber(row.score, NaN)) ? asNumber(row.score) : undefined,
      dimensions:
        row.dimensions && typeof row.dimensions === 'object'
          ? (row.dimensions as Record<string, number>)
          : undefined,
    })
    if (out.length >= input.maxCount) break
  }
  return out
}

export function formatUnderstandingForPrompt(value: VideoUnderstanding): string {
  if (!understandingHasSignal(value)) return '(ainda sem compreensão global)'
  const moments = value.majorMoments
    .slice(0, 16)
    .map((item) => `${item.time.toFixed(1)}s ${item.label}`)
    .join('; ')
  const visual = value.visualHighlights
    .slice(0, 12)
    .map((item) => `${item.time.toFixed(1)}s ${item.detail}`)
    .join('; ')
  const audio = value.audioHighlights
    .slice(0, 12)
    .map((item) => `${item.time.toFixed(1)}s ${item.detail}`)
    .join('; ')
  return [
    value.language ? `language: ${value.language}` : '',
    value.contentType ? `contentType: ${value.contentType}` : '',
    value.structure ? `structure: ${value.structure}` : '',
    value.narrativeArc ? `narrativeArc: ${value.narrativeArc}` : '',
    moments ? `majorMoments: ${moments}` : '',
    visual ? `visualHighlights: ${visual}` : '',
    audio ? `audioHighlights: ${audio}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
