import { describe, expect, it } from 'vitest'
import { canonicalQuery, signAwsV4Request } from './awsSigV4'

describe('awsSigV4', () => {
  it('ordena query canônica', () => {
    expect(canonicalQuery({ 'list-type': '2', prefix: 'models/', 'max-keys': '1000' })).toBe(
      'list-type=2&max-keys=1000&prefix=models%2F',
    )
  })

  it('produz Authorization AWS4-HMAC-SHA256 estável', () => {
    const signed = signAwsV4Request({
      method: 'GET',
      host: 's3api-eu-ro-1.runpod.io',
      canonicalUri: '/tjp7a4uk0y',
      query: { 'list-type': '2', 'max-keys': '1000' },
      region: 'EU-RO-1',
      accessKeyId: 'user_test',
      secretAccessKey: 'rps_test_secret',
      now: new Date('2026-11-08T20:00:00.000Z'),
    })
    expect(signed.headers.Authorization).toContain('AWS4-HMAC-SHA256 Credential=user_test/')
    expect(signed.headers.Authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date')
    expect(signed.headers['x-amz-date']).toBe('20261108T200000Z')
    expect(signed.url).toContain('https://s3api-eu-ro-1.runpod.io/tjp7a4uk0y?')
  })
})
