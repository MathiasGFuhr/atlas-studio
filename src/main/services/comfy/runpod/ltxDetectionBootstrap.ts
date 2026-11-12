/**
 * Boot do ambiente LTX: restaura snapshot e faz refresh leve sem S3 completo.
 */

import { createHash } from 'node:crypto'
import type { LtxAutoDetectResult } from '../../../../shared/ltxAutoDetect'
import type { LtxDetectionBootResult, LtxDetectionSnapshot } from '../../../../shared/ltxDetectionSnapshot'
import { detectAndConfigureLtxEnvironment, type DetectLtxDeps } from './ltxAutoDetectService'
import { getLtxDetectionSnapshot } from './ltxDetectionStore'

export type BootstrapLtxDeps = DetectLtxDeps & {
  /** true = forçar inventário S3 completo. */
  forceFullScan?: boolean
}

function accountFingerprintFromKey(apiKey: string): string | null {
  const key = apiKey.trim()
  if (!key) return null
  return createHash('sha256').update(`atlas-runpod:${key}`).digest('hex').slice(0, 16)
}

/**
 * 1) Devolve snapshot salvo imediatamente (se da mesma conta).
 * 2) Atualiza em modo light (sem S3) ou full se nunca configurado / forçado.
 */
export async function bootstrapLtxEnvironment(
  deps: BootstrapLtxDeps,
): Promise<LtxDetectionBootResult> {
  const apiKey = deps.getApiKey().trim()
  const accountFingerprint = accountFingerprintFromKey(apiKey)
  const snapshot =
    (deps.getStoredSnapshot ?? getLtxDetectionSnapshot)(accountFingerprint) ?? null

  if (!apiKey) {
    return {
      snapshot: null,
      detection: null,
      source: 'none',
      inventoryFromCache: false,
      message: 'Conecte a API Key Runpod para carregar o ambiente LTX.',
    }
  }

  if (deps.forceFullScan) {
    const detection = await detectAndConfigureLtxEnvironment({
      ...deps,
      mode: 'full',
      persistSnapshot: true,
    })
    return {
      snapshot: getLtxDetectionSnapshot(detection.accountFingerprint),
      detection,
      source: 'full_detect',
      inventoryFromCache: false,
      message: 'Verificação completa concluída.',
    }
  }

  if (!snapshot) {
    const hasS3 = Boolean(deps.getS3Credentials?.())
    if (!hasS3) {
      return {
        snapshot: null,
        detection: null,
        source: 'none',
        inventoryFromCache: false,
        message:
          'Ambiente ainda não configurado. Cadastre a chave S3 e aguarde a detecção automática, ou use “Detectar e configurar ambiente”.',
      }
    }
    const detection = await detectAndConfigureLtxEnvironment({
      ...deps,
      mode: 'full',
      persistSnapshot: true,
    })
    return {
      snapshot: getLtxDetectionSnapshot(detection.accountFingerprint),
      detection,
      source: 'full_detect',
      inventoryFromCache: false,
      message: 'Configuração inicial concluída e salva para esta conta.',
    }
  }

  const detection = await detectAndConfigureLtxEnvironment({
    ...deps,
    mode: 'light',
    persistSnapshot: true,
  })

  return {
    snapshot: getLtxDetectionSnapshot(detection.accountFingerprint) ?? snapshot,
    detection,
    source: detection.persistence.fromStoredInventory ? 'light_refresh' : 'full_detect',
    inventoryFromCache: detection.persistence.fromStoredInventory,
    message: detection.persistence.fromStoredInventory
      ? `Configuração restaurada. Última verificação de modelos: ${detection.persistence.inventoryVerifiedAt ?? snapshot.savedAt}.`
      : 'Configuração atualizada (inventário revalidado).',
  }
}

export function getSavedLtxDetectionForAccount(apiKey: string): {
  snapshot: LtxDetectionSnapshot | null
  detection: LtxAutoDetectResult | null
} {
  const accountFingerprint = accountFingerprintFromKey(apiKey)
  const snapshot = getLtxDetectionSnapshot(accountFingerprint)
  return { snapshot, detection: snapshot?.result ?? null }
}
