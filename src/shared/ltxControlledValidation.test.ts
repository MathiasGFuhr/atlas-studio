import { describe, expect, it } from 'vitest'
import { buildLtxControlledValidationPlan, DEFAULT_LTX_GPU_PRIORITIES } from './ltxControlledValidation'
import { normalizeLtxEnvironmentPlan } from './ltxEnvironment'

describe('buildLtxControlledValidationPlan', () => {
  it('mantém dry-run, não avança Fase 5 e bloqueia LipSync até aprovação', () => {
    const report = buildLtxControlledValidationPlan({
      plan: normalizeLtxEnvironmentPlan({
        primaryGpuId: DEFAULT_LTX_GPU_PRIORITIES[0],
        alternateGpuIds: [DEFAULT_LTX_GPU_PRIORITIES[1], null],
        maxUsdPerHour: 1,
        preferredCloud: 'SECURE',
        storageStrategy: 'network_volume',
        networkVolumeSizeGb: 50,
      }),
      pods: [
        {
          id: 'pod-run',
          name: 'Comfy LTX',
          status: 'RUNNING',
          gpuType: DEFAULT_LTX_GPU_PRIORITIES[0],
          gpuMemoryGb: 32,
          dataCenterId: 'US-KS-2',
          ports: ['8188/http'],
          costPerHr: 0.72,
          cloud: 'SECURE',
          hasComfyPort: true,
          comfyProxyUrl: 'https://example',
          actions: ['stop'],
          locked: false,
          image: 'comfy',
          networkMounts: [],
        },
      ],
      catalog: [
        {
          id: DEFAULT_LTX_GPU_PRIORITIES[0],
          name: 'PRO 4500',
          memoryGb: 32,
          securePrice: 0.72,
          communityPrice: 0.5,
          availability: 'LOW',
        },
        {
          id: DEFAULT_LTX_GPU_PRIORITIES[1],
          name: 'PRO 4500 SE',
          memoryGb: 32,
          securePrice: 0.72,
          communityPrice: 0.5,
          availability: 'LOW',
        },
      ],
      networkVolumes: [],
      dataCenters: [
        {
          id: 'US-KS-2',
          region: 'NORTH_AMERICA',
          networkVolumeTypes: [],
          gpuAvailability: [{ id: DEFAULT_LTX_GPU_PRIORITIES[0], availability: 'LOW' }],
        },
        {
          id: 'EU-RO-1',
          region: 'EUROPE',
          networkVolumeTypes: ['STANDARD'],
          gpuAvailability: [{ id: DEFAULT_LTX_GPU_PRIORITIES[0], availability: 'LOW' }],
        },
      ],
      modelInventory: {
        models: [
          {
            role: 'checkpoint',
            fileName: 'ltx-2.3-22b-dev-fp8.safetensors',
            folder: 'checkpoints',
            absolutePath: '/workspace/models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors',
            sizeBytes: 29145431166,
            sizeGib: 27.144,
            versionHint: 'FP8',
            present: true,
            sha256: null,
            sha256Status: 'pending_readonly_shell',
            sha256Command: 'sha256sum -b "x"',
          },
        ],
        totalBytes: 29145431166,
        totalGib: 27.144,
        recommendedNetworkVolumeGb: 50,
      },
      runtime: {
        comfyuiVersion: '0.30.0',
        pytorchVersion: '2.10.0+cu130',
        pythonVersion: '3.12.3',
        gpuName: 'NVIDIA RTX PRO 4500',
        vramTotalGb: 31.4,
      },
      preferredPodId: 'pod-run',
      workflowName: 'video_ltx2_3_ia2v.json',
      currentComfyBaseUrl: 'https://example',
    })

    expect(report.dryRun).toBe(true)
    expect(report.mutationCalls).toBe(0)
    expect(report.advancedToPhase5).toBe(false)
    expect(report.lipsyncTest.enabled).toBe(false)
    expect(report.lipsyncTest.requiresExplicitApproval).toBe(true)
    expect(report.dataCenters.currentPodSupportsNetworkVolume).toBe(false)
    expect(report.gpuPriorities).toHaveLength(2)
    expect(report.gpuPriorities.every((row) => /PRO 4500/i.test(row.gpuId))).toBe(true)
    expect(report.costEstimate.scenarios[0]?.requiresNewPaidResources).toBe(false)
    expect(report.approvalPrompt).toMatch(/AUTORIZO teste LipSync/)
  })
})
