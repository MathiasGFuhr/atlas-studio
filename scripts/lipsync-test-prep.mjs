import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
const dbPath = path.join(process.env.APPDATA ?? '', 'Atlas Studio', 'atlas-studio.db')
const db = new SQL.Database(fs.readFileSync(dbPath))

function rows(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  const out = []
  while (stmt.step()) out.push(stmt.getAsObject())
  stmt.free()
  return out
}

const projects = rows('SELECT id, name, folder_path FROM projects LIMIT 30')
const refs = rows(
  `SELECT id, project_id, label, status, sort_order, image_path, audio_path, audio_duration, prompt
   FROM lipsync_refs
   WHERE status = 'active'
   ORDER BY CASE WHEN audio_duration IS NULL THEN 9999 ELSE audio_duration END ASC, sort_order ASC
   LIMIT 20`,
)
const batches = rows(
  `SELECT id, project_id, status, output_dir, last_error, created_at, updated_at
   FROM comfy_batches ORDER BY created_at DESC LIMIT 8`,
)
const jobs = rows(
  `SELECT id, batch_id, ref_id, scene_number, status, prompt_id, output_path, error, duration, created_at, updated_at
   FROM comfy_jobs ORDER BY created_at DESC LIMIT 20`,
)

const base = 'https://d3ewr3ge0uk002-8188.proxy.runpod.net'
const queue = await (await fetch(`${base}/queue`, { signal: AbortSignal.timeout(20000) })).json()
const running = queue.queue_running || []
const pending = queue.queue_pending || []

function promptMeta(item) {
  // Comfy queue item: [number, prompt_id, {inputs...}, extra]
  const promptId = item?.[1]
  const graph = item?.[2]
  const nodeIds = graph && typeof graph === 'object' ? Object.keys(graph) : []
  return { promptId, nodeCount: nodeIds.length }
}

console.log(
  JSON.stringify(
    {
      projects,
      shortestRefs: refs.slice(0, 8).map((r) => ({
        id: r.id,
        project_id: r.project_id,
        label: r.label,
        audio_duration: r.audio_duration,
        image_exists: r.image_path ? fs.existsSync(String(r.image_path)) : false,
        audio_exists: r.audio_path ? fs.existsSync(String(r.audio_path)) : false,
        image_path: r.image_path,
        audio_path: r.audio_path,
      })),
      batches,
      jobs: jobs.map((j) => ({
        id: j.id,
        batch_id: j.batch_id,
        scene_number: j.scene_number,
        status: j.status,
        prompt_id: j.prompt_id,
        output_path: j.output_path,
        error: j.error,
        duration: j.duration,
      })),
      remoteQueue: {
        running: running.map(promptMeta),
        pendingCount: pending.length,
        pending: pending.slice(0, 12).map(promptMeta),
      },
    },
    null,
    2,
  ),
)
