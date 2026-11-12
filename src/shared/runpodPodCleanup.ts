import type { RunpodPodSummary } from './runpod'

/** Nome base sem sufixo de migrate/recovery. */
export function runpodPodBaseName(name: string | null | undefined): string {
  return String(name || '')
    .replace(/[-_\s]?(migration|migrated|recovery|recovered)\b.*$/i, '')
    .trim()
}

export function isMigrationPodName(name: string | null | undefined): boolean {
  return /migration|migrated|recovery|recovered/i.test(String(name || ''))
}

/**
 * Pods EXITED/ERROR substituídos por um *-migration (ou equivalente).
 * Nunca inclui o Pod a manter, nem RUNNING.
 */
export function findSupersededRunpodPods(
  pods: RunpodPodSummary[],
  keepPodId: string | null,
): RunpodPodSummary[] {
  const keep = keepPodId?.trim() || null
  const migrations = pods.filter((pod) => isMigrationPodName(pod.name))
  if (migrations.length === 0) return []

  const out = new Map<string, RunpodPodSummary>()
  for (const mig of migrations) {
    const base = runpodPodBaseName(mig.name).toLowerCase()
    if (!base) continue
    for (const pod of pods) {
      if (pod.id === keep || pod.id === mig.id) continue
      const status = String(pod.status || '').toUpperCase()
      if (status === 'RUNNING' || status === 'STARTING' || status === 'PROVISIONING') continue
      if (status !== 'EXITED' && status !== 'ERROR') continue
      if (isMigrationPodName(pod.name)) continue
      const podBase = runpodPodBaseName(pod.name).toLowerCase()
      if (podBase === base || String(pod.name || '').toLowerCase() === base) {
        out.set(pod.id, pod)
      }
    }
  }
  return [...out.values()]
}
