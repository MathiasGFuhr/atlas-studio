/**
 * Persistência da API Key do RunPod.
 * Preferência: safeStorage do Electron (DPAPI no Windows).
 * Fallback explícito: texto no SQLite, sem descartar chave antiga.
 */

export type RunpodSecretCodec = {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(buffer: Buffer): string
}

export type RunpodSecretRecord =
  | { mode: 'encrypted'; value: string }
  | { mode: 'plaintext'; value: string }
  | { mode: 'absent' }

/** Isolado para testes sem Electron. */
export function encodeRunpodSecret(plain: string, codec: RunpodSecretCodec | null): RunpodSecretRecord {
  const value = plain.trim()
  if (!value) return { mode: 'absent' }
  if (codec?.isEncryptionAvailable()) {
    try {
      return { mode: 'encrypted', value: codec.encryptString(value).toString('base64') }
    } catch {
      // cai no plaintext abaixo
    }
  }
  return { mode: 'plaintext', value }
}

export function decodeRunpodSecret(
  encryptedBase64: string | null | undefined,
  plaintext: string | null | undefined,
  codec: RunpodSecretCodec | null,
): { apiKey: string; shouldMigrateToEncrypted: boolean } {
  const enc = encryptedBase64?.trim() ?? ''
  if (enc && codec?.isEncryptionAvailable()) {
    try {
      const apiKey = codec.decryptString(Buffer.from(enc, 'base64')).trim()
      if (apiKey) return { apiKey, shouldMigrateToEncrypted: false }
    } catch {
      // tenta plaintext residual
    }
  }

  const plain = plaintext?.trim() ?? ''
  if (!plain) return { apiKey: '', shouldMigrateToEncrypted: false }
  return {
    apiKey: plain,
    shouldMigrateToEncrypted: Boolean(codec?.isEncryptionAvailable()),
  }
}
