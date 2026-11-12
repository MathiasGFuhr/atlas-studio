import { describe, expect, it } from 'vitest'
import { normalizeLtxEnvironmentPlan } from './ltxEnvironment'
import { planLtxGpuRecovery } from './ltxRecovery'
import type { RunpodGpuCatalogEntry, RunpodPodSummary } from './runpod'

const catalog: RunpodGpuCatalogEntry[] = [
  {
    id: 'NVIDIA RTX PRO 4500 Blackwell',
    name: 'PRO 4500',
    memoryGb: 32,
    securePrice: 0.72,
    communityPrice: 0.34,
    availability: 'LOW',
  },
  {
    id: 'NVIDIA RTX PRO 4500 Blackwell Server Edition',
    name: 'PRO 4500 SE',
    memoryGb: 32,
    securePrice: 0.72,
    communityPrice: 0.5,
    availability: 'LOW',
  },
  {
    id: 'NVIDIA L4',
    name: 'L4',
    memoryGb: 24,
    securePrice: 0.59,
    communityPrice: 0.39,
    availability: 'High',
  },
  {
    id: 'NVIDIA GeForce RTX 4090',
    name: 'RTX 4090',
    memoryGb: 24,
    securePrice: 0.44,
    communityPrice: 0.3,
    availability: 'NONE',
  },
]

function pod(partial: Partial<RunpodPodSummary> & Pick<RunpodPodSummary, 'id' | 'name'>): RunpodPodSummary {
  return {
    status: 'EXITED',
    gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
    gpuMemoryGb: 32,
    dataCenterId: 'EU-RO-1',
    ports: ['8188/http'],
    costPerHr: 0.72,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: null,
    actions: ['start'],
    locked: false,
    image: 'comfyui',
    networkMounts: [],
    ...partial,
  }
}

describe('planLtxGpuRecovery', () => {
  it('marca GPU original indisponível e propõe só PRO 4500 (nunca L4)', () => {
    const plan = normalizeLtxEnvironmentPlan({
      primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
      alternateGpuIds: ['NVIDIA RTX PRO 4500 Blackwell Server Edition', null],
      minVramGb: 16,
      maxUsdPerHour: 0.9,
      preferredDataCenterId: 'EU-RO-1',
      preferredCloud: 'SECURE',
      storageStrategy: 'network_volume',
    })

    const result = planLtxGpuRecovery({
      plan,
      preferredPodId: 'pod-ltx',
      pods: [
        pod({ id: 'pod-ltx', name: 'ComfyUI LTX', status: 'TERMINATED', actions: [] }),
        pod({
          id: 'pod-l4',
          name: 'Cheap L4',
          gpuType: 'NVIDIA L4',
          costPerHr: 0.59,
          status: 'EXITED',
        }),
        pod({
          id: 'pod-4500',
          name: 'exotic_beige_junglefowl-migration',
          gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
          costPerHr: 0.72,
          status: 'EXITED',
          actions: ['start', 'terminate'],
        }),
      ],
      catalog,
    })

    expect(result.dryRun).toBe(true)
    expect(result.mutationCalls).toBe(0)
    expect(result.unavailable).toBe(true)
    expect(result.options.length).toBeGreaterThan(0)
    expect(result.options.length).toBeLessThanOrEqual(3)
    expect(result.options[0]?.kind).toBe('reuse_existing_pod')
    expect(result.options[0]?.existingPodId).toBe('pod-4500')
    expect(result.options[0]?.gpuId).toMatch(/PRO 4500/i)
    expect(result.options.every((opt) => /PRO 4500/i.test(opt.gpuId))).toBe(true)
    expect(result.options.every((opt) => !/L4|4090|PRO 4000/i.test(opt.gpuId))).toBe(true)
    expect(
      result.options.some(
        (opt) =>
          opt.kind !== 'reuse_existing_pod' &&
          opt.gpuId === 'NVIDIA RTX PRO 4500 Blackwell' &&
          opt.reasons.some((line) => /Automatically migrate/i.test(line)),
      ),
    ).toBe(true)
    expect(result.consoleMigrateCaveat).toMatch(/Migrate/i)
  })
})
