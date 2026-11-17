import assert from 'node:assert/strict'
import {
  deriveConnectionState,
  mergePairingCredentials,
  normalizePairingRecord,
  reconnectDelayMs,
} from './pairingStore.mjs'

{
  const merged = mergePairingCredentials(
    { endpoint: '', pairingToken: '' },
    { endpoint: 'http://127.0.0.1:39305', pairingToken: 'secret-token-keep' },
  )
  assert.equal(merged.endpoint, 'http://127.0.0.1:39305')
  assert.equal(merged.pairingToken, 'secret-token-keep')
}

{
  const merged = mergePairingCredentials(
    { endpoint: 'http://127.0.0.1:39305', pairingToken: 'new-token' },
    { endpoint: 'http://127.0.0.1:39301', pairingToken: 'old' },
  )
  assert.equal(merged.endpoint, 'http://127.0.0.1:39305')
  assert.equal(merged.pairingToken, 'new-token')
}

assert.equal(deriveConnectionState({ helloOk: true }), 'connected')
assert.equal(deriveConnectionState({ httpStatus: 401 }), 'credential_rejected')
assert.equal(deriveConnectionState({ httpStatus: 403 }), 'credential_rejected')
assert.equal(deriveConnectionState({ networkError: true }), 'atlas_unavailable')
assert.equal(deriveConnectionState({ httpStatus: 503 }), 'atlas_unavailable')
assert.equal(deriveConnectionState({ helloOk: false }), 'reconnecting')

assert.equal(reconnectDelayMs(0), 2000)
assert.equal(reconnectDelayMs(1), 4000)
assert.equal(reconnectDelayMs(5), 60000)
assert.equal(reconnectDelayMs(9), 60000)

{
  const rec = normalizePairingRecord({
    installationId: 'inst-1',
    pairingToken: 'tok',
    endpoint: 'http://127.0.0.1:39305',
    paired: false,
  })
  assert.equal(rec.connectionState, 'reconnecting')
  assert.equal(rec.preferredEndpoint, 'http://127.0.0.1:39305')
}

{
  const rec = normalizePairingRecord({})
  assert.equal(rec.connectionState, 'unpaired')
  assert.equal(rec.pairingToken, null)
}

console.log('pairingStore.test.mjs OK')
