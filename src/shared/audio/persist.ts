import type { AutoCutPreset, MusicSegment } from '../musicAnalysis'

export interface MusicCutsDocument {
  version: 2
  cuts: MusicSegment[]
  selectedId?: string | null
  appliedPreset?: AutoCutPreset | null
}

function isSegment(value: unknown): value is MusicSegment {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && Number.isFinite(Number(row.start)) && Number.isFinite(Number(row.end))
}

export function parseMusicCutsJson(value: string): {
  cuts: MusicSegment[]
  selectedId: string | null
  appliedPreset: AutoCutPreset | null
} {
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      return {
        cuts: parsed.filter(isSegment),
        selectedId: null,
        appliedPreset: null,
      }
    }
    if (parsed && typeof parsed === 'object') {
      const row = parsed as Record<string, unknown>
      const cuts = Array.isArray(row.cuts) ? row.cuts.filter(isSegment) : []
      return {
        cuts,
        selectedId: typeof row.selectedId === 'string' ? row.selectedId : null,
        appliedPreset: typeof row.appliedPreset === 'string' ? (row.appliedPreset as AutoCutPreset) : null,
      }
    }
  } catch {
    /* ignore */
  }
  return { cuts: [], selectedId: null, appliedPreset: null }
}

export function serializeMusicCutsJson(input: {
  cuts: MusicSegment[]
  selectedId?: string | null
  appliedPreset?: AutoCutPreset | null
}): string {
  const document: MusicCutsDocument = {
    version: 2,
    cuts: input.cuts,
    selectedId: input.selectedId ?? null,
    appliedPreset: input.appliedPreset ?? null,
  }
  return JSON.stringify(document)
}
