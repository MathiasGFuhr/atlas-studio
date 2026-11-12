/**
 * Tipos e helpers da API S3 compatível do Runpod (Network Volumes).
 * Somente leitura — ListObjects. Sem upload/delete.
 */

import { LTX_IA2V_OFFICIAL_MODEL_ASSETS } from './ltxEnvironment'

/** Endpoint S3 por datacenter (docs.runpod.io/storage/s3-api). */
export const RUNPOD_S3_ENDPOINTS: Record<string, string> = {
  'EU-CZ-1': 'https://s3api-eu-cz-1.runpod.io',
  'EU-RO-1': 'https://s3api-eu-ro-1.runpod.io',
  'EUR-IS-1': 'https://s3api-eur-is-1.runpod.io',
  'EUR-NO-1': 'https://s3api-eur-no-1.runpod.io',
  'US-CA-2': 'https://s3api-us-ca-2.runpod.io',
  'US-GA-2': 'https://s3api-us-ga-2.runpod.io',
  'US-IL-1': 'https://s3api-us-il-1.runpod.io',
  'US-KS-2': 'https://s3api-us-ks-2.runpod.io',
  'US-MD-1': 'https://s3api-us-md-1.runpod.io',
  'US-MO-1': 'https://s3api-us-mo-1.runpod.io',
  'US-MO-2': 'https://s3api-us-mo-2.runpod.io',
  'US-NC-1': 'https://s3api-us-nc-1.runpod.io',
  'US-NC-2': 'https://s3api-us-nc-2.runpod.io',
  'US-NE-1': 'https://s3api-us-ne-1.runpod.io',
  'US-WA-1': 'https://s3api-us-wa-1.runpod.io',
}

/** Tamanhos observados no inventário Comfy (referência ±2%). */
export const LTX_IA2V_EXPECTED_SIZE_BYTES: Record<string, number> = {
  'ltx-2.3-22b-dev-fp8.safetensors': 29_145_431_166,
  'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors': 2_741_024_390,
  'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors': 628_203_616,
  'gemma_3_12B_it_fp4_mixed.safetensors': 9_447_702_218,
  'ltx-2.3-spatial-upscaler-x2-1.1.safetensors': 995_743_560,
}

export type RunpodS3Object = {
  key: string
  sizeBytes: number
}

export type LtxVolumeModelMatch = {
  role: string
  fileName: string
  expectedRelativeDir: string
  present: boolean
  key: string | null
  /** Caminho típico no Pod quando o volume monta em /workspace. */
  podPathHint: string | null
  sizeBytes: number | null
  sizeGib: number | null
  expectedSizeBytes: number | null
  sizeMatchesExpected: boolean | null
  nestedPath: boolean
}

export type LtxModelsInspectionStatus =
  | 'found'
  | 'incomplete'
  | 'pending_credentials'
  | 'pending_unreachable'
  | 'not_attempted'

export function runpodS3EndpointForDataCenter(dataCenterId: string | null | undefined): string | null {
  if (!dataCenterId) return null
  const key = dataCenterId.trim().toUpperCase()
  return RUNPOD_S3_ENDPOINTS[key] ?? null
}

export function basenameKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? normalized
}

export function sizeMatchesExpected(
  actualBytes: number | null | undefined,
  expectedBytes: number | null | undefined,
  toleranceRatio = 0.02,
): boolean | null {
  if (actualBytes == null || expectedBytes == null || expectedBytes <= 0) return null
  const delta = Math.abs(actualBytes - expectedBytes) / expectedBytes
  return delta <= toleranceRatio
}

/** Localiza os 5 modelos LTX em qualquer profundidade da listagem S3. */
export function matchLtxModelsInS3Objects(objects: RunpodS3Object[]): {
  models: LtxVolumeModelMatch[]
  present: number
  required: number
  listedObjectCount: number
} {
  const byBase = new Map<string, RunpodS3Object>()
  for (const obj of objects) {
    const base = basenameKey(obj.key)
    if (!base) continue
    const prev = byBase.get(base)
    // Preferir caminho sob models/ quando houver duplicatas.
    if (!prev || /(?:^|\/)models\//i.test(obj.key)) byBase.set(base, obj)
  }

  const models: LtxVolumeModelMatch[] = LTX_IA2V_OFFICIAL_MODEL_ASSETS.map((asset) => {
    const hit = byBase.get(asset.expectedFileName) ?? null
    const expectedSize = LTX_IA2V_EXPECTED_SIZE_BYTES[asset.expectedFileName] ?? null
    const sizeBytes = hit?.sizeBytes ?? null
    const expectedDir = asset.relativeDir.replace(/^models\//, '')
    const nested =
      hit != null
        ? !hit.key.replace(/\\/g, '/').endsWith(`${asset.relativeDir}/${asset.expectedFileName}`) &&
          !hit.key.replace(/\\/g, '/').endsWith(`${expectedDir}/${asset.expectedFileName}`)
        : false
    return {
      role: asset.role,
      fileName: asset.expectedFileName,
      expectedRelativeDir: asset.relativeDir,
      present: Boolean(hit),
      key: hit?.key ?? null,
      podPathHint: hit ? `/workspace/${hit.key.replace(/^\/+/, '')}` : null,
      sizeBytes,
      sizeGib: sizeBytes != null ? Math.round((sizeBytes / 1024 ** 3) * 1000) / 1000 : null,
      expectedSizeBytes: expectedSize,
      sizeMatchesExpected: sizeMatchesExpected(sizeBytes, expectedSize),
      nestedPath: nested,
    }
  })

  return {
    models,
    present: models.filter((model) => model.present).length,
    required: LTX_IA2V_OFFICIAL_MODEL_ASSETS.length,
    listedObjectCount: objects.length,
  }
}

export function extractCommonPrefixes(keys: string[]): string[] {
  const prefixes = new Set<string>()
  for (const key of keys) {
    const normalized = key.replace(/\\/g, '/')
    const slash = normalized.indexOf('/')
    if (slash > 0) prefixes.add(normalized.slice(0, slash + 1))
  }
  return [...prefixes].sort()
}
