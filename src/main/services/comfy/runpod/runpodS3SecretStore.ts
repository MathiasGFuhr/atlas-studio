/**
 * Credenciais S3 do Runpod (separadas da API Key).
 * Preferência: safeStorage do Electron.
 */

import {
  decodeRunpodSecret,
  encodeRunpodSecret,
  type RunpodSecretCodec,
  type RunpodSecretRecord,
} from './runpodSecretStore'
import type { RunpodS3Credentials } from './RunpodS3Client'

export type RunpodS3SecretBundle = {
  accessKeyId: string
  secretAccessKey: string
}

export function encodeRunpodS3Secrets(
  creds: RunpodS3SecretBundle | null | undefined,
  codec: RunpodSecretCodec | null,
): RunpodSecretRecord {
  const accessKeyId = creds?.accessKeyId?.trim() ?? ''
  const secretAccessKey = creds?.secretAccessKey?.trim() ?? ''
  if (!accessKeyId || !secretAccessKey) return { mode: 'absent' }
  const payload = JSON.stringify({ accessKeyId, secretAccessKey })
  return encodeRunpodSecret(payload, codec)
}

export function decodeRunpodS3Secrets(
  encryptedBase64: string | null | undefined,
  plaintext: string | null | undefined,
  codec: RunpodSecretCodec | null,
): { credentials: RunpodS3Credentials | null; shouldMigrateToEncrypted: boolean } {
  const decoded = decodeRunpodSecret(encryptedBase64, plaintext, codec)
  if (!decoded.apiKey) return { credentials: null, shouldMigrateToEncrypted: false }
  try {
    const parsed = JSON.parse(decoded.apiKey) as Partial<RunpodS3SecretBundle>
    const accessKeyId = String(parsed.accessKeyId ?? '').trim()
    const secretAccessKey = String(parsed.secretAccessKey ?? '').trim()
    if (!accessKeyId || !secretAccessKey) {
      return { credentials: null, shouldMigrateToEncrypted: false }
    }
    return {
      credentials: { accessKeyId, secretAccessKey },
      shouldMigrateToEncrypted: decoded.shouldMigrateToEncrypted,
    }
  } catch {
    return { credentials: null, shouldMigrateToEncrypted: false }
  }
}
