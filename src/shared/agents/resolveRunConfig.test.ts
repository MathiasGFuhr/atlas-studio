import { describe, expect, it } from 'vitest'
import { isConfiguredModelMissing, resolveRunConfig } from './resolveRunConfig'

describe('resolveRunConfig', () => {
  it('Chat usa o default quando a conversa não tem override', () => {
    expect(
      resolveRunConfig({
        overrideModel: null,
        overrideEffort: null,
        defaultModel: 'cli-default',
        defaultEffort: 'high',
      }),
    ).toEqual({
      model: 'cli-default',
      effort: 'high',
      usedModelOverride: false,
      usedEffortOverride: false,
    })
  })

  it('Chat usa override da conversa', () => {
    expect(
      resolveRunConfig({
        overrideModel: 'chat-model',
        overrideEffort: 'low',
        defaultModel: 'cli-default',
        defaultEffort: 'high',
      }),
    ).toEqual({
      model: 'chat-model',
      effort: 'low',
      usedModelOverride: true,
      usedEffortOverride: true,
    })
  })

  it('trata string vazia como ausência de override', () => {
    expect(
      resolveRunConfig({
        overrideModel: '  ',
        overrideEffort: '',
        defaultModel: 'cli-default',
        defaultEffort: 'medium',
      }),
    ).toMatchObject({
      model: 'cli-default',
      effort: 'medium',
      usedModelOverride: false,
      usedEffortOverride: false,
    })
  })
})

describe('isConfiguredModelMissing', () => {
  it('não marca ausência quando não há modelo salvo', () => {
    expect(isConfiguredModelMissing(null, [{ id: 'a' }])).toBe(false)
  })

  it('marca modelo removido do catálogo', () => {
    expect(isConfiguredModelMissing('gone', [{ id: 'a' }])).toBe(true)
    expect(isConfiguredModelMissing('a', [{ id: 'a' }])).toBe(false)
  })
})
