import { z } from 'zod'

export const FlowDomainErrorCodeSchema = z.enum([
  'PROTOCOL_UNSUPPORTED',
  'SCHEMA_INVALID',
  'UNAUTHORIZED',
  'INSTALLATION_REVOKED',
  'LEASE_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'SESSION_UNAUTHENTICATED',
  'ACCOUNT_UNKNOWN',
  'ACCOUNT_MISMATCH',
  'PROJECT_LINK_MISSING',
  'REFERENCE_BINDING_MISSING',
  'PREPARE_EXPIRED',
  'SUBMISSION_UNCERTAIN',
  'CAPABILITY_UNKNOWN',
  'ADAPTER_UNOBSERVED',
  'EXTERNAL_UNAVAILABLE',
  'NEEDS_USER_ACTION',
])

export type FlowDomainErrorCode = z.infer<typeof FlowDomainErrorCodeSchema>

export class FlowDomainError extends Error {
  readonly code: FlowDomainErrorCode
  readonly details: Record<string, unknown> | undefined

  constructor(
    code: FlowDomainErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'FlowDomainError'
    this.code = code
    this.details = details
  }
}
