import assert from 'node:assert/strict'
import {
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  SENSOR_VERSION,
  evaluateSensorHandshake,
  isCompatibleSensorVersion,
} from './versionContract.mjs'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))

assert.equal(typeof PACKAGE_VERSION, 'string')
assert.equal(typeof SENSOR_VERSION, 'string')
assert.equal(PROTOCOL_VERSION, 1)
assert.equal(PACKAGE_VERSION, manifest.version, 'packageVersion deve seguir o manifest')

// Compatível com o build atual → permite continuar
{
  const result = evaluateSensorHandshake({ actualSensorVersion: SENSOR_VERSION })
  assert.equal(result.ok, true)
  assert.equal(result.ready, true)
  assert.equal(result.pipelineBlocked, false)
  assert.equal(result.authRequired, false)
  assert.equal(result.code, null)
  assert.equal(isCompatibleSensorVersion(SENSOR_VERSION), true)
}

// Incompatível → interrompe antes de efeito externo
{
  const result = evaluateSensorHandshake({ actualSensorVersion: '0.3.6' })
  assert.equal(result.ok, false)
  assert.equal(result.ready, false)
  assert.equal(result.pipelineBlocked, true)
  assert.equal(result.authRequired, false)
  assert.equal(result.code, 'SENSOR_INCOMPATIBLE')
  assert.match(result.error || '', new RegExp(`esperado ${SENSOR_VERSION.replace(/\./g, '\\.')}`))
  assert.equal(isCompatibleSensorVersion('0.3.6'), false)
}

assert.equal(SENSOR_VERSION, '0.3.74')
assert.equal(PACKAGE_VERSION, '0.3.74')

// Ausente também bloqueia (sem aceitar qualquer versão)
{
  const result = evaluateSensorHandshake({ actualSensorVersion: null })
  assert.equal(result.ok, false)
  assert.equal(result.pipelineBlocked, true)
  assert.equal(result.authRequired, false)
}

console.log('versionContract.test.mjs OK')
