/**
 * Demonstra hello + vínculo + 2 refs na instância ativa, sem imprimir o token.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.join(__dirname, '..', 'docs', 'atlas-flow')
const expectedAtlas = '359ddd99-a504-40c5-86d7-c2e28658e01a'
const expectedFlow = 'd15189a6-30b9-4681-b86c-a93da144d4fe'

const live = JSON.parse(fs.readFileSync(path.join(docsDir, 'coordinator-live.json'), 'utf8'))
const secret = JSON.parse(
  fs.readFileSync(path.join(docsDir, 'coordinator-pairing.local.json'), 'utf8'),
)
const linkFile = JSON.parse(fs.readFileSync(path.join(docsDir, 'last-project-link.json'), 'utf8'))

const endpoint = live.endpoint
const tokenFp = createHash('sha256').update(secret.pairingToken).digest('hex').slice(0, 12)
const fileFp = live.pairingTokenFingerprint || null

const healthRes = await fetch(`${endpoint}/api/atlas-flow/v1/health`)
const health = await healthRes.json()

const helloRes = await fetch(`${endpoint}/api/atlas-flow/v1/executors/hello`, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret.pairingToken}`,
  },
  body: JSON.stringify({
    installationId: 'verify-script',
    extensionVersion: 'verify',
    protocolVersion: 1,
  }),
})
const helloBody = await helloRes.json().catch(() => null)

let linkBody = null
let refsBody = null
if (helloRes.ok) {
  const linkRes = await fetch(`${endpoint}/api/atlas-flow/v1/projects/links/latest`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${secret.pairingToken}`,
    },
  })
  linkBody = await linkRes.json()
  const refsRes = await fetch(
    `${endpoint}/api/atlas-flow/v1/references?atlasProjectId=${encodeURIComponent(expectedAtlas)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${secret.pairingToken}`,
      },
    },
  )
  refsBody = await refsRes.json()
}

const link = linkBody?.link || null
const refs = Array.isArray(refsBody?.references) ? refsBody.references : []
const staged = refs.filter((item) => item.uploadState === 'staged_local')

const report = {
  ok:
    health.ok === true &&
    helloRes.ok === true &&
    link?.linkState === 'linked' &&
    link?.atlasProjectId === expectedAtlas &&
    link?.flowProjectId === expectedFlow &&
    staged.length >= 2,
  endpoint,
  dataDir: live.dataDir || docsDir,
  pidHint: live.pidHint || null,
  pairingFile: 'docs/atlas-flow/coordinator-pairing.local.json',
  pairingTokenFingerprint: tokenFp,
  liveFingerprint: fileFp,
  fingerprintsMatch: fileFp ? fileFp === tokenFp : null,
  healthOk: health.ok === true,
  helloOk: helloRes.ok === true,
  helloHttpStatus: helloRes.status,
  helloError: helloRes.ok ? null : helloBody?.error || `HTTP ${helloRes.status}`,
  link: link
    ? {
        atlasProjectId: link.atlasProjectId,
        flowProjectId: link.flowProjectId,
        linkState: link.linkState,
      }
    : null,
  linkFileMatches:
    linkFile.link?.atlasProjectId === expectedAtlas &&
    linkFile.link?.flowProjectId === expectedFlow,
  stagedCount: staged.length,
  references: refs.map((item) => ({
    referenceId: item.referenceId,
    displayName: item.displayName,
    uploadState: item.uploadState,
    sha256: item.sha256,
  })),
  realFlowValidated: false,
  note: 'Sem pairingToken neste relatório. Extensão deve usar o mesmo fingerprint.',
  writtenAt: new Date().toISOString(),
}

fs.mkdirSync(path.join(docsDir, 'evidence'), { recursive: true })
fs.writeFileSync(
  path.join(docsDir, 'evidence', 'paired-instance-verify.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)

// Atualiza fingerprint público no live sem reescrever o token.
live.pairingTokenFingerprint = tokenFp
live.dataDir = docsDir
live.pidHint = live.pidHint || null
live.note =
  'Diagnóstico público. Compare pairingTokenFingerprint com o da extensão. Token só em coordinator-pairing.local.json.'
fs.writeFileSync(path.join(docsDir, 'coordinator-live.json'), `${JSON.stringify(live, null, 2)}\n`)

console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 1)
