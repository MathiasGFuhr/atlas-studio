import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectAndConfigureLtxEnvironment } from './ltxAutoDetectService'
import { RunpodClientV2 } from './RunpodClientV2'
import { normalizeLtxEnvironmentPlan } from '../../../../shared/ltxEnvironment'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeFetch(options?: { volumes?: unknown[]; comfyOk?: boolean }) {
  const volumes =
    options?.volumes ??
    [
      {
        id: 'tjp7a4uk0y',
        name: 'inadequate_magenta_crow',
        size: 70,
        dataCenter: 'EU-RO-1',
      },
    ]
  const comfyOk = options?.comfyOk === true

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method !== 'GET') return jsonResponse({ error: 'mutation blocked' }, 405)
    const url = String(input)

    if (url.includes('/v2/pods/') && !url.includes('?')) {
      return jsonResponse({
        id: 'pod1',
        name: 'ComfyUI LTX',
        status: 'EXITED',
        ports: ['8188/http'],
        gpu: { id: 'NVIDIA RTX PRO 4500 Blackwell', memory: 32 },
        dataCenterId: 'US-KS-2',
        cost: 0.72,
        actions: ['start'],
        image: 'runpod/comfyui:real',
        mounts: { network: [] },
      })
    }
    if (url.includes('/v2/pods')) {
      return jsonResponse({
        pods: [
          {
            id: 'pod1',
            name: 'ComfyUI LTX',
            status: 'EXITED',
            ports: ['8188/http'],
            gpu: { id: 'NVIDIA RTX PRO 4500 Blackwell', memory: 32 },
            dataCenterId: 'US-KS-2',
            cost: 0.72,
            actions: ['start'],
            image: 'runpod/comfyui:real',
          },
        ],
        pagination: { nextCursor: null, hasNextPage: false },
      })
    }
    if (url.includes('/v2/catalog/gpus')) {
      return jsonResponse({
        gpus: [
          {
            id: 'NVIDIA RTX PRO 4500 Blackwell',
            name: 'PRO 4500',
            memory: 32,
            price: { secure: 0.72 },
            availability: 'LOW',
          },
        ],
      })
    }
    if (url.includes('/v2/network-volumes')) {
      return jsonResponse({
        networkVolumes: volumes,
        pagination: { nextCursor: null, hasNextPage: false },
      })
    }
    if (url.includes('/v2/catalog/datacenters')) {
      return jsonResponse({
        dataCenters: [
          {
            id: 'EU-RO-1',
            networkVolumeTypes: ['STANDARD'],
            gpuAvailability: [
              { id: 'NVIDIA RTX PRO 4500 Blackwell', availability: 'LOW', name: '4500' },
            ],
          },
        ],
      })
    }
    if (!comfyOk && (url.includes('/system_stats') || url.includes('/object_info') || url.includes('/models'))) {
      return jsonResponse({ error: 'down' }, 503)
    }
    if (url.includes('/system_stats')) {
      return jsonResponse({
        system: { comfyui_version: '0.30.0' },
        devices: [{ name: 'cuda:0', vram_total: 32 * 1024 ** 3 }],
      })
    }
    if (url.includes('/object_info')) {
      return jsonResponse({
        TextGenerateLTX2Prompt: {},
        LoadImage: {},
        LoadAudio: {},
        SaveVideo: {},
      })
    }
    return jsonResponse({}, 404)
  })
}

const ltxWorkflow = {
  a: { class_type: 'LoadImage', inputs: {} },
  b: { class_type: 'LoadAudio', inputs: {} },
  c: { class_type: 'SaveVideo', inputs: {} },
  d: { class_type: 'TextGenerateLTX2Prompt', inputs: {} },
}

describe('detectAndConfigureLtxEnvironment — S3 / status', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Comfy offline + sem S3 = verificação pendente (não 0/5)', async () => {
    const fetchFn = makeFetch({ comfyOk: false })
    vi.stubGlobal('fetch', fetchFn)
    const result = await detectAndConfigureLtxEnvironment({
      getApiKey: () => 'test-key',
      getWorkflow: () => ltxWorkflow,
      getWorkflowName: () => 'wf.json',
      getComfyBaseUrl: () => 'https://pod1-8188.proxy.runpod.net',
      getPreferredPodId: () => 'pod1',
      getS3Credentials: () => null,
      getPlan: () =>
        normalizeLtxEnvironmentPlan({
          maxUsdPerHour: 1,
          networkVolumeId: 'tjp7a4uk0y',
          preferredDataCenterId: 'EU-RO-1',
        }),
      persistSuggestedPlan: false,
      persistSnapshot: false,
      getStoredSnapshot: () => null,
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
    })

    expect(result.selectedVolume?.id).toBe('tjp7a4uk0y')
    expect(result.storage.found).toBe(true)
    expect(result.storage.accessible).toBe(false)
    expect(result.storage.s3Endpoint).toBe('https://s3api-eu-ro-1.runpod.io')
    expect(result.comfy.powerState).toBe('offline')
    expect(result.modelsSummary.present).toBeNull()
    expect(result.modelsSummary.inspectionStatus).toBe('pending_credentials')
    expect(result.modelsSummary.label).not.toMatch(/0\/5/)
    expect(result.workflow.status).toBe('pending_runtime')
    expect(result.persistence.fromStoredInventory).toBe(false)
    expect(result.readiness.blockers.some((line) => /0\/5|Modelos incompletos/i.test(line))).toBe(
      false,
    )
  })

  it('lista modelos via S3 com GPU desligada', async () => {
    const fetchFn = makeFetch({ comfyOk: false })
    vi.stubGlobal('fetch', fetchFn)
    const result = await detectAndConfigureLtxEnvironment({
      getApiKey: () => 'test-key',
      getWorkflow: () => ltxWorkflow,
      getWorkflowName: () => 'wf.json',
      getComfyBaseUrl: () => 'https://pod1-8188.proxy.runpod.net',
      getPreferredPodId: () => 'pod1',
      getS3Credentials: () => ({ accessKeyId: 'user_x', secretAccessKey: 'rps_y' }),
      getPlan: () =>
        normalizeLtxEnvironmentPlan({
          maxUsdPerHour: 1,
          networkVolumeId: 'tjp7a4uk0y',
          preferredDataCenterId: 'EU-RO-1',
        }),
      persistSuggestedPlan: false,
      persistSnapshot: false,
      getStoredSnapshot: () => null,
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      createS3Client: () => ({
        endpointUrl: 'https://s3api-eu-ro-1.runpod.io',
        listAllObjects: async () => [
          {
            key: 'models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors',
            sizeBytes: 29_145_431_166,
          },
          {
            key: 'models/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
            sizeBytes: 2_741_024_390,
          },
          {
            key: 'models/loras/gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
            sizeBytes: 628_203_616,
          },
          {
            key: 'models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors',
            sizeBytes: 9_447_702_218,
          },
          {
            key: 'models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
            sizeBytes: 995_743_560,
          },
        ],
      }),
    })

    expect(result.mutationCalls).toBe(0)
    expect(result.modelsSummary.inspectionSource).toBe('s3')
    expect(result.modelsSummary.inspectionStatus).toBe('found')
    expect(result.modelsSummary.present).toBe(5)
    expect(result.modelsSummary.persistentReady).toBe(true)
    expect(result.storage.accessible).toBe(true)
    expect(result.comfy.accessible).toBe(false)
    expect(result.readiness.readyForLipsync).toBe(false)
    expect(result.readiness.readyForRecoveryOnOtherPod).toBe(true)
    expect(result.volumeModels).toHaveLength(5)
    expect(result.persistence.modelsPersistentlyVerified).toBe(true)
  })

  it('volume vazio via S3 = incompleto confirmado', async () => {
    const fetchFn = makeFetch({ comfyOk: false })
    vi.stubGlobal('fetch', fetchFn)
    const result = await detectAndConfigureLtxEnvironment({
      getApiKey: () => 'test-key',
      getWorkflow: () => ltxWorkflow,
      getWorkflowName: () => 'wf.json',
      getComfyBaseUrl: () => 'https://pod1-8188.proxy.runpod.net',
      getPreferredPodId: () => 'pod1',
      getS3Credentials: () => ({ accessKeyId: 'user_x', secretAccessKey: 'rps_y' }),
      getPlan: () =>
        normalizeLtxEnvironmentPlan({
          maxUsdPerHour: 1,
          networkVolumeId: 'tjp7a4uk0y',
        }),
      persistSuggestedPlan: false,
      persistSnapshot: false,
      getStoredSnapshot: () => null,
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      createS3Client: () => ({
        endpointUrl: 'https://s3api-eu-ro-1.runpod.io',
        listAllObjects: async () => [],
      }),
    })
    expect(result.modelsSummary.inspectionStatus).toBe('incomplete')
    expect(result.modelsSummary.present).toBe(0)
    expect(result.modelsSummary.label).toBe('Modelos incompletos: 0/5')
  })

  it('reutiliza inventário salvo em modo light sem listar S3', async () => {
    const { createHash } = await import('node:crypto')
    const apiKey = 'test-key'
    const fingerprint = createHash('sha256').update(`atlas-runpod:${apiKey}`).digest('hex').slice(0, 16)
    const fetchFn = makeFetch({ comfyOk: false })
    vi.stubGlobal('fetch', fetchFn)
    let s3Calls = 0
    const five = [
      'ltx-2.3-22b-dev-fp8.safetensors',
      'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
      'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
      'gemma_3_12B_it_fp4_mixed.safetensors',
      'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
    ].map((fileName, index) => ({
      role: 'model',
      fileName,
      expectedRelativeDir: 'models/x',
      present: true,
      key: `models/${fileName}`,
      podPathHint: `/workspace/models/${fileName}`,
      sizeBytes: 1000 + index,
      sizeGib: 0.001,
      expectedSizeBytes: 1000 + index,
      sizeMatchesExpected: true as boolean | null,
      nestedPath: false,
    }))

    const result = await detectAndConfigureLtxEnvironment({
      getApiKey: () => apiKey,
      getWorkflow: () => ltxWorkflow,
      getWorkflowName: () => 'wf.json',
      getComfyBaseUrl: () => 'https://pod1-8188.proxy.runpod.net',
      getPreferredPodId: () => 'pod1',
      getS3Credentials: () => ({ accessKeyId: 'user_x', secretAccessKey: 'rps_y' }),
      getPlan: () =>
        normalizeLtxEnvironmentPlan({
          maxUsdPerHour: 1,
          networkVolumeId: 'tjp7a4uk0y',
          preferredDataCenterId: 'EU-RO-1',
        }),
      mode: 'light',
      persistSuggestedPlan: false,
      persistSnapshot: false,
      getStoredSnapshot: () =>
        ({
          accountFingerprint: fingerprint,
          savedAt: new Date().toISOString(),
          inventoryVerifiedAt: new Date().toISOString(),
          inventoryVolumeId: 'tjp7a4uk0y',
          inventoryWorkflowName: 'wf.json',
          inventoryWorkflowFingerprint: null,
          inventorySource: 's3',
          result: {
            models: five.map((m) => ({
              role: m.role,
              fileName: m.fileName,
              folder: 'x',
              present: true,
              absolutePath: m.podPathHint,
              sizeBytes: m.sizeBytes,
              sizeGib: m.sizeGib,
              storageKind: 'network_volume',
              onSelectedNetworkVolume: true,
            })),
            volumeModels: five,
            modelsSummary: {
              required: 5,
              present: 5,
              inspectionStatus: 'found',
              inspectionSource: 's3',
              onNetworkVolume: 5,
              onContainerDiskOnly: 0,
              persistentReady: true,
              label: 'Modelos encontrados: 5/5',
              warning: null,
              checks: ['cached'],
            },
            storage: {
              found: true,
              accessible: true,
              volumeId: 'tjp7a4uk0y',
              volumeName: 'vol',
              dataCenterId: 'EU-RO-1',
              sizeGb: 70,
              s3Endpoint: 'https://s3api-eu-ro-1.runpod.io',
              accessSource: 's3',
              accessMessage: 'cached',
            },
          },
        }) as never,
      createClient: (key) =>
        new RunpodClientV2({ apiKey: key, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      createS3Client: () => ({
        endpointUrl: 'https://s3api-eu-ro-1.runpod.io',
        listAllObjects: async () => {
          s3Calls += 1
          return []
        },
      }),
    })

    expect(s3Calls).toBe(0)
    expect(result.persistence.fromStoredInventory).toBe(true)
    expect(result.modelsSummary.present).toBe(5)
    expect(result.modelsSummary.inspectionStatus).toBe('found')
    expect(result.storage.accessMessage).toMatch(/armazenado|Inventário/i)
  })

  it('identifica Pod montado no volume', async () => {
    const fetchFn = makeFetch({ comfyOk: false })
    fetchFn.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/v2/pods/') && !url.includes('?')) {
        return jsonResponse({
          id: 'pod1',
          name: 'ComfyUI LTX',
          status: 'EXITED',
          ports: ['8188/http'],
          gpu: { id: 'NVIDIA RTX PRO 4500 Blackwell', memory: 32 },
          dataCenterId: 'EU-RO-1',
          cost: 0.72,
          actions: ['start'],
          image: 'runpod/comfyui:real',
          mounts: { network: [{ volumeId: 'tjp7a4uk0y', path: '/workspace' }] },
        })
      }
      return makeFetch({ comfyOk: false })(input, init)
    })
    vi.stubGlobal('fetch', fetchFn)

    const result = await detectAndConfigureLtxEnvironment({
      getApiKey: () => 'test-key',
      getWorkflow: () => ltxWorkflow,
      getWorkflowName: () => 'wf.json',
      getComfyBaseUrl: () => 'https://pod1-8188.proxy.runpod.net',
      getPreferredPodId: () => 'pod1',
      getS3Credentials: () => null,
      getPlan: () =>
        normalizeLtxEnvironmentPlan({
          maxUsdPerHour: 1,
          networkVolumeId: 'tjp7a4uk0y',
        }),
      persistSuggestedPlan: false,
      persistSnapshot: false,
      getStoredSnapshot: () => null,
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
    })

    expect(result.volumeMountBindings.some((b) => b.volumeId === 'tjp7a4uk0y')).toBe(true)
    expect(result.ltxPod?.linkedToSelectedVolume).toBe(true)
    expect(result.ltxPod?.persistentMountPath).toBe('/workspace')
  })
})
