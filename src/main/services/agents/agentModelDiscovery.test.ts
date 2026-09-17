import { describe, expect, it } from 'vitest'
import { parseAgyModelsOutput } from './parseAgyModels'
import { parseCodexCatalog, parseCodexCatalogText, parseOfficialFallback } from './parseCodexModels'
import { parseReasoningEffortsFromHelp } from './parseReasoningEfforts'

describe('lista de modelos Codex', () => {
  it('lê o catálogo JSON do runtime sem nomes fixos', () => {
    const models = parseCodexCatalog({
      models: [
        {
          slug: 'runtime-alpha',
          display_name: 'Runtime Alpha',
          supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
        },
        { slug: 'runtime-beta', visibility: 'hidden' },
      ],
    })
    expect(models.map((model) => model.id)).toEqual(['runtime-alpha'])
    expect(models[0]?.reasoningEfforts?.map((item) => item.id)).toEqual(['low', 'high'])
  })

  it('inclui o modelo configurado mesmo se estiver oculto', () => {
    const models = parseCodexCatalog(
      { models: [{ slug: 'hidden-one', visibility: 'hidden' }] },
      'hidden-one',
    )
    expect(models).toEqual([expect.objectContaining({ id: 'hidden-one' })])
  })

  it('aceita saída textual do CLI', () => {
    const models = parseCodexCatalogText('runtime-gamma    Gamma Label\n# comment\n')
    expect(models).toEqual([{ id: 'runtime-gamma', label: 'Gamma Label' }])
  })
})

describe('lista de modelos Antigravity', () => {
  it('parseia slugs e rótulos do `agy models`', () => {
    const models = parseAgyModelsOutput(
      [
        'MODEL                         NAME',
        'agy-flash-high                Flash High',
        'agy-pro-medium                Pro Medium',
      ].join('\n'),
    )
    expect(models).toEqual([
      { id: 'agy-flash-high', label: 'Flash High' },
      { id: 'agy-pro-medium', label: 'Pro Medium' },
    ])
  })

  it('parseia JSON quando o CLI oferecer', () => {
    const models = parseAgyModelsOutput(JSON.stringify({ models: [{ id: 'agy-json', name: 'JSON' }] }))
    expect(models[0]).toMatchObject({ id: 'agy-json' })
  })
})

describe('esforço de raciocínio', () => {
  it('extrai valores do help do CLI, sem inventar lista', () => {
    const efforts = parseReasoningEffortsFromHelp(
      'Usage: agy [options]\n  --effort  Reasoning effort: low, medium, or high\n',
    )
    expect(efforts.map((item) => item.id)).toEqual(['low', 'medium', 'high'])
  })

  it('não inventa valores se o help não listar opções', () => {
    expect(parseReasoningEffortsFromHelp('agy -p prompt --output-format json')).toEqual([])
  })
})

describe('fallback oficial', () => {
  it('captura mensagem de fallback do CLI', () => {
    expect(parseOfficialFallback('unknown model, falling back to runtime-default')).toEqual({
      id: 'runtime-default',
      message: 'O CLI sugere runtime-default como alternativa oficial.',
    })
  })
})
