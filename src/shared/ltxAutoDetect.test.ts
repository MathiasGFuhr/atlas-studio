import { describe, expect, it } from 'vitest'
import {
  buildLtxAutoDetectReadiness,
  buildModelsSummaryLabel,
  classifyModelStoragePath,
  pickLtxComfyPod,
  pickPreferredNetworkVolume,
  recommendGpusForLtx,
  resolveComfyEnvironmentKind,
} from './ltxAutoDetect'
import { normalizeLtxEnvironmentPlan } from './ltxEnvironment'
import type { RunpodPodSummary } from './runpod'

function pod(partial: Partial<RunpodPodSummary> & Pick<RunpodPodSummary, 'id' | 'name'>): RunpodPodSummary {
  return {
    status: 'RUNNING',
    gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
    gpuMemoryGb: 32,
    dataCenterId: 'EU-RO-1',
    ports: ['8188/http'],
    costPerHr: 0.72,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: 'https://x-8188.proxy.runpod.net',
    actions: ['stop'],
    locked: false,
    image: 'runpod/comfyui:latest',
    networkMounts: [],
    ...partial,
  }
}

describe('classifyModelStoragePath', () => {
  it('marca /workspace como disco temporário sem mount confirmado', () => {
    const result = classifyModelStoragePath(
      '/workspace/runpod-slim/ComfyUI/models/checkpoints/a.safetensors',
      [],
      'vol1',
    )
    expect(result.storageKind).toBe('container_disk')
    expect(result.onSelectedNetworkVolume).toBe(false)
  })

  it('marca /workspace como Network Volume quando o mount aponta para lá', () => {
    const result = classifyModelStoragePath(
      '/workspace/models/checkpoints/a.safetensors',
      [{ volumeId: 'tjp7a4uk0y', path: '/workspace' }],
      'tjp7a4uk0y',
    )
    expect(result.storageKind).toBe('network_volume')
    expect(result.onSelectedNetworkVolume).toBe(true)
  })
})

describe('pickLtxComfyPod', () => {
  it('prefere Pod -migration EXITED com Start em vez do Pod antigo sem vaga', () => {
    const picked = pickLtxComfyPod(
      [
        pod({
          id: 'old',
          name: 'exotic_beige_junglefowl',
          status: 'EXITED',
          actions: [],
          gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
        }),
        pod({
          id: 'mig',
          name: 'exotic_beige_junglefowl-migration',
          status: 'EXITED',
          actions: ['start', 'terminate'],
          gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
        }),
      ],
      { volumeDc: 'EU-RO-1', preferredId: 'old' },
    )
    expect(picked?.id).toBe('mig')
  })
})

describe('pickPreferredNetworkVolume', () => {
  it('retorna null sem volumes', () => {
    expect(pickPreferredNetworkVolume([], 'EU-RO-1')).toBeNull()
  })

  it('escolhe volume do DC preferido entre vários', () => {
    const hit = pickPreferredNetworkVolume(
      [
        { id: 'a', name: 'a', sizeGb: 40, dataCenterId: 'US-KS-2' },
        { id: 'b', name: 'b', sizeGb: 70, dataCenterId: 'EU-RO-1' },
        { id: 'c', name: 'c', sizeGb: 100, dataCenterId: 'EU-RO-1' },
      ],
      'EU-RO-1',
    )
    expect(hit?.id).toBe('c')
  })

  it('respeita volumeId preferido', () => {
    const hit = pickPreferredNetworkVolume(
      [
        { id: 'tjp7a4uk0y', name: 'inadequate_magenta_crow', sizeGb: 70, dataCenterId: 'EU-RO-1' },
        { id: 'other', name: 'other', sizeGb: 200, dataCenterId: 'EU-RO-1' },
      ],
      'EU-RO-1',
      'tjp7a4uk0y',
    )
    expect(hit?.id).toBe('tjp7a4uk0y')
  })
})

describe('recommendGpusForLtx', () => {
  const catalog = [
    {
      id: 'NVIDIA RTX PRO 4500 Blackwell',
      name: 'PRO 4500',
      memoryGb: 32,
      securePrice: 0.72,
      communityPrice: 0.34,
      availability: 'LOW',
    },
    {
      id: 'NVIDIA GeForce RTX 4090',
      name: '4090',
      memoryGb: 24,
      securePrice: 0.89,
      communityPrice: 0.34,
      availability: 'LOW',
    },
    {
      id: 'NVIDIA RTX A6000',
      name: 'A6000',
      memoryGb: 48,
      securePrice: 0.59,
      communityPrice: 0.33,
      availability: 'NONE',
    },
  ]

  it('prefers existing validated pod and keeps volume DC', () => {
    const rows = recommendGpusForLtx({
      plan: normalizeLtxEnvironmentPlan({ maxUsdPerHour: 1, preferredCloud: 'SECURE' }),
      catalog,
      selectedVolume: { id: 'vol', name: 'vol', sizeGb: 70, dataCenterId: 'EU-RO-1' },
      ltxPod: pod({ id: 'pod1', name: 'Comfy LTX', dataCenterId: 'EU-RO-1' }),
      dataCenterGpuAvailability: [
        {
          dataCenterId: 'EU-RO-1',
          gpus: [
            { id: 'NVIDIA RTX PRO 4500 Blackwell', availability: 'LOW' },
            { id: 'NVIDIA GeForce RTX 4090', availability: 'LOW' },
          ],
        },
      ],
    })
    expect(rows[0]?.kind).toBe('existing_validated_pod')
    expect(rows[0]?.volumeCompatible).toBe(true)
  })

  it('respeita teto de preço insuficiente', () => {
    const rows = recommendGpusForLtx({
      plan: normalizeLtxEnvironmentPlan({ maxUsdPerHour: 0.1, preferredCloud: 'SECURE' }),
      catalog,
      selectedVolume: { id: 'vol', name: 'vol', sizeGb: 70, dataCenterId: 'EU-RO-1' },
      ltxPod: null,
      dataCenterGpuAvailability: [
        {
          dataCenterId: 'EU-RO-1',
          gpus: [{ id: 'NVIDIA GeForce RTX 4090', availability: 'LOW' }],
        },
      ],
    })
    expect(rows.length).toBe(0)
  })

  it('prioriza PRO 4500 e rejeita PRO 4000 mais barata', () => {
    const rows = recommendGpusForLtx({
      plan: normalizeLtxEnvironmentPlan({
        maxUsdPerHour: 1,
        preferredCloud: 'SECURE',
        primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
      }),
      catalog: [
        {
          id: 'NVIDIA RTX PRO 4000 Blackwell',
          name: 'PRO 4000',
          memoryGb: 24,
          securePrice: 0.57,
          communityPrice: 0.5,
          availability: 'LOW',
        },
        {
          id: 'NVIDIA RTX PRO 4500 Blackwell',
          name: 'PRO 4500',
          memoryGb: 32,
          securePrice: 0.72,
          communityPrice: 0.34,
          availability: 'LOW',
        },
      ],
      selectedVolume: { id: 'vol', name: 'vol', sizeGb: 70, dataCenterId: 'EU-RO-1' },
      ltxPod: null,
      dataCenterGpuAvailability: [
        {
          dataCenterId: 'EU-RO-1',
          gpus: [
            { id: 'NVIDIA RTX PRO 4000 Blackwell', availability: 'High' },
            { id: 'NVIDIA RTX PRO 4500 Blackwell', availability: 'LOW' },
          ],
        },
      ],
    })
    expect(rows[0]?.gpuId).toBe('NVIDIA RTX PRO 4500 Blackwell')
    expect(rows.every((row) => !/PRO 4000/i.test(row.gpuId))).toBe(true)
  })
})

describe('resolveComfyEnvironmentKind', () => {
  it('não trata placeholder como reproduzível', () => {
    const result = resolveComfyEnvironmentKind({
      accessible: true,
      image: 'runpod/comfyui:xyz',
      templatePinned: false,
      templateImage: 'atlas-studio/comfyui-ltx2.3:pending-pin',
    })
    expect(result.kind).toBe('image_identified')
    expect(result.dockerImageIsPlaceholder).toBe(false)
  })
})

describe('buildModelsSummaryLabel', () => {
  it('não mostra 0/5 quando a inspeção não ocorreu', () => {
    expect(
      buildModelsSummaryLabel({
        inspectionStatus: 'pending_credentials',
        present: null,
        required: 5,
      }),
    ).toMatch(/pendente|S3/i)
    expect(
      buildModelsSummaryLabel({
        inspectionStatus: 'found',
        present: 5,
        required: 5,
      }),
    ).toBe('Modelos encontrados: 5/5')
  })
})

describe('buildLtxAutoDetectReadiness', () => {
  it('ComfyUI offline não marca modelos como 0 ausentes', () => {
    const readiness = buildLtxAutoDetectReadiness({
      runpodConnected: true,
      comfyAccessible: false,
      comfyPowerState: 'offline',
      workflowStatus: 'pending_runtime',
      modelsPresent: null,
      modelsRequired: 5,
      modelsInspectionStatus: 'pending_credentials',
      persistentReady: false,
      hasVolume: true,
      storageAccessible: false,
      gpuOk: true,
      volumeLinkedToPod: false,
    })
    expect(readiness.readyForLipsync).toBe(false)
    expect(readiness.blockers.some((line) => /0\/5|Modelos incompletos/i.test(line))).toBe(false)
    expect(readiness.pending.some((line) => /ComfyUI offline/i.test(line))).toBe(true)
    expect(readiness.pending.some((line) => /S3/i.test(line))).toBe(true)
  })

  it('modelos no volume permitem recovery mesmo com Comfy offline', () => {
    const readiness = buildLtxAutoDetectReadiness({
      runpodConnected: true,
      comfyAccessible: false,
      comfyPowerState: 'offline',
      workflowStatus: 'pending_runtime',
      modelsPresent: 5,
      modelsRequired: 5,
      modelsInspectionStatus: 'found',
      persistentReady: true,
      hasVolume: true,
      storageAccessible: true,
      gpuOk: true,
      volumeLinkedToPod: true,
    })
    expect(readiness.readyForLipsync).toBe(false)
    expect(readiness.readyForRecoveryOnOtherPod).toBe(true)
  })

  it('workflow incompatível só com evidência', () => {
    const readiness = buildLtxAutoDetectReadiness({
      runpodConnected: true,
      comfyAccessible: true,
      comfyPowerState: 'online',
      workflowStatus: 'incompatible',
      modelsPresent: 5,
      modelsRequired: 5,
      modelsInspectionStatus: 'found',
      persistentReady: true,
      hasVolume: true,
      storageAccessible: true,
      gpuOk: true,
      volumeLinkedToPod: true,
    })
    expect(readiness.blockers.some((line) => /incompatível/i.test(line))).toBe(true)
  })
})
