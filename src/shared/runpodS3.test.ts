import { describe, expect, it } from 'vitest'
import {
  matchLtxModelsInS3Objects,
  runpodS3EndpointForDataCenter,
  sizeMatchesExpected,
} from './runpodS3'

describe('runpodS3 helpers', () => {
  it('resolve endpoint EU-RO-1', () => {
    expect(runpodS3EndpointForDataCenter('EU-RO-1')).toBe('https://s3api-eu-ro-1.runpod.io')
  })

  it('encontra modelos em caminhos aninhados e compara tamanho', () => {
    const result = matchLtxModelsInS3Objects([
      {
        key: 'runpod-slim/ComfyUI/models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors',
        sizeBytes: 29_145_431_166,
      },
      {
        key: 'models/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
        sizeBytes: 2_741_024_390,
      },
      {
        key: 'deep/gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
        sizeBytes: 628_203_616,
      },
      {
        key: 'models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
        sizeBytes: 9_447_702_218,
      },
      {
        key: 'models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        sizeBytes: 995_743_560,
      },
    ])
    expect(result.present).toBe(5)
    expect(result.models.every((model) => model.present)).toBe(true)
    expect(result.models.every((model) => model.sizeMatchesExpected === true)).toBe(true)
    expect(result.models.find((m) => m.fileName.startsWith('gemma-3'))?.nestedPath).toBe(true)
  })

  it('volume vazio = incompleto, não inventa presença', () => {
    const result = matchLtxModelsInS3Objects([])
    expect(result.present).toBe(0)
    expect(result.models.every((model) => !model.present)).toBe(true)
  })

  it('sizeMatchesExpected tolera 2%', () => {
    expect(sizeMatchesExpected(100, 100)).toBe(true)
    expect(sizeMatchesExpected(101, 100)).toBe(true)
    expect(sizeMatchesExpected(110, 100)).toBe(false)
    expect(sizeMatchesExpected(null, 100)).toBeNull()
  })
})
