/**
 * Cache em memória do status Runpod (GET-only).
 * Invalidado quando a conta (fingerprint da API key) muda.
 */

import { createHash } from 'node:crypto'
import type { RunpodInfraStatus } from '../../../../shared/runpod'

export const RUNPOD_STATUS_STALE_MS = 30_000

export type RunpodStatusCacheEntry = {
  accountFingerprint: string | null
  status: RunpodInfraStatus
  fetchedAtMs: number
}

let cache: RunpodStatusCacheEntry | null = null
let inFlight: Promise<RunpodInfraStatus> | null = null

export function fingerprintRunpodAccount(apiKey: string): string | null {
  const key = apiKey.trim()
  if (!key) return null
  return createHash('sha256').update(`atlas-runpod-status:${key}`).digest('hex').slice(0, 16)
}

export function getCachedRunpodStatus(accountFingerprint: string | null): RunpodInfraStatus | null {
  if (!cache) return null
  if (cache.accountFingerprint !== accountFingerprint) {
    cache = null
    return null
  }
  return cache.status
}

export function isRunpodStatusStale(entryFetchedAtMs: number, nowMs = Date.now()): boolean {
  return nowMs - entryFetchedAtMs >= RUNPOD_STATUS_STALE_MS
}

export function getRunpodStatusCacheMeta(accountFingerprint: string | null): {
  status: RunpodInfraStatus | null
  stale: boolean
  fetchedAtMs: number | null
} {
  const status = getCachedRunpodStatus(accountFingerprint)
  if (!status || !cache) return { status: null, stale: true, fetchedAtMs: null }
  return {
    status,
    stale: isRunpodStatusStale(cache.fetchedAtMs),
    fetchedAtMs: cache.fetchedAtMs,
  }
}

export function setCachedRunpodStatus(
  accountFingerprint: string | null,
  status: RunpodInfraStatus,
  fetchedAtMs = Date.now(),
): void {
  cache = { accountFingerprint, status, fetchedAtMs }
}

export function clearRunpodStatusCache(): void {
  cache = null
}

export function getRunpodStatusInFlight(): Promise<RunpodInfraStatus> | null {
  return inFlight
}

export function setRunpodStatusInFlight(promise: Promise<RunpodInfraStatus> | null): void {
  inFlight = promise
}

/** Deduplica refreshes concorrentes. */
export async function withRunpodStatusInFlight(
  run: () => Promise<RunpodInfraStatus>,
  options?: { force?: boolean },
): Promise<RunpodInfraStatus> {
  if (!options?.force && inFlight) return inFlight
  const promise = run().finally(() => {
    if (inFlight === promise) inFlight = null
  })
  inFlight = promise
  return promise
}
