import { describe, expect, it } from 'vitest'
import { analyzeLtxWorkflow } from './ltxWorkflowAnalysis'

describe('analyzeLtxWorkflow', () => {
  it('não inventa workflow a partir de stubs quando o input é vazio', () => {
    const analysis = analyzeLtxWorkflow(null)
    expect(analysis.source).toBe('empty')
    expect(analysis.nodeCount).toBe(0)
    expect(analysis.officialModelsMissingInWorkflow).toHaveLength(5)
  })

  it('extrai modelos e marcador LTX do JSON API realista', () => {
    const analysis = analyzeLtxWorkflow({
      '269': { class_type: 'LoadImage', inputs: { image: 'face.png' } },
      '276': { class_type: 'LoadAudio', inputs: { audio: 'line.mp3' } },
      '340:317': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'ltx-2.3-22b-dev-fp8.safetensors' },
      },
      '340:293': {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          lora_name: 'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
        },
      },
      '340:345': {
        class_type: 'LoraLoader',
        inputs: { lora_name: 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors' },
      },
      '340:318': {
        class_type: 'LTXAVTextEncoderLoader',
        inputs: {
          text_encoder: 'gemma_3_12B_it_fp4_mixed.safetensors',
          ckpt_name: 'ltx-2.3-22b-dev-fp8.safetensors',
        },
      },
      '340:313': {
        class_type: 'LatentUpscaleModelLoader',
        inputs: { model_name: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors' },
      },
      '340:319': {
        class_type: 'TextGenerateLTX2Prompt',
        inputs: { value: 'prompt' },
      },
    })

    expect(analysis.source).toBe('sqlite_import')
    expect(analysis.hasLtxMarker).toBe(true)
    expect(analysis.officialModelsMatched).toHaveLength(5)
    expect(analysis.extraModelFiles).toEqual([])
    expect(analysis.sampleMedia).toHaveLength(2)
    expect(analysis.nativeLtxClassTypes.length).toBeGreaterThan(0)
  })
})
