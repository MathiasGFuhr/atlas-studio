import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '../musicAnalysis'
import {
  cutStartForScene,
  pickMusicTrackForSync,
  planClipMusicSync,
  sceneNumberFromAsset,
} from './syncToMusic'

function track(partial: Partial<MusicTrack> & Pick<MusicTrack, 'id' | 'name' | 'cuts'>): MusicTrack {
  return {
    originalPath: 'C:/music/original.wav',
    previewPath: 'C:/music/preview.wav',
    duration: 100,
    cutMode: 'manual',
    captions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('sceneNumberFromAsset', () => {
  it('lê o número do nome', () => {
    expect(sceneNumberFromAsset({ name: '2.mp4', sourcePath: 'C:/x/2.mp4' })).toBe(2)
  })

  it('ignora nomes que não são só número', () => {
    expect(sceneNumberFromAsset({ name: 'cena_2.mp4', sourcePath: 'C:/x/cena_2.mp4' })).toBeNull()
  })
})

describe('cutStartForScene', () => {
  it('usa o corte N-1', () => {
    const cuts = [
      { id: 'a', start: 10, end: 20, label: '1', source: 'manual' as const },
      { id: 'b', start: 42.5, end: 55, label: '2', source: 'manual' as const },
    ]
    expect(cutStartForScene(cuts, 2)).toBe(42.5)
    expect(cutStartForScene(cuts, 3)).toBeNull()
  })

  it('prefere o label Trecho N mesmo fora de ordem', () => {
    const cuts = [
      { id: 'b', start: 42.5, end: 55, label: 'Trecho 2', source: 'manual' as const },
      { id: 'a', start: 10, end: 20, label: 'Trecho 1', source: 'manual' as const },
    ]
    expect(cutStartForScene(cuts, 1)).toBe(10)
    expect(cutStartForScene(cuts, 2)).toBe(42.5)
  })
})

describe('pickMusicTrackForSync', () => {
  it('prioriza a música cujo áudio está na timeline', () => {
    const chosen = pickMusicTrackForSync({
      tracks: [
        track({
          id: '1',
          name: 'Outra',
          cuts: [{ id: 'c', start: 1, end: 2, label: '1', source: 'manual' }],
        }),
        track({
          id: '2',
          name: 'Quando Tudo Passar',
          originalPath: 'D:/songs/Quando Tudo Passar.wav',
          cuts: [{ id: 'c', start: 12, end: 25, label: '1', source: 'manual' }],
        }),
      ],
      audioAssets: [{ name: 'Quando Tudo Passar.wav', sourcePath: 'D:/import/Quando Tudo Passar.wav' }],
    })
    expect(chosen?.id).toBe('2')
  })

  it('usa preferredTrackId e depois o nome do projeto', () => {
    const tracks = [
      track({
        id: '1',
        name: 'Outra',
        cuts: [{ id: 'c', start: 1, end: 2, label: '1', source: 'manual' }],
      }),
      track({
        id: '2',
        name: 'O Rei se ajoelhou',
        cuts: [{ id: 'c', start: 12, end: 25, label: '1', source: 'manual' }],
      }),
    ]
    expect(pickMusicTrackForSync({ tracks, audioAssets: [], preferredTrackId: '2' })?.id).toBe('2')
    expect(
      pickMusicTrackForSync({ tracks, audioAssets: [], projectName: 'O Rei se ajoelhou' })?.id,
    ).toBe('2')
  })
})

describe('planClipMusicSync', () => {
  it('planeja o start do trecho', () => {
    const result = planClipMusicSync({
      clip: {
        id: 'clip',
        assetId: 'asset',
        trackId: 'v1',
        start: 0,
        inPoint: 0,
        outPoint: 10,
        sourceDuration: 10,
        volume: 1,
        muted: false,
        fit: 'contain',
        scale: 1,
        opacity: 1,
        fadeIn: 0,
        fadeOut: 0,
        effects: [],
        animation: { inId: null, outId: null, comboId: null, inDuration: 0.6, outDuration: 0.6 },
        role: 'media',
        effectId: null,
        text: null,
      },
      asset: { name: '2.mp4', sourcePath: 'C:/lipsync/2.mp4' } as never,
      track: track({
        id: 'm1',
        name: 'Quando Tudo Passar',
        cuts: [
          { id: 'a', start: 5, end: 15, label: '1', source: 'manual' },
          { id: 'b', start: 40, end: 55, label: '2', source: 'manual' },
        ],
      }),
    })
    expect(result).toEqual({
      ok: true,
      start: 40,
      sceneNumber: 2,
      trackName: 'Quando Tudo Passar',
    })
  })
})
