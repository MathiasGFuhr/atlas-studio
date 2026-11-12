/**
 * Teste LipSync autorizado — caminho A — 1 cena.
 * Não cria volume/Pod; não altera workflow; não stop/terminate do Pod.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import initSqlJs from 'sql.js'

const MAX_USD = 0.54
const MAX_MINUTES = 15
const POD_USD_PER_HOUR = 0.72
const BASE = 'https://d3ewr3ge0uk002-8188.proxy.runpod.net'
const REF_ID = '2c38dc92-b6ba-47f4-b98c-5929eb6bf100' // ~1.99s — cena curta
const CLIENT_ID = `atlas-auth-test-${randomUUID().slice(0, 8)}`

const sessionStartedAt = Date.now()
const deadline = sessionStartedAt + MAX_MINUTES * 60_000

function elapsedMin() {
  return (Date.now() - sessionStartedAt) / 60_000
}
function estimatedUsd() {
  return Math.round(((elapsedMin() / 60) * POD_USD_PER_HOUR) * 1000) / 1000
}
function withinBudget() {
  return Date.now() < deadline && estimatedUsd() <= MAX_USD
}

const require = createRequire(import.meta.url)
const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
const dbPath = path.join(process.env.APPDATA ?? '', 'Atlas Studio', 'atlas-studio.db')
const db = new SQL.Database(fs.readFileSync(dbPath))

function one(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  return row
}

const ref = one(
  `SELECT id, project_id, label, prompt, image_path, audio_path, audio_duration
   FROM lipsync_refs WHERE id = ?`,
  [REF_ID],
)
if (!ref) throw new Error('Cena de teste não encontrada no SQLite.')
const project = one(`SELECT id, name, folder_path FROM projects WHERE id = ?`, [ref.project_id])
if (!project?.folder_path) throw new Error('Projeto da cena sem folder_path.')

const cfgRaw = one(`SELECT value FROM settings WHERE key = 'comfyConfig'`)?.value
const wfRaw = one(`SELECT value FROM settings WHERE key = 'comfyWorkflowJson'`)?.value
const config = JSON.parse(String(cfgRaw))
const workflowTemplate = JSON.parse(String(wfRaw))
const mapping = config.workflowMapping
if (!mapping) throw new Error('workflowMapping ausente.')

const durationPadding = Number(config.durationPadding) || 1
const audioDuration = Number(ref.audio_duration)
const duration = Math.max(1, Math.floor(audioDuration) + durationPadding)

const outputDir = path.join(String(project.folder_path), 'lipsync')
fs.mkdirSync(outputDir, { recursive: true })
const destVideo = path.join(outputDir, `atlas-auth-test-${ref.label || 'scene'}.mp4`)

async function getJson(route) {
  const response = await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${route} → ${response.status}`)
  return response.json()
}

async function queueState() {
  const q = await getJson('/queue')
  return {
    running: (q.queue_running || []).map((item) => item?.[1]).filter(Boolean),
    pending: (q.queue_pending || []).map((item) => item?.[1]).filter(Boolean),
  }
}

console.log(
  JSON.stringify(
    {
      phase: 'prep',
      refId: REF_ID,
      project: project.name,
      audioDuration,
      durationField: duration,
      outputDir,
      budget: { MAX_USD, MAX_MINUTES, POD_USD_PER_HOUR },
    },
    null,
    2,
  ),
)

// Esperar fila remota esvaziar (trabalho de produção alheio) sem cancelá-lo.
let waitedForForeignQueueMs = 0
for (;;) {
  if (!withinBudget()) {
    const q = await queueState()
    console.log(
      JSON.stringify(
        {
          ok: false,
          aborted: true,
          reason: 'budget_exhausted_waiting_foreign_queue',
          elapsedMin: Math.round(elapsedMin() * 100) / 100,
          estimatedUsd: estimatedUsd(),
          remoteQueue: q,
          note: 'Há trabalho remoto na fila ComfyUI. Não cancelei jobs de produção. Teste não iniciado.',
        },
        null,
        2,
      ),
    )
    process.exit(2)
  }
  const q = await queueState()
  if (q.running.length === 0 && q.pending.length === 0) break
  console.log(
    JSON.stringify({
      waitingForeignQueue: true,
      running: q.running.length,
      pending: q.pending.length,
      elapsedMin: Math.round(elapsedMin() * 100) / 100,
      estimatedUsd: estimatedUsd(),
    }),
  )
  await new Promise((r) => setTimeout(r, 15_000))
  waitedForForeignQueueMs += 15_000
}

async function upload(localPath, remoteName) {
  const data = await fs.promises.readFile(localPath)
  const form = new FormData()
  form.append('image', new Blob([data]), remoteName)
  form.append('type', 'input')
  form.append('overwrite', 'true')
  const response = await fetch(`${BASE}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(5 * 60_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.name) throw new Error(`upload falhou ${response.status}`)
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name
}

function applyScene(workflow, scene) {
  const next = structuredClone(workflow)
  const set = (nodeId, field, value) => {
    if (!next[nodeId]) throw new Error(`nó ${nodeId} ausente`)
    next[nodeId].inputs = { ...(next[nodeId].inputs || {}), [field]: value }
  }
  set(mapping.imageNode, 'image', scene.imageName)
  set(mapping.audioNode, 'audio', scene.audioName)
  set(mapping.promptNode, mapping.promptField || 'value', scene.prompt)
  set(mapping.durationNode, 'value', scene.duration)
  if (mapping.enhanceNode) set(mapping.enhanceNode, 'value', false)
  for (const seed of mapping.seedNodes || []) {
    set(seed.node, seed.field, Math.floor(Math.random() * 1_000_000_000))
  }
  return next
}

const imageName = await upload(String(ref.image_path), `atlas_test_${REF_ID.slice(0, 8)}.jpg`)
// Comfy upload/image also used for audio in Atlas? Check ComfyClient - only upload image endpoint.
// Atlas might upload audio via same /upload/image with audio file.
const audioName = await upload(String(ref.audio_path), `atlas_test_${REF_ID.slice(0, 8)}.mp3`)

const promptText = String(ref.prompt || 'A person speaking naturally to the camera.')
const workflow = applyScene(workflowTemplate, {
  imageName,
  audioName,
  prompt: promptText,
  duration,
})

if (!withinBudget()) {
  console.log(JSON.stringify({ ok: false, aborted: true, reason: 'budget_before_prompt' }, null, 2))
  process.exit(2)
}

const genStartedAt = Date.now()
const promptResponse = await fetch(`${BASE}/prompt`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: workflow, client_id: CLIENT_ID }),
  signal: AbortSignal.timeout(60_000),
})
const promptBody = await promptResponse.json().catch(() => ({}))
if (!promptResponse.ok || !promptBody.prompt_id) {
  throw new Error(`prompt recusado: ${JSON.stringify(promptBody).slice(0, 400)}`)
}
const promptId = promptBody.prompt_id
console.log(JSON.stringify({ phase: 'queued', promptId, genStartedAt }, null, 2))

let historyEntry = null
while (withinBudget()) {
  const hist = await getJson(`/history/${encodeURIComponent(promptId)}`)
  historyEntry = hist?.[promptId] ?? null
  if (historyEntry?.status?.completed || historyEntry?.outputs) break
  const q = await queueState()
  console.log(
    JSON.stringify({
      polling: true,
      promptId,
      running: q.running.includes(promptId),
      pending: q.pending.includes(promptId),
      elapsedMin: Math.round(elapsedMin() * 100) / 100,
      estimatedUsd: estimatedUsd(),
    }),
  )
  await new Promise((r) => setTimeout(r, 10_000))
}

const genEndedAt = Date.now()
const generationSeconds = Math.round((genEndedAt - genStartedAt) / 1000)

if (!historyEntry || (!historyEntry.status?.completed && !historyEntry.outputs)) {
  const q = await queueState()
  console.log(
    JSON.stringify(
      {
        ok: false,
        aborted: true,
        reason: 'timeout_or_budget_during_generation',
        promptId,
        generationSeconds,
        elapsedMin: Math.round(elapsedMin() * 100) / 100,
        estimatedUsd: estimatedUsd(),
        remoteQueue: q,
        historyStatus: historyEntry?.status ?? null,
      },
      null,
      2,
    ),
  )
  process.exit(3)
}

// extract SaveVideo / video output
function findVideoFile(outputs) {
  for (const nodeOut of Object.values(outputs || {})) {
    for (const key of ['gifs', 'videos', 'images']) {
      const arr = nodeOut?.[key]
      if (Array.isArray(arr)) {
        for (const file of arr) {
          if (file?.filename) return file
        }
      }
    }
  }
  return null
}

const file = findVideoFile(historyEntry.outputs)
if (!file) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        reason: 'no_video_in_outputs',
        promptId,
        generationSeconds,
        outputKeys: Object.keys(historyEntry.outputs || {}),
        status: historyEntry.status,
      },
      null,
      2,
    ),
  )
  process.exit(4)
}

const viewQs = new URLSearchParams({
  filename: file.filename,
  subfolder: file.subfolder || '',
  type: file.type || 'output',
})
const viewRes = await fetch(`${BASE}/view?${viewQs}`, { signal: AbortSignal.timeout(20 * 60_000) })
if (!viewRes.ok || !viewRes.body) throw new Error(`download falhou ${viewRes.status}`)
const buf = Buffer.from(await viewRes.arrayBuffer())
fs.writeFileSync(destVideo, buf)

let ffprobe = null
const probe = spawnSync(
  'ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', destVideo],
  { encoding: 'utf8' },
)
if (probe.status === 0) {
  try {
    ffprobe = JSON.parse(probe.stdout)
  } catch {
    ffprobe = { raw: probe.stdout }
  }
}

const finalQueue = await queueState()
const report = {
  ok: true,
  path: 'A',
  podId: 'd3ewr3ge0uk002',
  refId: REF_ID,
  sceneLabel: ref.label,
  projectName: project.name,
  audioDurationSec: audioDuration,
  durationFieldSent: duration,
  promptId,
  waitedForForeignQueueSec: Math.round(waitedForForeignQueueMs / 1000),
  generationSeconds,
  sessionElapsedMin: Math.round(elapsedMin() * 100) / 100,
  estimatedSessionUsd: estimatedUsd(),
  limits: { maxUsd: MAX_USD, maxMinutes: MAX_MINUTES },
  withinBudgetAtEnd: withinBudget() || estimatedUsd() <= MAX_USD,
  downloadedPath: destVideo,
  downloadedBytes: buf.length,
  remoteFile: file,
  ffprobe,
  historyCompleted: Boolean(historyEntry.status?.completed),
  executionError: null,
  finalRemoteQueue: finalQueue,
  podLeftRunning: true,
  notes: [
    'Workflow em memória apenas (structuredClone); SQLite/workflow não alterados.',
    'Nenhum volume/Pod criado; Pod não foi stop/terminate.',
  ],
}

// detect execution_error messages
for (const message of historyEntry.status?.messages || []) {
  if (Array.isArray(message) && message[0] === 'execution_error') {
    report.ok = false
    report.executionError = message[1]
  }
}

const outReport = path.join(process.cwd(), 'resources', 'ltx-environment', 'lipsync-auth-test-result.json')
fs.writeFileSync(outReport, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 5)
