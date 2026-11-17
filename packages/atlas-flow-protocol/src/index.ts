/**
 * Contrato compartilhado atlas-flow-v1.
 * Integração real permanece NÃO VALIDADA até observação do Flow autenticado.
 */
export const ATLAS_FLOW_NAMESPACE = 'atlas-flow-v1' as const
export const ATLAS_FLOW_PROTOCOL_VERSION = 1 as const

export * from './ids'
export * from './states'
export * from './generation'
export * from './envelopes'
export * from './errors'
