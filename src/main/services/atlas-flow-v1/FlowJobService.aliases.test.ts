import { describe, expect, it } from 'vitest'
import {
  extractBracketAliases,
  resolveBracketAliases,
} from './FlowJobService'

describe('atlas-flow-v1 alias resolution', () => {
  it('extrai só aliases entre colchetes', () => {
    expect(extractBracketAliases('[cantor] no [cenario] com @banda')).toEqual([
      'cantor',
      'cenario',
    ])
  })

  it('resolve aliases únicos para referenceIds', () => {
    const result = resolveBracketAliases('[cantor] no [cenario]', [
      { referenceId: 'r1', versionId: 'v1', alias: 'cantor' },
      { referenceId: 'r2', versionId: 'v2', alias: 'cenario' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.referenceIds).toEqual(['r1', 'r2'])
    expect(result.resolved.map((r) => r.alias)).toEqual(['cantor', 'cenario'])
  })

  it('mantém a referência conhecida quando outro colchete não tem imagem', () => {
    const result = resolveBracketAliases('[cantor] [identidade] [microfone] [banda]', [
      { referenceId: 'r1', versionId: 'v1', alias: 'cantor' },
      { referenceId: 'r2', versionId: 'v2', alias: 'banda' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.referenceIds).toEqual(['r1', 'r2'])
    expect(result.aliases).toEqual(['cantor', 'banda'])
  })

  it('bloqueia alias ambíguo', () => {
    const result = resolveBracketAliases('cena com [cantor]', [
      { referenceId: 'r1', versionId: 'v1', alias: 'cantor' },
      { referenceId: 'r2', versionId: 'v2', alias: 'cantor' },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('ALIAS_AMBIGUOUS')
    expect(result.ambiguous).toEqual(['cantor'])
  })

  it('sem colchetes não exige aliases', () => {
    const result = resolveBracketAliases('retrato em luz de janela', [
      { referenceId: 'r1', versionId: 'v1', alias: 'cantor' },
    ])
    expect(result).toEqual({ ok: true, aliases: [], referenceIds: [], resolved: [] })
  })
})
