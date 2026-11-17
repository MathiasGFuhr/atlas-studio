/**
 * Persistência única de pareamento atlas-flow-v1 (chrome.storage.local).
 * Campo vazio no popup = manter credencial. Desconectar é ação explícita.
 * Nunca exporta o token em status/diagnóstico.
 */

/** @typedef {'unpaired'|'reconnecting'|'atlas_unavailable'|'credential_rejected'|'connected'} ConnectionState */

export const PAIRING_STORAGE_KEYS = [
  'installationId',
  'paired',
  'endpoint',
  'pairingToken',
  'preferredEndpoint',
  'connectionState',
  'lastError',
  'lastHealthOk',
  'lastHelloOk',
  'reconnectAttempt',
  'lastReconnectAt',
]

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

/**
 * Merge de credenciais: input vazio preserva o salvo.
 * @param {{ endpoint?: string | null, pairingToken?: string | null }} input
 * @param {{ endpoint?: string | null, pairingToken?: string | null }} stored
 */
export function mergePairingCredentials(input, stored) {
  const endpoint = asNonEmptyString(input?.endpoint) || asNonEmptyString(stored?.endpoint)
  const pairingToken =
    asNonEmptyString(input?.pairingToken) || asNonEmptyString(stored?.pairingToken)
  return { endpoint, pairingToken }
}

/**
 * Health/rede ≠ token inválido. Só 401/403 rejeitam credencial.
 * @param {{ httpStatus?: number | null, networkError?: boolean, helloOk?: boolean }} input
 * @returns {ConnectionState}
 */
export function deriveConnectionState(input) {
  if (input.helloOk === true) return 'connected'
  if (input.httpStatus === 401 || input.httpStatus === 403) return 'credential_rejected'
  if (input.networkError === true) return 'atlas_unavailable'
  if (input.httpStatus != null && input.httpStatus >= 500) return 'atlas_unavailable'
  return 'reconnecting'
}

/**
 * Backoff progressivo (ms), com teto.
 * @param {number} attempt 0-based
 */
export function reconnectDelayMs(attempt) {
  const base = 2_000
  const capped = Math.min(60_000, base * 2 ** Math.max(0, Math.min(attempt, 5)))
  return capped
}

/**
 * @param {Record<string, unknown>} stored
 */
export function normalizePairingRecord(stored) {
  const installationId = asNonEmptyString(stored.installationId)
  const endpoint = asNonEmptyString(stored.endpoint) || asNonEmptyString(stored.preferredEndpoint)
  const preferredEndpoint = asNonEmptyString(stored.preferredEndpoint) || endpoint
  const pairingToken = asNonEmptyString(stored.pairingToken)
  const connectionState =
    typeof stored.connectionState === 'string' ? stored.connectionState : null
  const paired = stored.paired === true || connectionState === 'connected'
  return {
    installationId,
    paired,
    endpoint,
    preferredEndpoint,
    pairingToken,
    connectionState:
      /** @type {ConnectionState} */ (
        connectionState || (paired && pairingToken ? 'connected' : pairingToken ? 'reconnecting' : 'unpaired')
      ),
    lastError: asNonEmptyString(stored.lastError),
    lastHealthOk: typeof stored.lastHealthOk === 'boolean' ? stored.lastHealthOk : null,
    lastHelloOk: typeof stored.lastHelloOk === 'boolean' ? stored.lastHelloOk : null,
    reconnectAttempt: typeof stored.reconnectAttempt === 'number' ? stored.reconnectAttempt : 0,
    lastReconnectAt: asNonEmptyString(stored.lastReconnectAt),
  }
}
