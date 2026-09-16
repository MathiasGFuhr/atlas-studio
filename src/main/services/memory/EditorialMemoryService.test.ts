import { describe, expect, it } from 'vitest'
import {
  buildCompactEditorialContext,
  buildMemoryContext,
} from './EditorialMemoryService'

describe('EditorialMemoryService', () => {
  it('buildMemoryContext lida com lista vazia', () => {
    expect(buildMemoryContext([])).toContain('Nenhum roteiro')
  })

  it('buildCompactEditorialContext não quebra sem pasta', () => {
    const ctx = buildCompactEditorialContext({
      scriptsPath: '',
      nicheId: 'n1',
      nicheName: 'Teste',
      topic: 'Roma',
    })
    expect(ctx).toContain('DO_NOT_REPEAT')
    expect(ctx).toContain('Memória editorial')
  })
})
