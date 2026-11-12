import { describe, expect, it } from 'vitest'
import {
  fingerprintWorkflowPayload,
  isLtxInventoryFresh,
  shouldReuseStoredInventory,
  type LtxDetectionSnapshot,
} from './ltxDetectionSnapshot'

function snap(partial: Partial<LtxDetectionSnapshot>): LtxDetectionSnapshot {
  return {
    accountFingerprint: 'acct',
    savedAt: new Date().toISOString(),
    inventoryVerifiedAt: new Date().toISOString(),
    inventoryVolumeId: 'vol1',
    inventoryWorkflowName: 'wf.json',
    inventoryWorkflowFingerprint: 'wf_abc',
    inventorySource: 's3',
    result: {
      modelsSummary: { inspectionStatus: 'found' },
    } as LtxDetectionSnapshot['result'],
    ...partial,
  }
}

describe('ltxDetectionSnapshot helpers', () => {
  it('considera inventário fresco', () => {
    expect(isLtxInventoryFresh(new Date().toISOString())).toBe(true)
    expect(isLtxInventoryFresh(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString())).toBe(
      false,
    )
  })

  it('reutiliza quando volume/conta/workflow batem', () => {
    expect(
      shouldReuseStoredInventory({
        snapshot: snap({}),
        accountFingerprint: 'acct',
        selectedVolumeId: 'vol1',
        workflowName: 'wf.json',
        workflowFingerprint: 'wf_abc',
      }),
    ).toBe(true)
  })

  it('não reutiliza se volume ou conta mudar', () => {
    expect(
      shouldReuseStoredInventory({
        snapshot: snap({}),
        accountFingerprint: 'other',
        selectedVolumeId: 'vol1',
        workflowName: 'wf.json',
        workflowFingerprint: 'wf_abc',
      }),
    ).toBe(false)
    expect(
      shouldReuseStoredInventory({
        snapshot: snap({}),
        accountFingerprint: 'acct',
        selectedVolumeId: 'vol2',
        workflowName: 'wf.json',
        workflowFingerprint: 'wf_abc',
      }),
    ).toBe(false)
  })

  it('forceFullScan impede reuso', () => {
    expect(
      shouldReuseStoredInventory({
        snapshot: snap({}),
        accountFingerprint: 'acct',
        selectedVolumeId: 'vol1',
        workflowName: 'wf.json',
        workflowFingerprint: 'wf_abc',
        forceFullScan: true,
      }),
    ).toBe(false)
  })

  it('fingerprint de workflow é estável', () => {
    expect(fingerprintWorkflowPayload('{"a":1}')).toBe(fingerprintWorkflowPayload('{"a":1}'))
    expect(fingerprintWorkflowPayload('{"a":1}')).not.toBe(fingerprintWorkflowPayload('{"a":2}'))
  })
})
