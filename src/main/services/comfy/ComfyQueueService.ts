import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  ComfyApiWorkflow,
  ComfyBatch,
  ComfyBatchView,
  ComfyJob,
  ComfyScenePlan,
  ComfyWorkflowMapping,
} from '../../../shared/comfy'
import {
  COMFY_ACTIVE_STATUSES,
  COMFY_TERMINAL_STATUSES,
  buildComfySceneWorkflow,
  comfyOutputPrefix,
  comfyUploadName,
  countComfyJobs,
  estimateComfyTiming,
  jobsToSubmit,
  pickComfyVideoOutput,
  randomComfySeed,
  sceneOutputFileName,
} from '../../../shared/comfy'
import { ComfyUnreachableError, comfyExecutionError, type ComfyApi, type ComfyQueueState } from './ComfyClient'
import type { ComfyStore, StoredComfyJob } from './comfyStore'

const TICK_MS = 3_000

export type ComfyQueueDeps = {
  store: ComfyStore
  createClient: (baseUrl: string) => ComfyApi
  log?: (event: string, data?: Record<string, unknown>) => void
  /** Corta o vídeo baixado no tempo do áudio da cena. Falha aqui não perde o arquivo. */
  trimOutput?: (videoPath: string, audioPath: string) => Promise<unknown>
  /** Destino ao vivo: a pasta lipsync vinculada ao projeto, nunca um caminho antigo. */
  resolveOutputDir?: (batch: ComfyBatch) => string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Janela deslizante sobre a fila do ComfyUI: mantém até `queueSize` cenas enviadas, baixa cada
 * vídeo assim que termina e envia a próxima. O estado vive no SQLite, então sobrevive a reinícios
 * do Atlas e do pod.
 */
export class ComfyQueueService {
  private readonly store: ComfyStore
  private readonly createClient: (baseUrl: string) => ComfyApi
  private readonly log: NonNullable<ComfyQueueDeps['log']>
  private readonly trimOutput: NonNullable<ComfyQueueDeps['trimOutput']>
  private readonly resolveOutputDir: (batch: ComfyBatch) => string
  private readonly clientId = randomUUID()
  private readonly downloads = new Map<string, Promise<void>>()
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking: Promise<void> | null = null

  constructor(deps: ComfyQueueDeps) {
    this.store = deps.store
    this.createClient = deps.createClient
    this.log = deps.log ?? (() => {})
    this.trimOutput = deps.trimOutput ?? (async () => undefined)
    this.resolveOutputDir = deps.resolveOutputDir ?? ((batch) => batch.outputDir)
  }

  /** Ao abrir o Atlas: envios interrompidos no meio voltam para a fila e o lote continua. */
  resumeOnBoot() {
    for (const batch of this.store.activeBatches()) {
      for (const job of this.store.listJobs(batch.id)) {
        if (job.status === 'uploading') this.store.updateJob(job.id, { status: 'pending' })
      }
    }
    if (this.store.activeBatches().length > 0) this.ensureTimer()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  startBatch(input: { projectId: string | null; outputDir: string; scenes: ComfyScenePlan[] }): ComfyBatchView {
    if (input.scenes.length === 0) throw new Error('Nenhuma cena pronta para enviar.')
    const active = this.store.activeBatches()
    if (active.some((batch) => batch.projectId === input.projectId)) {
      throw new Error('Este projeto já está gerando. Minimize o painel e abra outro projeto para o próximo vídeo.')
    }
    this.requireSetup()

    const now = new Date().toISOString()
    const batch: ComfyBatch = {
      id: randomUUID(),
      projectId: input.projectId,
      outputDir: input.outputDir,
      status: 'running',
      lastError: null,
      createdAt: now,
      updatedAt: now,
    }
    const jobs: ComfyJob[] = input.scenes.map((scene) => ({
      id: randomUUID(),
      batchId: batch.id,
      refId: scene.refId,
      sceneNumber: scene.sceneNumber,
      imagePath: scene.imagePath,
      audioPath: scene.audioPath,
      prompt: scene.prompt,
      duration: scene.duration,
      seed: randomComfySeed(),
      status: 'pending',
      promptId: null,
      outputPath: null,
      error: null,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    }))
    this.store.createBatch(batch, jobs)
    this.log('comfy.batch.start', { batchId: batch.id, scenes: jobs.length })
    this.ensureTimer()
    void this.tick()
    return this.view(batch.id)!
  }

  view(batchId: string): ComfyBatchView | null {
    const batch = this.store.getBatch(batchId)
    if (!batch) return null
    const jobs: ComfyJob[] = this.store.listJobs(batchId)
    return {
      batch,
      jobs,
      counts: countComfyJobs(jobs),
      projectName: null,
      timing: estimateComfyTiming(batch, jobs),
    }
  }

  latestView(): ComfyBatchView | null {
    const batch = this.store.latestBatch()
    return batch ? this.view(batch.id) : null
  }

  listViews(): ComfyBatchView[] {
    const active = this.store.activeBatches()
    const latest = this.store.latestBatch()
    const views = active.map((batch) => this.view(batch.id)).filter((view): view is ComfyBatchView => Boolean(view))
    if (latest && !views.some((view) => view.batch.id === latest.id)) {
      const extra = this.view(latest.id)
      if (extra) views.push(extra)
    }
    return views
  }

  pause(batchId: string): ComfyBatchView | null {
    const batch = this.store.getBatch(batchId)
    if (batch?.status === 'running') this.store.updateBatch(batchId, { status: 'paused' })
    return this.view(batchId)
  }

  resume(batchId: string): ComfyBatchView | null {
    const batch = this.store.getBatch(batchId)
    if (batch?.status === 'paused') {
      this.store.updateBatch(batchId, { status: 'running', lastError: null })
      this.ensureTimer()
      void this.tick()
    }
    return this.view(batchId)
  }

  /** Volta as cenas com erro (e canceladas) para a fila, com novas tentativas. */
  retryFailed(batchId: string): ComfyBatchView | null {
    const batch = this.store.getBatch(batchId)
    if (!batch) return null
    let retried = 0
    for (const job of this.store.listJobs(batchId)) {
      if (job.status !== 'error' && job.status !== 'canceled') continue
      this.store.updateJob(job.id, { status: 'pending', promptId: null, error: null, attempts: 0, output: null })
      retried += 1
    }
    if (retried > 0) {
      this.store.updateBatch(batchId, { status: 'running', lastError: null })
      this.ensureTimer()
      void this.tick()
    }
    return this.view(batchId)
  }

  async cancel(batchId: string): Promise<ComfyBatchView | null> {
    const batch = this.store.getBatch(batchId)
    if (!batch) return null
    this.store.updateBatch(batchId, { status: 'canceled' })
    const jobs = this.store.listJobs(batchId)
    const queuedIds = jobs.filter((job) => job.status === 'queued' && job.promptId).map((job) => job.promptId!)
    if (queuedIds.length > 0) {
      try {
        const client = this.createClient(this.store.getConfig().baseUrl)
        const state = await client.queue()
        await client.deleteQueued(queuedIds.filter((id) => state.pending.includes(id)))
        if (queuedIds.some((id) => state.running.includes(id))) await client.interrupt()
      } catch (error) {
        this.log('comfy.batch.cancel_remote_failed', { batchId, message: errorMessage(error) })
      }
    }
    for (const job of jobs) {
      if (job.status === 'pending' || job.status === 'uploading' || job.status === 'queued') {
        this.store.updateJob(job.id, { status: 'canceled' })
      }
    }
    return this.view(batchId)
  }

  /** Um ciclo da fila. Público para os testes; em uso normal roda pelo timer. */
  tick(): Promise<void> {
    if (!this.ticking) {
      this.ticking = this.runTick().finally(() => {
        this.ticking = null
      })
    }
    return this.ticking
  }

  /** Espera os downloads em andamento (usado nos testes). */
  async settleDownloads() {
    await Promise.all([...this.downloads.values()])
  }

  private ensureTimer() {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref?.()
  }

  private requireSetup(): { workflow: ComfyApiWorkflow; mapping: ComfyWorkflowMapping; baseUrl: string } {
    const config = this.store.getConfig()
    const workflow = this.store.getWorkflow()
    if (!config.baseUrl) throw new Error('Informe a URL do ComfyUI em Configurações.')
    if (!workflow || !config.workflowMapping) throw new Error('Importe o workflow (formato API) em Configurações.')
    return { workflow, mapping: config.workflowMapping, baseUrl: config.baseUrl }
  }

  private async runTick() {
    const batches = this.store.activeBatches()
    if (batches.length === 0 && this.downloads.size === 0) {
      this.stop()
      return
    }
    for (const batch of batches) {
      try {
        await this.processBatch(batch)
      } catch (error) {
        const message = errorMessage(error)
        this.store.updateBatch(batch.id, { lastError: message })
        this.log('comfy.batch.tick_failed', { batchId: batch.id, message })
      }
    }
  }

  private async processBatch(batch: ComfyBatch) {
    const { workflow, mapping, baseUrl } = this.requireSetup()
    const config = this.store.getConfig()
    const client = this.createClient(baseUrl)

    try {
      await this.checkQueued(client, batch, mapping)
    } catch (error) {
      if (!(error instanceof ComfyUnreachableError)) throw error
      this.store.updateBatch(batch.id, { lastError: error.message })
      return
    }

    for (const job of this.store.listJobs(batch.id)) {
      if (job.status === 'downloading' && job.output && !this.downloads.has(job.id)) {
        this.startDownload(client, batch, job)
      }
    }

    const current = this.store.getBatch(batch.id)
    if (current?.status === 'running') {
      const occupiedElsewhere = this.occupiedSlots(batch.id)
      const reachable = await this.submitNext(
        client,
        batch,
        workflow,
        mapping,
        config.queueSize,
        occupiedElsewhere,
      )
      if (reachable && current.lastError) this.store.updateBatch(batch.id, { lastError: null })
    }

    const jobs = this.store.listJobs(batch.id)
    const pendingDownloads = jobs.some((job) => this.downloads.has(job.id))
    const finished = jobs.every((job) => COMFY_TERMINAL_STATUSES.includes(job.status))
    if (finished && !pendingDownloads) {
      this.store.updateBatch(batch.id, { status: 'done' })
      this.log('comfy.batch.done', { batchId: batch.id, ...countComfyJobs(jobs) })
    }
  }

  private async checkQueued(client: ComfyApi, batch: ComfyBatch, mapping: ComfyWorkflowMapping) {
    let queueState: ComfyQueueState | null = null
    for (const job of this.store.listJobs(batch.id)) {
      if (job.status !== 'queued' || !job.promptId) continue
      const entry = await client.history(job.promptId)
      const statusStr = entry?.status?.status_str
      if (entry && (statusStr === 'error' || statusStr === 'success' || entry.status?.completed)) {
        if (statusStr === 'error') {
          this.store.updateJob(job.id, { status: 'error', error: comfyExecutionError(entry) })
          continue
        }
        const output = pickComfyVideoOutput(entry.outputs, mapping.saveNode)
        this.store.updateJob(
          job.id,
          output
            ? { status: 'downloading', output, error: null }
            : { status: 'error', error: 'O ComfyUI terminou a cena, mas não gerou vídeo.' },
        )
        continue
      }
      queueState ??= await client.queue()
      if (queueState.running.includes(job.promptId) || queueState.pending.includes(job.promptId)) continue
      // Sumiu da fila sem histórico: o pod reiniciou. Confere o histórico de novo antes de reenviar.
      if (await client.history(job.promptId)) continue
      this.store.updateJob(job.id, {
        status: 'pending',
        promptId: null,
        error: 'O ComfyUI perdeu esta cena (reinício do pod?). Reenviando.',
      })
    }
  }

  /** Retorna false quando o ComfyUI está fora do ar. */
  private async submitNext(
    client: ComfyApi,
    batch: ComfyBatch,
    workflow: ComfyApiWorkflow,
    mapping: ComfyWorkflowMapping,
    queueSize: number,
    occupiedElsewhere = 0,
  ): Promise<boolean> {
    for (const job of jobsToSubmit(this.store.listJobs(batch.id), queueSize, occupiedElsewhere)) {
      this.store.updateJob(job.id, { status: 'uploading' })
      try {
        const imageName = await client.upload(
          job.imagePath,
          comfyUploadName(batch.id, job.sceneNumber, path.extname(job.imagePath) || '.png'),
        )
        const audioName = await client.upload(
          job.audioPath,
          comfyUploadName(batch.id, job.sceneNumber, path.extname(job.audioPath) || '.mp3'),
        )
        const sceneWorkflow = buildComfySceneWorkflow(workflow, mapping, {
          imageName,
          audioName,
          prompt: job.prompt,
          duration: job.duration,
          seed: job.seed,
          outputPrefix: comfyOutputPrefix(batch.id, job.sceneNumber),
        })
        const promptId = await client.queuePrompt(sceneWorkflow, this.clientId)
        this.store.updateJob(job.id, { status: 'queued', promptId, error: null })
        this.log('comfy.job.queued', { batchId: batch.id, scene: job.sceneNumber, promptId })
      } catch (error) {
        if (error instanceof ComfyUnreachableError) {
          this.store.updateJob(job.id, { status: 'pending' })
          this.store.updateBatch(batch.id, { lastError: error.message })
          return false
        }
        this.store.updateJob(job.id, {
          status: 'error',
          error: errorMessage(error),
          attempts: job.attempts + 1,
        })
      }
    }
    return true
  }

  private occupiedSlots(exceptBatchId?: string): number {
    let count = 0
    for (const batch of this.store.activeBatches()) {
      if (exceptBatchId && batch.id === exceptBatchId) continue
      for (const job of this.store.listJobs(batch.id)) {
        if (COMFY_ACTIVE_STATUSES.includes(job.status)) count += 1
      }
    }
    return count
  }

  private startDownload(client: ComfyApi, batch: ComfyBatch, job: StoredComfyJob) {
    const output = job.output!
    const ext = path.extname(output.filename) || '.mp4'
    const outputDir = this.resolveOutputDir(batch)
    if (path.resolve(outputDir) !== path.resolve(batch.outputDir)) {
      this.store.updateBatch(batch.id, { outputDir })
    }
    const dest = path.join(outputDir, sceneOutputFileName(job.sceneNumber, ext))
    const task = client
      .download(output, dest)
      .then(async () => {
        if (this.store.getConfig().trimToAudio) {
          try {
            const trimmed = await this.trimOutput(dest, job.audioPath)
            if (trimmed) this.log('comfy.job.trimmed', { batchId: batch.id, scene: job.sceneNumber, dest })
          } catch (error) {
            this.log('comfy.job.trim_failed', {
              batchId: batch.id,
              scene: job.sceneNumber,
              dest,
              message: errorMessage(error),
            })
          }
        }
        this.store.updateJob(job.id, { status: 'done', outputPath: dest, error: null })
        this.log('comfy.job.downloaded', { batchId: batch.id, scene: job.sceneNumber, dest })
      })
      .catch((error: unknown) => {
        // Falha de rede: continua em "downloading" e tenta no próximo ciclo; o arquivo segue no pod.
        const retry = error instanceof ComfyUnreachableError
        this.store.updateJob(job.id, retry ? { error: errorMessage(error) } : { status: 'error', error: errorMessage(error) })
      })
      .finally(() => {
        this.downloads.delete(job.id)
      })
    this.downloads.set(job.id, task)
  }
}
