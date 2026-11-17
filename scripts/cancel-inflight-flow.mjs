import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.join(process.env.APPDATA || '', 'Atlas Studio', 'atlas-studio.db')
const wasm = path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')

const SQL = await initSqlJs({ locateFile: () => wasm })
const db = new SQL.Database(fs.readFileSync(dbPath))
const now = new Date().toISOString()

function rows(sql) {
  const result = db.exec(sql)
  if (!result[0]) return []
  const cols = result[0].columns
  return result[0].values.map((value) =>
    Object.fromEntries(cols.map((col, index) => [col, value[index]])),
  )
}

const attempts = rows(`
  SELECT id, state, execution_stage, failure_code
  FROM flow_attempts
  WHERE state NOT IN ('completed','failed','canceled','partial','submission_uncertain')
`)
const commands = rows(`
  SELECT id, operation, status
  FROM flow_commands
  WHERE status IN ('queued','leased')
`)

console.log('inflight_attempts', attempts)
console.log('open_commands', commands)

db.run(
  `UPDATE flow_attempts
   SET state='canceled',
       execution_stage='canceled_by_user',
       failure_code='CANCELED_BY_USER',
       cancel_requested_at=?,
       cancel_requested_by='user',
       finished_at=?,
       revision=revision+1
   WHERE state NOT IN ('completed','failed','canceled','partial','submission_uncertain')`,
  [now, now],
)

db.run(
  `UPDATE flow_commands
   SET status='failed',
       result_digest=?,
       acknowledged_at=?
   WHERE status IN ('queued','leased')`,
  [JSON.stringify({ canceled: true, reason: 'CANCELED_BY_USER' }), now],
)

console.log(
  'remaining_inflight',
  rows(`
    SELECT COUNT(*) AS c FROM flow_attempts
    WHERE state NOT IN ('completed','failed','canceled','partial','submission_uncertain')
  `)[0],
)
console.log(
  'remaining_open_cmds',
  rows(`SELECT COUNT(*) AS c FROM flow_commands WHERE status IN ('queued','leased')`)[0],
)

fs.writeFileSync(dbPath, Buffer.from(db.export()))
console.log('db_saved', dbPath)
