import assert from 'node:assert/strict'

/**
 * Espelha a regra do Coordinator: clientSequence antigo não aplica estado.
 */
function shouldApplyProgress(prev, clientSequence) {
  if (clientSequence == null) return true
  if (clientSequence < prev) return false
  return true
}

assert.equal(shouldApplyProgress(0, 1), true)
assert.equal(shouldApplyProgress(5, 5), true)
assert.equal(shouldApplyProgress(5, 6), true)
assert.equal(shouldApplyProgress(5, 4), false)
assert.equal(shouldApplyProgress(3, null), true)

console.log('progressEventOrder.test.mjs OK')
