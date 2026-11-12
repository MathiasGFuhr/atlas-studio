import { describe, expect, it } from 'vitest'
import {
  addTrack,
  clipEnd,
  clipsAt,
  createEmptyTimeline,
  deleteClips,
  findClip,
  findFreeStart,
  findTrack,
  fitClipToMusicDuration,
  insertAssetClip,
  insertEffectClip,
  moveClip,
  moveTrack,
  normalizeTimeline,
  normalizeWatermarks,
  snapClipStart,
  splitAt,
  splitClip,
  timelineDuration,
  trimClip,
  updateClip,
  updateTrack,
} from './timelineOps'
import type { EditorTimeline } from './types'

const video = (id: string, duration: number) => ({ id, kind: 'video' as const, duration })
const audio = (id: string, duration: number) => ({ id, kind: 'audio' as const, duration })

function withClips(): { timeline: EditorTimeline; a: string; b: string } {
  let timeline = createEmptyTimeline('9:16')
  const first = insertAssetClip(timeline, video('asset-a', 10))
  timeline = first.timeline
  const second = insertAssetClip(timeline, video('asset-b', 6))
  return { timeline: second.timeline, a: first.clipId, b: second.clipId }
}

describe('fitClipToMusicDuration', () => {
  it('corta o excedente do vídeo para a duração da música', () => {
    const inserted = insertAssetClip(createEmptyTimeline(), video('long', 10))
    const fitted = fitClipToMusicDuration(inserted.timeline, inserted.clipId, 8.5)
    expect(findClip(fitted, inserted.clipId)).toMatchObject({ inPoint: 0, outPoint: 8.5, start: 0 })
  })
})

describe('insertAssetClip', () => {
  it('encadeia clipes de vídeo na faixa principal e áudio na faixa de áudio', () => {
    const { timeline, a, b } = withClips()
    expect(findClip(timeline, a)).toMatchObject({ start: 0, inPoint: 0, outPoint: 10 })
    expect(findClip(timeline, b)).toMatchObject({ start: 10, outPoint: 6 })

    const withAudio = insertAssetClip(timeline, audio('music', 30))
    const audioClip = findClip(withAudio.timeline, withAudio.clipId)!
    const audioTrack = withAudio.timeline.tracks.find((track) => track.id === audioClip.trackId)
    expect(audioTrack?.kind).toBe('audio')
    expect(audioClip.start).toBe(0)
    expect(timelineDuration(withAudio.timeline)).toBe(30)
  })

  it('imagem entra com 5s e sem limite de fonte', () => {
    const result = insertAssetClip(createEmptyTimeline(), { id: 'img', kind: 'image', duration: 0.04 })
    expect(findClip(result.timeline, result.clipId)).toMatchObject({ outPoint: 5, sourceDuration: null })
  })

  it('não sobrepõe quando solto em cima de outro clipe', () => {
    const { timeline } = withClips()
    const dropped = insertAssetClip(timeline, video('asset-c', 4), { start: 3 })
    expect(findClip(dropped.timeline, dropped.clipId)!.start).toBe(16)
  })
})

describe('findFreeStart', () => {
  it('usa o buraco mais próximo que comporta o clipe', () => {
    const { timeline, a } = withClips()
    const gapTimeline = deleteClips(timeline, [a])
    const others = gapTimeline.clips
    expect(findFreeStart(others, 2, 4)).toBe(2)
    expect(findFreeStart(others, 8, 4)).toBe(6)
  })
})

describe('splitClip', () => {
  it('divide preservando a continuidade da fonte', () => {
    const { timeline, a } = withClips()
    const result = splitClip(timeline, a, 4)
    const left = findClip(result.timeline, a)!
    const right = findClip(result.timeline, result.rightId!)!
    expect(left).toMatchObject({ start: 0, inPoint: 0, outPoint: 4 })
    expect(right).toMatchObject({ start: 4, inPoint: 4, outPoint: 10 })
  })

  it('ignora corte colado na borda', () => {
    const { timeline, a } = withClips()
    expect(splitClip(timeline, a, 0.01).rightId).toBeNull()
  })

  it('splitAt divide todos os clipes sob o playhead', () => {
    let { timeline } = withClips()
    timeline = insertAssetClip(timeline, audio('music', 30)).timeline
    const next = splitAt(timeline, 12)
    expect(next.clips).toHaveLength(timeline.clips.length + 2)
  })

  it('não divide em faixa travada', () => {
    const { timeline, a } = withClips()
    const locked = updateTrack(timeline, timeline.tracks[0].id, { locked: true })
    expect(splitClip(locked, a, 4).rightId).toBeNull()
  })
})

describe('trimClip', () => {
  it('apara o início sem passar do começo da fonte', () => {
    const { timeline, a } = withClips()
    const trimmed = trimClip(timeline, a, 'start', 2)
    expect(findClip(trimmed, a)).toMatchObject({ start: 2, inPoint: 2, outPoint: 10 })
    const back = trimClip(trimmed, a, 'start', -5)
    expect(findClip(back, a)).toMatchObject({ start: 0, inPoint: 0 })
  })

  it('apara o fim sem invadir o próximo clipe nem passar da fonte', () => {
    const { timeline, a, b } = withClips()
    const shorter = trimClip(timeline, a, 'end', 7)
    expect(findClip(shorter, a)).toMatchObject({ outPoint: 7 })
    const blocked = trimClip(shorter, a, 'end', 30)
    expect(clipEnd(findClip(blocked, a)!)).toBe(10)
    const lastClip = trimClip(timeline, b, 'end', 100)
    expect(findClip(lastClip, b)).toMatchObject({ outPoint: 6 })
  })

  it('imagem pode esticar livremente', () => {
    const result = insertAssetClip(createEmptyTimeline(), { id: 'img', kind: 'image', duration: 0 })
    const stretched = trimClip(result.timeline, result.clipId, 'end', 42)
    expect(findClip(stretched, result.clipId)).toMatchObject({ outPoint: 42 })
  })
})

describe('moveClip', () => {
  it('move para outra faixa do mesmo tipo e evita sobreposição', () => {
    const { timeline, a, b } = withClips()
    const overlay = addTrack(timeline, 'video')
    const moved = moveClip(overlay.timeline, b, { start: 1, trackId: overlay.trackId })
    expect(findClip(moved, b)).toMatchObject({ trackId: overlay.trackId, start: 1 })

    const collide = moveClip(timeline, b, { start: 5 })
    expect(findClip(collide, b)!.start).toBe(clipEnd(findClip(collide, a)!))
  })

  it('não move áudio para faixa de vídeo', () => {
    let { timeline } = withClips()
    const inserted = insertAssetClip(timeline, audio('music', 5))
    timeline = inserted.timeline
    const videoTrack = timeline.tracks.find((track) => track.kind === 'video')!
    const moved = moveClip(timeline, inserted.clipId, { start: 0, trackId: videoTrack.id })
    expect(findClip(moved, inserted.clipId)!.trackId).not.toBe(videoTrack.id)
  })
})

describe('deleteClips', () => {
  it('ripple puxa os clipes seguintes', () => {
    const { timeline, a, b } = withClips()
    const rippled = deleteClips(timeline, [a], true)
    expect(findClip(rippled, b)).toMatchObject({ start: 0 })
    const plain = deleteClips(timeline, [a], false)
    expect(findClip(plain, b)).toMatchObject({ start: 10 })
  })
})

describe('updateClip', () => {
  it('limita o volume entre 0 e 200%', () => {
    const { timeline, a } = withClips()
    expect(findClip(updateClip(timeline, a, { volume: 5 }), a)!.volume).toBe(2)
    expect(findClip(updateClip(timeline, a, { volume: -1 }), a)!.volume).toBe(0)
  })
})

describe('snap', () => {
  it('encaixa pelo fim quando está mais perto', () => {
    expect(snapClipStart(4.9, 3, [0, 8], 0.2)).toBe(5)
    expect(snapClipStart(0.1, 3, [0, 8], 0.2)).toBe(0)
    expect(snapClipStart(3, 1, [0, 10], 0.2)).toBe(3)
  })
})

describe('normalizeWatermarks', () => {
  it('migra watermark singular legado para lista', () => {
    const list = normalizeWatermarks({
      watermark: {
        assetId: 'logo',
        corner: 'bottom-left',
        scale: 0.2,
        opacity: 1,
        margin: 0.01,
      },
    })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ assetId: 'logo', corner: 'bottom-left' })
    expect(list[0].id).toBeTruthy()
  })

  it('respeita o máximo de duas marcas', () => {
    const list = normalizeWatermarks({
      watermarks: [
        { id: 'a', assetId: '1', corner: 'top-left', scale: 0.1, opacity: 1, margin: 0.01 },
        { id: 'b', assetId: '2', corner: 'top-right', scale: 0.1, opacity: 1, margin: 0.01 },
        { id: 'c', assetId: '3', corner: 'bottom-left', scale: 0.1, opacity: 1, margin: 0.01 },
      ],
    })
    expect(list).toHaveLength(2)
    expect(list.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('insertEffectClip', () => {
  it('abre faixa nova acima quando o tempo colide com outro efeito', () => {
    const first = insertEffectClip(createEmptyTimeline(), 'bloom', {
      start: 0,
      duration: 3,
      exactStart: true,
    })
    const second = insertEffectClip(first.timeline, 'blur', {
      start: 1,
      duration: 3,
      exactStart: true,
      trackId: findClip(first.timeline, first.clipId)!.trackId,
    })
    const firstClip = findClip(second.timeline, first.clipId)!
    const secondClip = findClip(second.timeline, second.clipId)!
    expect(secondClip.trackId).not.toBe(firstClip.trackId)
    expect(secondClip.start).toBe(1)
    const secondTrackIndex = second.timeline.tracks.findIndex((track) => track.id === secondClip.trackId)
    const firstTrackIndex = second.timeline.tracks.findIndex((track) => track.id === firstClip.trackId)
    expect(secondTrackIndex).toBeLessThan(firstTrackIndex)
    expect(findTrack(second.timeline, secondClip.trackId)?.kind).toBe('effect')
  })

  it('forceNewTrack cria faixa no topo mesmo com espaço livre', () => {
    const first = insertEffectClip(createEmptyTimeline(), 'bloom', {
      start: 0,
      duration: 3,
      exactStart: true,
    })
    const second = insertEffectClip(first.timeline, 'blur', {
      start: 10,
      duration: 3,
      exactStart: true,
      forceNewTrack: true,
    })
    expect(findClip(second.timeline, second.clipId)!.trackId).not.toBe(
      findClip(second.timeline, first.clipId)!.trackId,
    )
    expect(second.timeline.tracks.filter((track) => track.kind === 'effect')).toHaveLength(2)
  })
})

describe('moveTrack', () => {
  it('reordena vídeo/efeito e mantém áudio fixo no fim', () => {
    let timeline = createEmptyTimeline()
    const video = addTrack(timeline, 'video')
    timeline = video.timeline
    const effect = addTrack(timeline, 'effect')
    timeline = effect.timeline
    const music = insertAssetClip(timeline, audio('music', 12))
    timeline = music.timeline

    const idsBefore = timeline.tracks.map((track) => track.id)
    expect(timeline.tracks.at(-1)?.kind).toBe('audio')

    const moved = moveTrack(timeline, video.trackId, effect.trackId)
    expect(moved.tracks.map((track) => track.kind).filter((kind) => kind === 'audio')).toEqual(['audio'])
    expect(moved.tracks.at(-1)?.kind).toBe('audio')
    expect(moved.tracks.findIndex((track) => track.id === video.trackId)).toBeLessThan(
      moved.tracks.findIndex((track) => track.id === effect.trackId),
    )
    expect(moved.tracks.at(-1)?.id).toBe(idsBefore.at(-1))
  })

  it('não move a faixa de música', () => {
    let timeline = insertAssetClip(createEmptyTimeline(), audio('music', 8)).timeline
    const audioTrack = timeline.tracks.find((track) => track.kind === 'audio')!
    const videoTrack = timeline.tracks.find((track) => track.kind === 'video')!
    const next = moveTrack(timeline, audioTrack.id, videoTrack.id)
    expect(next).toBe(timeline)
  })
})

describe('clipsAt / normalizeTimeline', () => {
  it('acha clipes no tempo e sobrevive a JSON quebrado', () => {
    const { timeline, a, b } = withClips()
    expect(clipsAt(timeline, 9.99).map((clip) => clip.id)).toEqual([a])
    expect(clipsAt(timeline, 10).map((clip) => clip.id)).toEqual([b])

    const roundTrip = normalizeTimeline(JSON.parse(JSON.stringify(timeline)))
    expect(roundTrip).toEqual(timeline)

    const broken = normalizeTimeline({ aspect: 'x', tracks: 'nope', clips: [{ id: 1 }] }, '16:9')
    expect(broken.aspect).toBe('16:9')
    expect(broken.watermarks).toEqual([])
    expect(broken.clips).toEqual([])
    expect(broken.tracks.length).toBeGreaterThan(0)

    const audioPinned = normalizeTimeline({
      aspect: '16:9',
      fps: 30,
      tracks: [
        { id: 'a1', kind: 'audio', name: 'Áudio 1' },
        { id: 'v1', kind: 'video', name: 'Vídeo 1' },
        { id: 'e1', kind: 'effect', name: 'Efeito 1' },
      ],
      clips: [],
    })
    expect(audioPinned.tracks.map((track) => track.kind)).toEqual(['video', 'effect', 'audio'])
  })
})
