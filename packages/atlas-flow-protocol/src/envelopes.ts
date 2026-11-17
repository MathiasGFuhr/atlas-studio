import { z } from 'zod'
import { PROTOCOL_VERSION } from './generation'
import { IsoDateTimeSchema, Sha256HexSchema, UuidSchema } from './ids'
import { ProtocolOperationSchema } from './states'

/** Envelope de comando Atlas → extensão (protocolo atlas-flow-v1). */
export const CommandEnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  commandId: UuidSchema,
  operation: ProtocolOperationSchema,
  installationId: UuidSchema,
  attemptId: UuidSchema.nullable(),
  projectLinkId: UuidSchema.nullable(),
  leaseId: UuidSchema,
  leaseEpoch: z.number().int().nonnegative(),
  issuedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  payloadDigest: Sha256HexSchema,
  payload: z.record(z.string(), z.unknown()),
})

/** Envelope de evento extensão → Atlas. */
export const EventEnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  eventId: UuidSchema,
  commandId: UuidSchema,
  attemptId: UuidSchema.nullable(),
  installationId: UuidSchema,
  sequence: z.number().int().nonnegative(),
  eventType: z.string().min(1).max(128),
  occurredAt: IsoDateTimeSchema,
  payload: z.record(z.string(), z.unknown()),
})

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>

export function parseCommandEnvelope(input: unknown): CommandEnvelope {
  return CommandEnvelopeSchema.parse(input)
}

export function parseEventEnvelope(input: unknown): EventEnvelope {
  return EventEnvelopeSchema.parse(input)
}
