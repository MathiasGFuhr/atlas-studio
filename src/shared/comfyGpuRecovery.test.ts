import { describe, expect, it } from 'vitest'
import { buildComfyGpuRecoveryPreview, RUNPOD_CONSOLE_MIGRATE_NOTE } from './comfyGpuRecovery'
import type { LtxRecoveryOption } from './ltxRecovery'
import type { RunpodPodSummary } from './runpod'

function pod(overrides: Partial<RunpodPodSummary> = {}): RunpodPodSummary {
  return {
    id: 'oldpod',
    name: 'LTX',
    status: 'EXITED',
    gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
    gpuMemoryGb: 32,
    dataCenterId: 'EU-RO-1',
    ports: ['8188/http'],
    costPerHr: 0.72,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: 'https://oldpod-8188.proxy.runpod.net',
    actions: ['start'],
    locked: false,
    image: 'runpod/comfyui-ltx:2.3',
    networkMounts: [{ volumeId: 'tjp7a4uk0y', path: '/runpod-volume' }],
    ...overrides,
  }
}

const create4500: LtxRecoveryOption = {
  priority: 1,
  kind: 'propose_new_pod_same_dc',
  gpuId: 'NVIDIA RTX PRO 4500 Blackwell',
  memoryGb: 32,
  priceUsd: 0.72,
  availability: 'LOW',
  dataCenterId: 'EU-RO-1',
  existingPodId: null,
  fitsBudget: true,
  fitsVram: true,
  preservesNetworkVolumeDc: true,
  reasons: ['Proposta'],
  estimatedComputeUsdPerHour: 0.72,
}

describe('buildComfyGpuRecoveryPreview', () => {
  it('documenta que migrate console não está na REST e oferece create+volume 4500 idêntica', () => {
    const preview = buildComfyGpuRecoveryPreview({
      originalPod: pod(),
      volumeDataCenterId: 'EU-RO-1',
      networkVolumeId: 'tjp7a4uk0y',
      mountPath: '/runpod-volume',
      image: 'runpod/comfyui-ltx:2.3',
      maxUsdPerHour: 1,
      recoveryOptions: [create4500],
      availableGpuIdsInVolumeDc: ['NVIDIA RTX PRO 4500 Blackwell'],
    })
    expect(preview.consoleMigrateAvailableViaOfficialRest).toBe(false)
    expect(preview.consoleMigrateNote).toBe(RUNPOD_CONSOLE_MIGRATE_NOTE)
    expect(preview.options[0]?.kind).toBe('create_pod_with_network_volume')
    expect(preview.options[0]?.gpuId).toBe('NVIDIA RTX PRO 4500 Blackwell')
    expect(preview.options[0]?.label).toMatch(/Criar Pod novo/i)
    expect(preview.options[0]?.preservesModelsOnVolume).toBe(true)
    expect(preview.options[0]?.willStopOriginalIfRunning).toBe(false)
  })

  it('mantém PRO 4500 mesmo se o DC só listar L4', () => {
    const preview = buildComfyGpuRecoveryPreview({
      originalPod: pod(),
      volumeDataCenterId: 'EU-RO-1',
      networkVolumeId: 'tjp7a4uk0y',
      mountPath: '/runpod-volume',
      image: 'runpod/comfyui-ltx:2.3',
      maxUsdPerHour: 1,
      recoveryOptions: [
        create4500,
        {
          ...create4500,
          priority: 2,
          gpuId: 'NVIDIA L4',
          priceUsd: 0.59,
          estimatedComputeUsdPerHour: 0.59,
        },
      ],
      availableGpuIdsInVolumeDc: ['NVIDIA L4'],
    })
    expect(preview.options).toHaveLength(1)
    expect(preview.options[0]?.gpuId).toBe('NVIDIA RTX PRO 4500 Blackwell')
    expect(preview.options[0]?.reasons.some((line) => /Pode falhar|vaga agora/i.test(line))).toBe(true)
  })

  it('não oferece Server Edition se o DC do volume só lista a 4500 normal', () => {
    const preview = buildComfyGpuRecoveryPreview({
      originalPod: pod(),
      volumeDataCenterId: 'EU-RO-1',
      networkVolumeId: 'tjp7a4uk0y',
      mountPath: '/runpod-volume',
      image: 'runpod/comfyui-ltx:2.3',
      maxUsdPerHour: 1,
      recoveryOptions: [
        create4500,
        {
          ...create4500,
          priority: 2,
          gpuId: 'NVIDIA RTX PRO 4500 Blackwell Server Edition',
          estimatedComputeUsdPerHour: 0.72,
        },
      ],
      availableGpuIdsInVolumeDc: ['NVIDIA RTX PRO 4500 Blackwell'],
    })
    expect(preview.options.every((row) => !/Server Edition/i.test(row.gpuId))).toBe(true)
    expect(preview.options.some((row) => row.gpuId === 'NVIDIA RTX PRO 4500 Blackwell')).toBe(true)
  })

  it('exige stop do original se ele estiver RUNNING', () => {
    const preview = buildComfyGpuRecoveryPreview({
      originalPod: pod({ status: 'RUNNING', actions: ['stop'] }),
      volumeDataCenterId: 'EU-RO-1',
      networkVolumeId: 'tjp7a4uk0y',
      mountPath: '/runpod-volume',
      image: 'runpod/comfyui-ltx:2.3',
      maxUsdPerHour: null,
      recoveryOptions: [create4500],
      availableGpuIdsInVolumeDc: ['NVIDIA RTX PRO 4500 Blackwell'],
    })
    expect(preview.originalCurrentlyBilling).toBe(true)
    expect(preview.options[0]?.willStopOriginalIfRunning).toBe(true)
  })
})
