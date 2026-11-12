import { describe, expect, it } from 'vitest'
import { DEFAULT_COMFY_CONFIG } from './comfy'
import { buildGpuRecoveryValidationPlan } from './gpuRecoveryValidation'
import { buildComfyAutoShutdownPlan } from './comfyAutoShutdown'
import type { RunpodPodSummary } from './runpod'

function pod(overrides: Partial<RunpodPodSummary> = {}): RunpodPodSummary {
  return {
    id: 'fjax6sfs2l8wg8',
    name: 'LTX',
    status: 'EXITED',
    gpuType: 'NVIDIA GeForce RTX 4090',
    gpuMemoryGb: 24,
    dataCenterId: 'EU-RO-1',
    ports: ['8188/http'],
    costPerHr: 0.44,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: 'https://fjax6sfs2l8wg8-8188.proxy.runpod.net',
    actions: [],
    locked: false,
    image: 'runpod/comfyui-ltx:2.3',
    networkMounts: [{ volumeId: 'tjp7a4uk0y', path: '/runpod-volume' }],
    ...overrides,
  }
}

describe('buildGpuRecoveryValidationPlan', () => {
  it('bloqueia autorização paga enquanto dry-run/orçamento/modelos faltam', () => {
    const plan = buildGpuRecoveryValidationPlan({
      config: { ...DEFAULT_COMFY_CONFIG, hasRunpodApiKey: true, runpodDryRunStarts: true },
      preferredPod: pod(),
      volumeId: 'tjp7a4uk0y',
      volumeDc: 'EU-RO-1',
      volumeSizeGb: 70,
      maxUsdPerHour: null,
      modelsPersistentlyVerified: false,
      workflowName: null,
      hasWorkflowMapping: false,
      dockerImage: 'runpod/comfyui-ltx:2.3',
      templatePinned: true,
      gpuUnavailableDetected: true,
      unavailableDetail: 'start não permitido',
      availableGpusInDc: [{ gpuId: 'NVIDIA GeForce RTX 4090', availability: 'High', priceUsd: 0.44 }],
      recovery: null,
      scene: {
        refId: null,
        number: null,
        hasImage: false,
        hasAudio: false,
        hasPrompt: false,
        outputDir: null,
      },
    })
    expect(plan.readyToAuthorizePaidRecovery).toBe(false)
    expect(plan.batchProductionAllowed).toBe(false)
    expect(plan.autoShutdownImplemented).toBe(false)
    expect(plan.continuousBillingRisks.length).toBeGreaterThan(0)
  })

  it('libera autorização quando checklist completo', () => {
    const plan = buildGpuRecoveryValidationPlan({
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
      preferredPod: pod({ actions: [] }),
      volumeId: 'tjp7a4uk0y',
      volumeDc: 'EU-RO-1',
      volumeSizeGb: 70,
      maxUsdPerHour: 1.2,
      modelsPersistentlyVerified: true,
      workflowName: 'ltx.json',
      hasWorkflowMapping: true,
      dockerImage: 'runpod/comfyui-ltx:2.3',
      templatePinned: true,
      gpuUnavailableDetected: true,
      unavailableDetail: 'GPU do host ocupada',
      availableGpusInDc: [{ gpuId: 'NVIDIA GeForce RTX 4090', availability: 'High', priceUsd: 0.44 }],
      recovery: {
        consoleMigrateAvailableViaOfficialRest: false,
        consoleMigrateNote: 'note',
        originalPod: pod(),
        volumeDataCenterId: 'EU-RO-1',
        networkVolumeId: 'tjp7a4uk0y',
        options: [
          {
            id: 'create:NVIDIA GeForce RTX 4090',
            kind: 'create_pod_with_network_volume',
            label: 'Novo Pod',
            gpuId: 'NVIDIA GeForce RTX 4090',
            dataCenterId: 'EU-RO-1',
            estimatedCostPerHr: 0.44,
            existingPodId: null,
            networkVolumeId: 'tjp7a4uk0y',
            mountPath: '/runpod-volume',
            image: 'runpod/comfyui-ltx:2.3',
            fitsBudget: true,
            preservesModelsOnVolume: true,
            willStopOriginalIfRunning: false,
            reasons: [],
          },
        ],
        recommendedOptionId: 'create:NVIDIA GeForce RTX 4090',
        message: 'ok',
        originalCurrentlyBilling: false,
      },
      scene: {
        refId: 'scene1',
        number: '01',
        hasImage: true,
        hasAudio: true,
        hasPrompt: true,
        outputDir: 'D:/proj/lipsync',
      },
    })
    expect(plan.readyToAuthorizePaidRecovery).toBe(true)
    expect(plan.recommendedAction).toBe('create_pod_with_network_volume')
    expect(plan.message).toMatch(/Nenhuma operação paga/)
  })
})

describe('buildComfyAutoShutdownPlan', () => {
  it('planeja STOP sem terminate e espera downloads', () => {
    const plan = buildComfyAutoShutdownPlan()
    expect(plan.implemented).toBe(false)
    expect(plan.stopAction).toBe('stop')
    expect(plan.neverActions).toContain('terminate')
    expect(plan.waitForDownloads).toBe(true)
  })
})
