import { describe, expect, it } from 'vitest'
import { buildClipCutExportItems, buildClipCutFfmpegArgs } from './clipCutExportPlan'
import {
  addTrack,
  createEmptyTimeline,
  fitClipToMusicDuration,
  insertAssetClip,
  insertEffectClip,
  insertTextClip,
  splitClip,
  updateTrack,
} from './timelineOps'

describe('buildClipCutExportItems', () => {
  it('ordena clipes de vídeo na timeline, gera nomes com zero à esquerda e ignora áudio/imagem/efeito/texto', () => {
    let timeline = createEmptyTimeline('16:9')
    const v1 = insertAssetClip(
      timeline,
      { id: 'v1', kind: 'video', duration: 6 },
      { start: 0, exactStart: true },
    )
    timeline = fitClipToMusicDuration(v1.timeline, v1.clipId, 3.25)

    const v2 = insertAssetClip(
      timeline,
      { id: 'v2', kind: 'video', duration: 5 },
      { start: 3.25, exactStart: true },
    )
    timeline = fitClipToMusicDuration(v2.timeline, v2.clipId, 2.5)

    timeline = insertAssetClip(timeline, { id: 'img', kind: 'image', duration: 0 }, { start: 5.75 }).timeline
    timeline = insertAssetClip(timeline, { id: 'song', kind: 'audio', duration: 20 }, { start: 0 }).timeline
    timeline = insertEffectClip(timeline, 'glow', { start: 0, duration: 2 }).timeline
    timeline = insertTextClip(timeline, 'classic-bold', { start: 0, duration: 2, title: 'Oi' }).timeline

    const items = buildClipCutExportItems({
      timeline,
      assets: {
        v1: { name: '1.mp4', path: 'C:\\proj\\lipsync\\1.mp4', kind: 'video', hasAudio: true },
        v2: { name: 'cena:2?.mp4', path: 'C:\\proj\\lipsync\\2.mp4', kind: 'video', hasAudio: false },
        img: { name: 'capa.png', path: 'C:\\proj\\capa.png', kind: 'image', hasAudio: false },
        song: { name: 'musica.mp3', path: 'C:\\proj\\musica.mp3', kind: 'audio', hasAudio: true },
      },
    })

    expect(items).toEqual([
      {
        clipId: v1.clipId,
        assetId: 'v1',
        index: 1,
        fileName: '01 - 1.mp4',
        sourcePath: 'C:\\proj\\lipsync\\1.mp4',
        inPoint: 0,
        duration: 3.25,
        hasAudio: true,
      },
      {
        clipId: v2.clipId,
        assetId: 'v2',
        index: 2,
        fileName: '02 - cena 2.mp4',
        sourcePath: 'C:\\proj\\lipsync\\2.mp4',
        inPoint: 0,
        duration: 2.5,
        hasAudio: false,
      },
    ])
  })

  it('mantém partes divididas com numeração sequencial e respeita filtro clipIds e faixa oculta', () => {
    let timeline = createEmptyTimeline('16:9')
    const added = insertAssetClip(
      timeline,
      { id: 'v1', kind: 'video', duration: 6 },
      { start: 0, exactStart: true },
    )
    const split = splitClip(added.timeline, added.clipId, 2.5)
    timeline = split.timeline

    const extraTrack = addTrack(timeline, 'video')
    timeline = insertAssetClip(
      extraTrack.timeline,
      { id: 'v2', kind: 'video', duration: 4 },
      { trackId: extraTrack.trackId, start: 1, exactStart: true },
    ).timeline
    timeline = updateTrack(timeline, extraTrack.trackId, { hidden: true })

    const assets = {
      v1: { name: '1.mp4', path: 'C:\\v\\1.mp4', kind: 'video' as const, hasAudio: false },
      v2: { name: '2.mp4', path: 'C:\\v\\2.mp4', kind: 'video' as const, hasAudio: false },
    }

    const allVisible = buildClipCutExportItems({ timeline, assets })
    expect(allVisible).toHaveLength(2)
    expect(allVisible[0]).toMatchObject({ index: 1, fileName: '01 - 1.mp4', inPoint: 0, duration: 2.5 })
    expect(allVisible[1]).toMatchObject({ index: 2, fileName: '02 - 1.mp4', inPoint: 2.5, duration: 3.5 })

    const onlySecond = buildClipCutExportItems({
      timeline,
      assets,
      clipIds: [split.rightId!],
    })
    expect(onlySecond).toHaveLength(1)
    expect(onlySecond[0]).toMatchObject({ index: 1, fileName: '01 - 1.mp4', inPoint: 2.5, duration: 3.5 })
  })

  it('evita colisão caso o arquivo original já tenha o mesmo nome do destino', () => {
    const timeline = insertAssetClip(createEmptyTimeline('16:9'), {
      id: 'v1',
      kind: 'video',
      duration: 4,
    }).timeline

    const items = buildClipCutExportItems({
      timeline,
      assets: {
        v1: { name: 'cena.mp4', path: 'C:\\v\\01 - cena.mp4', kind: 'video', hasAudio: false },
      },
    })
    expect(items[0].fileName).toBe('01 - cena (corte).mp4')
  })
})

describe('buildClipCutFfmpegArgs', () => {
  it('gera comando preciso sem áudio para CapCut por padrão', () => {
    const args = buildClipCutFfmpegArgs({
      sourcePath: 'C:\\v\\1.mp4',
      outputPath: 'C:\\out\\01 - 1.mp4',
      inPoint: 1.25,
      duration: 3.4,
      hasAudio: true,
      stripAudio: true,
      maxQuality: true,
    })

    expect(args).toContain('-ss')
    expect(args[args.indexOf('-ss') + 1]).toBe('1.250')
    expect(args[args.indexOf('-t') + 1]).toBe('3.400')
    expect(args).toContain('-an')
    expect(args).not.toContain('-c:a')
    expect(args[args.indexOf('-crf') + 1]).toBe('14')
    expect(args[args.indexOf('-preset') + 1]).toBe('slow')
    expect(args.at(-1)).toBe('C:\\out\\01 - 1.mp4')
  })

  it('mantém áudio AAC opcional via 0:a:0? quando stripAudio é false', () => {
    const args = buildClipCutFfmpegArgs({
      sourcePath: 'C:\\v\\1.mp4',
      outputPath: 'C:\\out\\01 - 1.mp4',
      inPoint: 0,
      duration: 2,
      hasAudio: false,
      stripAudio: false,
      maxQuality: false,
    })

    expect(args).not.toContain('-an')
    expect(args).toContain('0:a:0?')
    expect(args).toContain('-c:a')
    expect(args[args.indexOf('-crf') + 1]).toBe('16')
    expect(args[args.indexOf('-preset') + 1]).toBe('veryfast')
  })
})
