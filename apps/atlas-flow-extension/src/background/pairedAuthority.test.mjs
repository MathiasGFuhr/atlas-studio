import assert from 'node:assert/strict'
import {
  chooseEndpointAfterReferencesQuery,
  decideReferencesAvailability,
} from './pairedAuthority.mjs'

function run() {
  const paired = 'http://127.0.0.1:39301'
  const other = 'http://127.0.0.1:39302'

  assert.equal(
    decideReferencesAvailability({
      pairedEndpoint: paired,
      httpOk: true,
      references: [],
    }).error,
    'REFERENCES_NOT_AVAILABLE',
  )

  // Coordinator A (pareado) vazio; B tem refs → permanece em A.
  const emptyAHasB = chooseEndpointAfterReferencesQuery({
    pairedEndpoint: paired,
    pairedHttpOk: true,
    pairedReferences: [],
    alternateEndpoint: other,
    alternateReferences: [
      { referenceId: 'x', uploadState: 'staged_local' },
      { referenceId: 'y', uploadState: 'staged_local' },
    ],
  })
  assert.equal(emptyAHasB.endpointUsed, paired)
  assert.equal(emptyAHasB.switched, false)
  assert.equal(emptyAHasB.error, 'REFERENCES_NOT_AVAILABLE')
  assert.equal(emptyAHasB.pipelineBlocked, true)

  const okOnPaired = chooseEndpointAfterReferencesQuery({
    pairedEndpoint: paired,
    pairedHttpOk: true,
    pairedReferences: [{ referenceId: 'a' }],
    alternateEndpoint: other,
    alternateReferences: [],
  })
  assert.equal(okOnPaired.endpointUsed, paired)
  assert.equal(okOnPaired.switched, false)
  assert.equal(okOnPaired.pipelineBlocked, false)

  console.log('pairedAuthority.test.mjs: OK')
}

run()
