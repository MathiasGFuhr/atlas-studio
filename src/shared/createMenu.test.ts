import { describe, expect, it } from 'vitest'
import { createMenuAreaFromPath, createMenuOrder } from './createMenu'

describe('createMenuOrder', () => {
  it('usa ordem padrão na home e demais áreas', () => {
    expect(createMenuOrder('home')).toEqual(['history', 'music', 'channel', 'task'])
    expect(createMenuAreaFromPath('/')).toBe('home')
    expect(createMenuAreaFromPath('/tarefas')).toBe('home')
    expect(createMenuAreaFromPath('/canais/abc')).toBe('home')
  })

  it('prioriza música sem esconder opções', () => {
    expect(createMenuOrder('music')).toEqual(['music', 'task', 'channel', 'history'])
    expect(createMenuAreaFromPath('/musica')).toBe('music')
    expect(createMenuAreaFromPath('/musica/projetos/1')).toBe('music')
  })

  it('prioriza história sem esconder opções', () => {
    expect(createMenuOrder('history')).toEqual(['history', 'task', 'channel', 'music'])
    expect(createMenuAreaFromPath('/historia/criar')).toBe('history')
  })
})
