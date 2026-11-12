import { describe, expect, it, vi } from 'vitest'
import {
  diagnoseLtxEnvironmentPrep,
  getLtxEnvironmentPlan,
  saveLtxEnvironmentPlan,
} from './ltxEnvironmentService'
import { LTX_DEFAULT_PRIMARY_GPU_ID } from '../../../../shared/ltxEnvironment'
import { RunpodClientV2 } from './RunpodClientV2'

function memoryIo() {
  const map = new Map<string, string>()
  return {
    read: (key: string) => map.get(key) ?? null,
    write: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ltxEnvironmentService plan IO', () => {
  it('persiste plano forçando dryRunOnly e troca GPU legada pela PRO 4500', () => {
    const io = memoryIo()
    const saved = saveLtxEnvironmentPlan(
      {
        dryRunOnly: false,
        primaryGpuId: 'NVIDIA GeForce RTX 4090',
        storageStrategy: 'network_volume',
        maxUsdPerHour: 0.9,
      },
      io,
    )
    expect(saved.dryRunOnly).toBe(true)
    expect(getLtxEnvironmentPlan(io).primaryGpuId).toBe(LTX_DEFAULT_PRIMARY_GPU_ID)
    expect(getLtxEnvironmentPlan(io).storageStrategy).toBe('network_volume')
  })
})

describe('diagnoseLtxEnvironmentPrep', () => {
  it('é somente leitura (mutationCalls 0) e lista volumes/gpus', async () => {
    const methods: string[] = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      methods.push(method)
      const url = String(input)
      if (url.includes('/v2/pods')) {
        return jsonResponse({
          pods: [
            {
              id: 'pod1',
              name: 'ComfyUI LTX',
              status: 'EXITED',
              ports: ['8188/http'],
              gpu: { id: LTX_DEFAULT_PRIMARY_GPU_ID, memory: 32 },
              dataCenterId: 'US-KS-2',
              cost: 0.44,
              actions: ['start'],
            },
          ],
          pagination: { nextCursor: null, hasNextPage: false },
        })
      }
      if (url.includes('/v2/catalog/gpus')) {
        return jsonResponse({
          gpus: [
            {
              id: LTX_DEFAULT_PRIMARY_GPU_ID,
              name: 'PRO 4500',
              memory: 32,
              price: { secure: 0.44 },
              availability: 'HIGH',
            },
          ],
        })
      }
      if (url.includes('/v2/network-volumes')) {
        return jsonResponse({ networkVolumes: [], pagination: { nextCursor: null, hasNextPage: false } })
      }
      return jsonResponse({}, 404)
    })

    const status = await diagnoseLtxEnvironmentPrep({
      getApiKey: () => 'test-key',
      getPlan: () =>
        saveLtxEnvironmentPlan(
          {
            primaryGpuId: LTX_DEFAULT_PRIMARY_GPU_ID,
            storageStrategy: 'network_volume',
            preferredDataCenterId: 'US-KS-2',
            maxUsdPerHour: 1,
          },
          memoryIo(),
        ),
      getWorkflowName: () => 'video_ltx2_3_ia2v.json',
      getWorkflow: () => ({
        a: { class_type: 'LoadImage', inputs: {} },
        b: { class_type: 'TextGenerateLTX2Prompt', inputs: {} },
      }),
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
    })

    expect(status.dryRun).toBe(true)
    expect(status.mutationCalls).toBe(0)
    expect(methods.every((method) => method === 'GET')).toBe(true)
    expect(status.storage.accountHasNetworkVolume).toBe(false)
    expect(status.models).toHaveLength(5)
    expect(status.podsSnapshot).toHaveLength(1)
    expect(status.gpuFailover[0]?.fitsVram).toBe(true)
    expect(status.readiness.blockers.some((line) => /Network Volume/i.test(line))).toBe(true)
  })

  it('funciona sem chave API e mantém diagnóstico planejado com defaults', async () => {
    const status = await diagnoseLtxEnvironmentPrep({
      getApiKey: () => '',
      getWorkflowName: () => '',
      getWorkflow: () => null,
      getPlan: () => getLtxEnvironmentPlan(memoryIo()),
    })
    expect(status.mutationCalls).toBe(0)
    expect(status.podsSnapshot).toEqual([])
    expect(status.readiness.level).toBe('planned')
  })
})
