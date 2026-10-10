import { describe, expect, it } from 'vitest'
import { buildHomeModuleStats } from './homeStats'
import type { Project } from './types'
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

describe('buildHomeModuleStats', () => {
  it('conta projetos e faixas vinculadas', () => {
    const stats = buildHomeModuleStats({
      projects: [project('p1'), project('p2')],
      tracks: [track('t1', 'p1'), track('t2', null), track('t3', 'p2')],
    })
    expect(stats.musicCount).toBe(2)
    expect(stats.trackCount).toBe(2)
    expect(stats.tracks.map((item) => item.id)).toEqual(['t1', 't3'])
  })
})
