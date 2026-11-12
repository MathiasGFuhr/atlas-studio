/**
 * Prepara checklist do teste real LipSync (1 cena) sem iniciar GPU.
 */

import { COMFY_DOWNLOAD_SUBDIR } from '../../../../shared/comfy'
import {
  buildLipsyncControlledTestPlan,
  type LipsyncControlledTestPlan,
} from '../../../../shared/lipsyncControlledTest'
import { pickLtxComfyPod } from '../../../../shared/ltxAutoDetect'
import { lipSyncRefRepository } from '../../../repositories/lipSyncRefRepository'
import { projectRepository } from '../../../repositories/projectRepository'
import { folderExists } from '../../storage/projectFolders'
import { sqliteComfyStore } from '../comfyStore'
import { ensureComfyDownloadDir } from '../outputDir'
import { getLtxEnvironmentPlan } from './ltxEnvironmentService'
import { getSavedLtxDetectionForAccount } from './ltxDetectionBootstrap'
import { createRunpodClient } from '../runpod'
import { summarizeV2Pod } from './mapRunpodV2'
import { assessLtxPodCompatibility } from '../../../../shared/runpodLtxCompat'

function sceneNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

export async function prepareLipsyncControlledTest(options?: {
  projectId?: string | null
  refId?: string | null
}): Promise<LipsyncControlledTestPlan> {
  const config = sqliteComfyStore.getConfig()
  const plan = getLtxEnvironmentPlan()
  const apiKey = sqliteComfyStore.getRunpodApiKey()
  const saved = getSavedLtxDetectionForAccount(apiKey)
  const modelsPersistentlyVerified = Boolean(
    saved.detection?.persistence?.modelsPersistentlyVerified,
  )

  let preferredPod = null as ReturnType<typeof summarizeV2Pod> | null
  if (apiKey.trim()) {
    try {
      const client = createRunpodClient(apiKey)
      const pods = (await client.listPods()).map(summarizeV2Pod).map((pod) => ({
        ...pod,
        ltxCompat: assessLtxPodCompatibility(pod),
      }))
      const preferredId = config.runpodPreferredPodId.trim()
      preferredPod =
        (preferredId ? pods.find((pod) => pod.id === preferredId) : null) ??
        pods.find(
          (pod) =>
            pod.hasComfyPort &&
            plan.preferredDataCenterId &&
            pod.dataCenterId === plan.preferredDataCenterId,
        ) ??
        pickLtxComfyPod(pods)
    } catch {
      preferredPod = null
    }
  }

  const projectId = options?.projectId?.trim() || null
  const refs = projectId
    ? lipSyncRefRepository.list({ status: 'active', projectId })
    : []
  const requested = options?.refId?.trim()
  const shortScene =
    (requested ? refs.find((ref) => ref.id === requested) : null) ??
    refs.find((ref) => ref.imagePath?.trim() && ref.audioPath?.trim() && ref.prompt?.trim()) ??
    refs[0] ??
    null
  const sceneIndex = shortScene ? refs.findIndex((ref) => ref.id === shortScene.id) : -1

  const project = projectId ? projectRepository.get(projectId) : null
  const folder = project?.projectFolderPath?.trim() ?? ''
  const outputDir =
    folder && folderExists(folder)
      ? ensureComfyDownloadDir(folder) ?? `${folder.replace(/[\\/]+$/, '')}\\${COMFY_DOWNLOAD_SUBDIR}`
      : null

  return buildLipsyncControlledTestPlan({
    config,
    preferredPod,
    volumeDataCenterId: plan.preferredDataCenterId,
    modelsPersistentlyVerified,
    scene: {
      refId: shortScene?.id ?? null,
      label: shortScene?.label ?? null,
      number: sceneIndex >= 0 ? sceneNumber(sceneIndex) : null,
      imagePath: shortScene?.imagePath ?? null,
      audioPath: shortScene?.audioPath ?? null,
      prompt: shortScene?.prompt ?? null,
      outputDir,
    },
  })
}
