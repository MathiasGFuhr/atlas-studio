import { describe, expect, it } from 'vitest'
import type { MusicTrack } from './musicAnalysis'
import {
  MUSIC_NO_SINGER_ID,
  groupMusicTracksBySinger,
  matchesMusicTrackQuery,
} from './musicGrouping'

function track(partial: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: 't1',
    projectId: null,
    channelId: null,
    channelName: null,
    name: 'Faixa',
    originalPath: 'C:\\audio.mp3',
    previewPath: 'C:\\preview.wav',
    duration: 180,
    cutMode: 'automatico',
    cuts: [],
    captions: [],
    captionsLanguage: null,
    selectedId: null,
    appliedPreset: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...partial,
  }
}

describe('musicGrouping', () => {
  it('agrupa músicas por cantor em ordem alfabética e deixa Sem cantor por último', () => {
    const groups = groupMusicTracksBySinger(
      [
        track({
          id: 't1',
          name: 'Sem vínculo',
          cuts: [{ id: 'c1', start: 0, end: 10, label: 'C1', source: 'manual' }],
        }),
        track({
          id: 't2',
          name: 'Fogo no Altar',
          channelId: 'ch-maggie',
          channelName: 'Maggie Holloway',
          captions: [{ start: 0, end: 5, text: 'Oi' }],
          updatedAt: '2026-11-02T10:00:00.000Z',
        }),
        track({
          id: 't3',
          name: 'Teu Nome é Vitória',
          channelId: 'ch-ana',
          channelName: 'Ana Clara',
          cuts: [
            { id: 'c1', start: 0, end: 10, label: 'C1', source: 'manual' },
            { id: 'c2', start: 10, end: 20, label: 'C2', source: 'manual' },
          ],
        }),
        track({
          id: 't4',
          name: 'Só Tu Reinas',
          channelId: 'ch-maggie',
          channelName: 'Maggie Holloway',
          updatedAt: '2026-11-03T10:00:00.000Z',
        }),
      ],
      [
        { id: 'ch-ana', name: 'Ana Clara' },
        { id: 'ch-maggie', name: 'Maggie Holloway' },
      ],
    )

    expect(groups.map((g) => g.id)).toEqual(['ch-ana', 'ch-maggie', MUSIC_NO_SINGER_ID])
    expect(groups[0]?.cutsCount).toBe(2)
    expect(groups[1]?.tracks.map((t) => t.id)).toEqual(['t4', 't2'])
    expect(groups[1]?.captionsCount).toBe(1)
    expect(groups[2]?.name).toBe('Sem cantor')
  })

  it('filtra músicas pelo nome da faixa ou pelo nome do cantor', () => {
    const item = track({
      name: 'O Véu Já Não Nos Separa',
      channelId: 'ch-1',
      channelName: 'Maggie Holloway',
    })
    expect(matchesMusicTrackQuery(item, '')).toBe(true)
    expect(matchesMusicTrackQuery(item, 'véu')).toBe(true)
    expect(matchesMusicTrackQuery(item, 'maggie')).toBe(true)
    expect(matchesMusicTrackQuery(item, 'outro')).toBe(false)
  })
})
