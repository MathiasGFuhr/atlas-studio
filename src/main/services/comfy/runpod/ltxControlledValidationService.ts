/**
 * Pré-Fase 5 — monta plano de validação controlada (dry-run).
 * Sem create volume/pod e sem start automático de GPU.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  buildLtxControlledValidationPlan,
  type LtxControlledValidationPlan,
  type LtxModelInventoryRow,
} from '../../../../shared/ltxControlledValidation'
import { logger } from '../../logging/logger'
import { ComfyClient } from '../ComfyClient'
import { createRunpodClient } from '../runpod'
import { summarizeGpuType, summarizeNetworkVolume, summarizeV2Pod } from './mapRunpodV2'
import { getLtxEnvironmentPlan } from './ltxEnvironmentService'

const TARGET_MODELS: Array<{ folder: string; fileName: string; role: string; versionHint: string }> = [
  {
    folder: 'checkpoints',
    fileName: 'ltx-2.3-22b-dev-fp8.safetensors',
    role: 'checkpoint',
    versionHint: 'LTX-2.3 22B FP8',
  },
  {
    folder: 'loras',
    fileName: 'ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors',
    role: 'lora',
    versionHint: 'distilled 1.1',
  },
  {
    folder: 'loras',
    fileName: 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
    role: 'lora',
    versionHint: 'gemma abliterated rank64 bf16',
  },
  {
    folder: 'text_encoders',
    fileName: 'gemma_3_12B_it_fp4_mixed.safetensors',
    role: 'text_encoder',
    versionHint: 'Gemma 3 12B FP4 mixed',
  },
  {
    folder: 'latent_upscale_models',
    fileName: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
    role: 'upscaler',
    versionHint: 'spatial upscaler x2 1.1',
  },
]

export type ControlledValidationDeps = {
  getApiKey: () => string
  getComfyBaseUrl: () => string
  getPreferredPodId: () => string | null
  getWorkflowName: () => string
  createClient?: typeof createRunpodClient
  resourcesDir?: string
  writeReport?: boolean
}

async function inventoryModelsFromComfy(baseUrl: string): Promise<{
  models: LtxModelInventoryRow[]
  totalBytes: number
  totalGib: number
  recommendedNetworkVolumeGb: number
}> {
  if (!baseUrl.trim()) {
    return {
      models: TARGET_MODELS.map((t) => ({
        role: t.role,
        fileName: t.fileName,
        folder: t.folder,
        absolutePath: null,
        sizeBytes: null,
        sizeGib: null,
        versionHint: t.versionHint,
        present: false,
        sha256: null,
        sha256Status: 'missing_file',
        sha256Command: `sha256sum -b "/workspace/runpod-slim/ComfyUI/models/${t.folder}/${t.fileName}"`,
      })),
      totalBytes: 0,
      totalGib: 0,
      recommendedNetworkVolumeGb: 50,
    }
  }

  const client = new ComfyClient(baseUrl)
  // Usa fetch direto nos endpoints experiment (somente GET)
  const getJson = async (route: string) => {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${route}`, {
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`${route} → ${response.status}`)
    return response.json()
  }

  const folderMeta = (await getJson('/experiment/models')) as Array<{
    name: string
    folders?: string[]
  }>
  const folderMap = Object.fromEntries(folderMeta.map((row) => [row.name, row]))

  const models: LtxModelInventoryRow[] = []
  for (const target of TARGET_MODELS) {
    const listed = (await getJson(`/experiment/models/${encodeURIComponent(target.folder)}`)) as Array<{
      name: string
      pathIndex?: number
      size?: number
    }>
    const hit = listed.find((row) => row.name === target.fileName)
    const pathIndex = hit?.pathIndex ?? 0
    const absDir = folderMap[target.folder]?.folders?.[pathIndex] ?? null
    const absolutePath = absDir ? `${absDir.replace(/\/+$/, '')}/${target.fileName}` : null
    const sizeBytes = typeof hit?.size === 'number' ? hit.size : null
    models.push({
      role: target.role,
      fileName: target.fileName,
      folder: target.folder,
      absolutePath,
      sizeBytes,
      sizeGib: sizeBytes != null ? Math.round((sizeBytes / 1024 ** 3) * 1000) / 1000 : null,
      versionHint: target.versionHint,
      present: Boolean(hit),
      sha256: null,
      sha256Status: hit ? 'pending_readonly_shell' : 'missing_file',
      sha256Command: absolutePath
        ? `sha256sum -b "${absolutePath}"`
        : `sha256sum -b "/workspace/runpod-slim/ComfyUI/models/${target.folder}/${target.fileName}"`,
    })
  }

  void client
  const totalBytes = models.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0)
  const totalGib = Math.round((totalBytes / 1024 ** 3) * 1000) / 1000
  const recommendedNetworkVolumeGb = Math.ceil(((totalBytes * 1.15) / 1024 ** 3) / 5) * 5 || 50
  return { models, totalBytes, totalGib, recommendedNetworkVolumeGb }
}

export async function prepareLtxControlledValidation(
  deps: ControlledValidationDeps,
): Promise<LtxControlledValidationPlan> {
  const plan = getLtxEnvironmentPlan()
  const baseUrl = deps.getComfyBaseUrl()
  const log = (event: string, data?: Record<string, unknown>) => logger.info(event, data)
  log('ltx.controlled_validation.start', { dryRun: true })

  let runtime = {
    comfyuiVersion: null as string | null,
    pytorchVersion: null as string | null,
    pythonVersion: null as string | null,
    gpuName: null as string | null,
    vramTotalGb: null as number | null,
  }

  try {
    if (baseUrl.trim()) {
      const client = new ComfyClient(baseUrl)
      const raw = await client.systemStatsRaw()
      const device = raw.devices?.[0]
      runtime = {
        comfyuiVersion: raw.system?.comfyui_version ?? null,
        pytorchVersion: raw.system?.pytorch_version ?? null,
        pythonVersion: raw.system?.python_version ?? null,
        gpuName: device?.name ?? null,
        vramTotalGb: device?.vram_total
          ? Math.round((device.vram_total / 1024 ** 3) * 10) / 10
          : null,
      }
    }
  } catch (error) {
    log('ltx.controlled_validation.runtime_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const modelInventory = await inventoryModelsFromComfy(baseUrl).catch(() => ({
    models: [] as LtxModelInventoryRow[],
    totalBytes: 0,
    totalGib: 0,
    recommendedNetworkVolumeGb: 50,
  }))

  let pods: ReturnType<typeof summarizeV2Pod>[] = []
  let catalog: ReturnType<typeof summarizeGpuType>[] = []
  let networkVolumes: ReturnType<typeof summarizeNetworkVolume>[] = []
  let dataCenters: Awaited<ReturnType<ReturnType<typeof createRunpodClient>['listDataCenters']>> = []

  const apiKey = deps.getApiKey().trim()
  if (apiKey) {
    try {
      const client = (deps.createClient ?? createRunpodClient)(apiKey)
      const [podsV2, gpus, volumes, dcs] = await Promise.all([
        client.listPods(),
        client.listGpuTypes({ includeAvailability: true }).catch(() => []),
        client.listNetworkVolumes().catch(() => []),
        client.listDataCenters({ includeGpuAvailability: true }).catch(() => []),
      ])
      pods = podsV2.filter((pod) => pod.id).map(summarizeV2Pod)
      catalog = gpus.map(summarizeGpuType)
      networkVolumes = volumes.map(summarizeNetworkVolume)
      dataCenters = dcs
    } catch (error) {
      log('ltx.controlled_validation.api_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const report = buildLtxControlledValidationPlan({
    plan,
    pods,
    catalog,
    networkVolumes,
    dataCenters,
    modelInventory,
    runtime,
    preferredPodId: deps.getPreferredPodId(),
    workflowName: deps.getWorkflowName(),
    currentComfyBaseUrl: baseUrl,
  })

  if (deps.writeReport !== false) {
    const dir = deps.resourcesDir ?? path.join(process.cwd(), 'resources', 'ltx-environment')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'controlled-validation-report.json'), `${JSON.stringify(report, null, 2)}\n`)
    const checksum = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'OUT=/workspace/ltx-model-sha256.txt',
      ': > "$OUT"',
      ...report.modelInventory.models.map((m) => `sha256sum -b "${m.absolutePath ?? m.fileName}" | tee -a "$OUT"`),
      'echo "DONE" | tee -a "$OUT"',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(dir, 'checksum-models-readonly.sh'), checksum)
  }

  log('ltx.controlled_validation.done', {
    models: report.modelInventory.models.length,
    sha256Pending: report.modelInventory.sha256Pending,
    currentDc: report.dataCenters.currentPodDataCenterId,
    nvOnCurrentDc: report.dataCenters.currentPodSupportsNetworkVolume,
  })

  return report
}
