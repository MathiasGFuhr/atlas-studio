/**
 * Cliente da RunPod REST API v2.
 * Base: https://api.runpod.io — paths /v2/...
 * Mutações documentadas usadas pelo Atlas: start/stop (action) e create pod.
 * Não há ação REST "migrate" — a migração automática do console é só no painel (beta).
 */

export const RUNPOD_API_V2_BASE = 'https://api.runpod.io'

export type RunpodV2Pod = {
  id: string
  name: string
  status?: string | null
  ports?: string[] | null
  gpu?: { id?: string | null; count?: number | null; memory?: number | null } | null
  dataCenterId?: string | null
  cloud?: string | null
  cost?: number | null
  actions?: string[] | null
  locked?: boolean | null
  runtime?: {
    ports?: Array<{ private?: number | null; type?: string | null }> | null
  } | null
  template?: string | null
  image?: string | null
  /** Montagens de armazenamento (GET pod detalhado; lista pode omitir). */
  mounts?: {
    network?: Array<{ volumeId?: string | null; path?: string | null }> | null
    persistent?: { path?: string | null } | null
    global?: Array<{ volumeId?: string | null; path?: string | null }> | null
  } | null
}

export type RunpodV2GpuType = {
  id: string
  name?: string | null
  memory?: number | null
  price?: { secure?: number | null; community?: number | null } | null
  availability?: string | null
}

export type RunpodV2NetworkVolume = {
  id: string
  name?: string | null
  size?: number | null
  dataCenter?: string | null
}

export type RunpodV2Template = {
  id: string
  name?: string | null
  image?: string | null
  serverless?: boolean | null
}

export type RunpodClientV2Options = {
  apiKey: string
  baseUrl?: string
  fetchFn?: typeof fetch
  timeoutMs?: number
  /** Retries só em GET com 429/5xx. */
  maxRetries?: number
  log?: (event: string, data?: Record<string, unknown>) => void
}

export class RunpodApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'RunpodApiError'
    this.status = status
  }
}

type Pagination = { nextCursor?: string | null; hasNextPage?: boolean }

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function describeHttpError(status: number, body: string): string {
  if (status === 401 || status === 403) return 'Chave da API do RunPod inválida.'
  if (status === 429) return 'A API do RunPod limitou as consultas. Espere um pouco e tente de novo.'
  if (status >= 500) return `A API do RunPod está indisponível (${status}).`
  const trimmed = body.replace(/\s+/g, ' ').trim().slice(0, 180)
  // Nunca ecoar possíveis tokens que possam vir no corpo.
  const safe = trimmed.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  return safe ? `A API do RunPod respondeu ${status}: ${safe}` : `A API do RunPod respondeu ${status}.`
}

function sanitizePath(path: string): string {
  return path.split('?')[0] ?? path
}

export class RunpodClientV2 {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly log?: (event: string, data?: Record<string, unknown>) => void

  constructor(options: RunpodClientV2Options) {
    const key = options.apiKey.trim()
    if (!key) throw new Error('Informe a chave da API do RunPod nas Configurações.')
    this.apiKey = key
    this.baseUrl = (options.baseUrl ?? RUNPOD_API_V2_BASE).replace(/\/+$/, '')
    this.fetchFn = options.fetchFn ?? fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.maxRetries = Math.max(0, options.maxRetries ?? 2)
    this.log = options.log
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: { allowRetry?: boolean },
  ): Promise<T> {
    const allowRetry = options?.allowRetry ?? method === 'GET'
    let attempt = 0
    for (;;) {
      const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
      this.log?.('runpod.v2.request', { method, path: sanitizePath(path), attempt })
      let response: Response
      try {
        response = await this.fetchFn(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Não foi possível falar com a API do RunPod (${reason}).`)
      }

      const text = await response.text()
      if (response.ok) {
        if (!text.trim()) return {} as T
        try {
          return JSON.parse(text) as T
        } catch {
          throw new Error('A API do RunPod devolveu uma resposta inválida.')
        }
      }

      const retryable =
        allowRetry &&
        (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504)
      if (retryable && attempt < this.maxRetries) {
        attempt += 1
        const backoff = Math.min(4_000, 400 * 2 ** attempt)
        this.log?.('runpod.v2.retry', { path: sanitizePath(path), status: response.status, attempt, backoff })
        await sleep(backoff)
        continue
      }

      if (response.status === 409) {
        throw new RunpodApiError(
          'A ação não é válida para o status atual do Pod (conflito 409). Atualize o status e tente de novo.',
          409,
        )
      }
      if (response.status === 400) {
        const detail = text.toLowerCase()
        if (
          detail.includes('not enough free gpus') ||
          detail.includes('free gpus on the host') ||
          detail.includes('host machine to start this pod')
        ) {
          throw new RunpodApiError(
            'Não há GPU livre na máquina física deste Pod (host sem capacidade). O Atlas pode recuperar com outro Pod ou um novo no mesmo Network Volume.',
            400,
          )
        }
        throw new RunpodApiError(
          describeHttpError(400, text) ||
            'Não há GPU livre na máquina do Pod (host sem capacidade). Tente outro Pod ou mais tarde.',
          400,
        )
      }

      throw new RunpodApiError(describeHttpError(response.status, text), response.status)
    }
  }

  private async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>('GET', path)
  }

  private async listAllPages<TItem>(
    path: string,
    bagKey: string,
    limit = 100,
  ): Promise<TItem[]> {
    const items: TItem[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (cursor) params.set('cursor', cursor)
      const payload = await this.getJson<Record<string, unknown> & { pagination?: Pagination }>(
        `${path}?${params.toString()}`,
      )
      const batch = payload[bagKey]
      if (Array.isArray(batch)) items.push(...(batch as TItem[]))
      if (!payload.pagination?.hasNextPage || !payload.pagination.nextCursor) break
      cursor = payload.pagination.nextCursor
    }
    return items
  }

  /** Valida a chave listando no máximo 1 pod (somente leitura). */
  async testApiKey(): Promise<{ ok: true }> {
    await this.getJson<{ pods?: RunpodV2Pod[] }>('/v2/pods?limit=1')
    return { ok: true }
  }

  async listPods(): Promise<RunpodV2Pod[]> {
    return this.listAllPages<RunpodV2Pod>('/v2/pods', 'pods')
  }

  async getPod(id: string): Promise<RunpodV2Pod> {
    const podId = id.trim()
    if (!podId) throw new Error('Informe o ID do pod.')
    return this.getJson<RunpodV2Pod>(`/v2/pods/${encodeURIComponent(podId)}`)
  }

  /**
   * Catálogo de GPUs. Com AVAILABILITY exige product=POD (contrato v2).
   * Somente leitura — não reserva capacidade.
   */
  async listGpuTypes(options?: { includeAvailability?: boolean }): Promise<RunpodV2GpuType[]> {
    const params = new URLSearchParams()
    if (options?.includeAvailability !== false) {
      params.set('include', 'AVAILABILITY')
      params.set('product', 'POD')
    }
    const qs = params.toString()
    const payload = await this.getJson<{ gpus?: RunpodV2GpuType[] }>(`/v2/catalog/gpus${qs ? `?${qs}` : ''}`)
    return Array.isArray(payload.gpus) ? payload.gpus : []
  }

  async listNetworkVolumes(): Promise<RunpodV2NetworkVolume[]> {
    return this.listAllPages<RunpodV2NetworkVolume>('/v2/network-volumes', 'networkVolumes')
  }

  /**
   * Catálogo de datacenters (GET). Use include=GPU_AVAILABILITY para cruzar com Network Volumes.
   * Somente leitura — não cria volumes.
   */
  async listDataCenters(options?: {
    includeGpuAvailability?: boolean
  }): Promise<
    Array<{
      id: string
      name?: string | null
      region?: string | null
      networkVolumeTypes?: string[] | null
      globalNetwork?: boolean | null
      gpuAvailability?: Array<{ id: string; name?: string; availability: string }> | null
    }>
  > {
    const params = new URLSearchParams()
    if (options?.includeGpuAvailability !== false) {
      params.set('include', 'GPU_AVAILABILITY')
    }
    const qs = params.toString()
    const payload = await this.getJson<{
      dataCenters?: Array<{
        id: string
        name?: string | null
        region?: string | null
        networkVolumeTypes?: string[] | null
        globalNetwork?: boolean | null
        gpuAvailability?: Array<{ id: string; name?: string; availability: string }> | null
      }>
    }>(`/v2/catalog/datacenters${qs ? `?${qs}` : ''}`)
    return Array.isArray(payload.dataCenters) ? payload.dataCenters : []
  }

  /** Templates da conta do usuário (owned). Catálogo público fica para fases posteriores. */
  async listTemplates(): Promise<RunpodV2Template[]> {
    return this.listAllPages<RunpodV2Template>('/v2/templates', 'templates')
  }

  /** POST /v2/pods/{id}/action { action: "start" } — documentado. */
  async startPod(id: string): Promise<RunpodV2Pod> {
    const podId = id.trim()
    if (!podId) throw new Error('Informe o ID do pod.')
    return this.requestJson<RunpodV2Pod>(
      'POST',
      `/v2/pods/${encodeURIComponent(podId)}/action`,
      { action: 'start' },
      { allowRetry: false },
    )
  }

  /** POST /v2/pods/{id}/action { action: "stop" } — documentado; não exclui o Pod. */
  async stopPod(id: string): Promise<RunpodV2Pod> {
    const podId = id.trim()
    if (!podId) throw new Error('Informe o ID do pod.')
    return this.requestJson<RunpodV2Pod>(
      'POST',
      `/v2/pods/${encodeURIComponent(podId)}/action`,
      { action: 'stop' },
      { allowRetry: false },
    )
  }

  /** POST /v2/pods/{id}/action { action: "terminate" } — exclui o Pod (não o Network Volume). */
  async terminatePod(id: string): Promise<RunpodV2Pod> {
    const podId = id.trim()
    if (!podId) throw new Error('Informe o ID do pod.')
    return this.requestJson<RunpodV2Pod>(
      'POST',
      `/v2/pods/${encodeURIComponent(podId)}/action`,
      { action: 'terminate' },
      { allowRetry: false },
    )
  }

  /**
   * POST /v2/pods — criar Pod (documentado).
   * Equivalente operacional à migração com Network Volume: anexa o volume existente
   * no mesmo DC. Não há endpoint REST de "Automatically migrate your Pod data".
   */
  async createPod(body: RunpodCreatePodRequest): Promise<RunpodV2Pod> {
    if (!body.name?.trim()) throw new Error('Informe o nome do Pod.')
    if (!body.image?.trim() && !body.templateId?.trim()) {
      throw new Error('Informe a imagem Docker ou um templateId.')
    }
    if (!body.gpu?.id?.trim()) throw new Error('Informe o tipo de GPU.')
    return this.requestJson<RunpodV2Pod>('POST', '/v2/pods', body, { allowRetry: false })
  }
}

/** Corpo mínimo alinhado a CreatePodRequest (OpenAPI v2). */
export type RunpodCreatePodRequest = {
  name: string
  image?: string
  templateId?: string
  cloud?: 'SECURE' | 'COMMUNITY'
  dataCenterIds?: string[]
  gpu: { id: string; count?: number }
  ports?: string[]
  disk?: number
  env?: Record<string, string>
  mounts?: {
    network?: Array<{ volumeId: string; path: string }>
  }
}
