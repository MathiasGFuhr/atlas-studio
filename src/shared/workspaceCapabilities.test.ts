import { describe, expect, it } from 'vitest'
import {
  detectContentAreaPresence,
  enabledContentAreas,
  filterCreateMenuItems,
  isContentAreaEnabled,
  resolveWorkspaceCapabilities,
  taskRelatedTypeOptions,
} from './workspaceCapabilities'

describe('workspaceCapabilities', () => {
  it('detecta presença musical', () => {
    expect(detectContentAreaPresence({ projectTypes: ['music'], channelTypes: [] })).toEqual({
      musicPresent: true,
    })
  })

  it('sempre habilita música', () => {
    const caps = resolveWorkspaceCapabilities({ musicPresent: false })
    expect(caps.musicEnabled).toBe(true)
    expect(enabledContentAreas(caps)).toEqual(['music'])
    expect(isContentAreaEnabled(caps, 'music')).toBe(true)
  })

  it('filtra menu de criação', () => {
    expect(filterCreateMenuItems(['music', 'channel', 'task'], { musicEnabled: true })).toEqual([
      'music',
      'channel',
      'task',
    ])
  })

  it('opções de tarefa sem história', () => {
    const options = taskRelatedTypeOptions({ musicEnabled: true })
    expect(options.map((item) => item.value)).toEqual(['', 'music', 'channel'])
  })
})
