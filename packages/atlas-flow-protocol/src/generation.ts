import { z } from 'zod'
import { IsoDateTimeSchema, Sha256HexSchema, UuidSchema } from './ids'
import { EvidenceStatusSchema } from './states'

export const PROTOCOL_VERSION = 1 as const

export const EvidenceSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    status: EvidenceStatusSchema,
    source: z.string().min(1).max(256),
    observedAt: IsoDateTimeSchema,
    documentId: z.string().min(1).max(256).optional(),
  })

export const ReferenceSnapshotSchema = z.object({
  referenceId: UuidSchema,
  referenceVersionId: UuidSchema,
  aliasAtSubmission: z.string().min(1).max(128),
  effectiveSha256: Sha256HexSchema,
})

export const ResolvedReferenceSchema = ReferenceSnapshotSchema.extend({
  flowBindingId: UuidSchema,
  /** Identidade externa só quando realmente observada — string opaca, sem inventar formato. */
  flowMediaId: z.string().min(1).max(512),
})

/**
 * Settings de geração de IMAGEM.
 * modelKey/aspectRatio não são inventados: devem vir de capacidade observada.
 */
export const GenerationSettingsSchema = z.object({
  mode: z.literal('image'),
  modelKey: z.string().min(1).max(128),
  aspectRatio: z.string().min(1).max(32),
  outputs: z.number().int().min(1).max(8),
  resolutionPolicy: z.literal('original'),
  capabilitySnapshotId: UuidSchema,
})

export const AttemptSnapshotSchema = z.object({
  attemptId: UuidSchema,
  promptId: UuidSchema,
  promptRevisionId: UuidSchema,
  atlasProjectId: UuidSchema,
  projectLinkId: UuidSchema,
  flowPrincipalId: UuidSchema,
  flowProjectId: z.string().min(1).max(512),
  compiledText: z.string().min(1).max(32_000),
  compiledTextSha256: Sha256HexSchema,
  references: z.array(ReferenceSnapshotSchema).max(16),
  settings: GenerationSettingsSchema,
})

export type ReferenceSnapshot = z.infer<typeof ReferenceSnapshotSchema>
export type ResolvedReference = z.infer<typeof ResolvedReferenceSchema>
export type GenerationSettings = z.infer<typeof GenerationSettingsSchema>
export type AttemptSnapshot = z.infer<typeof AttemptSnapshotSchema>
