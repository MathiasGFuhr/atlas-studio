import { z } from 'zod'

export const SubmissionCertaintySchema = z.enum([
  'not_sent',
  'may_have_sent',
  'accepted',
  'rejected',
  'resolved_by_user',
])

export const AttemptStateSchema = z.enum([
  'draft',
  'queued',
  'waiting_executor',
  'waiting_session',
  'preparing',
  'ready_to_submit',
  'submitting',
  'generating',
  'retrieving',
  'completed',
  'partial',
  'failed',
  'canceled',
  'submission_uncertain',
  'needs_user_action',
])

export const EvidenceStatusSchema = z.enum([
  'observed',
  'user_confirmed',
  'unknown',
  'stale',
])

export const ProtocolOperationSchema = z.enum([
  'executor.inspect',
  'session.inspect',
  'capabilities.inspect',
  'project.ensure',
  'project.delete',
  'reference.ensure',
  'generation.prepare',
  'generation.submit',
  'generation.observe',
  'result.retrieve',
  'executor.reconcile',
  'executor.pause',
  'executor.resume',
])

export type SubmissionCertainty = z.infer<typeof SubmissionCertaintySchema>
export type AttemptState = z.infer<typeof AttemptStateSchema>
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>
export type ProtocolOperation = z.infer<typeof ProtocolOperationSchema>
