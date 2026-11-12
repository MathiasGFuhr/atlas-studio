/**
 * Snapshot persistente da detecção LTX — por conta Runpod.
 * Separado do estado runtime (Comfy online/offline).
 */

import type { LtxAutoDetectResult } from './ltxAutoDetect'

/** Inventário S3 considerado fresco por este período (ms). */
export const LTX_INVENTORY_FRESH_MS = 7 * 24 * 60 * 60 * 1000

export type LtxDetectionSnapshot = {
  accountFingerprint: string
  savedAt: string
  /** Quando o inventário de modelos no volume foi confirmado (S3/Comfy). */
  inventoryVerifiedAt: string | null
  inventoryVolumeId: string | null
  inventoryWorkflowName: string | null
  inventoryWorkflowFingerprint: string | null
  inventorySource: 's3' | 'comfy' | 'none'
  /** Resultado completo da última detecção (pode ter Comfy offline). */
  result: LtxAutoDetectResult
}

export type LtxDetectionBootResult = {
  snapshot: LtxDetectionSnapshot | null
  /** Resultado exibido (salvo ou recém-atualizado). */
  detection: LtxAutoDetectResult | null
  source: 'none' | 'stored' | 'light_refresh' | 'full_detect'
  inventoryFromCache: boolean
  message: string
}

export function isLtxInventoryFresh(
  inventoryVerifiedAt: string | null | undefined,
  nowMs = Date.now(),
  freshMs = LTX_INVENTORY_FRESH_MS,
): boolean {
  if (!inventoryVerifiedAt) return false
  const ts = Date.parse(inventoryVerifiedAt)
  if (!Number.isFinite(ts)) return false
  return nowMs - ts < freshMs
}

export function shouldReuseStoredInventory(input: {
  snapshot: LtxDetectionSnapshot | null
  accountFingerprint: string | null
  selectedVolumeId: string | null
  workflowName: string
  workflowFingerprint: string | null
  forceFullScan?: boolean
}): boolean {
  if (input.forceFullScan) return false
  const snap = input.snapshot
  if (!snap || !input.accountFingerprint) return false
  if (snap.accountFingerprint !== input.accountFingerprint) return false
  if (!isLtxInventoryFresh(snap.inventoryVerifiedAt)) return false
  if (!snap.inventoryVolumeId || snap.inventoryVolumeId !== input.selectedVolumeId) return false
  if (
    snap.inventoryWorkflowFingerprint &&
    input.workflowFingerprint &&
    snap.inventoryWorkflowFingerprint !== input.workflowFingerprint
  ) {
    return false
  }
  if (
    snap.inventoryWorkflowName &&
    input.workflowName &&
    snap.inventoryWorkflowName !== input.workflowName
  ) {
    return false
  }
  const status = snap.result.modelsSummary.inspectionStatus
  return status === 'found' || status === 'incomplete'
}

export function fingerprintWorkflowPayload(workflowJson: string | null | undefined): string | null {
  const raw = workflowJson?.trim()
  if (!raw) return null
  // Hash leve estável (não criptográfico) — suficiente para invalidar inventário.
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0
  }
  return `wf_${(hash >>> 0).toString(16)}_${raw.length}`
}
