/**
 * Persiste o plano LTX com o Network Volume já criado (dry-run; não cria recursos).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app, safeStorage } from 'electron'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)

try {
  app.setName('Atlas Studio')
  app.setPath('userData', path.join(process.env.APPDATA ?? '', 'Atlas Studio'))
} catch {
  /* ignore */
}

await app.whenReady()
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
  /** GPU compatível com o volume em EU-RO-1 (catálogo: RTX PRO 4500 Blackwell 32GB). */
  primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
  alternateGpuIds: ['NVIDIA GeForce RTX 4090', 'NVIDIA RTX PRO 4500 Blackwell Server Edition'],
  minVramGb: 16,
  recommendedVramGb: 24,
  maxUsdPerHour: 0.9,
  preferredCloud: 'SECURE',
  modelsMountPath: '/runpod-volume/models',
  comfyRootInContainer: '/ComfyUI',
  notes:
    'Volume inadequate_magenta_crow (tjp7a4uk0y) já existe em EU-RO-1 70GB — NÃO criar outro. Teste LipSync 1 cena = Pod atual US-KS-2; migração = Pod novo futuro no EU-RO-1 anexando este volume.',
}

db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
  'ltxEnvironmentPlan',
  JSON.stringify(plan),
])

const data = db.export()
fs.writeFileSync(dbPath, Buffer.from(data))

const outDir = path.join(process.cwd(), 'resources', 'ltx-environment')
fs.writeFileSync(path.join(outDir, 'ltx-environment-plan.json'), `${JSON.stringify(plan, null, 2)}\n`)

console.log(JSON.stringify({ ok: true, plan }, null, 2))
void safeStorage
app.exit(0)
