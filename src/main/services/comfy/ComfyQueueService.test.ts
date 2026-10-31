import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ComfyApiWorkflow,
  ComfyBatch,
  ComfyConfig,
  ComfyJob,
  ComfyOutputFile,
  ComfyScenePlan,
} from '../../../shared/comfy'
import { detectComfyWorkflowMapping, normalizeComfyConfig } from '../../../shared/comfy'
import { ComfyUnreachableError, type ComfyApi, type ComfyHistoryEntry } from './ComfyClient'
import { ComfyQueueService } from './ComfyQueueService'
import type { ComfyJobPatch, ComfyStore, StoredComfyJob } from './comfyStore'

const WORKFLOW: ComfyApiWorkflow = {
  '269': { inputs: { image: '' }, class_type: 'LoadImage' },
  '276': { inputs: { audio: '' }, class_type: 'LoadAudio' },
  '341': { inputs: { filename_prefix: '' }, class_type: 'SaveVideo' },
  '340:285': { inputs: { noise_seed: 42 }, class_type: 'RandomNoise' },
  '340:319': { inputs: { value: '' }, class_type: 'PrimitiveStringMultiline', _meta: { title: 'Prompt' } },
  '340:331': { inputs: { value: 9 }, class_type: 'PrimitiveFloat', _meta: { title: 'Duration' } },
  '340:349': { inputs: { value: true }, class_type: 'PrimitiveBoolean', _meta: { title: 'Enable Prompt Enhance' } },
}

class MemoryStore implements ComfyStore {
  config: ComfyConfig = normalizeComfyConfig({
    baseUrl: 'https://pod-8188.proxy.runpod.net',
    queueSize: 5,
    workflowName: 'video_ltx2_3_ia2v.json',
    workflowMapping: detectComfyWorkflowMapping(WORKFLOW),
  })
  batches = new Map<string, ComfyBatch>()
  jobs = new Map<string, StoredComfyJob>()

  getConfig() {
    return this.config
  }
  getWorkflow() {
    return WORKFLOW
  }
  createBatch(batch: ComfyBatch, jobs: ComfyJob[]) {
    this.batches.set(batch.id, { ...batch })
    for (const job of jobs) this.jobs.set(job.id, { ...job, output: null })
  }
  getBatch(id: string) {
    const batch = this.batches.get(id)
    return batch ? { ...batch } : null
  }
  latestBatch() {
    return [...this.batches.values()].at(-1) ?? null
  }
  activeBatches() {
    return [...this.batches.values()].filter((batch) => batch.status === 'running' || batch.status === 'paused')
  }
  updateBatch(id: string, patch: Partial<Pick<ComfyBatch, 'status' | 'lastError' | 'outputDir'>>) {
    const batch = this.batches.get(id)
    if (batch) this.batches.set(id, { ...batch, ...patch })
  }
  listJobs(batchId: string) {
    return [...this.jobs.values()]
      .filter((job) => job.batchId === batchId)
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((job) => ({ ...job }))
  }
  updateJob(id: string, patch: ComfyJobPatch) {
    const job = this.jobs.get(id)
    if (job) this.jobs.set(id, { ...job, ...patch })
  }
}

/** ComfyUI de uma GPU: roda uma cena por vez, na ordem em que chegaram. */
class FakeComfy implements ComfyApi {
  online = true
  uploads: string[] = []
  submitted: Array<{ promptId: string; workflow: ComfyApiWorkflow }> = []
  order: string[] = []
  results = new Map<string, ComfyHistoryEntry>()
  rejectNext: string | null = null
  private seq = 0

  private guard() {
    if (!this.online) throw new ComfyUnreachableError('pod desligado')
  }
  async systemStats() {
    this.guard()
    return { ok: true, message: 'ok' }
  }
  async upload(_localPath: string, remoteName: string) {
    this.guard()
    this.uploads.push(remoteName)
    return remoteName
  }
  async queuePrompt(workflow: ComfyApiWorkflow) {
    this.guard()
    if (this.rejectNext) {
      const message = this.rejectNext
      this.rejectNext = null
      throw new Error(message)
    }
    const promptId = `p${++this.seq}`
    this.submitted.push({ promptId, workflow })
    this.order.push(promptId)
    return promptId
  }
  async history(promptId: string) {
    this.guard()
    return this.results.get(promptId) ?? null
  }
  async queue() {
    this.guard()
    return { running: this.order.slice(0, 1), pending: this.order.slice(1) }
  }
  async download(file: ComfyOutputFile, destPath: string) {
    this.guard()
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, file.filename)
    return destPath
  }
  async deleteQueued(promptIds: string[]) {
    this.order = this.order.filter((id) => !promptIds.includes(id))
  }
  async interrupt() {
    this.order.shift()
  }

  /** A cena em execução termina e a próxima da fila começa. */
  finishRunning(status: 'success' | 'error' = 'success') {
    const promptId = this.order.shift()
    if (!promptId) throw new Error('nada rodando')
    const prefix = String(this.submitted.find((entry) => entry.promptId === promptId)?.workflow['341'].inputs.filename_prefix)
    this.results.set(
      promptId,
      status === 'success'
        ? {
            status: { status_str: 'success', completed: true },
            outputs: { '341': { images: [{ filename: `${path.basename(prefix)}_00001_.mp4`, subfolder: path.dirname(prefix), type: 'output' }] } },
          }
        : {
            status: { status_str: 'error', completed: false, messages: [['execution_error', { node_type: 'VAEDecodeTiled', exception_message: 'CUDA out of memory' }]] },
          },
    )
    return promptId
  }
}

describe('ComfyQueueService', () => {
  let outputDir = ''
  let store: MemoryStore
  let comfy: FakeComfy
  let service: ComfyQueueService

  function scenes(count: number): ComfyScenePlan[] {
    return Array.from({ length: count }, (_, index) => ({
      refId: `ref-${index + 1}`,
      sceneNumber: index + 1,
      imagePath: `C:/cenas/${index + 1}.png`,
      audioPath: `C:/cenas/${index + 1}.MP3`,
      prompt: `Cena ${index + 1}`,
      duration: 22,
    }))
  }

  async function cycle() {
    await service.tick()
    await service.settleDownloads()
  }

  function statuses(batchId: string) {
    return store.listJobs(batchId).map((job) => job.status)
  }

  beforeEach(() => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-comfy-'))
    store = new MemoryStore()
    comfy = new FakeComfy()
    service = new ComfyQueueService({ store, createClient: () => comfy })
  })

  afterEach(() => {
    service.stop()
    fs.rmSync(outputDir, { recursive: true, force: true })
  })

  it('mantém 5 na fila e envia a próxima assim que uma termina, sem esperar as outras', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(30) })
    await cycle()

    expect(comfy.submitted).toHaveLength(5)
    expect(comfy.uploads.slice(0, 2)).toEqual([
      `atlas_${batch.id.slice(0, 8)}_cena-01.png`,
      `atlas_${batch.id.slice(0, 8)}_cena-01.mp3`,
    ])
    const first = comfy.submitted[0].workflow
    expect(first['340:331'].inputs.value).toBe(22)
    expect(first['340:319'].inputs.value).toBe('Cena 1')
    expect(first['340:349'].inputs.value).toBe(false)

    comfy.finishRunning()
    await cycle()

    expect(comfy.submitted).toHaveLength(6)
    expect(comfy.submitted[5].workflow['340:319'].inputs.value).toBe('Cena 6')
    expect(fs.readdirSync(outputDir)).toEqual(['1.mp4'])
    expect(statuses(batch.id).slice(0, 7)).toEqual(['done', 'queued', 'queued', 'queued', 'queued', 'queued', 'pending'])
  })

  it('termina o lote com todos os vídeos baixados na pasta', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(7) })
    await cycle()
    for (let index = 0; index < 7; index += 1) {
      comfy.finishRunning()
      await cycle()
    }
    expect(store.getBatch(batch.id)?.status).toBe('running')
    await cycle()
    expect(store.getBatch(batch.id)?.status).toBe('done')
    expect(fs.readdirSync(outputDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))).toEqual(
      ['1', '2', '3', '4', '5', '6', '7'].map((stem) => `${stem}.mp4`),
    )
  })

  it('cena com erro libera a vaga e pode ser reenviada', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(6) })
    await cycle()
    comfy.finishRunning('error')
    await cycle()

    const [failed] = store.listJobs(batch.id)
    expect(failed.status).toBe('error')
    expect(failed.error).toBe('VAEDecodeTiled: CUDA out of memory')
    expect(comfy.submitted).toHaveLength(6)

    service.retryFailed(batch.id)
    expect(store.listJobs(batch.id)[0].status).toBe('pending')
  })

  it('workflow recusado pelo ComfyUI marca só aquela cena com erro', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(2) })
    comfy.rejectNext = 'O ComfyUI recusou o workflow: nó 269: imagem não encontrada'
    await cycle()
    expect(statuses(batch.id)).toEqual(['error', 'queued'])
    expect(store.listJobs(batch.id)[0].error).toContain('imagem não encontrada')
  })

  it('pod fora do ar não queima as cenas: tudo volta para a fila e segue quando ele volta', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(3) })
    comfy.online = false
    await cycle()
    expect(statuses(batch.id)).toEqual(['pending', 'pending', 'pending'])
    expect(store.getBatch(batch.id)?.lastError).toContain('pod desligado')

    comfy.online = true
    await cycle()
    expect(statuses(batch.id)).toEqual(['queued', 'queued', 'queued'])
    expect(store.getBatch(batch.id)?.lastError).toBeNull()
  })

  it('cena que sumiu da fila (pod reiniciado) é reenviada', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(2) })
    await cycle()
    comfy.order = []
    await service.tick()
    expect(comfy.submitted).toHaveLength(4)
    expect(statuses(batch.id)).toEqual(['queued', 'queued'])
  })

  it('pausar segura novos envios; as que já estão no ComfyUI terminam e baixam', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(8) })
    await cycle()
    service.pause(batch.id)
    comfy.finishRunning()
    await cycle()
    expect(comfy.submitted).toHaveLength(5)
    expect(statuses(batch.id)[0]).toBe('done')

    service.resume(batch.id)
    await cycle()
    expect(comfy.submitted).toHaveLength(6)
  })

  it('cancelar tira as cenas da fila do ComfyUI e interrompe a que está rodando', async () => {
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(8) })
    await cycle()
    await service.cancel(batch.id)
    expect(comfy.order).toEqual([])
    expect(store.getBatch(batch.id)?.status).toBe('canceled')
    expect(new Set(statuses(batch.id))).toEqual(new Set(['canceled']))
  })

  it('depois de baixar, corta o vídeo no tempo do áudio quando a opção está ligada', async () => {
    store.config = { ...store.config, trimToAudio: true }
    const trimmed: Array<{ video: string; audio: string }> = []
    service.stop()
    service = new ComfyQueueService({
      store,
      createClient: () => comfy,
      trimOutput: async (videoPath, audioPath) => {
        trimmed.push({ video: videoPath, audio: audioPath })
        return true
      },
    })
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(1) })
    await cycle()
    comfy.finishRunning()
    await cycle()
    expect(trimmed).toEqual([{ video: path.join(outputDir, '1.mp4'), audio: 'C:/cenas/1.MP3' }])
    expect(statuses(batch.id)).toEqual(['done'])
  })

  it('com a opção desligada, baixa o vídeo sem cortar', async () => {
    const trimmed: string[] = []
    service.stop()
    service = new ComfyQueueService({
      store,
      createClient: () => comfy,
      trimOutput: async (videoPath) => {
        trimmed.push(videoPath)
        return true
      },
    })
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(1) })
    await cycle()
    comfy.finishRunning()
    await cycle()
    expect(trimmed).toEqual([])
    expect(statuses(batch.id)).toEqual(['done'])
  })

  it('se o corte falhar, o vídeo baixado continua válido', async () => {
    store.config = { ...store.config, trimToAudio: true }
    service.stop()
    service = new ComfyQueueService({
      store,
      createClient: () => comfy,
      trimOutput: async () => {
        throw new Error('ffmpeg caiu')
      },
    })
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(1) })
    await cycle()
    comfy.finishRunning()
    await cycle()
    expect(statuses(batch.id)).toEqual(['done'])
    expect(fs.existsSync(path.join(outputDir, '1.mp4'))).toBe(true)
  })

  it('o mesmo projeto não entra duas vezes; outro projeto entra na mesma fila de 5', async () => {
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-comfy-b-'))
    service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(3) })
    expect(() => service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(2) })).toThrow('já está gerando')
    const second = service.startBatch({ projectId: 'p2', outputDir: otherDir, scenes: scenes(3) })
    await cycle()
    await cycle()
    expect(comfy.submitted).toHaveLength(5)
    expect(store.listJobs(second.batch.id).filter((job) => job.status === 'queued')).toHaveLength(2)
    fs.rmSync(otherDir, { recursive: true, force: true })
  })

  it('baixa na pasta lipsync atual, mesmo se o lote tiver sido iniciado em outro destino', async () => {
    const lipsyncDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-comfy-lipsync-'))
    service.stop()
    service = new ComfyQueueService({
      store,
      createClient: () => comfy,
      resolveOutputDir: () => lipsyncDir,
    })
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(1) })
    await cycle()
    comfy.finishRunning()
    await cycle()
    expect(fs.existsSync(path.join(lipsyncDir, '1.mp4'))).toBe(true)
    expect(fs.existsSync(path.join(outputDir, '1.mp4'))).toBe(false)
    expect(store.getBatch(batch.id)?.outputDir).toBe(lipsyncDir)
    fs.rmSync(lipsyncDir, { recursive: true, force: true })
  })

  it('nunca apaga um vídeo já existente: grava 1 1.mp4, 1 2.mp4…', async () => {
    fs.writeFileSync(path.join(outputDir, '1.mp4'), 'geracao-anterior')
    fs.writeFileSync(path.join(outputDir, '1 1.mp4'), 'segunda-geracao')
    const { batch } = service.startBatch({ projectId: 'p1', outputDir, scenes: scenes(1) })
    await cycle()
    comfy.finishRunning()
    await cycle()
    expect(fs.readFileSync(path.join(outputDir, '1.mp4'), 'utf8')).toBe('geracao-anterior')
    expect(fs.readFileSync(path.join(outputDir, '1 1.mp4'), 'utf8')).toBe('segunda-geracao')
    expect(fs.existsSync(path.join(outputDir, '1 2.mp4'))).toBe(true)
    expect(store.listJobs(batch.id)[0].outputPath).toBe(path.join(outputDir, '1 2.mp4'))
  })
})
