import { z } from 'zod'

/** UUID v4 (ou UUID genérico RFC) gerado localmente. */
export const UuidSchema = z.string().uuid()

/** SHA-256 em hex minúsculo/maiúsculo, exatamente 64 caracteres. */
export const Sha256HexSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, 'SHA-256 deve ter 64 caracteres hex')

/** Timestamp ISO-8601 UTC (validação de parse, não de fuso). */
export const IsoDateTimeSchema = z.string().datetime({ offset: true })

export type Uuid = z.infer<typeof UuidSchema>
export type Sha256Hex = z.infer<typeof Sha256HexSchema>
