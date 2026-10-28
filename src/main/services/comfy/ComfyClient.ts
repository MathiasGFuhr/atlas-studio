import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { ComfyApiWorkflow, ComfyConnectionInfo, ComfyOutputFile } from '../../../shared/comfy'
import { normalizeComfyBaseUrl } from '../../../shared/comfy'

const SHORT_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 5 * 60_000
const DOWNLOAD_TIMEOUT_MS = 20 * 60_000

/** Falha de rede (pod desligado, URL errada): não conta como erro da cena. */
export class ComfyUnreachableError extends Error {}

export type ComfyHistoryEntry = {
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] }
  outputs?: Record<string, unknown>
}

export type ComfyQueueState = { running: string[]; pending: string[] }

export interface ComfyApi {
  systemStats(): Promise<ComfyConnectionInfo>
  upload(localPath: string, remoteName: string): Promise<string>
  queuePrompt(workflow: ComfyApiWorkflow, clientId: string): Promise<string>
  history(promptId: string): Promise<ComfyHistoryEntry | null>
  queue(): Promise<ComfyQueueState>
  download(file: ComfyOutputFile, destPath: string): Promise<void>
  deleteQueued(promptIds: string[]): Promise<void>
  interrupt(): Promise<void>
}

function describeNodeErrors(nodeErrors: unknown): string {
  if (!nodeErrors || typeof nodeErrors !== 'object') return ''
  const parts: string[] = []
  for (const [nodeId, value] of Object.entries(nodeErrors as Record<string, unknown>)) {
    const errors = (value as { errors?: Array<{ message?: string; details?: string }> })?.errors ?? []
    for (const error of errors) {
      parts.push(`nó ${nodeId}: ${[error.message, error.details].filter(Boolean).join(' — ')}`)
    }
  }
  return parts.slice(0, 3).join('; ')
}

/** Primeira mensagem de erro de execução registrada no `/history`. */
export function comfyExecutionError(entry: ComfyHistoryEntry): string {
  for (const message of entry.status?.messages ?? []) {
    if (!Array.isArray(message) || message[0] !== 'execution_error') continue
    const data = message[1] as { node_type?: string; exception_message?: string } | undefined
    const text = data?.exception_message?.trim()
    if (text) return data?.node_type ? `${data.node_type}: ${text}` : text
  }
  return 'O ComfyUI terminou a cena com erro.'
}

export class ComfyClient implements ComfyApi {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = normalizeComfyBaseUrl(baseUrl)
    if (!this.baseUrl) throw new Error('Informe a URL do ComfyUI nas Configurações.')
  }

  private async request(route: string, init: RequestInit = {}, timeoutMs = SHORT_TIMEOUT_MS) {
    try {
      return await fetch(`${this.baseUrl}${route}`, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ComfyUnreachableError(`Não foi possível falar com o ComfyUI (${reason}).`)
    }
  }

  private async json<T>(route: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
    const response = await this.request(route, init, timeoutMs)
    if (response.status >= 500 || response.status === 404) {
      throw new ComfyUnreachableError(`O ComfyUI respondeu ${response.status} em ${route}.`)
    }
    if (!response.ok) throw new Error(`O ComfyUI respondeu ${response.status} em ${route}.`)
    return (await response.json()) as T
  }

  async systemStats(): Promise<ComfyConnectionInfo> {
    const stats = await this.json<{
      system?: { comfyui_version?: string }
      devices?: Array<{ name?: string; vram_total?: number }>
    }>('/system_stats')
    const device = stats.devices?.[0]
    const vram = device?.vram_total ? Math.round((device.vram_total / 1024 ** 3) * 10) / 10 : undefined
    return {
      ok: true,
      message: 'Conectado ao ComfyUI.',
      gpu: device?.name?.replace(/^cuda:\d+\s*/, '').replace(/\s*:\s*cudaMallocAsync$/, ''),
      vramTotalGb: vram,
      comfyVersion: stats.system?.comfyui_version,
    }
  }

  async upload(localPath: string, remoteName: string): Promise<string> {
    const data = await fs.promises.readFile(localPath)
    const form = new FormData()
    form.append('image', new Blob([data]), remoteName)
    form.append('type', 'input')
    form.append('overwrite', 'true')
    const result = await this.json<{ name?: string; subfolder?: string }>(
      '/upload/image',
      { method: 'POST', body: form },
      UPLOAD_TIMEOUT_MS,
    )
    if (!result.name) throw new Error(`O ComfyUI não confirmou o envio de ${path.basename(localPath)}.`)
    return result.subfolder ? `${result.subfolder}/${result.name}` : result.name
  }

  async queuePrompt(workflow: ComfyApiWorkflow, clientId: string): Promise<string> {
    const response = await this.request('/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    })
    const body = (await response.json().catch(() => null)) as {
      prompt_id?: string
      error?: { message?: string; details?: string }
      node_errors?: unknown
    } | null
    if (response.status >= 500 || response.status === 404) {
      throw new ComfyUnreachableError(`O ComfyUI respondeu ${response.status} ao receber a cena.`)
    }
    if (!response.ok || !body?.prompt_id) {
      const detail = describeNodeErrors(body?.node_errors) || body?.error?.message || `HTTP ${response.status}`
      throw new Error(`O ComfyUI recusou o workflow: ${detail}`)
    }
    return body.prompt_id
  }

  async history(promptId: string): Promise<ComfyHistoryEntry | null> {
    const data = await this.json<Record<string, ComfyHistoryEntry>>(`/history/${encodeURIComponent(promptId)}`)
    return data[promptId] ?? null
  }

  async queue(): Promise<ComfyQueueState> {
    const data = await this.json<{ queue_running?: unknown[][]; queue_pending?: unknown[][] }>('/queue')
    const ids = (items: unknown[][] | undefined) =>
      (items ?? []).map((item) => String(item?.[1] ?? '')).filter(Boolean)
    return { running: ids(data.queue_running), pending: ids(data.queue_pending) }
  }

  async download(file: ComfyOutputFile, destPath: string): Promise<void> {
    const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type })
    const response = await this.request(`/view?${query.toString()}`, {}, DOWNLOAD_TIMEOUT_MS)
    if (!response.ok || !response.body) {
      throw new ComfyUnreachableError(`O ComfyUI respondeu ${response.status} ao baixar ${file.filename}.`)
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const partial = `${destPath}.part`
    try {
      await pipeline(
        Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
        fs.createWriteStream(partial),
      )
      fs.renameSync(partial, destPath)
    } catch (error) {
      fs.rmSync(partial, { force: true })
      const reason = error instanceof Error ? error.message : String(error)
      throw new ComfyUnreachableError(`O download de ${file.filename} falhou (${reason}).`)
    }
  }

  async deleteQueued(promptIds: string[]): Promise<void> {
    if (promptIds.length === 0) return
    await this.request('/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: promptIds }),
    })
  }

  async interrupt(): Promise<void> {
    await this.request('/interrupt', { method: 'POST' })
  }
}
