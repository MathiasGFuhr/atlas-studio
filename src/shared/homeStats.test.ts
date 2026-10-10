import { describe, expect, it } from 'vitest'
import { buildHomeModuleStats } from './homeStats'
import type { ChannelVideo, Project } from './types'
import type { MusicTrack } from './musicAnalysis'

function project(id: string): Project {
  return {
    id,
    name: id,
    description: '',
    projectType: 'music',
    channelId: null,
    projectFolderPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function track(id: string, projectId: string | null): MusicTrack {
  return {
    id,
    projectId,
    name: id,
    filePath: `${id}.mp3`,
    duration: 120,
    sampleRate: 44100,
    channels: 2,
    waveform: [],
    analysis: null,
    cuts: [],
    exportFolder: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as MusicTrack
}

function video(
  id: string,
  opts: { channelType?: ChannelVideo['channelType']; projectId?: string | null } = {},
): ChannelVideo {
  return {
    id,
    channelId: 'c1',
    title: id,
    description: '',
    thumbnailPath: '',
    scheduledDate: '2026-06-01',
    status: 'agendando',
    scriptId: null,
    projectId: opts.projectId ?? null,
    projectFolderPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    channelType: opts.channelType ?? 'music',
  }
}

describe('buildHomeModuleStats', () => {
  it('conta agendados de Música e faixas vinculadas', () => {
    const stats = buildHomeModuleStats({
      projects: [project('p1'), project('p2')],
      tracks: [track('t1', 'p1'), track('t2', null), track('t3', 'p2')],
      upcomingVideos: [
        video('v1', { channelType: 'music', projectId: 'p1' }),
        video('v2', { channelType: 'history' }),
        video('v3', { channelType: 'history', projectId: 'p2' }),
      ],
    })
    expect(stats.scheduledCount).toBe(2)
    expect(stats.trackCount).toBe(2)
    expect(stats.tracks.map((item) => item.id)).toEqual(['t1', 't3'])
  })
})
