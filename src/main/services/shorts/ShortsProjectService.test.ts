import { describe, expect, it } from 'vitest'
import type { ShortsClip, ShortsJob, VideoProbeInfo } from '../../../shared/shorts'
import { DEFAULT_FRAMING_SETTINGS } from '../../../shared/shortsFraming'
import { defaultShortsLanguageFields } from '../../../shared/shortsLanguage'
import {
  addClipWith,
  consolidateDuplicatesWith,
  createFromSourceVideoWith,
  deleteProjectWith,
  markClipExportedWith,
  removeClipWith,
  type ShortsProjectStore,
} from './ShortsProjectService'

function probe(partial: Partial<VideoProbeInfo> & Pick<VideoProbeInfo, 'duration' | 'name'>): VideoProbeInfo {
  return {
    path: '',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    format: 'mp4',
    hasAudio: true,
    fileSize: 12_000_000,
    mtimeMs: 1_000,
    ...partial,
  }
}

function clip(partial: Partial<ShortsClip> = {}): ShortsClip {
  return {
    id: 'c1',
    index: 1,
    start: 35,
    end: 80,
    score: 90,
    reason: 'gancho',
    hook: 'hook',
    title: 'Short',
    description: 'Desc',
    hashtags: [],
    accepted: false,
    exportedPath: null,
    focusStrategy: 'center',
    ...partial,
  }
}

function createStore(): ShortsProjectStore & { projects: Map<string, ShortsJob> } {
  const projects = new Map<string, ShortsJob>()
  let seq = 1
  const store: ShortsProjectStore & { projects: Map<string, ShortsJob> } = {
    projects,
    list: () => [...projects.values()],
    get: (id) => projects.get(id) ?? null,
    create: (input) => {
      const now = new Date().toISOString()
      const created: ShortsJob = {
        id: `p-${seq++}`,
        projectId: input.projectId ?? null,
        name: input.name || input.sourceName.replace(/\.[^.]+$/, ''),
        sourcePath: input.sourcePath,
        sourceName: input.sourceName,
        profile: input.profile || 'history',
        clipCount: 5,
        requestedDuration: 30,
        durationMode: 'approximate',
        aspectMode: 'center_9_16',
        framingTrack: [],
        framingSettings: DEFAULT_FRAMING_SETTINGS,
        captionsEnabled: true,
        probe: input.probe ?? null,
        clips: [],
        transcript: [],
        transcriptSource: 'none',
        ...defaultShortsLanguageFields(),
        analysisNotes: null,
        analysisMode: null,
        errorMessage: null,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        sourceExists: true,
        thumbnailUrl: null,
      }
      projects.set(created.id, created)
      return created
    },
    update: (id, patch) => {
      const current = projects.get(id)
      if (!current) return null
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() } as ShortsJob
      projects.set(id, next)
      return next
    },
    remove: (id) => projects.delete(id),
  }
  return store
}

describe('ShortsProjectService', () => {
  it('detecta alemão no filename na criação, sem assumir português', () => {
    const store = createStore()
    const created = createFromSourceVideoWith(store, {
      sourcePath: 'D:\\videos\\Als GEGEN DEN TAKT begann.mp4',
      sourceName: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan.mp4',
      probe: probe({ name: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan.mp4', duration: 200, path: 'D:\\videos\\Als GEGEN DEN TAKT begann.mp4' }),
    })
    expect(created.project.contentLanguage).toBe('de')
    expect(created.project.languageSource).toBe('filename')
    expect(created.project.languageOverride).toBeNull()
  })
  it('cumpre 1 vídeo original = 1 projeto em todo o ciclo', () => {
    const store = createStore()
    const videoA = 'D:\\videos\\VIDEO A.mp4'
    const videoB = 'D:\\videos\\VIDEO B.mp4'
    const probeA = probe({ name: 'VIDEO A.mp4', duration: 287, path: videoA })
    const probeB = probe({ name: 'VIDEO B.mp4', duration: 200, path: videoB, fileSize: 9_000_000 })

    const created = createFromSourceVideoWith(store, {
      sourcePath: videoA,
      sourceName: 'VIDEO A.mp4',
      probe: probeA,
    })
    expect(created.kind).toBe('created')
    expect(store.list()).toHaveLength(1)

    const analyzed = addClipWith(
      store,
      created.project.id,
      clip({ id: 's1', start: 35, end: 80 }),
    )
    addClipWith(store, created.project.id, clip({ id: 's2', index: 2, start: 108, end: 153 }))
    addClipWith(store, created.project.id, clip({ id: 's3', index: 3, start: 185, end: 230 }))
    addClipWith(store, created.project.id, clip({ id: 's4', index: 4, start: 185, end: 230 }))
    addClipWith(store, created.project.id, clip({ id: 's5', index: 5, start: 236, end: 287 }))
    expect(store.list()).toHaveLength(1)
    expect(store.get(created.project.id)?.clips).toHaveLength(5)

    const export45 = 'D:\\exports\\VIDEO A-short-1.mp4'
    const export51 = 'D:\\videos\\VIDEO A-short-5.mp4'
    markClipExportedWith(store, created.project.id, 's1', export45)
    markClipExportedWith(store, created.project.id, 's5', export51)
    expect(store.list()).toHaveLength(1)

    const restart = store.list()
    expect(restart).toHaveLength(1)

    const reimport = createFromSourceVideoWith(store, {
      sourcePath: videoA,
      sourceName: 'VIDEO A.mp4',
      probe: probeA,
    })
    expect(reimport.kind).toBe('existing')
    expect(reimport.reason).toBe('same_source')
    expect(store.list()).toHaveLength(1)

    const importExport = createFromSourceVideoWith(store, {
      sourcePath: export51,
      sourceName: 'VIDEO A-short-5.mp4',
      probe: probe({ name: 'VIDEO A-short-5.mp4', duration: 51, path: export51, width: 1080, height: 1920 }),
    })
    expect(importExport.kind).toBe('existing')
    expect(importExport.reason).toBe('export_of_existing')
    expect(store.list()).toHaveLength(1)

    const second = createFromSourceVideoWith(store, {
      sourcePath: videoB,
      sourceName: 'VIDEO B.mp4',
      probe: probeB,
    })
    expect(second.kind).toBe('created')
    expect(store.list()).toHaveLength(2)

    const removed = deleteProjectWith(store, created.project.id)
    expect(removed).toBe(true)
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].id).toBe(second.project.id)
    expect(analyzed).toBeTruthy()
  })

  it('só cria outro projeto do mesmo vídeo com forceNew explícito', () => {
    const store = createStore()
    const sourcePath = 'D:\\videos\\VIDEO A.mp4'
    const probeA = probe({ name: 'VIDEO A.mp4', duration: 287, path: sourcePath })
    createFromSourceVideoWith(store, { sourcePath, sourceName: 'VIDEO A.mp4', probe: probeA })
    const forced = createFromSourceVideoWith(store, {
      sourcePath,
      sourceName: 'VIDEO A.mp4',
      probe: probeA,
      forceNew: true,
    })
    expect(forced.kind).toBe('created')
    expect(store.list()).toHaveLength(2)
  })

  it('consolida original duplicado e card de export 00:51 sem apagar o MP4 exportado', () => {
    const store = createStore()
    const originalPath = 'D:\\videos\\GEGEN DEN TAKT.mp4'
    const exportPath = 'D:\\videos\\GEGEN DEN TAKT-short-2.mp4'
    const original = store.create({
      sourcePath: originalPath,
      sourceName: 'GEGEN DEN TAKT.mp4',
      probe: probe({ name: 'GEGEN DEN TAKT.mp4', duration: 287, path: originalPath }),
    })
    store.update(original.id, {
      status: 'ready',
      clips: [
        clip({
          id: 'keep',
          index: 2,
          start: 235,
          end: 287,
          exportedPath: exportPath,
          accepted: true,
        }),
      ],
    })
    store.create({
      sourcePath: exportPath,
      sourceName: 'GEGEN DEN TAKT-short-2.mp4',
      probe: probe({ name: 'GEGEN DEN TAKT-short-2.mp4', duration: 51.75, path: exportPath, width: 1080, height: 1920 }),
    })
    store.create({
      sourcePath: originalPath,
      sourceName: 'GEGEN DEN TAKT.mp4',
      probe: probe({ name: 'GEGEN DEN TAKT.mp4', duration: 287, path: originalPath }),
    })

    const result = consolidateDuplicatesWith(store)
    expect(result.scanned).toBe(3)
    expect(result.removed).toBe(2)
    expect(store.list()).toHaveLength(1)
    const kept = store.list()[0]
    expect(kept.id).toBe(original.id)
    expect(kept.clips[0].exportedPath).toBe(exportPath)
  })

  it('excluir projeto remove o registro e não exige apagar original nem export', () => {
    const store = createStore()
    const created = store.create({
      sourcePath: 'D:\\videos\\VIDEO A.mp4',
      sourceName: 'VIDEO A.mp4',
      probe: probe({ name: 'VIDEO A.mp4', duration: 287 }),
    })
    markClipExportedWith(store, created.id, addClipWith(store, created.id, clip())!.clips[0].id, 'D:\\out\\a.mp4')
    const cacheRemoved: string[] = []
    expect(deleteProjectWith(store, created.id, { removeCacheDir: (id) => cacheRemoved.push(id) })).toBe(true)
    expect(store.list()).toHaveLength(0)
    expect(cacheRemoved).toEqual([created.id])
  })

  it('excluir um Short remove só o corte e reindexa os demais', () => {
    const store = createStore()
    const created = store.create({
      sourcePath: 'D:\\videos\\VIDEO A.mp4',
      sourceName: 'VIDEO A.mp4',
      probe: probe({ name: 'VIDEO A.mp4', duration: 287 }),
    })
    addClipWith(store, created.id, clip({ id: 's1', index: 1, start: 10, end: 40 }))
    addClipWith(store, created.id, clip({ id: 's2', index: 2, start: 80, end: 110 }))
    addClipWith(store, created.id, clip({ id: 's3', index: 3, start: 150, end: 180 }))
    markClipExportedWith(store, created.id, 's2', 'D:\\out\\a-short-2.mp4')

    const next = removeClipWith(store, created.id, 's2')
    expect(next?.clips.map((item) => item.id)).toEqual(['s1', 's3'])
    expect(next?.clips.map((item) => item.index)).toEqual([1, 2])
    expect(store.list()).toHaveLength(1)
  })
})
