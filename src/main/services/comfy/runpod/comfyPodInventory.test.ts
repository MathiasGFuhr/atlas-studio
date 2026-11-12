import { describe, expect, it } from 'vitest'
import { inspectComfyPodReadOnly } from './comfyPodInventory'

describe('inspectComfyPodReadOnly', () => {
  it('lista pendências quando a URL está vazia', async () => {
    const result = await inspectComfyPodReadOnly('', null)
    expect(result.dryRun).toBe(true)
    expect(result.accessible).toBe(false)
    expect(result.pendingChecks.length).toBeGreaterThan(0)
  })

  it('inventaria system_stats e modelos sem mutação', async () => {
    const calls: string[] = []
    const result = await inspectComfyPodReadOnly(
      'https://comfy.example',
      {
        a: { class_type: 'TextGenerateLTX2Prompt', inputs: {} },
        b: {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'ltx-2.3-22b-dev-fp8.safetensors' },
        },
      },
      {
        createClient: () => ({
          async systemStatsRaw() {
            calls.push('system_stats')
            return {
              system: {
                comfyui_version: '0.3.50',
                pytorch_version: '2.7.0',
                python_version: '3.12.0',
                os: 'linux',
              },
              devices: [{ name: 'cuda:0 NVIDIA GeForce RTX 4090', vram_total: 24 * 1024 ** 3 }],
            }
          },
          async listObjectInfoClassTypes() {
            calls.push('object_info')
            return ['TextGenerateLTX2Prompt', 'CheckpointLoaderSimple', 'LoadImage', 'LoadAudio', 'SaveVideo']
          },
          async listModelFolders() {
            calls.push('models')
            return ['checkpoints', 'loras', 'text_encoders', 'latent_upscale_models']
          },
          async listModels(folder: string) {
            calls.push(`models/${folder}`)
            if (folder === 'checkpoints') return ['ltx-2.3-22b-dev-fp8.safetensors']
            return []
          },
        }),
      },
    )

    expect(result.accessible).toBe(true)
    expect(result.mutationCalls).toBe(0)
    expect(result.system.comfyuiVersion).toBe('0.3.50')
    expect(result.system.pytorchVersion).toBe('2.7.0')
    expect(result.classTypes.hasLtxMarker).toBe(true)
    expect(result.models.find((row) => row.expectedFileName.includes('ltx-2.3-22b'))?.present).toBe(true)
    expect(calls.every((route) => !/prompt|upload|interrupt/i.test(route))).toBe(true)
  })
})
