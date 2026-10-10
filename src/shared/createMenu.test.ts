import { describe, expect, it } from 'vitest'
import { createMenuAreaFromPath, createMenuOrder } from './createMenu'

describe('createMenu', () => {
  it('detecta área musical pela rota', () => {
    expect(createMenuAreaFromPath('/musica')).toBe('music')
    expect(createMenuAreaFromPath('/musica/prompts')).toBe('music')
    expect(createMenuAreaFromPath('/')).toBe('home')
  })

  it('prioriza música no menu', () => {
    expect(createMenuOrder('home')[0]).toBe('music')
    expect(createMenuOrder('music')[0]).toBe('music')
  })
})
