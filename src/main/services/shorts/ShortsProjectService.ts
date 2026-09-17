import fs from 'node:fs'
import type {
  ShortsAspectMode,
  ShortsClip,
  ShortsClipCount,
  ShortsClipPatch,
  ShortsDurationMode,
  ShortsJob,
  ShortsProfile,
  VideoProbeInfo,
} from '../../../shared/shorts'
import { capRequestedDuration, constrainClipWindow } from '../../../shared/shortsDuration'
import {
  findExistingShortsProject,
  identityFromProbe,
  mergeSameSourceSnapshots,
  planShortsProjectConsolidation,
  type ShortsDuplicateReason,
  type ShortsImportResult,
} from '../../../shared/shortsProjectIdentity'
import {
  languageFieldsFromResolution,
  resolveContentLanguage,
} from '../../../shared/shortsLanguage'
import { shortsRepository } from '../../repositories/shortsRepository'
import { resolveShortsLanguageFields } from './editorialContext'
import { shortsJobCacheDir } from './shortsThumbnail'

export type ShortsProjectStore = {
  list: () => ShortsJob[]
  get: (id: string) => ShortsJob | null
  create: (input: {
    sourcePath: string
    sourceName: string
    name?: string
    projectId?: string | null
    profile?: ShortsProfile
    probe?: VideoProbeInfo | null
  }) => ShortsJob
  update: (id: string, patch: Parameters<typeof shortsRepository.update>[1]) => ShortsJob | null
  remove: (id: string) => boolean
}

const liveStore: ShortsProjectStore = {
  list: () => shortsRepository.list(),
  get: (id) => shortsRepository.get(id),
  create: (input) => shortsRepository.create(input),
  update: (id, patch) => shortsRepository.update(id, patch),
  remove: (id) => shortsRepository.remove(id),
}

export type CreateFromSourceVideoInput = {
  sourcePath: string
  sourceName: string
  projectId?: string | null
  profile?: ShortsProfile
  probe?: VideoProbeInfo | null
  /** Só cria outro projeto para o mesmo vídeo quando o usuário pediu explicitamente. */
  forceNew?: boolean
}

export function createFromSourceVideoWith(
  store: ShortsProjectStore,
  input: CreateFromSourceVideoInput,
): { kind: 'created' | 'existing'; project: ShortsJob; reason?: ShortsDuplicateReason } {
  const sourcePath = input.sourcePath
  if (!input.forceNew) {
    const match = findExistingShortsProject(identityFromProbe(sourcePath, input.probe), store.list())
    if (match) {
      if (match.reason === 'export_of_existing' && match.clipId) {
        const updated = markClipExportedWith(store, match.project.id, match.clipId, sourcePath)
        return { kind: 'existing', project: updated ?? match.project, reason: match.reason }
      }
      return { kind: 'existing', project: match.project, reason: match.reason }
    }
  }

  const created = store.create({
    sourcePath,
    sourceName: input.sourceName,
    projectId: input.projectId ?? null,
    profile: input.profile ?? 'history',
    probe: input.probe ?? null,
  })
  const resolved = resolveContentLanguage({
    languageOverride: created.languageOverride,
    transcriptLanguage: created.transcriptLanguage,
    filename: created.sourceName,
    title: created.name,
  })
  const withLanguage =
    store.update(
      created.id,
      languageFieldsFromResolution(resolved, {
        languageOverride: created.languageOverride,
        transcriptLanguage: created.transcriptLanguage,
      }),
    ) ?? created
  return { kind: 'created', project: withLanguage }
}

export function createFromSourceVideo(input: CreateFromSourceVideoInput) {
  const result = createFromSourceVideoWith(liveStore, input)
  if (result.kind !== 'created') return result
  const fields = resolveShortsLanguageFields(result.project)
  const updated = liveStore.update(result.project.id, fields)
  return { ...result, project: updated ?? result.project }
}

export function openProject(id: string): ShortsJob | null {
  return liveStore.get(id)
}

export function updateClipWith(
  store: ShortsProjectStore,
  jobId: string,
  clipId: string,
  patch: ShortsClipPatch,
): ShortsJob | null {
  const job = store.get(jobId)
  if (!job) return null
  const duration = job.probe?.duration ?? Number.POSITIVE_INFINITY
  const clips = job.clips.map((clip) => {
    if (clip.id !== clipId) return clip
    const next = { ...clip }
    if (patch.title != null) next.title = patch.title
    if (patch.description != null) next.description = patch.description
    if (patch.hashtags != null) next.hashtags = patch.hashtags
    if (patch.start == null && patch.end == null) return next
    const videoDuration = Number.isFinite(duration) ? duration : Math.max(clip.end, patch.end ?? 0)
    if (job.durationMode === 'exact') {
      const moved = patch.start != null && patch.start !== clip.start ? 'start' : 'end'
      const window = constrainClipWindow({
        start: patch.start ?? clip.start,
        end: patch.end ?? clip.end,
        videoDuration,
        requestedDuration: job.requestedDuration,
        mode: 'exact',
        moved,
      })
      return { ...next, start: window.start, end: window.end }
    }
    const start = Math.max(0, Math.min(videoDuration, patch.start ?? clip.start))
    const end = Math.max(start + 0.4, Math.min(videoDuration, patch.end ?? clip.end))
    return { ...next, start, end }
  })
  return store.update(jobId, { clips })
}

export function updateClip(jobId: string, clipId: string, patch: ShortsClipPatch) {
  return updateClipWith(liveStore, jobId, clipId, patch)
}

export function addClipWith(store: ShortsProjectStore, jobId: string, clip: ShortsClip): ShortsJob | null {
  const job = store.get(jobId)
  if (!job) return null
  const clips = [...job.clips, { ...clip, index: job.clips.length + 1 }]
  return store.update(jobId, { clips, status: 'ready' })
}

export function markClipExportedWith(
  store: ShortsProjectStore,
  jobId: string,
  clipId: string,
  outputPath: string,
): ShortsJob | null {
  const job = store.get(jobId)
  if (!job) return null
  const clips: ShortsClip[] = job.clips.map((item) =>
    item.id === clipId ? { ...item, exportedPath: outputPath, accepted: true } : item,
  )
  return store.update(jobId, { clips })
}

export function markClipExported(jobId: string, clipId: string, outputPath: string) {
  return markClipExportedWith(liveStore, jobId, clipId, outputPath)
}

export function updateProjectSettings(
  jobId: string,
  patch: Partial<
    Pick<
      ShortsJob,
      | 'name'
      | 'profile'
      | 'clipCount'
      | 'requestedDuration'
      | 'durationMode'
      | 'aspectMode'
      | 'captionsEnabled'
      | 'languageOverride'
    >
  >,
) {
  const job = liveStore.get(jobId)
  if (!job) return null
  const nextPatch: Parameters<typeof shortsRepository.update>[1] = { ...patch }
  if (nextPatch.requestedDuration != null) {
    const capped = capRequestedDuration(nextPatch.requestedDuration, job.probe?.duration)
    nextPatch.requestedDuration = capped.requested
  }
  if ('languageOverride' in patch) {
    Object.assign(
      nextPatch,
      resolveShortsLanguageFields({
        ...job,
        languageOverride: patch.languageOverride ?? null,
      }),
    )
  }
  return liveStore.update(jobId, nextPatch)
}

export function updateProjectSettingsWith(
  store: ShortsProjectStore,
  jobId: string,
  patch: Partial<
    Pick<
      ShortsJob,
      'name' | 'profile' | 'clipCount' | 'requestedDuration' | 'durationMode' | 'aspectMode' | 'captionsEnabled' | 'languageOverride'
    >
  >,
): ShortsJob | null {
  const job = store.get(jobId)
  if (!job) return null
  const nextPatch = { ...patch }
  if (nextPatch.requestedDuration != null) {
    const capped = capRequestedDuration(nextPatch.requestedDuration, job.probe?.duration)
    nextPatch.requestedDuration = capped.requested
  }
  return store.update(jobId, nextPatch)
}

export function deleteProjectWith(
  store: ShortsProjectStore,
  id: string,
  io: { removeCacheDir?: (jobId: string) => void } = {},
): boolean {
  const job = store.get(id)
  if (!job) return false
  io.removeCacheDir?.(id)
  return store.remove(id)
}

export function deleteProject(id: string): boolean {
  return deleteProjectWith(liveStore, id, {
    removeCacheDir(jobId) {
      const cacheDir = shortsJobCacheDir(jobId)
      if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true })
    },
  })
}

export function consolidateDuplicatesWith(
  store: ShortsProjectStore,
  io: { removeCacheDir?: (jobId: string) => void } = {},
): { scanned: number; removed: number; merged: number; absorbedExports: number } {
  const projects = store.list()
  const plan = planShortsProjectConsolidation(projects)
  let removed = 0
  let merged = 0
  let absorbedExports = 0
  const byId = new Map(projects.map((project) => [project.id, project]))

  for (const action of plan) {
    if (action.type === 'absorb_export') {
      const parent = store.get(action.parentId) ?? byId.get(action.parentId)
      const derived = store.get(action.derivedId) ?? byId.get(action.derivedId)
      if (!parent || !derived) continue
      const clips = parent.clips.map((clip) =>
        clip.id === action.clipId
          ? { ...clip, exportedPath: clip.exportedPath || action.exportPath, accepted: true }
          : clip,
      )
      store.update(parent.id, { clips })
      if (store.remove(derived.id)) {
        io.removeCacheDir?.(derived.id)
        removed += 1
        absorbedExports += 1
      }
      continue
    }

    const keeper = store.get(action.keeperId) ?? byId.get(action.keeperId)
    if (!keeper) continue
    const duplicates = action.duplicateIds
      .map((id) => store.get(id) ?? byId.get(id))
      .filter((item): item is ShortsJob => Boolean(item))
    if (!duplicates.length) continue
    const next = mergeSameSourceSnapshots(keeper, duplicates)
    store.update(keeper.id, {
      name: next.name,
      projectId: next.projectId,
      probe: next.probe,
      clips: next.clips,
      transcript: next.transcript,
      transcriptSource: next.transcriptSource,
      analysisNotes: next.analysisNotes,
      status: next.status,
    })
    merged += 1
    for (const duplicate of duplicates) {
      if (store.remove(duplicate.id)) {
        io.removeCacheDir?.(duplicate.id)
        removed += 1
      }
    }
  }

  return { scanned: projects.length, removed, merged, absorbedExports }
}

export function toImportResult(
  result: { kind: 'created' | 'existing'; project: ShortsJob; reason?: ShortsDuplicateReason },
  sourcePath: string,
): ShortsImportResult {
  return {
    kind: result.kind,
    project: result.project,
    reason: result.reason,
    sourcePath,
  }
}

export type ShortsProjectSettingsPatch = Partial<{
  name: string
  profile: ShortsProfile
  clipCount: ShortsClipCount
  requestedDuration: number
  durationMode: ShortsDurationMode
  aspectMode: ShortsAspectMode
  captionsEnabled: boolean
  languageOverride: string | null
}>
