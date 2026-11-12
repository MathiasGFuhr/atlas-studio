import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const SQL = await initSqlJs({
  locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
})
const paths = [
  path.join(process.env.APPDATA ?? '', 'Atlas Studio', 'atlas-studio.db'),
  path.join(process.env.APPDATA ?? '', 'atlas-studio', 'atlas-studio.db'),
]
const outDir = path.resolve('resources/ltx-environment')
fs.mkdirSync(outDir, { recursive: true })

let found = false
for (const dbPath of paths) {
  if (!fs.existsSync(dbPath)) {
    console.log('missing', dbPath)
    continue
  }
  const db = new SQL.Database(fs.readFileSync(dbPath))
  console.log('===', dbPath)
  const keys = db.exec(
    "SELECT key, length(value) AS len FROM settings WHERE key LIKE '%comfy%' OR key LIKE '%workflow%' OR key LIKE '%ltx%'",
  )
  console.log(JSON.stringify(keys, null, 2))

  const wf = db.exec("SELECT value FROM settings WHERE key = 'comfyWorkflowJson'")
  const raw = wf[0]?.values?.[0]?.[0]
  if (!raw) {
    console.log('no workflow in', dbPath)
    continue
  }
  const text = String(raw)
  const parsed = JSON.parse(text)
  const outJson = path.join(outDir, 'exported-workflow-from-sqlite.json')
  fs.writeFileSync(outJson, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  const classTypes = [...new Set(Object.values(parsed).map((n) => n?.class_type).filter(Boolean))].sort()
  console.log('nodes', Object.keys(parsed).length)
  console.log('class_types', classTypes.join(', '))
  console.log('written', outJson)

  const cfg = db.exec("SELECT value FROM settings WHERE key = 'comfyConfig'")
  if (cfg[0]?.values?.[0]?.[0]) {
    fs.writeFileSync(path.join(outDir, 'exported-comfy-config.json'), `${cfg[0].values[0][0]}\n`)
    console.log('config written')
  }
  found = true
  break
}

if (!found) process.exitCode = 2
