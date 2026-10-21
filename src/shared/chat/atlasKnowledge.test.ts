import { describe, expect, it } from 'vitest'
import { formatWorkspaceBriefing, resolveAtlasScreen, type WorkspaceBriefing } from './atlasKnowledge'

const empty: WorkspaceBriefing = {
  accountName: 'Mathias',
  projects: [],
  channels: [],
  tasks: [],
  tracks: [],
  shorts: [],
  videos: [],
  lipsync: [],
  clocks: [],
  omitted: {},
}

describe('resolveAtlasScreen', () => {
  it('abre a agenda pelo apelido', () => {
    expect(resolveAtlasScreen('calendário').path).toBe('/canais/agenda')
  })

  it('abre shorts', () => {
    expect(resolveAtlasScreen('Shorts').path).toBe('/shorts')
  })

  it('recusa uma tela inventada', () => {
    expect(() => resolveAtlasScreen('financeiro')).toThrow(/Não conheço a tela/)
  })
})

describe('formatWorkspaceBriefing', () => {
  it('mostra o que existe e marca seções vazias', () => {
    const text = formatWorkspaceBriefing({
      ...empty,
      projects: [{ id: 'p1', label: 'Johann Falk' }],
      tasks: [{ id: 't1', label: 'Mixar', detail: '14/10' }],
      clocks: [{ id: 'de', label: 'Alemanha', detail: '14:32' }],
      omitted: { tracks: 2 },
    })
    expect(text).toContain('Conta: Mathias')
    expect(text).toContain('Johann Falk [p1]')
    expect(text).toContain('Mixar (14/10) [t1]')
    expect(text).toContain('Faixas (2): e mais 2.')
    expect(text).toContain('Canais: nenhum.')
    expect(text).toContain('Alemanha 14:32')
  })
})
