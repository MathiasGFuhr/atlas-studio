import type { ShortsClip, ShortsJob, VideoProbeInfo } from './shorts'
import { clipDuration } from './shorts'

export type ShortsDuplicateReason = 'same_source' | 'export_of_existing'

export type ShortsImportResult = {
  kind: 'created' | 'existing'
  project: ShortsJob
  reason?: ShortsDuplicateReason
  sourcePath: string
}

export type ShortsSourceStat = {
  size?: number | null
  mtimeMs?: number | null
}

export type ShortsIdentityInput = {
  sourcePath: string
  sourceName?: string
  duration?: number | null
  fileSize?: number | null
  mtimeMs?: number | null
}

export type ShortsProjectSnapshot = Pick<
  ShortsJob,
  | 'id'
  | 'name'
  | 'sourcePath'
  | 'sourceName'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'clips'
  | 'probe'
  | 'projectId'
  | 'profile'
  | 'transcript'
  | 'transcriptSource'
  | 'analysisNotes'
>

export type ShortsExistingMatch<T extends ShortsProjectSnapshot = ShortsProjectSnapshot> = {
  project: T
  reason: ShortsDuplicateReason
  clipId?: string
}

export type ShortsConsolidationAction =
  | { type: 'merge_same_source'; keeperId: string; duplicateIds: string[] }
  | {
      type: 'absorb_export'
      parentId: string
      derivedId: string
      clipId: string | null
      exportPath: string
    }

function exportedCount(clips: ShortsClip[]): number {
  return clips.filter((clip) => Boolean(clip.exportedPath) || clip.accepted).length
}

const PATH_TOLERANCE_SECONDS = 0.25
const CLIP_WINDOW_TOLERANCE = 0.4
const EXPORT_DURATION_SLACK = 1.5

/** Path canônico para identidade: barras unificadas, drive minúsculo, sem barra final. */
export function normalizeSourceVideoPath(filePath: string): string {
  let value = String(filePath ?? '').trim()
  if (!value) return ''
  value = value.replace(/\\/g, '/')
  value = value.replace(/\/{2,}/g, '/')
  if (/^[A-Za-z]:/.test(value)) {
    value = value.charAt(0).toLowerCase() + value.slice(1)
  }
  if (value.length > 1) value = value.replace(/\/+$/, '')
  return value
}

export function sourceFileName(filePath: string): string {
  const trimmed = String(filePath ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/^.*[/\\]/, '')
}

export function sourceFileStem(fileNameOrPath: string): string {
  const name = sourceFileName(fileNameOrPath)
  return name.replace(/\.[^./\\]+$/, '').trim()
}

export function sourceDirectoryKey(filePath: string): string {
  const normalized = normalizeSourceVideoPath(filePath)
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

export function durationsMatch(a?: number | null, b?: number | null, slack = PATH_TOLERANCE_SECONDS): boolean {
  if (a == null || b == null) return false
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= slack
}

export function parseAtlasExportFileName(fileNameOrPath: string): { stem: string; index: number } | null {
  const name = sourceFileName(fileNameOrPath)
  const match = name.match(/^(.*)-short-(\d+)\.[^.]+$/i)
  if (!match) return null
  const stem = match[1].trim()
  const index = Number(match[2])
  if (!stem || !Number.isFinite(index) || index < 1) return null
  return { stem, index }
}

export function identityFromProbe(
  sourcePath: string,
  probe?: VideoProbeInfo | null,
  stat?: ShortsSourceStat | null,
): ShortsIdentityInput {
  return {
    sourcePath,
    sourceName: probe?.name || sourceFileName(sourcePath),
    duration: probe?.duration ?? null,
    fileSize: stat?.size ?? probe?.fileSize ?? null,
    mtimeMs: stat?.mtimeMs ?? probe?.mtimeMs ?? null,
  }
}

export function identityFromProject(project: ShortsProjectSnapshot): ShortsIdentityInput {
  return {
    sourcePath: project.sourcePath,
    sourceName: project.sourceName,
    duration: project.probe?.duration ?? null,
    fileSize: project.probe?.fileSize ?? null,
    mtimeMs: project.probe?.mtimeMs ?? null,
  }
}

export function projectDuration(project: Pick<ShortsProjectSnapshot, 'probe'>): number | null {
  const duration = project.probe?.duration
  return Number.isFinite(duration) && Number(duration) > 0 ? Number(duration) : null
}

export function isProtectedShortsClip(clip: Pick<ShortsClip, 'exportedPath' | 'accepted'>): boolean {
  return Boolean(clip.exportedPath) || clip.accepted
}

export function clipsShareWindow(
  a: Pick<ShortsClip, 'start' | 'end'>,
  b: Pick<ShortsClip, 'start' | 'end'>,
  tolerance = CLIP_WINDOW_TOLERANCE,
): boolean {
  return Math.abs(a.start - b.start) <= tolerance && Math.abs(a.end - b.end) <= tolerance
}

export function clipsOverlap(
  a: Pick<ShortsClip, 'start' | 'end'>,
  b: Pick<ShortsClip, 'start' | 'end'>,
): boolean {
  return a.start < b.end - 0.2 && b.start < a.end - 0.2
}

export function mergeClipRecords(primary: ShortsClip, extra: ShortsClip): ShortsClip {
  return {
    ...primary,
    exportedPath: primary.exportedPath || extra.exportedPath,
    accepted: primary.accepted || extra.accepted,
    title: primary.title.trim() || extra.title,
    description: primary.description.trim() || extra.description,
    hashtags: primary.hashtags.length ? primary.hashtags : extra.hashtags,
    hook: primary.hook.trim() || extra.hook,
    reason: primary.reason.trim() || extra.reason,
    score: Math.max(primary.score, extra.score),
  }
}

export function mergeClipLists(keeper: ShortsClip[], extras: ShortsClip[]): ShortsClip[] {
  const merged = keeper.map((clip) => ({ ...clip }))
  for (const extra of extras) {
    const existing = merged.find((clip) => clipsShareWindow(clip, extra))
    if (existing) {
      const index = merged.indexOf(existing)
      merged[index] = mergeClipRecords(existing, extra)
      continue
    }
    merged.push({ ...extra })
  }
  return merged.map((clip, index) => ({ ...clip, index: index + 1 }))
}

/** Reanálise: não apaga Shorts exportados/aceitos. Candidatos novos sem overlap entram no fim. */
export function mergeReanalysisClips(existing: ShortsClip[], next: ShortsClip[]): ShortsClip[] {
  const protectedClips = existing.filter(isProtectedShortsClip)
  if (protectedClips.length === 0) {
    return next.map((clip, index) => ({ ...clip, index: index + 1 }))
  }
  const result = protectedClips.map((clip) => ({ ...clip }))
  for (const candidate of next) {
    if (result.some((clip) => clipsOverlap(clip, candidate) || clipsShareWindow(clip, candidate))) continue
    result.push({ ...candidate })
  }
  return result
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map((clip, index) => ({ ...clip, index: index + 1 }))
}

export function pickKeeperProject<T extends ShortsProjectSnapshot>(projects: T[]): T {
  const ranked = [...projects].sort((a, b) => {
    const exportDelta = exportedCount(b.clips) - exportedCount(a.clips)
    if (exportDelta) return exportDelta
    const clipDelta = b.clips.length - a.clips.length
    if (clipDelta) return clipDelta
    const readyDelta = Number(b.status === 'ready') - Number(a.status === 'ready')
    if (readyDelta) return readyDelta
    const durationDelta = (projectDuration(b) ?? 0) - (projectDuration(a) ?? 0)
    if (Math.abs(durationDelta) > 0.5) return durationDelta
    return a.createdAt.localeCompare(b.createdAt)
  })
  return ranked[0]
}

function findExportParent<T extends ShortsProjectSnapshot>(
  input: ShortsIdentityInput,
  projects: T[],
): ShortsExistingMatch<T> | null {
  const fileKey = normalizeSourceVideoPath(input.sourcePath)
  if (!fileKey) return null

  const byExportedPath: ShortsExistingMatch<T>[] = []
  for (const project of projects) {
    if (normalizeSourceVideoPath(project.sourcePath) === fileKey) continue
    for (const clip of project.clips) {
      if (!clip.exportedPath) continue
      if (normalizeSourceVideoPath(clip.exportedPath) === fileKey) {
        byExportedPath.push({ project, reason: 'export_of_existing', clipId: clip.id })
      }
    }
  }
  if (byExportedPath.length === 1) return byExportedPath[0]
  if (byExportedPath.length > 1) {
    return { ...byExportedPath[0], project: pickKeeperProject(byExportedPath.map((item) => item.project)) }
  }

  const parsed = parseAtlasExportFileName(input.sourceName || input.sourcePath)
  if (!parsed) return null
  const dir = sourceDirectoryKey(input.sourcePath)
  const duration = input.duration ?? null
  const parents = projects.filter((project) => {
    if (normalizeSourceVideoPath(project.sourcePath) === fileKey) return false
    if (sourceDirectoryKey(project.sourcePath) !== dir) return false
    const stem = sourceFileStem(project.sourceName) || sourceFileStem(project.sourcePath)
    if (stem !== parsed.stem) return false
    const parentDuration = projectDuration(project)
    if (parentDuration != null && duration != null && durationsMatch(parentDuration, duration, 2)) {
      return false
    }
    if (parentDuration != null && duration != null && duration >= parentDuration - 5) return false
    return true
  })
  if (parents.length !== 1) return null
  const parent = parents[0]
  const clip =
    parent.clips.find((item) => item.index === parsed.index) ??
    parent.clips.find((item) => duration != null && durationsMatch(clipDuration(item), duration, EXPORT_DURATION_SLACK)) ??
    null
  return { project: parent, reason: 'export_of_existing', clipId: clip?.id }
}

function findSameSource<T extends ShortsProjectSnapshot>(
  input: ShortsIdentityInput,
  projects: T[],
): T[] {
  const fileKey = normalizeSourceVideoPath(input.sourcePath)
  if (!fileKey) return []
  const byPath = projects.filter((project) => normalizeSourceVideoPath(project.sourcePath) === fileKey)
  if (byPath.length) return byPath

  const fileName = sourceFileName(input.sourceName || input.sourcePath).toLowerCase()
  const size = input.fileSize ?? null
  const duration = input.duration ?? null
  if (!fileName || size == null || duration == null) return []

  return projects.filter((project) => {
    if (sourceFileName(project.sourcePath).toLowerCase() !== fileName) return false
    if (project.probe?.fileSize == null || project.probe.fileSize !== size) return false
    return durationsMatch(project.probe.duration, duration, 0.2)
  })
}

export function findExistingShortsProject<T extends ShortsProjectSnapshot>(
  input: ShortsIdentityInput,
  projects: T[],
): ShortsExistingMatch<T> | null {
  const exportMatch = findExportParent(input, projects)
  if (exportMatch) return exportMatch

  const same = findSameSource(input, projects)
  if (same.length === 1) return { project: same[0], reason: 'same_source' }
  if (same.length > 1) return { project: pickKeeperProject(same), reason: 'same_source' }
  return null
}

export function planShortsProjectConsolidation<T extends ShortsProjectSnapshot>(
  projects: T[],
): ShortsConsolidationAction[] {
  const actions: ShortsConsolidationAction[] = []
  const consumed = new Set<string>()

  for (const project of projects) {
    if (consumed.has(project.id)) continue
    const match = findExportParent(identityFromProject(project), projects.filter((item) => item.id !== project.id))
    if (!match) continue
    consumed.add(project.id)
    actions.push({
      type: 'absorb_export',
      parentId: match.project.id,
      derivedId: project.id,
      clipId: match.clipId ?? null,
      exportPath: project.sourcePath,
    })
  }

  const remaining = projects.filter((project) => !consumed.has(project.id))
  const groups = new Map<string, T[]>()
  for (const project of remaining) {
    const key = normalizeSourceVideoPath(project.sourcePath)
    if (!key) continue
    const current = groups.get(key) ?? []
    current.push(project)
    groups.set(key, current)
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const keeper = pickKeeperProject(group)
    const duplicates = group.filter((item) => item.id !== keeper.id).map((item) => item.id)
    if (!duplicates.length) continue
    for (const id of duplicates) consumed.add(id)
    actions.push({ type: 'merge_same_source', keeperId: keeper.id, duplicateIds: duplicates })
  }

  return actions
}

export function mergeSameSourceSnapshots<T extends ShortsProjectSnapshot>(keeper: T, duplicates: T[]): T {
  let clips = keeper.clips.map((clip) => ({ ...clip }))
  let probe = keeper.probe
  let transcript = keeper.transcript
  let transcriptSource = keeper.transcriptSource
  let analysisNotes = keeper.analysisNotes
  let status = keeper.status
  let projectId = keeper.projectId
  let name = keeper.name

  for (const duplicate of duplicates) {
    clips = mergeClipLists(clips, duplicate.clips)
    if ((!probe || !projectDuration({ probe })) && duplicate.probe) probe = duplicate.probe
    if ((!transcript || transcript.length === 0) && duplicate.transcript?.length) {
      transcript = duplicate.transcript
      transcriptSource = duplicate.transcriptSource
    }
    if (!analysisNotes && duplicate.analysisNotes) analysisNotes = duplicate.analysisNotes
    if (status !== 'ready' && duplicate.status === 'ready') status = 'ready'
    if (!projectId && duplicate.projectId) projectId = duplicate.projectId
    if (!name.trim() && duplicate.name.trim()) name = duplicate.name
  }

  if (clips.length > 0 && status === 'draft') status = 'ready'

  return {
    ...keeper,
    name,
    projectId,
    probe,
    clips,
    transcript,
    transcriptSource,
    analysisNotes,
    status,
  }
}

export function attachExportToParentClips(
  clips: ShortsClip[],
  exportPath: string,
  clipId?: string | null,
): ShortsClip[] {
  if (clipId) {
    return clips.map((clip) =>
      clip.id === clipId ? { ...clip, exportedPath: clip.exportedPath || exportPath, accepted: true } : clip,
    )
  }
  const key = normalizeSourceVideoPath(exportPath)
  const already = clips.some((clip) => clip.exportedPath && normalizeSourceVideoPath(clip.exportedPath) === key)
  if (already) return clips
  return clips
}
