/**
 * Contrato de versões Atlas Flow v1 (fonte de verdade).
 *
 * - packageVersion: pacote/extensão (manifest)
 * - sensorVersion: content script (__ATLAS_FLOW_V1_SENSOR__)
 * - protocolVersion: protocolo atlas-flow-v1 (hello / API)
 *
 * São conceitos distintos; podem coincidir numericamente, mas não devem
 * ser misturados em checagens de compatibilidade.
 */

/** Versão do pacote da extensão (alinhar com src/manifest.json). */
export const PACKAGE_VERSION = '0.3.74'

/** Versão do sensor (content script) embutida neste build. */
export const SENSOR_VERSION = '0.3.74'

/** Versão do protocolo atlas-flow-v1. */
export const PROTOCOL_VERSION = 1

/**
 * @param {unknown} actual
 * @param {string} [expected]
 * @returns {boolean}
 */
export function isCompatibleSensorVersion(actual, expected = SENSOR_VERSION) {
  return typeof actual === 'string' && actual.length > 0 && actual === expected
}

/**
 * Avalia handshake do sensor sem efeitos externos.
 * Incompatibilidade bloqueante: pipelineBlocked=true, authRequired=false.
 *
 * @param {{
 *   actualSensorVersion?: string | null,
 *   expectedSensorVersion?: string,
 * }} input
 */
export function evaluateSensorHandshake(input = {}) {
  const expectedSensorVersion = input.expectedSensorVersion || SENSOR_VERSION
  const actualSensorVersion =
    typeof input.actualSensorVersion === 'string' ? input.actualSensorVersion : null

  if (isCompatibleSensorVersion(actualSensorVersion, expectedSensorVersion)) {
    return {
      ok: true,
      ready: true,
      pipelineBlocked: false,
      authRequired: false,
      code: null,
      error: null,
      packageVersion: PACKAGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      expectedSensorVersion,
      actualSensorVersion,
    }
  }

  return {
    ok: false,
    ready: false,
    pipelineBlocked: true,
    authRequired: false,
    code: 'SENSOR_INCOMPATIBLE',
    error: `Sensor ainda em ${actualSensorVersion || 'desconhecida'}; esperado ${expectedSensorVersion}.`,
    packageVersion: PACKAGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    expectedSensorVersion,
    actualSensorVersion,
  }
}

/**
 * Snapshot público (sem segredos) para diagnóstico/build.
 */
export function versionContractSnapshot() {
  return {
    packageVersion: PACKAGE_VERSION,
    sensorVersion: SENSOR_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    note: 'package ≠ sensor ≠ protocol — checagens usam o campo adequado.',
  }
}
