import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRunpodStatusCache,
  fingerprintRunpodAccount,
  getCachedRunpodStatus,
  getRunpodStatusCacheMeta,
  isRunpodStatusStale,
  RUNPOD_STATUS_STALE_MS,
  setCachedRunpodStatus,
  withRunpodStatusInFlight,
} from './runpodStatusCache'
import type { RunpodInfraStatus } from '../../../../shared/runpod'

function sampleStatus(partial?: Partial<RunpodInfraStatus>): RunpodInfraStatus {
  return {
    fetchedAt: new Date().toISOString(),
    apiKeyPresent: true,
    apiKeyValid: true,
    error: null,
    autoInfraEnabled: false,
    preferredPodId: 'pod1',
    dryRunStarts: true,
    configuredUrl: '',
    urlStale: false,
    selectedPod: null,
    pods: [],
    suggestedUrl: null,
    comfy: null,
    gpuCatalog: [],
    networkVolumes: [],
    templates: [],
    mutationCalls: 0,
    lifecycle: null,
    ...partial,
  }
}

describe('runpodStatusCache', () => {
  afterEach(() => {
    clearRunpodStatusCache()
  })

  it('invalida cache quando a conta muda', () => {
    const fpA = fingerprintRunpodAccount('key-a')
    const fpB = fingerprintRunpodAccount('key-b')
    setCachedRunpodStatus(fpA, sampleStatus({ preferredPodId: 'pod-a' }))
    expect(getCachedRunpodStatus(fpA)?.preferredPodId).toBe('pod-a')
    expect(getCachedRunpodStatus(fpB)).toBeNull()
  })

  it('marca stale após TTL', () => {
    const now = Date.now()
    expect(isRunpodStatusStale(now - RUNPOD_STATUS_STALE_MS - 1, now)).toBe(true)
    expect(isRunpodStatusStale(now - 1_000, now)).toBe(false)
  })

  it('deduplica refreshes em voo', async () => {
    let runs = 0
    const shared = withRunpodStatusInFlight(async () => {
      runs += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return sampleStatus({ preferredPodId: 'shared' })
    })
    const [a, b] = await Promise.all([
      shared,
      withRunpodStatusInFlight(async () => {
        runs += 1
        return sampleStatus({ preferredPodId: 'other' })
      }),
    ])
    expect(a.preferredPodId).toBe('shared')
    expect(b.preferredPodId).toBe('shared')
    expect(runs).toBe(1)
  })

  it('force ignora in-flight anterior após conclusão', async () => {
    const first = await withRunpodStatusInFlight(async () => sampleStatus({ preferredPodId: 'one' }))
    expect(first.preferredPodId).toBe('one')
    const second = await withRunpodStatusInFlight(
      async () => sampleStatus({ preferredPodId: 'two' }),
      { force: true },
    )
    expect(second.preferredPodId).toBe('two')
  })

  it('meta reporta stale corretamente', () => {
    const fp = fingerprintRunpodAccount('meta-key')
    setCachedRunpodStatus(fp, sampleStatus(), Date.now() - RUNPOD_STATUS_STALE_MS - 5)
    const meta = getRunpodStatusCacheMeta(fp)
    expect(meta.status).not.toBeNull()
    expect(meta.stale).toBe(true)
  })
})
