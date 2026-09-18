import { describe, expect, it } from 'vitest'
import type { ShortsClip, ShortsJob } from './shorts'
import { DEFAULT_FRAMING_SETTINGS } from './shortsFraming'
import {
  findExistingShortsProject,
  mergeReanalysisClips,
  mergeSameSourceSnapshots,
  normalizeSourceVideoPath,
  parseAtlasExportFileName,
  planShortsProjectConsolidation,
  sourceDirectoryKey,
} from './shortsProjectIdentity'

function clip(partial: Partial<ShortsClip> = {}): ShortsClip {
  return {
    id: 'c1',
    index: 1,
    start: 0,
    end: 15,
    score: 80,
    reason: 'gancho',
    hook: 'hook',
    title: 'Título',
    description: 'Desc',
    hashtags: [],
    accepted: false,
    exportedPath: null,
    focusStrategy: 'center',
    ...partial,
  }
}

function job(partial: Partial<ShortsJob> = {}): ShortsJob {
  return {
    id: 'j1',
    projectId: null,
    name: 'GEGEN DEN TAKT',
    sourcePath: 'D:\\videos\\GEGEN DEN TAKT.mp4',
    sourceName: 'GEGEN DEN TAKT.mp4',
    profile: 'music',
    clipCount: 5,
    requestedDuration: 30,
    durationMode: 'approximate',
    aspectMode: 'center_9_16',
    framingTrack: [],
    framingSettings: DEFAULT_FRAMING_SETTINGS,
    captionsEnabled: true,
    probe: { name: 'GEGEN DEN TAKT.mp4', path: '', duration: 287, width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', format: 'mp4', hasAudio: true },
    clips: [],
    transcript: [],
    transcriptSource: 'none',
    contentLanguage: '',
    languageSource: 'fallback',
    languageConfidence: 0,
    languageOverride: null,
    detectedLanguage: null,
    transcriptLanguage: null,
    analysisMode: null,
    analysisNotes: null,
    errorMessage: null,
    status: 'draft',
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T12:00:00.000Z',
    sourceExists: true,
    thumbnailUrl: null,
    ...partial,
  }
}

const originalPath =
  'D:\\Canais Youtube\\Johann Falk\\Gegen den Takt\\Als „GEGEN DEN TAKT“ begann, erwachte das gan\\Als „GEGEN DEN TAKT“ begann, erwachte das gan.mp4'
const exportPath =
  'D:\\Canais Youtube\\Johann Falk\\Gegen den Takt\\Als „GEGEN DEN TAKT“ begann, erwachte das gan\\Als „GEGEN DEN TAKT“ begann, erwachte das gan-short-2.mp4'

describe('identidade do vídeo-fonte de Shorts', () => {
  it('normaliza path do Windows sem usar só o nome do arquivo', () => {
    expect(normalizeSourceVideoPath('D:\\Videos\\Show.mp4')).toBe('d:/Videos/Show.mp4')
    expect(normalizeSourceVideoPath('D:/Videos/Show.mp4')).toBe('d:/Videos/Show.mp4')
    expect(sourceDirectoryKey(originalPath)).toBe(
      'd:/Canais Youtube/Johann Falk/Gegen den Takt/Als „GEGEN DEN TAKT“ begann, erwachte das gan',
    )
    expect(parseAtlasExportFileName(exportPath)).toEqual({
      stem: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan',
      index: 2,
    })
  })

  it('não trata dois vídeos com o mesmo nome e pastas diferentes como o mesmo projeto', () => {
    const a = job({ id: 'a', sourcePath: 'D:\\canal-a\\show.mp4', sourceName: 'show.mp4' })
    const b = job({
      id: 'b',
      sourcePath: 'D:\\canal-b\\show.mp4',
      sourceName: 'show.mp4',
      probe: { ...a.probe!, duration: 120, path: 'D:\\canal-b\\show.mp4' },
    })
    expect(findExistingShortsProject({ sourcePath: b.sourcePath, duration: 120 }, [a])).toBeNull()
  })

  it('reconhece o mesmo arquivo original pelo path normalizado', () => {
    const existing = job({
      id: 'ready',
      sourcePath: originalPath,
      status: 'ready',
      clips: [clip({ exportedPath: exportPath, accepted: true, start: 235.46, end: 287.21 })],
    })
    const match = findExistingShortsProject(
      { sourcePath: originalPath.replace(/\\/g, '/') },
      [existing],
    )
    expect(match?.reason).toBe('same_source')
    expect(match?.project.id).toBe('ready')
  })

  it('reconhece um MP4 exportado (-short-N) como filho do projeto-fonte, não como projeto novo', () => {
    const parent = job({
      id: 'parent',
      sourcePath: originalPath,
      sourceName: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan.mp4',
      status: 'ready',
      probe: { name: 'src.mp4', path: originalPath, duration: 287.21, width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', format: 'mp4', hasAudio: true },
      clips: [
        clip({
          id: 'clip-2',
          index: 2,
          start: 235.46,
          end: 287.21,
          exportedPath: exportPath,
          accepted: true,
        }),
      ],
    })
    const match = findExistingShortsProject(
      { sourcePath: exportPath, duration: 51.75, sourceName: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan-short-2.mp4' },
      [parent],
    )
    expect(match?.reason).toBe('export_of_existing')
    expect(match?.project.id).toBe('parent')
    expect(match?.clipId).toBe('clip-2')
  })
})

describe('consolidação segura de ShortsProjects', () => {
  it('une reimport do original e absorve o card de 00:51 vindo do export, sem misturar outro vídeo', () => {
    const original = job({
      id: 'original',
      sourcePath: originalPath,
      sourceName: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan.mp4',
      status: 'ready',
      createdAt: '2026-09-17T10:03:16.024Z',
      probe: { name: 'src.mp4', path: originalPath, duration: 287.21, width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', format: 'mp4', hasAudio: true },
      clips: [
        clip({ id: 'c2', index: 2, start: 235.46, end: 287.21, exportedPath: exportPath, accepted: true }),
        clip({ id: 'c1', index: 1, start: 235.46, end: 287.21 }),
      ],
    })
    const derived51 = job({
      id: 'derived-51',
      name: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan-short-2',
      sourcePath: exportPath,
      sourceName: 'Als „GEGEN DEN TAKT“ begann, erwachte das gan-short-2.mp4',
      status: 'draft',
      createdAt: '2026-09-17T11:03:08.594Z',
      probe: { name: 'short.mp4', path: exportPath, duration: 51.75, width: 1080, height: 1920, fps: 30, aspectRatio: '9:16', format: 'mp4', hasAudio: true },
      clips: [],
    })
    const duplicateOriginal = job({
      id: 'dup-original',
      sourcePath: originalPath,
      sourceName: original.sourceName,
      status: 'draft',
      createdAt: '2026-09-17T11:03:11.778Z',
      probe: original.probe,
      clips: [],
    })
    const otherVideo = job({
      id: 'other',
      name: 'Zu alt für eure Regeln',
      sourcePath: 'D:\\Canais Youtube\\Johann Falk\\Zu alt\\video.mp4',
      sourceName: 'Zu alt.mp4',
      probe: { name: 'Zu alt.mp4', path: '', duration: 310.78, width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', format: 'mp4', hasAudio: true },
    })

    const plan = planShortsProjectConsolidation([original, derived51, duplicateOriginal, otherVideo])
    expect(plan).toEqual(
      expect.arrayContaining([
        { type: 'absorb_export', parentId: 'original', derivedId: 'derived-51', clipId: 'c2', exportPath },
        { type: 'merge_same_source', keeperId: 'original', duplicateIds: ['dup-original'] },
      ]),
    )
    expect(plan.some((action) => 'keeperId' in action && action.keeperId === 'other')).toBe(false)
    expect(plan.some((action) => action.type === 'absorb_export' && action.derivedId === 'other')).toBe(false)
  })

  it('em caso de dúvida (mesmo nome, pastas diferentes) não mescla', () => {
    const a = job({ id: 'a', sourcePath: 'D:\\a\\show.mp4', sourceName: 'show.mp4' })
    const b = job({ id: 'b', sourcePath: 'D:\\b\\show.mp4', sourceName: 'show.mp4' })
    expect(planShortsProjectConsolidation([a, b])).toEqual([])
  })

  it('ao mesclar o mesmo source, preserva export e copy do keeper', () => {
    const keeper = job({
      id: 'k',
      status: 'ready',
      clips: [clip({ id: 'keep', exportedPath: exportPath, accepted: true, title: 'Refrão' })],
    })
    const duplicate = job({
      id: 'd',
      status: 'draft',
      clips: [clip({ id: 'extra', start: 80, end: 120, title: 'Outro' })],
    })
    const merged = mergeSameSourceSnapshots(keeper, [duplicate])
    expect(merged.clips).toHaveLength(2)
    expect(merged.clips[0].exportedPath).toBe(exportPath)
    expect(merged.clips[0].title).toBe('Refrão')
    expect(merged.clips[1].title).toBe('Outro')
    expect(merged.status).toBe('ready')
  })
})

describe('reanálise preserva Shorts exportados', () => {
  it('mantém clip exportado e só adiciona candidatos sem overlap', () => {
    const existing = [
      clip({ id: 'exported', start: 235, end: 287, exportedPath: exportPath, accepted: true }),
      clip({ id: 'draft', start: 10, end: 40 }),
    ]
    const next = [
      clip({ id: 'new-a', start: 12, end: 42, title: 'Novo A' }),
      clip({ id: 'new-b', start: 80, end: 120, title: 'Novo B' }),
    ]
    const merged = mergeReanalysisClips(existing, next)
    expect(merged.some((item) => item.id === 'exported' && item.exportedPath === exportPath)).toBe(true)
    expect(merged.some((item) => item.title === 'Novo B')).toBe(true)
    expect(merged.some((item) => item.id === 'draft')).toBe(false)
  })
})
