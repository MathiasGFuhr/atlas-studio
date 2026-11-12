/**
 * Grava ltxEnvironmentPlan no SQLite (sem Electron). Não toca na API key.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
const dbPath = path.join(process.env.APPDATA ?? '', 'Atlas Studio', 'atlas-studio.db')
const db = new SQL.Database(fs.readFileSync(dbPath))

const plan = {
  dryRunOnly: true,
  templateImage: 'atlas-studio/comfyui-ltx2.3:pending-pin',
  templateTagPinned: false,
  containerPort: 8188,
  storageStrategy: 'network_volume',
  preferredDataCenterId: 'EU-RO-1',
  networkVolumeId: 'tjp7a4uk0y',
  networkVolumeSizeGb: 70,
  primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
  alternateGpuIds: ['NVIDIA GeForce RTX 4090', 'NVIDIA RTX PRO 4500 Blackwell Server Edition'],
  minVramGb: 16,
  recommendedVramGb: 24,
  maxUsdPerHour: 0.9,
  preferredCloud: 'SECURE',
  modelsMountPath: '/runpod-volume/models',
  comfyRootInContainer: '/ComfyUI',
  notes:
    'Volume inadequate_magenta_crow (tjp7a4uk0y) já existe em EU-RO-1 70GB US$4.90/mês — NÃO criar outro. Caminho A: teste 1 cena no Pod d3ewr3ge0uk002. Caminho B: Pod novo futuro em EU-RO-1 anexando este volume.',
}

db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
  'ltxEnvironmentPlan',
  JSON.stringify(plan),
])
fs.writeFileSync(dbPath, Buffer.from(db.export()))

const outDir = path.join(process.cwd(), 'resources', 'ltx-environment')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'ltx-environment-plan.json'), `${JSON.stringify(plan, null, 2)}\n`)
console.log(JSON.stringify({ ok: true, dbPath, networkVolumeId: plan.networkVolumeId }, null, 2))
