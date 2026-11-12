/**
 * Cliente S3 compatível Runpod — somente ListObjectsV2 (GET).
 * Não faz PutObject / DeleteObject / sync.
 */

import type { RunpodS3Object } from '../../../../shared/runpodS3'
import { runpodS3EndpointForDataCenter } from '../../../../shared/runpodS3'
import { signAwsV4Request } from './awsSigV4'

export type RunpodS3Credentials = {
  accessKeyId: string
  secretAccessKey: string
}

export type RunpodS3ClientOptions = {
  credentials: RunpodS3Credentials
  dataCenterId: string
  volumeId: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}

function parseListObjectsXml(xml: string): {
  objects: RunpodS3Object[]
  isTruncated: boolean
  nextContinuationToken: string | null
} {
  const objects: RunpodS3Object[] = []
  const contentsRe = /<Contents>([\s\S]*?)<\/Contents>/g
  let match: RegExpExecArray | null
  while ((match = contentsRe.exec(xml))) {
    const block = match[1] ?? ''
    const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1]?.trim() ?? ''
    const sizeRaw = block.match(/<Size>([\s\S]*?)<\/Size>/)?.[1]?.trim() ?? '0'
    if (!key) continue
    objects.push({ key: decodeXml(key), sizeBytes: Number(sizeRaw) || 0 })
  }
  const isTruncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml)
  const nextContinuationToken =
    xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]?.trim() ?? null
  return {
    objects,
    isTruncated,
    nextContinuationToken: nextContinuationToken ? decodeXml(nextContinuationToken) : null,
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export class RunpodS3Client {
  private readonly credentials: RunpodS3Credentials
  private readonly dataCenterId: string
  private readonly volumeId: string
  private readonly fetchFn: typeof fetch
  private readonly timeoutMs: number
  private readonly endpoint: string
  private readonly host: string

  constructor(options: RunpodS3ClientOptions) {
    const accessKeyId = options.credentials.accessKeyId.trim()
    const secretAccessKey = options.credentials.secretAccessKey.trim()
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Informe as credenciais S3 do Runpod (Access Key + Secret).')
    }
    const endpoint = runpodS3EndpointForDataCenter(options.dataCenterId)
    if (!endpoint) {
      throw new Error(
        `Datacenter ${options.dataCenterId} sem endpoint S3 conhecido na documentação Runpod.`,
      )
    }
    const volumeId = options.volumeId.trim()
    if (!volumeId) throw new Error('Informe o ID do Network Volume.')

    this.credentials = { accessKeyId, secretAccessKey }
    this.dataCenterId = options.dataCenterId.trim()
    this.volumeId = volumeId
    this.fetchFn = options.fetchFn ?? fetch
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.endpoint = endpoint.replace(/\/+$/, '')
    this.host = new URL(this.endpoint).host
  }

  get endpointUrl(): string {
    return this.endpoint
  }

  /** Lista todos os objetos (paginado). Somente leitura. */
  async listAllObjects(prefix = ''): Promise<RunpodS3Object[]> {
    const out: RunpodS3Object[] = []
    let token: string | null = null
    for (let page = 0; page < 50; page += 1) {
      const batch = await this.listObjectsPage(prefix, token)
      out.push(...batch.objects)
      if (!batch.isTruncated || !batch.nextContinuationToken) break
      token = batch.nextContinuationToken
    }
    return out
  }

  async listObjectsPage(
    prefix = '',
    continuationToken: string | null = null,
  ): Promise<{
    objects: RunpodS3Object[]
    isTruncated: boolean
    nextContinuationToken: string | null
  }> {
    const query: Record<string, string> = {
      'list-type': '2',
      'max-keys': '1000',
    }
    if (prefix) query.prefix = prefix
    if (continuationToken) query['continuation-token'] = continuationToken

    const signed = signAwsV4Request({
      method: 'GET',
      host: this.host,
      canonicalUri: `/${encodeURIComponent(this.volumeId).replace(/%2F/gi, '/')}`,
      query,
      region: this.dataCenterId,
      accessKeyId: this.credentials.accessKeyId,
      secretAccessKey: this.credentials.secretAccessKey,
    })

    const response = await this.fetchFn(signed.url, {
      method: 'GET',
      headers: signed.headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    const text = await response.text()
    if (!response.ok) {
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180)
      throw new Error(
        `S3 ListObjects ${response.status}${snippet ? `: ${snippet}` : ''} (volume ${this.volumeId}).`,
      )
    }
    return parseListObjectsXml(text)
  }
}
