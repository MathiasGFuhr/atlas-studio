import { findSupersededRunpodPods } from '../../../../shared/runpodPodCleanup'
import type { RunpodPodSummary } from '../../../../shared/runpod'
import type { RunpodClientV2 } from './RunpodClientV2'

export type CleanupSupersededPodsResult = {
  dryRun: boolean
  candidates: Array<{ id: string; name: string; status: string }>
  terminated: Array<{ id: string; name: string }>
  failed: Array<{ id: string; name: string; error: string }>
  message: string
}

export async function cleanupSupersededRunpodPods(input: {
  pods: RunpodPodSummary[]
  keepPodId: string | null
  dryRun: boolean
  createClient: (apiKey: string) => RunpodClientV2
  getApiKey: () => string
  log?: (event: string, data?: Record<string, unknown>) => void
}): Promise<CleanupSupersededPodsResult> {
  const candidates = findSupersededRunpodPods(input.pods, input.keepPodId)
  const listed = candidates.map((pod) => ({
    id: pod.id,
    name: pod.name,
    status: String(pod.status),
  }))

  if (candidates.length === 0) {
    return {
      dryRun: input.dryRun,
      candidates: [],
      terminated: [],
      failed: [],
      message: 'Nenhum Pod antigo substituído para remover.',
    }
  }

  if (input.dryRun) {
    return {
      dryRun: true,
      candidates: listed,
      terminated: [],
      failed: [],
      message: `Simulação: removeria ${candidates.length} Pod(s) antigo(s) substituído(s) pela migration.`,
    }
  }

  const apiKey = input.getApiKey().trim()
  if (!apiKey) {
    return {
      dryRun: false,
      candidates: listed,
      terminated: [],
      failed: listed.map((row) => ({ ...row, error: 'Chave RunPod ausente.' })),
      message: 'Sem chave RunPod — limpeza não executada.',
    }
  }

  const client = input.createClient(apiKey)
  const terminated: CleanupSupersededPodsResult['terminated'] = []
  const failed: CleanupSupersededPodsResult['failed'] = []

  for (const pod of candidates) {
    try {
      input.log?.('runpod.cleanup.terminate', { podId: pod.id, name: pod.name })
      await client.terminatePod(pod.id)
      terminated.push({ id: pod.id, name: pod.name })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failed.push({ id: pod.id, name: pod.name, error: message })
      input.log?.('runpod.cleanup.terminate_failed', { podId: pod.id, message })
    }
  }

  return {
    dryRun: false,
    candidates: listed,
    terminated,
    failed,
    message: terminated.length
      ? `Removidos ${terminated.length} Pod(s) antigo(s)${failed.length ? ` · ${failed.length} falha(s)` : ''}. Volume preservado.`
      : `Não foi possível remover Pods antigos${failed.length ? `: ${failed[0]?.error}` : ''}.`,
  }
}
