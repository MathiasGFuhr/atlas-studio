import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
const dbPath = path.join(process.env.APPDATA ?? '', 'Atlas Studio', 'atlas-studio.db')
const db = new SQL.Database(fs.readFileSync(dbPath))

function get(key) {
  const rows = db.exec('SELECT value FROM settings WHERE key = ?', [key])
  return rows[0]?.values?.[0]?.[0] ?? null
}

const planRaw = get('ltxEnvironmentPlan')
const cfgRaw = get('comfyConfig')
const hasEnc = Boolean(get('comfyRunpodApiKeyEnc'))
const hasPlain = Boolean(get('comfyRunpodApiKey'))

console.log(
  JSON.stringify(
    {
      dbPath,
      hasEnc,
      hasPlain,
      plan: planRaw ? JSON.parse(String(planRaw)) : null,
      config: cfgRaw ? JSON.parse(String(cfgRaw)) : null,
    },
    null,
    2,
  ),
)
