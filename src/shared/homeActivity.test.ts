import { describe, expect, it } from 'vitest'
import { buildHomeActivity } from './homeActivity'
import type { AtlasTask, Channel, Project } from './types'
import type { MusicTrack } from './musicAnalysis'

function project(id: string, updatedAt: string): Project {
  return {
    id,
    name: id,
    description: '',
    projectType: 'music',
    channelId: null,
    projectFolderPath: null,
    createdAt: updatedAt,
    updatedAt,
  }
}

function channel(id: string, updatedAt: string): Channel {
  return {
    id,
    name: id,
    description: '',
    avatarPath: '',
    nicheId: null,
    youtubeUrl: '',
    color: '#fff',
    channelType: 'music',
    active: true,
    folderPath: null,
    createdAt: updatedAt,
    updatedAt,
  }
}

function task(id: string, completedAt: string): AtlasTask {
  return {
    id,
    title: id,
    description: '',
    status: 'completed',
    priority: 'normal',
    category: 'music',
    dueDate: null,
    relatedType: null,
    relatedId: null,
    completedAt,
    createdAt: completedAt,
    updatedAt: completedAt,
  }
}

function track(id: string, updatedAt: string): MusicTrack {
  return {
    id,
    projectId: 'p1',
    name: id,
    filePath: `${id}.mp3`,
    duration: 10,
    sampleRate: 44100,
    channels: 2,
    waveform: [],
    analysis: null,
    cuts: [],
    exportFolder: null,
    createdAt: updatedAt,
    updatedAt,
  } as unknown as MusicTrack
}

describe('buildHomeActivity', () => {
  it('monta atividade só de música', () => {
    const items = buildHomeActivity({
      projects: [project('p1', '2026-01-03T00:00:00.000Z')],
      tasks: [task('t1', '2026-01-02T00:00:00.000Z')],
      channels: [channel('c1', '2026-01-01T00:00:00.000Z')],
      tracks: [track('m1', '2026-01-04T00:00:00.000Z')],
    })
    expect(items[0]?.kind).toBe('music-updated')
    expect(items.some((item) => item.kind === 'project-created')).toBe(true)
  })
})
