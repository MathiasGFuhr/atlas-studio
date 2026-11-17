/**
 * Autoridade do endpoint pareado: lista vazia ≠ trocar de Coordinator.
 * Fonte compartilhada com pairedAuthority.ts (espelho tipado para o SW).
 */

export function decideReferencesAvailability(input) {
  if (!input.httpOk) {
    return {
      available: false,
      error: 'PAIRED_COORDINATOR_UNAVAILABLE',
      pipelineBlocked: true,
    }
  }
  if (!Array.isArray(input.references) || input.references.length === 0) {
    return {
      available: false,
      error: 'REFERENCES_NOT_AVAILABLE',
      pipelineBlocked: true,
    }
  }
  return { available: true, pipelineBlocked: false }
}

/**
 * Simula A (vazio) vs B (com refs): a extensão deve permanecer em A.
 */
export function chooseEndpointAfterReferencesQuery(input) {
  const decision = decideReferencesAvailability({
    pairedEndpoint: input.pairedEndpoint,
    httpOk: input.pairedHttpOk,
    references: input.pairedReferences,
  })
  if (!decision.available) {
    return {
      endpointUsed: input.pairedEndpoint,
      switched: false,
      error: decision.error,
      pipelineBlocked: true,
    }
  }
  void input.alternateEndpoint
  void input.alternateReferences
  return {
    endpointUsed: input.pairedEndpoint,
    switched: false,
    pipelineBlocked: false,
  }
}
