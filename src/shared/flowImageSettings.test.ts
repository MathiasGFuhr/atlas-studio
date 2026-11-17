import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FLOW_IMAGE_SETTINGS,
  flowImageCreditsLabel,
  normalizeFlowImageSettings,
  readStoredFlowImageSettings,
  reasoningDetail,
} from './flowImageSettings'

describe('flowImageSettings', () => {
  it('normaliza seleção válida e descarta vídeo ou modelo desconhecido', () => {
    expect(
      normalizeFlowImageSettings({
        mode: 'video',
        aspectRatio: '9:16',
        modelKey: 'veo',
        reasoning: 'low',
        outputs: 1,
      }),
    ).toEqual({
      mode: 'image',
      aspectRatio: '9:16',
      modelKey: 'nano-banana-2.1',
      modelLabel: 'Nano Banana 2.1',
      reasoning: 'low',
      outputs: 1,
    })
  })

  it('cai no padrão quando o valor é inválido', () => {
    expect(normalizeFlowImageSettings({ aspectRatio: '21:9', outputs: 8, reasoning: 'max' })).toEqual(
      DEFAULT_FLOW_IMAGE_SETTINGS,
    )
    expect(readStoredFlowImageSettings('não-json')).toEqual(DEFAULT_FLOW_IMAGE_SETTINGS)
    expect(reasoningDetail('high')).toBe('Muito detalhado')
    expect(flowImageCreditsLabel('nano-banana-2.1')).toBe('A geração vai usar 0 créditos')
    expect(flowImageCreditsLabel('nano-banana-pro')).toBeNull()
  })

  it('aceita os três modelos de imagem do Flow', () => {
    expect(normalizeFlowImageSettings({ modelKey: 'nano-banana-pro' }).modelLabel).toBe(
      'Nano Banana Pro',
    )
    expect(normalizeFlowImageSettings({ modelKey: 'nano-banana-2-lite' }).modelLabel).toBe(
      'Nano Banana 2 Lite',
    )
    expect(normalizeFlowImageSettings({ modelLabel: 'Nano Banana 2.1' }).modelKey).toBe(
      'nano-banana-2.1',
    )
  })
})
