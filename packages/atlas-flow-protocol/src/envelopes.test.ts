import { describe, expect, it } from 'vitest'
import { parseCommandEnvelope, parseEventEnvelope } from './envelopes'

const sha = 'a'.repeat(64)
const id = '11111111-1111-4111-8111-111111111111'

describe('atlas-flow-protocol envelopes', () => {
  it('aceita comando válido protocolVersion=1', () => {
    const command = parseCommandEnvelope({
      protocolVersion: 1,
      commandId: id,
      operation: 'executor.inspect',
      installationId: id,
      attemptId: null,
      projectLinkId: null,
      leaseId: id,
      leaseEpoch: 0,
      issuedAt: '2026-11-13T12:00:00.000Z',
      expiresAt: '2026-11-13T12:02:00.000Z',
      payloadDigest: sha,
      payload: {},
    })
    expect(command.operation).toBe('executor.inspect')
  })

  it('rejeita operação desconhecida', () => {
    expect(() =>
      parseCommandEnvelope({
        protocolVersion: 1,
        commandId: id,
        operation: 'executeScript',
        installationId: id,
        attemptId: null,
        projectLinkId: null,
        leaseId: id,
        leaseEpoch: 0,
        issuedAt: '2026-11-13T12:00:00.000Z',
        expiresAt: '2026-11-13T12:02:00.000Z',
        payloadDigest: sha,
        payload: {},
      }),
    ).toThrow()
  })

  it('aceita evento válido', () => {
    const event = parseEventEnvelope({
      protocolVersion: 1,
      eventId: id,
      commandId: id,
      attemptId: null,
      installationId: id,
      sequence: 1,
      eventType: 'executor.inspected',
      occurredAt: '2026-11-13T12:00:01.000Z',
      payload: { ok: true },
    })
    expect(event.eventType).toBe('executor.inspected')
  })
})
