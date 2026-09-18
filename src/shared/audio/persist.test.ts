import { describe, expect, it } from 'vitest'
import { parseMusicCutsJson, serializeMusicCutsJson } from './persist'

describe('persistência de cortes', () => {
  it('lê JSON legado em array e o documento novo', () => {
    const legacy = parseMusicCutsJson(JSON.stringify([{ id: 'a', start: 0, end: 4, label: 'Intro', source: 'manual' }]))
    expect(legacy.cuts).toHaveLength(1)
    const wrapped = serializeMusicCutsJson({
      cuts: legacy.cuts,
      selectedId: 'a',
      appliedPreset: 'gancho15',
    })
    const parsed = parseMusicCutsJson(wrapped)
    expect(parsed.selectedId).toBe('a')
    expect(parsed.appliedPreset).toBe('gancho15')
    expect(parsed.cuts[0].label).toBe('Intro')
  })
})
