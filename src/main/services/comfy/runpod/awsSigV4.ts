/**
 * Assinatura AWS Signature Version 4 (mínima) para ListObjectsV2.
 * Sem SDK — somente leitura.
 */

import { createHash, createHmac } from 'node:crypto'

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

function amzDate(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amzDate: iso, dateStamp: iso.slice(0, 8) }
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** Query string canônica (chaves ordenadas, valores RFC3986). */
export function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key]!)}`)
    .join('&')
}

export type SigV4Request = {
  method: 'GET'
  /** Host sem scheme, ex.: s3api-eu-ro-1.runpod.io */
  host: string
  /** Path absoluto começando com /, ex.: /bucketId */
  canonicalUri: string
  query: Record<string, string>
  region: string
  service?: string
  accessKeyId: string
  secretAccessKey: string
  now?: Date
  /** Payload hash; GET vazio = SHA256('') */
  payloadHash?: string
}

export function signAwsV4Request(input: SigV4Request): {
  authorization: string
  headers: Record<string, string>
  url: string
} {
  const service = input.service ?? 's3'
  const now = input.now ?? new Date()
  const { amzDate: amz, dateStamp } = amzDate(now)
  const payloadHash = input.payloadHash ?? sha256Hex('')
  const query = canonicalQuery(input.query)
  const canonicalHeaders = `host:${input.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${input.region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, input.region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const url = `https://${input.host}${input.canonicalUri}${query ? `?${query}` : ''}`
  return {
    authorization,
    headers: {
      Host: input.host,
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amz,
    },
    url,
  }
}
