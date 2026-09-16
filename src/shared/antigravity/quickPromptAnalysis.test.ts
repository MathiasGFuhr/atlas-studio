import { describe, expect, it } from 'vitest'
import { normalizeQuickPromptAnalysis, qualityLabelForScore } from './quickPromptAnalysis'

describe('qualityLabelForScore', () => {
  it('usa as faixas pedidas', () => {
    expect(qualityLabelForScore(95)).toBe('Excelente')
    expect(qualityLabelForScore(80)).toBe('Bom')
    expect(qualityLabelForScore(61)).toBe('Precisa ajustes')
    expect(qualityLabelForScore(40)).toBe('Problemático')
  })
})

describe('normalizeQuickPromptAnalysis', () => {
  it('preenche campos e preserva o prompt original quando a correção vem vazia', () => {
    const analysis = normalizeQuickPromptAnalysis(
      {
        score: 87,
        verdict: 'Bom',
        okItems: [{ title: 'Preservação da referência' }, 'Câmera profissional'],
        issues: [
          {
            category: 'coherence',
            severity: 'warning',
            title: 'Contexto incompatível',
            detail: 'Plateia está configurada como "No palco".',
          },
          { category: 'nonsense', title: '', detail: '' },
        ],
        correctedPrompt: '',
        cleanedPrompt: '',
      },
      'original prompt',
    )

    expect(analysis.score).toBe(87)
    expect(analysis.okItems).toEqual([
      { title: 'Preservação da referência' },
      { title: 'Câmera profissional' },
    ])
    expect(analysis.issues).toHaveLength(1)
    expect(analysis.issues[0]?.category).toBe('coherence')
    expect(analysis.correctedPrompt).toBe('original prompt')
    expect(analysis.cleanedPrompt).toBe('original prompt')
  })
})
