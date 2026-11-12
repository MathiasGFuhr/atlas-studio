/**
 * Descriptografa a API key via Electron safeStorage e consulta catálogo GET (somente leitura).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { app, safeStorage } from 'electron'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)

async function main() {
  // Alinhar identidade com o app que criptografou a chave (DPAPI / safeStorage).
  try {
    app.setName('Atlas Studio')
    app.setPath('userData', path.join(process.env.APPDATA ?? '', 'Atlas Studio'))
  } catch {
    // ignore se já iniciado
  }
  await app.whenReady()
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
  const candidates = [
    path.join(process.env.APPDATA ?? '', 'Atlas Studio', 'atlas-studio.db'),
    path.join(app.getPath('userData'), 'atlas-studio.db'),
  ]
  const found = candidates.find((p) => fs.existsSync(p))
  if (!found) {
    console.error(JSON.stringify({ error: 'db_not_found', candidates }))
    app.exit(2)
    return
  }
  const db = new SQL.Database(fs.readFileSync(found))
  const enc = db.exec("SELECT value FROM settings WHERE key = 'comfyRunpodApiKeyEnc'")[0]?.values?.[0]?.[0]
  const plain = db.exec("SELECT value FROM settings WHERE key = 'comfyRunpodApiKey'")[0]?.values?.[0]?.[0]
  let apiKey = ''
  if (enc && safeStorage.isEncryptionAvailable()) {
    try {
      apiKey = safeStorage.decryptString(Buffer.from(String(enc), 'base64')).trim()
    } catch (error) {
      console.error('decrypt_failed', error instanceof Error ? error.message : String(error))
    }
  }
  if (!apiKey && plain) apiKey = String(plain).trim()
  if (!apiKey) {
    console.error(JSON.stringify({ error: 'no_api_key' }))
    app.exit(3)
    return
  }

  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
  const get = async (route) => {
    const response = await fetch(`https://api.runpod.io${route}`, { headers, signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    if (!response.ok) throw new Error(`${route} ${response.status} ${text.slice(0, 200)}`)
    return JSON.parse(text)
  }

  const [pods, gpus, volumes, datacenters] = await Promise.all([
    get('/v2/pods?limit=100'),
    get('/v2/catalog/gpus?include=AVAILABILITY&product=POD'),
    get('/v2/network-volumes?limit=100'),
    get('/v2/catalog/datacenters?include=GPU_AVAILABILITY'),
  ])

  const fingerprint = createHash('sha256').update(apiKey).digest('hex').slice(0, 8)
  const out = {
    dryRun: true,
    mutationCalls: 0,
    keyFingerprint: fingerprint,
    fetchedAt: new Date().toISOString(),
    pods: pods.pods ?? pods,
    gpus: gpus.gpus ?? [],
    networkVolumes: volumes.networkVolumes ?? volumes,
    dataCenters: datacenters.dataCenters ?? [],
  }

  const outPath = path.join(process.cwd(), 'resources', 'ltx-environment', 'runpod-catalog-snapshot.json')
  // Sanitize: never write the API key
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`)
  console.log(
    JSON.stringify(
      {
        ok: true,
        outPath,
        pods: Array.isArray(out.pods) ? out.pods.length : 0,
        gpus: out.gpus.length,
        volumes: Array.isArray(out.networkVolumes) ? out.networkVolumes.length : 0,
        dataCenters: out.dataCenters.length,
      },
      null,
      2,
    ),
  )
  app.exit(0)
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
