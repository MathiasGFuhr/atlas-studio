import { describe, expect, it } from 'vitest'
import { DEFAULT_COMFY_CONFIG } from './comfy'
import { buildLipsyncControlledTestPlan } from './lipsyncControlledTest'
import type { RunpodPodSummary } from './runpod'

function pod(overrides: Partial<RunpodPodSummary> = {}): RunpodPodSummary {
  return {
    id: 'podltx12345',
    name: 'ComfyUI LTX',
    status: 'EXITED',
    gpuType: 'NVIDIA GeForce RTX 4090',
    gpuMemoryGb: 24,
    dataCenterId: 'EU-RO-1',
    ports: ['8188/http'],
    costPerHr: 0.44,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: 'https://podltx12345-8188.proxy.runpod.net',
    actions: ['start'],
    locked: false,
    image: 'ltx',
    networkMounts: [],
    ...overrides,
  }
}

describe('buildLipsyncControlledTestPlan', () => {
  it('bloqueia quando dry-run ainda está ligado', () => {
    const plan = buildLipsyncControlledTestPlan({
      config: {
        ...DEFAULT_COMFY_CONFIG,
        hasRunpodApiKey: true,
        runpodDryRunStarts: true,
        workflowMapping: {
          imageNode: '1',
          audioNode: '2',
          promptNode: '3',
          promptField: 'text',
          durationNode: '4',
          saveNode: '5',
          seedNodes: [],
          enhanceNode: null,
        },
        workflowName: 'ltx.json',
      },
      preferredPod: pod(),
      volumeDataCenterId: 'EU-RO-1',
      modelsPersistentlyVerified: true,
      scene: {
        refId: 'r1',
        label: 'Cena 1',
        number: '01',
        imagePath: 'C:/a/1.png',
        audioPath: 'C:/a/1.mp3',
        prompt: 'teste curto',
        outputDir: 'C:/a/lipsync',
      },
    })
    expect(plan.readyToAuthorizeStart).toBe(false)
    expect(plan.autoShutdownImplemented).toBe(false)
    expect(plan.blockers.some((line) => /dry-run/i.test(line))).toBe(true)
  })

  it('libera autorização quando checklist real está completo', () => {
    const plan = buildLipsyncControlledTestPlan({
      config: {
        ...DEFAULT_COMFY_CONFIG,
        hasRunpodApiKey: true,
        runpodDryRunStarts: false,
        workflowMapping: {
          imageNode: '1',
          audioNode: '2',
          promptNode: '3',
          promptField: 'text',
          durationNode: '4',
          saveNode: '5',
          seedNodes: [],
          enhanceNode: null,
        },
        workflowName: 'ltx.json',
      },
      preferredPod: pod(),
      volumeDataCenterId: 'EU-RO-1',
      modelsPersistentlyVerified: true,
      scene: {
        refId: 'r1',
        label: 'Cena 1',
        number: '01',
        imagePath: 'C:/a/1.png',
        audioPath: 'C:/a/1.mp3',
        prompt: 'teste curto',
        outputDir: 'C:/a/lipsync',
      },
    })
    expect(plan.readyToAuthorizeStart).toBe(true)
    expect(plan.message).toMatch(/não será disparada automaticamente/i)
    expect(plan.authorizationSteps.length).toBeGreaterThan(3)
  })
})
