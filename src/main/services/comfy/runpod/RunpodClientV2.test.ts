import { describe, expect, it, vi } from 'vitest'
import { RunpodApiError, RunpodClientV2 } from './RunpodClientV2'
import { summarizeV2Pod, v2PodToCandidate } from './mapRunpodV2'
import { decodeRunpodSecret, encodeRunpodSecret } from './runpodSecretStore'
import { refreshRunpodInfraStatus } from './refreshRunpodStatus'
import { pickRunpodComfyPod } from '../../../../shared/comfy'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('RunpodClientV2', () => {
  it('lista pods com GET /v2/pods e nunca envia POST', async () => {
    const calls: Array<{ method: string; url: string; hasAuth: boolean }> = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      const headers = new Headers(init?.headers)
      calls.push({ method, url, hasAuth: headers.get('Authorization') === 'Bearer secret-key-value' })
      if (url.includes('/v2/pods')) {
        return jsonResponse({
          pods: [
            {
              id: 'podabc12345',
              name: 'ComfyUI LTX',
              status: 'RUNNING',
              ports: ['8188/http', '22/tcp'],
              gpu: { id: 'NVIDIA GeForce RTX 4090' },
              dataCenterId: 'US-KS-2',
              cost: 0.44,
              cloud: 'SECURE',
            },
          ],
          pagination: { nextCursor: null, hasNextPage: false },
        })
      }
      return jsonResponse({ title: 'not found', status: 404 }, 404)
    })

    const client = new RunpodClientV2({
      apiKey: 'secret-key-value',
      fetchFn: fetchFn as unknown as typeof fetch,
      maxRetries: 0,
    })
    const pods = await client.listPods()
    expect(pods).toHaveLength(1)
    expect(pods[0].id).toBe('podabc12345')
    expect(calls.every((call) => call.method === 'GET')).toBe(true)
    expect(calls.every((call) => call.hasAuth)).toBe(true)
    expect(calls.some((call) => call.url.includes('/v2/pods'))).toBe(true)
  })

  it('trata 401 como chave inválida sem vazar o corpo com token', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ title: 'Unauthorized Bearer leaked-token-xyz', status: 401 }, 401),
    )
    const client = new RunpodClientV2({
      apiKey: 'bad-key',
      fetchFn: fetchFn as unknown as typeof fetch,
      maxRetries: 0,
    })
    await expect(client.testApiKey()).rejects.toMatchObject({
      name: 'RunpodApiError',
      status: 401,
      message: 'Chave da API do RunPod inválida.',
    })
  })

  it('consulta catálogo de GPUs com AVAILABILITY + product=POD', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain('/v2/catalog/gpus')
      expect(url).toContain('include=AVAILABILITY')
      expect(url).toContain('product=POD')
      return jsonResponse({
        gpus: [{ id: 'NVIDIA GeForce RTX 4090', name: 'RTX 4090', memory: 24, price: { secure: 0.44 } }],
      })
    })
    const client = new RunpodClientV2({
      apiKey: 'k',
      fetchFn: fetchFn as unknown as typeof fetch,
      maxRetries: 0,
    })
    const gpus = await client.listGpuTypes()
    expect(gpus[0].id).toContain('4090')
  })

  it('faz backoff em 429 e depois sucede (ainda só GET)', async () => {
    let hits = 0
    const fetchFn = vi.fn(async () => {
      hits += 1
      if (hits === 1) return jsonResponse({ title: 'rate', status: 429 }, 429)
      return jsonResponse({ pods: [], pagination: { nextCursor: null, hasNextPage: false } })
    })
    const client = new RunpodClientV2({
      apiKey: 'k',
      fetchFn: fetchFn as unknown as typeof fetch,
      maxRetries: 2,
      timeoutMs: 5_000,
    })
    await expect(client.listPods()).resolves.toEqual([])
    expect(hits).toBe(2)
  })
})

describe('mapRunpodV2', () => {
  it('mapeia ports configuradas para o seletor de Comfy', () => {
    const candidate = v2PodToCandidate({
      id: 'cdde0r2vynph2r',
      name: 'ComfyUI',
      status: 'RUNNING',
      ports: ['8188/http', '22/tcp'],
      gpu: { id: 'NVIDIA GeForce RTX 4090' },
      dataCenterId: 'US-KS-2',
      cost: 0.5,
    })
    expect(pickRunpodComfyPod([candidate])).toEqual({
      id: 'cdde0r2vynph2r',
      name: 'ComfyUI',
      port: 8188,
    })
    expect(
      summarizeV2Pod({
        id: 'cdde0r2vynph2r',
        name: 'ComfyUI',
        status: 'RUNNING',
        ports: ['8188/http'],
      }).comfyProxyUrl,
    ).toBe('https://cdde0r2vynph2r-8188.proxy.runpod.net')
  })
})

describe('runpodSecretStore', () => {
  it('cifra quando o codec está disponível e migra plaintext', () => {
    const codec = {
      isEncryptionAvailable: () => true,
      encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
      decryptString: (buffer: Buffer) => buffer.toString('utf8').replace(/^enc:/, ''),
    }
    const encoded = encodeRunpodSecret(' minha-chave ', codec)
    expect(encoded).toEqual({ mode: 'encrypted', value: Buffer.from('enc:minha-chave').toString('base64') })
    const decoded = decodeRunpodSecret(encoded.mode === 'encrypted' ? encoded.value : null, null, codec)
    expect(decoded).toEqual({ apiKey: 'minha-chave', shouldMigrateToEncrypted: false })

    const fromPlain = decodeRunpodSecret(null, 'antiga', codec)
    expect(fromPlain).toEqual({ apiKey: 'antiga', shouldMigrateToEncrypted: true })
  })

  it('mantém plaintext explícito se a criptografia não estiver disponível', () => {
    expect(encodeRunpodSecret('chave', null)).toEqual({ mode: 'plaintext', value: 'chave' })
  })
})

describe('refreshRunpodInfraStatus', () => {
  it('não marca mutação e detecta URL obsoleta', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v2/pods')) {
        return jsonResponse({
          pods: [
            {
              id: 'novo123456789',
              name: 'Novo',
              status: 'RUNNING',
              ports: ['8188/http'],
              gpu: { id: 'NVIDIA GeForce RTX 4090' },
              dataCenterId: 'US-KS-2',
              cost: 0.4,
            },
          ],
          pagination: { nextCursor: null, hasNextPage: false },
        })
      }
      if (url.includes('/v2/catalog/gpus')) return jsonResponse({ gpus: [] })
      if (url.includes('/v2/network-volumes')) {
        return jsonResponse({ networkVolumes: [], pagination: { nextCursor: null, hasNextPage: false } })
      }
      if (url.includes('/v2/templates')) {
        return jsonResponse({ templates: [], pagination: { nextCursor: null, hasNextPage: false } })
      }
      return jsonResponse({}, 404)
    })

    // Injeta fetch global para createRunpodClient usar o mock via opção? createRunpodClient não aceita fetch.
    // Então testamos o mapper+status com deps e um client indireto: stub getApiKey vazio / com chave
    // usando o cliente real requer mock de fetch global.
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchFn as unknown as typeof fetch
    try {
      const status = await refreshRunpodInfraStatus({
        getApiKey: () => 'test-key',
        getConfiguredUrl: () => 'https://antigo00000000-8188.proxy.runpod.net',
        getAutoInfraEnabled: () => false,
        testComfy: async () => ({ ok: true, message: 'Conectado ao ComfyUI.' }),
      })
      expect(status.mutationCalls).toBe(0)
      expect(status.apiKeyValid).toBe(true)
      expect(status.urlStale).toBe(true)
      expect(status.suggestedUrl).toBe('https://novo123456789-8188.proxy.runpod.net')
      expect(status.selectedPod?.id).toBe('novo123456789')
      expect(status.autoInfraEnabled).toBe(false)
      expect(fetchFn.mock.calls.every((call) => String((call[1] as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'GET')).toBe(
        true,
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('funciona sem chave e sem chamar a API', async () => {
    const status = await refreshRunpodInfraStatus({
      getApiKey: () => '',
      getConfiguredUrl: () => '',
      getAutoInfraEnabled: () => false,
      getDryRunStarts: () => true,
      testComfy: async () => ({ ok: false, message: 'n/a' }),
    })
    expect(status.apiKeyPresent).toBe(false)
    expect(status.pods).toEqual([])
    expect(status.dryRunStarts).toBe(true)
    expect(status.mutationCalls).toBe(0)
    expect(status.error).toMatch(/chave/i)
  })

  it('propaga erro de autenticação', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => jsonResponse({ title: 'nope' }, 401)) as unknown as typeof fetch
    try {
      const status = await refreshRunpodInfraStatus({
        getApiKey: () => 'bad',
        getConfiguredUrl: () => '',
        getAutoInfraEnabled: () => false,
        testComfy: async () => ({ ok: false, message: 'n/a' }),
      })
      expect(status.apiKeyValid).toBe(false)
      expect(status.error).toBe('Chave da API do RunPod inválida.')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('RunpodApiError', () => {
  it('expõe status HTTP', () => {
    const error = new RunpodApiError('falhou', 403)
    expect(error.status).toBe(403)
  })
})
