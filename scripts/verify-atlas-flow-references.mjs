/**
 * Demonstra a mesma consulta da extensão: GET /references?atlasProjectId=...
 * Não imprime pairingToken. Pipeline deve ver 2 staged_local.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.join(__dirname, '..', 'docs', 'atlas-flow')
const atlasProjectId = '359ddd99-a504-40c5-86d7-c2e28658e01a'
const expectedFlowProjectId = 'd15189a6-30b9-4681-b86c-a93da144d4fe'

const live = JSON.parse(fs.readFileSync(path.join(docsDir, 'coordinator-live.json'), 'utf8'))
const secret = JSON.parse(
  fs.readFileSync(path.join(docsDir, 'coordinator-pairing.local.json'), 'utf8'),
)
const link = JSON.parse(fs.readFileSync(path.join(docsDir, 'last-project-link.json'), 'utf8')).link

const endpoint = live.endpoint
const url = `${endpoint}/api/atlas-flow/v1/references?atlasProjectId=${encodeURIComponent(atlasProjectId)}`
const res = await fetch(url, {
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${secret.pairingToken}`,
  },
})
const body = await res.json()

const refs = Array.isArray(body.references) ? body.references : []
const staged = refs.filter((item) => item.uploadState === 'staged_local')
const fileChecks = []
for (const ref of refs) {
  const store = JSON.parse(fs.readFileSync(path.join(docsDir, 'references-store.json'), 'utf8'))
  const full = (store.references || []).find((item) => item.referenceId === ref.referenceId)
  if (!full?.absPath) {
    fileChecks.push({ referenceId: ref.referenceId, ok: false, error: 'no_absPath_in_store' })
    continue
  }
  const bytes = fs.readFileSync(full.absPath)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  fileChecks.push({
    referenceId: ref.referenceId,
    displayName: ref.displayName,
    ok: sha256 === ref.sha256 && bytes.length === ref.byteSize,
    byteSize: bytes.length,
    sha256,
    fileExists: true,
  })
}

const report = {
  ok: res.ok && staged.length >= 2 && fileChecks.every((item) => item.ok),
  endpoint,
  httpStatus: res.status,
  atlasProjectId,
  expectedFlowProjectId,
  linkAtlasProjectId: link.atlasProjectId,
  linkFlowProjectId: link.flowProjectId,
  idsMatch:
    link.atlasProjectId === atlasProjectId && link.flowProjectId === expectedFlowProjectId,
  linkedFlowProjectIdFromApi: body.linkedFlowProjectId ?? null,
  memoryCount: body.memoryCount ?? null,
  storePath: body.storePath ?? null,
  referencesCount: refs.length,
  stagedCount: staged.length,
  references: refs.map((item) => ({
    referenceId: item.referenceId,
    displayName: item.displayName,
    uploadState: item.uploadState,
    byteSize: item.byteSize,
    sha256: item.sha256,
    fileExists: item.fileExists,
  })),
  fileChecks,
  realFlowValidated: false,
  note: 'Mesma operação GET usada pela extensão. Sem token neste relatório.',
  writtenAt: new Date().toISOString(),
}

fs.writeFileSync(
  path.join(docsDir, 'evidence', 'references-query-verify.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 1)
