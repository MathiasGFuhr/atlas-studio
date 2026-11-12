import fs from 'node:fs'
import path from 'node:path'
import type {
  ComfyBatchView,
  ComfyConfig,
  ComfyConfigPatch,
  ComfyConnectionInfo,
  ComfyDiscoverResult,
  ComfyStartResult,
} from '../../../shared/comfy'
import {
  detectComfyWorkflowMapping,
  normalizeComfyConfig,
  parseComfyWorkflow,
  pickRunpodComfyPod,
  planComfyScenes,
  podIdFromComfyUrl,
} from '../../../shared/comfy'
import type {
  RunpodInfraStatus,
  RunpodPodLifecycleState,
  RunpodStartPodRequest,
  RunpodStartPreview,
  RunpodStopPodRequest,
  RunpodStopPodResult,
} from '../../../shared/runpod'
import type { LtxEnvironmentPlan, LtxEnvironmentPrepStatus } from '../../../shared/ltxEnvironment'
import { lipSyncRefRepository } from '../../repositories/lipSyncRefRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { folderExists } from '../storage/projectFolders'
import { logger } from '../logging/logger'
import { ComfyClient } from './ComfyClient'
import { ComfyQueueService } from './ComfyQueueService'
import { sqliteComfyStore } from './comfyStore'
import { coerceComfyDownloadDir, ensureComfyDownloadDir } from './outputDir'
import { createRunpodClient, listRunpodPods, resolveRunpodComfyUrl } from './runpod'
import { RunpodLifecycleManager } from './runpod/RunpodLifecycleManager'
import { ComfyConnectOrchestrator } from './runpod/comfyConnectOrchestrator'
import type {
  ComfyConnectConfirmRequest,
  ComfyConnectConfirmResult,
  ComfyConnectPrepareResult,
  ComfyConnectRefreshResult,
} from '../../../shared/comfyConnect'
import type { ComfyGpuRecoveryConfirmRequest } from '../../../shared/comfyGpuRecovery'
import {
  diagnoseLtxEnvironmentPrep,
  getLtxEnvironmentPlan,
  saveLtxEnvironmentPlan,
} from './runpod/ltxEnvironmentService'
import type { ExportLtxWorkflowResult, LtxPhase4ValidationStatus } from '../../../shared/ltxPhase4'
import type { LtxControlledValidationPlan } from '../../../shared/ltxControlledValidation'
import type { LtxAutoDetectResult } from '../../../shared/ltxAutoDetect'
import type { LtxDetectionBootResult } from '../../../shared/ltxDetectionSnapshot'
import { exportLtxWorkflowFromSqlite } from './runpod/exportLtxWorkflow'
import { validateLtxPhase4 } from './runpod/ltxPhase4Service'
import { prepareLtxControlledValidation } from './runpod/ltxControlledValidationService'
import { detectAndConfigureLtxEnvironment } from './runpod/ltxAutoDetectService'
import {
  bootstrapLtxEnvironment,
  getSavedLtxDetectionForAccount,
} from './runpod/ltxDetectionBootstrap'
import { refreshRunpodInfraStatus } from './runpod/refreshRunpodStatus'
import {
  fingerprintRunpodAccount,
  getCachedRunpodStatus,
  getRunpodStatusCacheMeta,
  setCachedRunpodStatus,
  clearRunpodStatusCache,
  withRunpodStatusInFlight,
} from './runpod/runpodStatusCache'
import { trimComfyVideoToAudio } from './trimComfyVideo'

export const runpodLifecycleManager = new RunpodLifecycleManager({
  createClient: createRunpodClient,
  getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
  getWorkflow: () => sqliteComfyStore.getWorkflow(),
  saveBaseUrl: (url) => {
    saveComfyConfig({ baseUrl: url })
  },
  getDryRunDefault: () => sqliteComfyStore.getConfig().runpodDryRunStarts,
  log: (event, data) => logger.info(event, data),
})

export const comfyConnectOrchestrator = new ComfyConnectOrchestrator({
  getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
  getConfig: () => sqliteComfyStore.getConfig(),
  saveConfig: (patch) => saveComfyConfig(patch),
  getWorkflow: () => sqliteComfyStore.getWorkflow(),
  getLtxPlan: () => getLtxEnvironmentPlan(),
  modelsPersistentlyVerified: () => {
    const saved = getSavedLtxDetectionForAccount(sqliteComfyStore.getRunpodApiKey())
    return Boolean(saved.detection?.persistence?.modelsPersistentlyVerified)
  },
  getRunpodStatus: (options) => getRunpodInfraStatus(options),
  lifecycle: runpodLifecycleManager,
  createClient: createRunpodClient,
  log: (event, data) => logger.info(event, data),
})

export async function prepareComfyConnect(): Promise<ComfyConnectPrepareResult> {
  return comfyConnectOrchestrator.prepare()
}

export async function confirmComfyConnect(
  request: ComfyConnectConfirmRequest,
): Promise<ComfyConnectConfirmResult> {
  return comfyConnectOrchestrator.confirm(request)
}

export async function confirmComfyGpuRecovery(
  request: ComfyGpuRecoveryConfirmRequest,
): Promise<ComfyConnectConfirmResult> {
  return comfyConnectOrchestrator.confirmRecovery(request)
}

export async function refreshComfyConnectStatus(): Promise<ComfyConnectRefreshResult> {
  return comfyConnectOrchestrator.refreshStatus()
}

export { prepareLipsyncControlledTest } from './runpod/lipsyncControlledTestService'
export type { LipsyncControlledTestPlan } from '../../../shared/lipsyncControlledTest'
export { prepareGpuRecoveryValidation } from './runpod/gpuRecoveryValidationService'
export type { GpuRecoveryValidationBundle } from '../../../shared/gpuRecoveryValidation'

function liveComfyDownloadDir(projectId: string | null): string | null {
  if (!projectId) return null
  const folder = projectRepository.get(projectId)?.projectFolderPath ?? null
  return ensureComfyDownloadDir(folder)
}

let editorIngestHook:
  | ((info: { batch: { projectId: string | null }; job: { sceneNumber: number }; outputPath: string }) => Promise<void>)
  | null = null

/** O Editor registra o hook depois — evita ciclo de import no boot. */
export function setComfyEditorIngestHook(
  hook: typeof editorIngestHook,
) {
  editorIngestHook = hook
}

export const comfyQueueService = new ComfyQueueService({
  store: sqliteComfyStore,
  createClient: (baseUrl) => new ComfyClient(baseUrl),
  log: (event, data) => logger.info(event, data),
  trimOutput: trimComfyVideoToAudio,
  resolveOutputDir: (batch) =>
    liveComfyDownloadDir(batch.projectId) ?? coerceComfyDownloadDir(batch.outputDir, null),
  onVideoDownloaded: async (info) => {
    if (editorIngestHook) await editorIngestHook(info)
  },
})

export function getComfyConfig(): ComfyConfig {
  return sqliteComfyStore.getConfig()
}

/** O mapeamento do workflow só muda pela importação, nunca pelo formulário. */
export function saveComfyConfig(patch: ComfyConfigPatch) {
  if (patch.runpodApiKey !== undefined) {
    sqliteComfyStore.saveRunpodApiKey(patch.runpodApiKey)
    clearRunpodStatusCache()
  }
  const current = sqliteComfyStore.getConfig()
  return sqliteComfyStore.saveConfig(
    normalizeComfyConfig({
      ...current,
      baseUrl: patch.baseUrl ?? current.baseUrl,
      queueSize: patch.queueSize ?? current.queueSize,
      durationPadding: patch.durationPadding ?? current.durationPadding,
      trimToAudio: patch.trimToAudio ?? current.trimToAudio,
      runpodAutoInfraEnabled:
        patch.runpodAutoInfraEnabled !== undefined
          ? patch.runpodAutoInfraEnabled
          : current.runpodAutoInfraEnabled,
      runpodPreferredPodId:
        patch.runpodPreferredPodId !== undefined
          ? patch.runpodPreferredPodId
          : current.runpodPreferredPodId,
      runpodDryRunStarts:
        patch.runpodDryRunStarts !== undefined ? patch.runpodDryRunStarts : current.runpodDryRunStarts,
    }),
  )
}

export function importComfyWorkflow(filePath: string): ComfyConfig {
  const text = fs.readFileSync(filePath, 'utf8')
  const workflow = parseComfyWorkflow(text)
  const mapping = detectComfyWorkflowMapping(workflow)
  sqliteComfyStore.saveWorkflow(workflow)
  const current = sqliteComfyStore.getConfig()
  return sqliteComfyStore.saveConfig({
    ...current,
    workflowName: path.basename(filePath),
    workflowMapping: mapping,
  })
}

export async function testComfyConnection(baseUrl?: string): Promise<ComfyConnectionInfo> {
  try {
    return await new ComfyClient(baseUrl ?? sqliteComfyStore.getConfig().baseUrl).systemStats()
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function discoverComfyUrl(): Promise<ComfyDiscoverResult> {
  const apiKey = sqliteComfyStore.getRunpodApiKey()
  if (!apiKey) {
    throw new Error(
      'Cole a chave da API do RunPod nas Configurações (uma vez). Depois o Atlas puxa a URL sozinho.',
    )
  }
  const current = sqliteComfyStore.getConfig()
  const preferredId = podIdFromComfyUrl(current.baseUrl)
  const pods = await listRunpodPods(apiKey)
  const preferredStillRunning = Boolean(
    preferredId && pickRunpodComfyPod(pods, preferredId)?.id === preferredId,
  )

  // Só reutiliza a URL se o pod da URL ainda estiver RUNNING com Comfy.
  if (current.baseUrl && preferredStillRunning) {
    const connection = await testComfyConnection(current.baseUrl)
    if (connection.ok) {
      return {
        ok: true,
        changed: false,
        baseUrl: current.baseUrl,
        podId: preferredId ?? '',
        podName: '',
        message: connection.message,
        connection,
      }
    }
  }

  // Pod antigo saiu / URL sem pod válido: nunca mantém endereço obsoleto como se fosse válido.
  const resolved = await resolveRunpodComfyUrl(apiKey, preferredStillRunning ? current.baseUrl : '')
  const saved = saveComfyConfig({ baseUrl: resolved.baseUrl })
  const connection = await testComfyConnection(saved.baseUrl)
  return {
    ok: connection.ok,
    changed: saved.baseUrl !== current.baseUrl,
    baseUrl: saved.baseUrl,
    podId: resolved.podId,
    podName: resolved.podName,
    message: connection.ok
      ? `URL do pod ${resolved.podName}`
      : `Pod ${resolved.podName} encontrado, mas o ComfyUI ainda não respondeu. Espere uns segundos e teste.`,
    connection,
  }
}

function applySuggestedComfyUrlIfReady(status: RunpodInfraStatus): RunpodInfraStatus {
  if (!status.comfy?.ok || !status.suggestedUrl) return status
  const suggested = status.suggestedUrl.trim()
  if (!suggested) return status
  const configured = status.configuredUrl.trim()
  const shouldApply = !configured || status.urlStale
  if (!shouldApply || suggested === configured) return status
  saveComfyConfig({ baseUrl: suggested })
  return {
    ...status,
    configuredUrl: suggested,
    urlStale: false,
  }
}

/** Snapshot em cache (sem rede). Null se nunca consultou ou conta mudou. */
export function getCachedRunpodInfraStatus(): RunpodInfraStatus | null {
  const fingerprint = fingerprintRunpodAccount(sqliteComfyStore.getRunpodApiKey())
  const cached = getCachedRunpodStatus(fingerprint)
  if (!cached) return null
  return {
    ...cached,
    lifecycle: runpodLifecycleManager.getLatest(),
    preferredPodId: sqliteComfyStore.getConfig().runpodPreferredPodId || cached.preferredPodId,
  }
}

export function getRunpodInfraStatusMeta(): {
  status: RunpodInfraStatus | null
  stale: boolean
  fetchedAtMs: number | null
} {
  const fingerprint = fingerprintRunpodAccount(sqliteComfyStore.getRunpodApiKey())
  const meta = getRunpodStatusCacheMeta(fingerprint)
  if (!meta.status) return meta
  return {
    ...meta,
    status: {
      ...meta.status,
      lifecycle: runpodLifecycleManager.getLatest(),
      preferredPodId: sqliteComfyStore.getConfig().runpodPreferredPodId || meta.status.preferredPodId,
    },
  }
}

/**
 * Status somente-leitura da conta Runpod + Comfy (Fase 1/2).
 * Usa cache + dedupe; `force` ignora TTL e força novo GET.
 */
export async function getRunpodInfraStatus(options?: {
  force?: boolean
}): Promise<RunpodInfraStatus> {
  const apiKey = sqliteComfyStore.getRunpodApiKey()
  const fingerprint = fingerprintRunpodAccount(apiKey)
  const force = Boolean(options?.force)
  const meta = getRunpodStatusCacheMeta(fingerprint)

  if (!force && meta.status && !meta.stale) {
    return {
      ...meta.status,
      lifecycle: runpodLifecycleManager.getLatest(),
      preferredPodId: sqliteComfyStore.getConfig().runpodPreferredPodId || meta.status.preferredPodId,
    }
  }

  return withRunpodStatusInFlight(
    async () => {
      const config = sqliteComfyStore.getConfig()
      let status = await refreshRunpodInfraStatus({
        getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
        getConfiguredUrl: () => config.baseUrl,
        getAutoInfraEnabled: () => config.runpodAutoInfraEnabled,
        getPreferredPodId: () => config.runpodPreferredPodId || null,
        getDryRunStarts: () => config.runpodDryRunStarts,
        getLifecycle: () => runpodLifecycleManager.getLatest(),
        testComfy: testComfyConnection,
      })
      status = applySuggestedComfyUrlIfReady(status)
      setCachedRunpodStatus(fingerprintRunpodAccount(sqliteComfyStore.getRunpodApiKey()), status)
      return status
    },
    { force },
  )
}

export async function previewRunpodPodStart(podId: string): Promise<RunpodStartPreview> {
  return runpodLifecycleManager.previewStart(podId)
}

export async function startRunpodExistingPod(
  request: RunpodStartPodRequest,
): Promise<RunpodPodLifecycleState> {
  if (request.podId.trim()) {
    saveComfyConfig({ runpodPreferredPodId: request.podId.trim() })
  }
  return runpodLifecycleManager.startExistingPod(request)
}

export async function stopRunpodExistingPod(
  request: RunpodStopPodRequest,
): Promise<RunpodStopPodResult> {
  const config = sqliteComfyStore.getConfig()
  const result = await runpodLifecycleManager.stopExistingPod(request, {
    currentBaseUrl: config.baseUrl,
  })
  // Força próximo status a reler pods (EXITED) sem cache velho.
  clearRunpodStatusCache()
  return result
}

export async function cleanupSupersededRunpodPodsForAccount(options?: {
  dryRun?: boolean
  keepPodId?: string | null
}): Promise<import('./runpod/podCleanupService').CleanupSupersededPodsResult> {
  const { cleanupSupersededRunpodPods } = await import('./runpod/podCleanupService')
  const config = sqliteComfyStore.getConfig()
  const status = await getRunpodInfraStatus({ force: true })
  const keepPodId =
    options?.keepPodId?.trim() ||
    config.runpodPreferredPodId ||
    status.preferredPodId ||
    status.selectedPod?.id ||
    null
  const dryRun = options?.dryRun ?? config.runpodDryRunStarts
  const result = await cleanupSupersededRunpodPods({
    pods: status.pods,
    keepPodId,
    dryRun,
    createClient: createRunpodClient,
    getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
    log: (event, data) => logger.info(event, data),
  })
  if (result.terminated.length > 0) clearRunpodStatusCache()
  return result
}

export function getRunpodPodLifecycle(): RunpodPodLifecycleState | null {
  return runpodLifecycleManager.getLatest()
}

export function getLtxEnvPlan(): LtxEnvironmentPlan {
  return getLtxEnvironmentPlan()
}

export function saveLtxEnvPlan(patch: Partial<LtxEnvironmentPlan>): LtxEnvironmentPlan {
  return saveLtxEnvironmentPlan(patch)
}

/** Diagnóstico Fase 3 — somente leitura / dry-run. */
export async function getLtxEnvironmentStatus(): Promise<LtxEnvironmentPrepStatus> {
  return diagnoseLtxEnvironmentPrep({
    getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
    getWorkflow: () => sqliteComfyStore.getWorkflow(),
    getWorkflowName: () => sqliteComfyStore.getConfig().workflowName,
  })
}

/** Exporta o workflow real do SQLite (API JSON) — Fase 4. */
export function exportLtxWorkflow(): ExportLtxWorkflowResult {
  return exportLtxWorkflowFromSqlite({
    workflow: sqliteComfyStore.getWorkflow(),
    workflowName: sqliteComfyStore.getConfig().workflowName,
  })
}

/** Validação controlada Fase 4 — dry-run; sem provisionamento pago. */
export async function validateLtxPhase4Environment(): Promise<LtxPhase4ValidationStatus> {
  const config = sqliteComfyStore.getConfig()
  return validateLtxPhase4({
    getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
    getWorkflow: () => sqliteComfyStore.getWorkflow(),
    getWorkflowName: () => config.workflowName,
    getComfyBaseUrl: () => config.baseUrl,
    getPreferredPodId: () => config.runpodPreferredPodId || null,
  })
}

/** Pré-Fase 5 — plano de validação real controlada (dry-run / aprovação). */
export async function prepareLtxControlledValidationPlan(): Promise<LtxControlledValidationPlan> {
  const config = sqliteComfyStore.getConfig()
  return prepareLtxControlledValidation({
    getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
    getComfyBaseUrl: () => config.baseUrl,
    getPreferredPodId: () => config.runpodPreferredPodId || null,
    getWorkflowName: () => config.workflowName,
  })
}

function ltxDetectDeps(mode?: 'full' | 'light' | 'auto') {
  const config = sqliteComfyStore.getConfig()
  return {
    getApiKey: () => sqliteComfyStore.getRunpodApiKey(),
    getWorkflow: () => sqliteComfyStore.getWorkflow(),
    getWorkflowName: () => config.workflowName,
    getComfyBaseUrl: () => config.baseUrl,
    getPreferredPodId: () => config.runpodPreferredPodId || null,
    getS3Credentials: () => sqliteComfyStore.getRunpodS3Credentials(),
    mode,
  }
}

/** Detectar e configurar ambiente LTX (somente leitura + salvar preferências). */
export async function detectLtxEnvironmentAuto(options?: {
  forceFullScan?: boolean
}): Promise<LtxAutoDetectResult> {
  return detectAndConfigureLtxEnvironment({
    ...ltxDetectDeps(options?.forceFullScan ? 'full' : 'auto'),
    persistSnapshot: true,
  })
}

/** Snapshot salvo da conta atual (sem rede). */
export function getSavedLtxDetection(): {
  detection: LtxAutoDetectResult | null
  savedAt: string | null
  inventoryVerifiedAt: string | null
} {
  const { snapshot, detection } = getSavedLtxDetectionForAccount(sqliteComfyStore.getRunpodApiKey())
  return {
    detection,
    savedAt: snapshot?.savedAt ?? null,
    inventoryVerifiedAt: snapshot?.inventoryVerifiedAt ?? null,
  }
}

/**
 * Ao abrir Configurações: restaura estado salvo e atualiza leve (sem S3 completo se fresco).
 * Não inicia GPU.
 */
export async function bootstrapLtxEnvironmentAuto(options?: {
  forceFullScan?: boolean
}): Promise<LtxDetectionBootResult> {
  return bootstrapLtxEnvironment({
    ...ltxDetectDeps(options?.forceFullScan ? 'full' : 'auto'),
    forceFullScan: options?.forceFullScan,
    persistSnapshot: true,
  })
}

export function getRunpodS3CredentialStatus(): {
  configured: boolean
  accessKeyPreview: string | null
} {
  const creds = sqliteComfyStore.getRunpodS3Credentials()
  if (!creds) return { configured: false, accessKeyPreview: null }
  const id = creds.accessKeyId
  const preview = id.length <= 10 ? `${id.slice(0, 4)}…` : `${id.slice(0, 8)}…${id.slice(-4)}`
  return { configured: true, accessKeyPreview: preview }
}

export function saveRunpodS3CredentialBundle(input: {
  accessKeyId: string
  secretAccessKey: string
} | null): { configured: boolean; accessKeyPreview: string | null } {
  if (!input?.accessKeyId?.trim() || !input?.secretAccessKey?.trim()) {
    sqliteComfyStore.saveRunpodS3Credentials(null)
    return { configured: false, accessKeyPreview: null }
  }
  sqliteComfyStore.saveRunpodS3Credentials({
    accessKeyId: input.accessKeyId.trim(),
    secretAccessKey: input.secretAccessKey.trim(),
  })
  return getRunpodS3CredentialStatus()
}

/**
 * Após cadastrar S3: roda configuração inicial uma vez (GET/S3 list read-only).
 * Não inicia GPU.
 */
export async function saveRunpodS3CredentialsAndBootstrap(input: {
  accessKeyId: string
  secretAccessKey: string
} | null): Promise<{
  configured: boolean
  accessKeyPreview: string | null
  boot: LtxDetectionBootResult | null
}> {
  const status = saveRunpodS3CredentialBundle(input)
  if (!status.configured) return { ...status, boot: null }
  const boot = await bootstrapLtxEnvironmentAuto({ forceFullScan: true })
  return { ...status, boot }
}

function withProjectName(view: ComfyBatchView | null): ComfyBatchView | null {
  if (!view) return null
  const name = view.batch.projectId ? projectRepository.get(view.batch.projectId)?.name ?? null : null
  return { ...view, projectName: name }
}

export function listComfyViews(): ComfyBatchView[] {
  return comfyQueueService.listViews().map((view) => withProjectName(view)!)
}

export function latestComfyView(): ComfyBatchView | null {
  return withProjectName(comfyQueueService.latestView())
}

/** Lotes em andamento passam a gravar em `{pasta vinculada}/lipsync`. */
export function remapActiveComfyOutputDirs() {
  for (const batch of sqliteComfyStore.activeBatches()) {
    const resolved = liveComfyDownloadDir(batch.projectId)
    if (!resolved) continue
    if (path.resolve(batch.outputDir) === resolved) continue
    sqliteComfyStore.updateBatch(batch.id, { outputDir: resolved })
  }
}

/**
 * Envia as cenas ativas do projeto. Os vídeos vão para `{pasta vinculada}/lipsync`
 * (`1.mp4`, `2.mp4`…). Nunca para outro lugar.
 */
export function startComfyBatch(projectId: string | null, refIds?: string[] | null): ComfyStartResult {
  if (!projectId?.trim()) throw new Error('Selecione um projeto para gerar.')
  const project = projectRepository.get(projectId)
  if (!project) throw new Error('Projeto não encontrado.')
  const folder = project.projectFolderPath?.trim() ?? ''
  if (!folder || !folderExists(folder)) {
    throw new Error(
      'Vincule a pasta das imagens e áudios neste projeto (Puxar da pasta). Os vídeos são gravados em lipsync, dentro dessa pasta.',
    )
  }
  const outputDir = ensureComfyDownloadDir(folder)
  if (!outputDir) {
    throw new Error(
      'Vincule a pasta das imagens e áudios neste projeto (Puxar da pasta). Os vídeos são gravados em lipsync, dentro dessa pasta.',
    )
  }
  const only = Array.isArray(refIds)
    ? refIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []
  const config = sqliteComfyStore.getConfig()
  const refs = lipSyncRefRepository.list({ status: 'active', projectId })
  const { scenes, problems } = planComfyScenes(
    refs,
    config.durationPadding,
    only.length > 0 ? { refIds: only } : undefined,
  )
  const view = withProjectName(comfyQueueService.startBatch({ projectId, outputDir, scenes }))!
  return { view, skipped: problems }
}
