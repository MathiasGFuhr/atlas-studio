import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_COMFY_CONFIG, type ComfyConfig } from '../../../../shared/comfy'
import { DEFAULT_LTX_ENVIRONMENT_PLAN } from '../../../../shared/ltxEnvironment'
import type { RunpodInfraStatus, RunpodPodSummary } from '../../../../shared/runpod'
import { assessLtxPodCompatibility } from '../../../../shared/runpodLtxCompat'
import { ComfyConnectOrchestrator } from './comfyConnectOrchestrator'
import { RunpodLifecycleManager } from './RunpodLifecycleManager'

function pod(overrides: Partial<RunpodPodSummary> = {}): RunpodPodSummary {
  const base: RunpodPodSummary = {
    id: 'podltx12345',
    name: 'ComfyUI LTX-2.3',
    status: 'EXITED',
    gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
    gpuMemoryGb: 32,
    dataCenterId: 'EU-RO-1',
    ports: ['8188/http'],
    costPerHr: 0.72,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: 'https://podltx12345-8188.proxy.runpod.net',
    actions: ['start'],
    locked: false,
    image: 'runpod/comfyui-ltx:2.3',
    networkMounts: [{ volumeId: 'tjp7a4uk0y', path: '/workspace' }],
  }
  const next = { ...base, ...overrides }
  return { ...next, ltxCompat: assessLtxPodCompatibility(next) }
}

function status(pods: RunpodPodSummary[], overrides: Partial<RunpodInfraStatus> = {}): RunpodInfraStatus {
  return {
    fetchedAt: new Date().toISOString(),
    apiKeyPresent: true,
    apiKeyValid: true,
    error: null,
    autoInfraEnabled: false,
    preferredPodId: pods[0]?.id ?? null,
    dryRunStarts: true,
    configuredUrl: '',
    urlStale: false,
    selectedPod: pods[0] ?? null,
    pods,
    suggestedUrl: pods[0]?.comfyProxyUrl ?? null,
    comfy: null,
    gpuCatalog: [
      {
        id: 'NVIDIA RTX PRO 4500 Blackwell',
        name: 'PRO 4500',
        memoryGb: 32,
        securePrice: 0.72,
        communityPrice: 0.34,
        availability: 'High',
      },
    ],
    networkVolumes: [{ id: 'tjp7a4uk0y', name: 'ltx', sizeGb: 70, dataCenterId: 'EU-RO-1' }],
    templates: [],
    mutationCalls: 0,
    lifecycle: null,
    ...overrides,
  }
}

function makeOrchestrator(options: {
  pods: RunpodPodSummary[]
  config?: Partial<ComfyConfig>
  modelsVerified?: boolean
  probeOk?: boolean
  nodesOk?: boolean
}) {
  let config: ComfyConfig = {
    ...DEFAULT_COMFY_CONFIG,
    hasRunpodApiKey: true,
    runpodDryRunStarts: true,
    runpodPreferredPodId: options.pods[0]?.id ?? '',
    ...options.config,
  }
  const saves: string[] = []

  const lifecycle = new RunpodLifecycleManager({
    createClient: () =>
      ({
        getPod: async () => ({
          id: options.pods[0]!.id,
          name: options.pods[0]!.name,
          status: options.pods[0]!.status,
          ports: options.pods[0]!.ports,
          gpu: { id: options.pods[0]!.gpuType, memory: options.pods[0]!.gpuMemoryGb },
          dataCenterId: options.pods[0]!.dataCenterId,
          cost: options.pods[0]!.costPerHr,
          cloud: options.pods[0]!.cloud,
          actions: options.pods[0]!.actions,
          locked: false,
          image: options.pods[0]!.image,
        }),
        startPod: async () => {
          throw new Error('POST start não deve ocorrer neste teste dry-run sem confirm')
        },
      }) as never,
    getApiKey: () => 'test-key',
    getWorkflow: () => null,
    saveBaseUrl: (url) => {
      config = { ...config, baseUrl: url }
      saves.push(url)
    },
    getDryRunDefault: () => config.runpodDryRunStarts,
    sleep: async () => undefined,
    podReadyTimeoutMs: 50,
    comfyReadyTimeoutMs: 50,
    pollIntervalMs: 1,
    probeComfy: async () => ({
      connection: {
        ok: options.probeOk !== false,
        message: options.probeOk === false ? 'Comfy offline' : 'ok',
        gpu: 'PRO 4500',
      },
      nodes: {
        ok: options.nodesOk !== false,
        present: ['LoadImage', 'TextGenerateLTX2Prompt'],
        missing: options.nodesOk === false ? ['TextGenerateLTX2Prompt'] : [],
        hasLtxMarker: options.nodesOk !== false,
        message: options.nodesOk === false ? 'Workflow incompatível' : 'nós ok',
      },
    }),
  })

  const orchestrator = new ComfyConnectOrchestrator({
    getApiKey: () => 'test-key',
    getConfig: () => config,
    saveConfig: (patch) => {
      config = { ...config, ...patch }
      if (patch.baseUrl !== undefined) saves.push(String(patch.baseUrl))
      return config
    },
    getWorkflow: () => null,
    getLtxPlan: () => ({
      ...DEFAULT_LTX_ENVIRONMENT_PLAN,
      preferredDataCenterId: 'EU-RO-1',
      networkVolumeId: 'tjp7a4uk0y',
      primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
      maxUsdPerHour: 1.5,
      templateImage: 'runpod/comfyui-ltx:2.3',
      templateTagPinned: true,
      storageStrategy: 'network_volume',
    }),
    modelsPersistentlyVerified: () => Boolean(options.modelsVerified),
    getRunpodStatus: async () => status(options.pods),
    lifecycle,
    createClient: () =>
      ({
        listDataCenters: async () => [
          {
            id: 'EU-RO-1',
            gpuAvailability: [
              { id: 'NVIDIA RTX PRO 4500 Blackwell', availability: 'High' },
            ],
          },
        ],
        createPod: async () => {
          throw new Error('create não deve rodar neste teste')
        },
        stopPod: async () => {
          throw new Error('stop não deve rodar neste teste')
        },
      }) as never,
    probeComfy: async () => ({
      connection: {
        ok: options.probeOk !== false,
        message: options.probeOk === false ? 'Comfy offline' : 'ok',
        gpu: 'PRO 4500',
      },
      nodes: {
        ok: options.nodesOk !== false,
        present: ['LoadImage', 'TextGenerateLTX2Prompt'],
        missing: options.nodesOk === false ? ['TextGenerateLTX2Prompt'] : [],
        hasLtxMarker: options.nodesOk !== false,
        message: options.nodesOk === false ? 'Workflow incompatível' : 'nós ok',
      },
    }),
  })

  return { orchestrator, getConfig: () => config, saves }
}

describe('ComfyConnectOrchestrator', () => {
  it('conecta imediatamente quando Pod RUNNING e Comfy/LTX ok', async () => {
    const running = pod({ status: 'RUNNING', actions: ['stop'] })
    const { orchestrator, getConfig } = makeOrchestrator({
      pods: [running],
      modelsVerified: true,
      config: { baseUrl: 'https://old-pod-8188.proxy.runpod.net', runpodDryRunStarts: false },
    })
    const result = await orchestrator.prepare()
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.baseUrl).toBe(running.comfyProxyUrl)
    expect(result.message).toContain('pronto para gerar')
    expect(result.dryRun).toBe(false)
    expect(getConfig().baseUrl).toBe(running.comfyProxyUrl)
  })

  it('pede confirmação quando Pod está desligado (sem POST)', async () => {
    const { orchestrator, saves } = makeOrchestrator({
      pods: [pod({ status: 'EXITED' })],
      modelsVerified: true,
    })
    const result = await orchestrator.prepare()
    expect(result.status).toBe('needs_confirmation')
    if (result.status !== 'needs_confirmation') return
    expect(result.preview.pod.id).toBe('podltx12345')
    expect(result.dryRunDefault).toBe(true)
    expect(saves.some((url) => url.includes('POST'))).toBe(false)
  })

  it('dry-run confirma e marca ready sem cobrança', async () => {
    const exited = pod({ status: 'EXITED' })
    const { orchestrator, getConfig } = makeOrchestrator({
      pods: [exited],
      modelsVerified: true,
    })
    const prepared = await orchestrator.prepare()
    expect(prepared.status).toBe('needs_confirmation')
    if (prepared.status !== 'needs_confirmation') return

    const confirmed = await orchestrator.confirm({
      podId: prepared.preview.pod.id,
      confirmedCostPerHr: prepared.preview.costPerHr,
      dryRun: true,
      acceptBilling: false,
    })
    expect(confirmed.status).toBe('simulated')
    expect(confirmed.phase).toBe('simulated')
    expect(confirmed.lifecycle.dryRun).toBe(true)
    expect(confirmed.baseUrl).toBeNull()
    expect(confirmed.message).toBe('Simulação concluída — nenhuma GPU iniciada')
    // Não persiste URL simulada como conexão real.
    expect(getConfig().baseUrl).toBe('')
  })

  it('bloqueia start real sem acceptBilling', async () => {
    const exited = pod({ status: 'EXITED' })
    const { orchestrator } = makeOrchestrator({
      pods: [exited],
      modelsVerified: true,
      config: { runpodDryRunStarts: false },
    })
    const prepared = await orchestrator.prepare()
    expect(prepared.status).toBe('needs_confirmation')
    if (prepared.status !== 'needs_confirmation') return

    const confirmed = await orchestrator.confirm({
      podId: prepared.preview.pod.id,
      confirmedCostPerHr: prepared.preview.costPerHr,
      dryRun: false,
      acceptBilling: false,
    })
    expect(confirmed.status).toBe('error')
    expect(confirmed.message).toMatch(/cobrança|confirmação/i)
  })

  it('limpa URL obsoleta quando GPU está desligada no refresh', async () => {
    const { orchestrator, getConfig } = makeOrchestrator({
      pods: [pod({ status: 'EXITED' })],
      config: { baseUrl: 'https://old-pod-8188.proxy.runpod.net' },
    })
    const refresh = await orchestrator.refreshStatus()
    expect(refresh.phase).toBe('gpu_off')
    expect(getConfig().baseUrl).toBe('')
  })

  it('reporta workflow incompatível quando nós LTX faltam', async () => {
    const running = pod({ status: 'RUNNING', actions: ['stop'] })
    const { orchestrator } = makeOrchestrator({
      pods: [running],
      modelsVerified: true,
      nodesOk: false,
    })
    const result = await orchestrator.prepare()
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toMatch(/incompatível|Ausentes|nós/i)
  })

  it('impede clique duplo reutilizando prepare em voo', async () => {
    const exited = pod({ status: 'EXITED' })
    const { orchestrator } = makeOrchestrator({ pods: [exited], modelsVerified: true })
    const a = orchestrator.prepare()
    const b = orchestrator.prepare()
    const [ra, rb] = await Promise.all([a, b])
    expect(ra).toBe(rb)
    expect(ra.status).toBe('needs_confirmation')
  })

  it('após start real falhar por host sem GPU, confirm devolve needs_recovery', async () => {
    const exited = pod({
      status: 'EXITED',
      actions: ['start'],
      image: 'runpod/comfyui-ltx:2.3',
      costPerHr: 0.72,
    })
    const alt = pod({
      id: 'altpod999',
      name: 'Alt LTX',
      status: 'EXITED',
      actions: ['start'],
      image: 'runpod/comfyui-ltx:2.3',
      costPerHr: 0.5,
    })
    let config: ComfyConfig = {
      ...DEFAULT_COMFY_CONFIG,
      hasRunpodApiKey: true,
      runpodDryRunStarts: false,
      runpodPreferredPodId: exited.id,
    }
    const lifecycle = new RunpodLifecycleManager({
      createClient: () =>
        ({
          getPod: async () => ({
            id: exited.id,
            name: exited.name,
            status: 'EXITED',
            ports: exited.ports,
            gpu: { id: exited.gpuType, memory: 32 },
            dataCenterId: exited.dataCenterId,
            cost: exited.costPerHr,
            cloud: 'SECURE',
            actions: ['start'],
            locked: false,
            image: exited.image,
          }),
          startPod: async () => {
            throw new Error(
              'There are not enough free GPUs on the host machine to start this pod.',
            )
          },
        }) as never,
      getApiKey: () => 'k',
      getWorkflow: () => null,
      saveBaseUrl: () => undefined,
      getDryRunDefault: () => false,
      sleep: async () => undefined,
      pollIntervalMs: 1,
    })
    const orchestrator = new ComfyConnectOrchestrator({
      getApiKey: () => 'k',
      getConfig: () => config,
      saveConfig: (patch) => {
        config = { ...config, ...patch }
        return config
      },
      getWorkflow: () => null,
      getLtxPlan: () => ({
        ...DEFAULT_LTX_ENVIRONMENT_PLAN,
        preferredDataCenterId: 'EU-RO-1',
        networkVolumeId: 'tjp7a4uk0y',
        primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
        maxUsdPerHour: 1.5,
        templateImage: 'runpod/comfyui-ltx:2.3',
        templateTagPinned: true,
        storageStrategy: 'network_volume',
      }),
      modelsPersistentlyVerified: () => true,
      getRunpodStatus: async () => status([exited, alt]),
      lifecycle,
      createClient: () =>
        ({
          listDataCenters: async () => [
            {
              id: 'EU-RO-1',
              gpuAvailability: [{ id: 'NVIDIA RTX PRO 4500 Blackwell', availability: 'High' }],
            },
          ],
          createPod: async () => {
            throw new Error('create não deve rodar neste teste')
          },
          stopPod: async () => {
            throw new Error('stop não deve rodar neste teste')
          },
        }) as never,
    })
    const confirmed = await orchestrator.confirm({
      podId: exited.id,
      confirmedCostPerHr: 0.72,
      dryRun: false,
      acceptBilling: true,
    })
    expect(confirmed.status).toBe('needs_recovery')
    expect(confirmed.recovery?.options.length).toBeGreaterThan(0)
  })

  it('oferece recovery autorizável quando GPU indisponível (sem create automático)', async () => {
    const blocked = pod({
      id: 'blocked1',
      status: 'TERMINATED',
      actions: [],
      hasComfyPort: true,
      image: 'runpod/comfyui-ltx:2.3',
    })
    const alt = pod({
      id: 'altpod999',
      name: 'Alt LTX',
      status: 'EXITED',
      actions: ['start'],
      image: 'runpod/comfyui-ltx:2.3',
    })
    const { orchestrator } = makeOrchestrator({
      pods: [blocked, alt],
      config: { runpodPreferredPodId: 'blocked1' },
      modelsVerified: true,
    })
    const result = await orchestrator.prepare()
    expect(result.status).toBe('needs_recovery')
    if (result.status !== 'needs_recovery') return
    expect(result.recovery.options.some((row) => row.kind === 'reuse_existing_pod')).toBe(true)
    expect(result.recovery.consoleMigrateAvailableViaOfficialRest).toBe(false)
  })

  it('troca de conta sem chave retorna erro isolado', async () => {
    const lifecycle = new RunpodLifecycleManager({
      createClient: () => ({ getPod: async () => pod() }) as never,
      getApiKey: () => '',
      getWorkflow: () => null,
      saveBaseUrl: () => undefined,
      getDryRunDefault: () => true,
    })
    const orchestrator = new ComfyConnectOrchestrator({
      getApiKey: () => '',
      getConfig: () => ({ ...DEFAULT_COMFY_CONFIG }),
      saveConfig: (patch) => ({ ...DEFAULT_COMFY_CONFIG, ...patch }),
      getWorkflow: () => null,
      getLtxPlan: () => DEFAULT_LTX_ENVIRONMENT_PLAN,
      modelsPersistentlyVerified: () => false,
      getRunpodStatus: async () => status([]),
      lifecycle,
      createClient: () => ({}) as never,
    })
    const result = await orchestrator.prepare()
    expect(result.status).toBe('error')
    expect(result.message).toMatch(/chave/i)
  })
})

describe('mapLifecyclePhaseToConnectUi (smoke)', () => {
  it('não confunde dry-run com start real no confirm', async () => {
    const startPod = vi.fn(async () => {
      throw new Error('não deveria chamar start real')
    })
    const exited = pod({ status: 'EXITED' })
    let config: ComfyConfig = {
      ...DEFAULT_COMFY_CONFIG,
      hasRunpodApiKey: true,
      runpodDryRunStarts: true,
      runpodPreferredPodId: exited.id,
    }
    const lifecycle = new RunpodLifecycleManager({
      createClient: () =>
        ({
          getPod: async () => ({
            id: exited.id,
            name: exited.name,
            status: 'EXITED',
            ports: exited.ports,
            gpu: { id: exited.gpuType, memory: 24 },
            dataCenterId: exited.dataCenterId,
            cost: exited.costPerHr,
            cloud: 'SECURE',
            actions: ['start'],
            locked: false,
            image: exited.image,
          }),
          startPod,
        }) as never,
      getApiKey: () => 'k',
      getWorkflow: () => null,
      saveBaseUrl: (url) => {
        config = { ...config, baseUrl: url }
      },
      getDryRunDefault: () => true,
      sleep: async () => undefined,
      pollIntervalMs: 1,
      podReadyTimeoutMs: 50,
      comfyReadyTimeoutMs: 50,
    })
    const orchestrator = new ComfyConnectOrchestrator({
      getApiKey: () => 'k',
      getConfig: () => config,
      saveConfig: (patch) => {
        config = { ...config, ...patch }
        return config
      },
      getWorkflow: () => null,
      getLtxPlan: () => ({
        ...DEFAULT_LTX_ENVIRONMENT_PLAN,
        preferredDataCenterId: 'EU-RO-1',
      }),
      modelsPersistentlyVerified: () => true,
      getRunpodStatus: async () => status([exited]),
      lifecycle,
      createClient: () => ({}) as never,
    })
    const prepared = await orchestrator.prepare()
    expect(prepared.status).toBe('needs_confirmation')
    if (prepared.status !== 'needs_confirmation') return
    const confirmed = await orchestrator.confirm({
      podId: exited.id,
      confirmedCostPerHr: exited.costPerHr,
      dryRun: true,
      acceptBilling: false,
    })
    expect(confirmed.status).toBe('simulated')
    expect(confirmed.phase).toBe('simulated')
    expect(startPod).not.toHaveBeenCalled()
    expect(config.baseUrl).toBe('')
  })
})
