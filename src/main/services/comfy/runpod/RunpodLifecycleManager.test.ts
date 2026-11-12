import { describe, expect, it, vi } from 'vitest'
import { RunpodClientV2, type RunpodV2Pod } from './RunpodClientV2'
import { RunpodLifecycleManager } from './RunpodLifecycleManager'
import { assessLtxPodCompatibility, evaluateComfyNodeReadiness } from '../../../../shared/runpodLtxCompat'
import type { RunpodPodSummary } from '../../../../shared/runpod'

function exitedPod(overrides: Partial<RunpodV2Pod> = {}): RunpodV2Pod {
  return {
    id: 'podltx12345',
    name: 'ComfyUI LTX-2.3',
    status: 'EXITED',
    ports: ['8188/http', '22/tcp'],
    gpu: { id: 'NVIDIA GeForce RTX 4090', memory: 24 },
    dataCenterId: 'US-KS-2',
    cost: 0.44,
    cloud: 'SECURE',
    actions: ['start', 'terminate'],
    locked: false,
    image: 'runpod/comfyui-ltx:2.3',
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('assessLtxPodCompatibility', () => {
  const base: RunpodPodSummary = {
    id: 'p1',
    name: 'ComfyUI LTX',
    status: 'EXITED',
    gpuType: 'NVIDIA GeForce RTX 4090',
    gpuMemoryGb: 24,
    dataCenterId: 'US-KS-2',
    ports: ['8188/http'],
    costPerHr: 0.4,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: 'https://p1-8188.proxy.runpod.net',
    actions: ['start'],
    locked: false,
    image: 'comfy-ltx',
    networkMounts: [],
  }

  it('aprova pod EXITED com 8188 e VRAM adequada', () => {
    const result = assessLtxPodCompatibility(base)
    expect(result.level).toBe('ok')
    expect(result.canStart).toBe(true)
  })

  it('bloqueia sem porta Comfy', () => {
    const result = assessLtxPodCompatibility({
      ...base,
      hasComfyPort: false,
      ports: ['22/tcp'],
      comfyProxyUrl: null,
    })
    expect(result.level).toBe('block')
    expect(result.canStart).toBe(false)
  })
})

describe('evaluateComfyNodeReadiness', () => {
  it('exige marcador LTX', () => {
    const ready = evaluateComfyNodeReadiness(
      ['LoadImage', 'LoadAudio', 'SaveVideo', 'TextGenerateLTX2Prompt'],
      ['LoadImage', 'LoadAudio', 'SaveVideo', 'TextGenerateLTX2Prompt'],
    )
    expect(ready.ok).toBe(true)
    expect(
      evaluateComfyNodeReadiness(['LoadImage'], ['LoadImage', 'TextGenerateLTX2Prompt']).hasLtxMarker,
    ).toBe(false)
  })
})

describe('RunpodClientV2.startPod', () => {
  it('envia POST /action start e nunca create/delete', async () => {
    const calls: Array<{ method: string; url: string; body: string | null }> = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        method: (init?.method ?? 'GET').toUpperCase(),
        url: String(input),
        body: typeof init?.body === 'string' ? init.body : null,
      })
      return jsonResponse({ ...exitedPod(), status: 'STARTING', actions: ['stop'] })
    })
    const client = new RunpodClientV2({
      apiKey: 'k',
      fetchFn: fetchFn as unknown as typeof fetch,
      maxRetries: 0,
    })
    const pod = await client.startPod('podltx12345')
    expect(pod.status).toBe('STARTING')
    expect(calls).toEqual([
      {
        method: 'POST',
        url: 'https://api.runpod.io/v2/pods/podltx12345/action',
        body: JSON.stringify({ action: 'start' }),
      },
    ])
  })
})

describe('RunpodLifecycleManager', () => {
  it('dry-run completa até ready sem POST de start', async () => {
    const posts: string[] = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = String(input)
      if (method === 'POST') posts.push(url)
      if (url.includes('/v2/pods/podltx12345') && !url.includes('/action')) {
        return jsonResponse(exitedPod())
      }
      return jsonResponse({}, 404)
    })

    const savedUrls: string[] = []
    const manager = new RunpodLifecycleManager({
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      getApiKey: () => 'test-key',
      getWorkflow: () => null,
      saveBaseUrl: (url) => savedUrls.push(url),
      getDryRunDefault: () => true,
      sleep: async () => undefined,
      pollIntervalMs: 1,
      podReadyTimeoutMs: 5_000,
      comfyReadyTimeoutMs: 5_000,
    })

    const preview = await manager.previewStart('podltx12345')
    expect(preview.costPerHr).toBe(0.44)
    expect(preview.compatibility.canStart).toBe(true)

    const result = await manager.startExistingPod({
      podId: 'podltx12345',
      confirmedCostPerHr: 0.44,
      dryRun: true,
      acceptBilling: false,
    })
    expect(posts).toEqual([])
    expect(result.phase).toBe('ready')
    expect(result.dryRun).toBe(true)
    expect(result.baseUrl).toBeNull()
    expect(savedUrls).toEqual([])
    expect(result.message).toBe('Simulação concluída — nenhuma GPU iniciada')
    expect(result.nodeReadiness?.hasLtxMarker).toBe(true)
  })

  it('bloqueia start real sem acceptBilling (Pod parado)', async () => {
    const posts: string[] = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = String(input)
      if (method === 'POST') posts.push(url)
      return jsonResponse(exitedPod())
    })
    const manager = new RunpodLifecycleManager({
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      getApiKey: () => 'test-key',
      getWorkflow: () => null,
      saveBaseUrl: () => undefined,
      getDryRunDefault: () => false,
    })
    const result = await manager.startExistingPod({
      podId: 'podltx12345',
      confirmedCostPerHr: 0.44,
      dryRun: false,
      acceptBilling: false,
    })
    expect(result.phase).toBe('error')
    expect(result.error).toMatch(/cobrança/i)
    expect(posts).toEqual([])
  })

  it('Pod já RUNNING não exige acceptBilling para só aguardar Comfy', async () => {
    const posts: string[] = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = String(input)
      if (method === 'POST') posts.push(url)
      return jsonResponse(
        exitedPod({
          status: 'RUNNING',
          actions: ['stop'],
          cost: 0.44,
        }),
      )
    })
    const manager = new RunpodLifecycleManager({
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      getApiKey: () => 'test-key',
      getWorkflow: () => null,
      saveBaseUrl: () => undefined,
      getDryRunDefault: () => false,
      sleep: async () => undefined,
      pollIntervalMs: 1,
      comfyReadyTimeoutMs: 20,
      probeComfy: async () => ({
        connection: { ok: true, message: 'ok', gpu: '4090' },
        nodes: {
          ok: true,
          present: ['LoadImage', 'TextGenerateLTX2Prompt'],
          missing: [],
          hasLtxMarker: true,
          message: 'ok',
        },
      }),
    })
    const result = await manager.startExistingPod({
      podId: 'podltx12345',
      confirmedCostPerHr: 0.44,
      dryRun: false,
      acceptBilling: false,
    })
    expect(posts).toEqual([])
    expect(result.phase).toBe('ready')
  })

  it('recusa custo divergente', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(exitedPod({ cost: 0.55 })))
    const manager = new RunpodLifecycleManager({
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      getApiKey: () => 'test-key',
      getWorkflow: () => null,
      saveBaseUrl: () => undefined,
      getDryRunDefault: () => true,
    })
    const result = await manager.startExistingPod({
      podId: 'podltx12345',
      confirmedCostPerHr: 0.44,
      dryRun: true,
      acceptBilling: false,
    })
    expect(result.phase).toBe('error')
    expect(result.error).toMatch(/divergente/i)
  })

  it('é idempotente para o mesmo pod em voo', async () => {
    let getCount = 0
    const fetchFn = vi.fn(async () => {
      getCount += 1
      return jsonResponse(exitedPod())
    })
    const manager = new RunpodLifecycleManager({
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      getApiKey: () => 'test-key',
      getWorkflow: () => null,
      saveBaseUrl: () => undefined,
      getDryRunDefault: () => true,
      sleep: async () => undefined,
      pollIntervalMs: 1,
    })
    const req = {
      podId: 'podltx12345',
      confirmedCostPerHr: 0.44,
      dryRun: true,
      acceptBilling: false,
    }
    const [a, b] = await Promise.all([manager.startExistingPod(req), manager.startExistingPod(req)])
    expect(a).toBe(b)
    expect(getCount).toBeGreaterThan(0)
  })
})

describe('RunpodLifecycleManager.stopExistingPod', () => {
  it('envia STOP e limpa URL se apontava para o Pod', async () => {
    const calls: Array<{ method: string; url: string; body: string | null }> = []
    let savedUrl = 'https://podltx12345-8188.proxy.runpod.net'
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = String(input)
      calls.push({
        method,
        url,
        body: typeof init?.body === 'string' ? init.body : null,
      })
      if (method === 'GET') {
        return jsonResponse({
          ...exitedPod(),
          status: 'RUNNING',
          actions: ['stop', 'restart'],
        })
      }
      return jsonResponse({
        ...exitedPod(),
        status: 'EXITED',
        actions: ['start', 'terminate'],
      })
    })
    const manager = new RunpodLifecycleManager({
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      getApiKey: () => 'test-key',
      getWorkflow: () => null,
      saveBaseUrl: (url) => {
        savedUrl = url
      },
      getDryRunDefault: () => false,
      sleep: async () => undefined,
    })
    const result = await manager.stopExistingPod(
      { podId: 'podltx12345', dryRun: false },
      { currentBaseUrl: savedUrl },
    )
    expect(result.phase).toBe('stopped')
    expect(result.clearedBaseUrl).toBe(true)
    expect(savedUrl).toBe('')
    expect(calls.some((c) => c.method === 'POST' && c.body?.includes('"stop"'))).toBe(true)
    expect(calls.every((c) => !c.body?.includes('terminate'))).toBe(true)
  })

  it('dry-run não envia POST stop', async () => {
    const methods: string[] = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      methods.push((init?.method ?? 'GET').toUpperCase())
      return jsonResponse({
        ...exitedPod(),
        status: 'RUNNING',
        actions: ['stop'],
      })
    })
    const manager = new RunpodLifecycleManager({
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      getApiKey: () => 'test-key',
      getWorkflow: () => null,
      saveBaseUrl: () => undefined,
      getDryRunDefault: () => true,
      sleep: async () => undefined,
    })
    const result = await manager.stopExistingPod({ podId: 'podltx12345', dryRun: true })
    expect(result.phase).toBe('stopped')
    expect(result.dryRun).toBe(true)
    expect(methods.every((m) => m === 'GET')).toBe(true)
  })
})
