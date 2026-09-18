import { describe, expect, it } from 'vitest'
import type { ChannelVideo } from './types'
import {
  channelCalendarPath,
  channelPublishedPath,
  channelVideoPath,
  formatMusicProjectPublicationLine,
  formatScheduledDateLabel,
  pickUpcomingChannelVideos,
  sortPublishedChannelVideos,
  todayDateKey,
} from './channelVideos'

function video(partial: Partial<ChannelVideo> & Pick<ChannelVideo, 'id' | 'title' | 'scheduledDate'>): ChannelVideo {
  return {
    channelId: 'ch-1',
    description: '',
    thumbnailPath: '',
    status: 'agendando',
    scriptId: null,
    projectId: null,
    projectFolderPath: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...partial,
  }
}

describe('channelVideos', () => {
  const now = new Date(2026, 8, 17)

  it('monta a chave local de hoje', () => {
    expect(todayDateKey(now)).toBe('2026-09-17')
  })

  it('formata hoje, amanhã e data futura sem ISO cru', () => {
    expect(formatScheduledDateLabel('2026-09-17', now)).toBe('Hoje')
    expect(formatScheduledDateLabel('2026-09-18', now)).toBe('Amanhã')
    expect(formatScheduledDateLabel('2026-09-20', now)).toBe('20 set')
  })

  it('ordena próximos cronologicamente e ignora datas passadas', () => {
    const picked = pickUpcomingChannelVideos(
      [
        video({ id: 'old', title: 'Antigo', scheduledDate: '2026-09-16' }),
        video({ id: 'later', title: 'Depois', scheduledDate: '2026-09-20', createdAt: '2026-09-01T00:00:00.000Z' }),
        video({ id: 'today', title: 'Hoje', scheduledDate: '2026-09-17' }),
        video({ id: 'tomorrow', title: 'Amanhã', scheduledDate: '2026-09-18' }),
      ],
      '2026-09-17',
      5,
    )
    expect(picked.map((item) => item.id)).toEqual(['today', 'tomorrow', 'later'])
  })

  it('respeita o limite da Home', () => {
    const videos = Array.from({ length: 8 }, (_, index) =>
      video({
        id: `v${index}`,
        title: `Vídeo ${index}`,
        scheduledDate: `2026-09-${String(17 + index).padStart(2, '0')}`,
      }),
    )
    expect(pickUpcomingChannelVideos(videos, '2026-09-17', 5)).toHaveLength(5)
  })

  it('ignora vídeos publicados mesmo com data futura', () => {
    const picked = pickUpcomingChannelVideos(
      [
        video({ id: 'live', title: 'Na agenda', scheduledDate: '2026-09-18' }),
        video({
          id: 'done',
          title: 'Já no ar',
          scheduledDate: '2026-09-18',
          status: 'publicado',
        }),
      ],
      '2026-09-17',
      5,
    )
    expect(picked.map((item) => item.id)).toEqual(['live'])
  })

  it('abre o registro do vídeo no calendário do canal', () => {
    expect(channelVideoPath('abc', 'xyz')).toBe('/canais/abc/videos/xyz')
    expect(channelVideoPath('abc', 'xyz', { tab: 'publicados' })).toBe(
      '/canais/abc/videos/xyz?aba=publicados',
    )
    expect(channelCalendarPath('abc', 'publicados')).toBe('/canais/abc?aba=publicados')
    expect(channelPublishedPath()).toBe('/canais/publicados')
  })

  it('ordena publicados da data mais recente para a mais antiga', () => {
    const sorted = sortPublishedChannelVideos([
      video({ id: 'a', title: 'A', scheduledDate: '2026-09-10', status: 'publicado' }),
      video({ id: 'b', title: 'B', scheduledDate: '2026-09-21', status: 'publicado' }),
      video({ id: 'c', title: 'C', scheduledDate: '2026-09-18', status: 'publicado' }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('monta o resumo da publicação do projeto de Música', () => {
    expect(
      formatMusicProjectPublicationLine({
        channelName: 'Johann Falk',
        scheduledDate: '2026-09-21',
        now,
      }),
    ).toBe('Johann Falk · 21 set')
  })
})
