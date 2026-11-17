/**
 * Coordinator atlas-flow-v1 em 127.0.0.1 (diagnóstico + project.ensure).
 * Geração real permanece NÃO VALIDADA.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const docsDir = path.join(root, 'docs', 'atlas-flow')
const stagingDir = path.join(docsDir, 'staging')
const ports = [39301, 39302, 39303, 39304, 39305]

function loadOrCreatePairingToken() {
  const secretPath = path.join(docsDir, 'coordinator-pairing.local.json')
  const livePath = path.join(docsDir, 'coordinator-live.json')
  try {
    if (fs.existsSync(secretPath)) {
      const secret = JSON.parse(fs.readFileSync(secretPath, 'utf8'))
      if (typeof secret.pairingToken === 'string' && secret.pairingToken.length >= 32) {
        return secret.pairingToken
      }
    }
  } catch {
    /* ignore */
  }
  // Migração: live.json antigo podia conter o token (não deve mais).
  try {
    if (fs.existsSync(livePath)) {
      const live = JSON.parse(fs.readFileSync(livePath, 'utf8'))
      if (typeof live.pairingToken === 'string' && live.pairingToken.length >= 32) {
        return live.pairingToken
      }
    }
  } catch {
    /* ignore */
  }
  return randomBytes(24).toString('hex')
}

const pairingToken = loadOrCreatePairingToken()

let lastObservation = null
/** @type {Map<string, any>} */
const linksByIdempotency = new Map()
/** @type {Map<string, any>} */
const linksByAtlasProject = new Map()
/** @type {Map<string, any>} */
const referencesById = new Map()
/** @type {Map<string, any>} */
const referenceBindings = new Map()

function bootstrapPersistedLink() {
  const linkPath = path.join(docsDir, 'last-project-link.json')
  try {
    if (!fs.existsSync(linkPath)) return
    const parsed = JSON.parse(fs.readFileSync(linkPath, 'utf8'))
    const link = parsed.link
    if (!link?.atlasProjectId || !link?.idempotencyKey) return
    if (link.linkState === 'linked' && link.flowProjectId) {
      linksByIdempotency.set(link.idempotencyKey, link)
      linksByAtlasProject.set(link.atlasProjectId, link)
      console.log(
        `[atlas-flow-v1] vínculo restaurado flowProjectId=${link.flowProjectId}`,
      )
    }
  } catch (error) {
    console.warn('[atlas-flow-v1] falha ao restaurar vínculo', error)
  }
}

bootstrapPersistedLink()
fs.mkdirSync(stagingDir, { recursive: true })

const referencesStorePath = path.join(docsDir, 'references-store.json')

function persistReferencesStore() {
  const link = [...linksByAtlasProject.values()].find((item) => item.linkState === 'linked') || null
  const payload = {
    version: 1,
    atlasProjectId: link?.atlasProjectId || null,
    linkedFlowProjectId: link?.flowProjectId || null,
    updatedAt: new Date().toISOString(),
    note: 'Store persistente de referências (sobrevive a restart). Sem pairingToken.',
    references: [...referencesById.values()],
  }
  fs.writeFileSync(referencesStorePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function bootstrapPersistedReferences() {
  try {
    if (!fs.existsSync(referencesStorePath)) {
      console.log('[atlas-flow-v1] references-store.json ausente')
      return
    }
    const parsed = JSON.parse(fs.readFileSync(referencesStorePath, 'utf8'))
    const items = Array.isArray(parsed.references) ? parsed.references : []
    let loaded = 0
    let missingFiles = 0
    for (const item of items) {
      if (!item?.referenceId || !item?.absPath) continue
      if (!fs.existsSync(item.absPath)) {
        missingFiles += 1
        console.warn(`[atlas-flow-v1] ref ${item.referenceId} sem arquivo: ${item.absPath}`)
        continue
      }
      const bytes = fs.readFileSync(item.absPath)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (item.sha256 && item.sha256 !== sha256) {
        console.warn(
          `[atlas-flow-v1] ref ${item.referenceId} hash diverge store=${item.sha256} disk=${sha256}`,
        )
        continue
      }
      if (item.byteSize && item.byteSize !== bytes.length) {
        console.warn(
          `[atlas-flow-v1] ref ${item.referenceId} size diverge store=${item.byteSize} disk=${bytes.length}`,
        )
        continue
      }
      referencesById.set(item.referenceId, {
        ...item,
        byteSize: bytes.length,
        sha256,
        // Anexação no draft NÃO sobrevive a restart — revalidar na UI atual.
        attachedState: 'not_attached',
      })
      loaded += 1
    }
    console.log(
      `[atlas-flow-v1] referências restauradas loaded=${loaded} missingFiles=${missingFiles} store=${referencesStorePath}`,
    )
  } catch (error) {
    console.warn('[atlas-flow-v1] falha ao restaurar referências', error)
  }
}

bootstrapPersistedReferences()

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function authorize(req) {
  const header = req.headers.authorization?.trim() ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return false
  const left = Buffer.from(header.slice(7).trim())
  const right = Buffer.from(pairingToken)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return null
  return JSON.parse(raw)
}

function writeLive(port) {
  fs.mkdirSync(docsDir, { recursive: true })
  const secretPath = path.join(docsDir, 'coordinator-pairing.local.json')
  const tokenFingerprint = createHash('sha256').update(pairingToken).digest('hex').slice(0, 12)
  fs.writeFileSync(
    secretPath,
    `${JSON.stringify(
      {
        pairingToken,
        endpoint: `http://127.0.0.1:${port}`,
        writtenAt: new Date().toISOString(),
        note: 'Segredo local. Não anexar em issues/chats.',
      },
      null,
      2,
    )}\n`,
  )
  const filePath = path.join(docsDir, 'coordinator-live.json')
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        namespace: 'atlas-flow-v1',
        host: '127.0.0.1',
        port,
        endpoint: `http://127.0.0.1:${port}`,
        hasPairingToken: true,
        pairingTokenFingerprint: tokenFingerprint,
        dataDir: docsDir,
        pidHint: process.pid,
        realFlowValidated: false,
        writtenAt: new Date().toISOString(),
        note: 'Diagnóstico público. Compare pairingTokenFingerprint com o da extensão. Token só em coordinator-pairing.local.json.',
      },
      null,
      2,
    )}\n`,
  )
  return filePath
}

function persistLink(link) {
  const filePath = path.join(docsDir, 'last-project-link.json')
  fs.mkdirSync(docsDir, { recursive: true })
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ receivedAt: new Date().toISOString(), realFlowValidated: false, link }, null, 2)}\n`,
  )
  return filePath
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const host = (req.headers.host ?? '').split(':')[0]?.toLowerCase() ?? ''
        if (host !== '127.0.0.1' && host !== 'localhost') {
          sendJson(res, 403, { error: 'HOST_FORBIDDEN' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')

        if (req.method === 'GET' && url.pathname === '/api/atlas-flow/v1/health') {
          sendJson(res, 200, {
            ok: true,
            namespace: 'atlas-flow-v1',
            protocolVersion: 1,
            host: '127.0.0.1',
            port,
            realFlowValidated: false,
          })
          return
        }

        if (!authorize(req)) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/atlas-flow/v1/executors/hello') {
          const body = (await readJson(req)) || {}
          sendJson(res, 200, {
            ok: true,
            acknowledgedInstallationId: body.installationId ?? null,
            realFlowValidated: false,
            serverTime: new Date().toISOString(),
          })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/atlas-flow/v1/executors/heartbeat') {
          sendJson(res, 200, {
            ok: true,
            serverTime: new Date().toISOString(),
            realFlowValidated: false,
          })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/atlas-flow/v1/session/observations') {
          const body = await readJson(req)
          lastObservation = body
          const isProjectPage = body && typeof body === 'object' && body.kind === 'project_page'
          const obsPath = path.join(
            docsDir,
            isProjectPage ? 'last-project-page-observation.json' : 'last-session-observation.json',
          )
          fs.writeFileSync(
            obsPath,
            `${JSON.stringify({ receivedAt: new Date().toISOString(), realFlowValidated: false, observation: body }, null, 2)}\n`,
          )
          sendJson(res, 200, { ok: true, stored: true, filePath: obsPath, realFlowValidated: false })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/atlas-flow/v1/session/observations/latest') {
          sendJson(res, 200, { ok: true, observation: lastObservation, realFlowValidated: false })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/atlas-flow/v1/projects/ensure') {
          const body = (await readJson(req)) || {}
          const atlasProjectId = String(body.atlasProjectId || '').trim()
          const idempotencyKey = String(
            body.idempotencyKey || req.headers['idempotency-key'] || '',
          ).trim()
          const requestedTitle = String(body.requestedTitle || '').trim() || 'Atlas Flow project'
          if (!atlasProjectId || !idempotencyKey) {
            sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'atlasProjectId e idempotencyKey obrigatórios' })
            return
          }

          const existing =
            linksByIdempotency.get(idempotencyKey) || linksByAtlasProject.get(atlasProjectId) || null

          if (existing?.linkState === 'linked' && existing.flowProjectId) {
            sendJson(res, 200, {
              ok: true,
              action: 'reuse',
              commandId: existing.commandId,
              link: existing,
              realFlowValidated: false,
            })
            return
          }

          if (existing?.linkState === 'uncertain') {
            sendJson(res, 200, {
              ok: false,
              action: 'uncertain_reconcile',
              commandId: existing.commandId,
              link: existing,
              error: 'Há ensure incerto para esta chave. Reconcilie antes de novo clique.',
              realFlowValidated: false,
            })
            return
          }

          const commandId = randomUUID()
          const pending = {
            id: randomUUID(),
            atlasProjectId,
            idempotencyKey,
            commandId,
            requestedTitle,
            flowProjectId: null,
            flowProjectUrl: null,
            observedTitle: null,
            linkState: 'pending_create',
            submissionCertainty: 'not_sent',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          linksByIdempotency.set(idempotencyKey, pending)
          linksByAtlasProject.set(atlasProjectId, pending)
          persistLink(pending)
          sendJson(res, 200, {
            ok: true,
            action: 'create',
            commandId,
            link: pending,
            realFlowValidated: false,
          })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/atlas-flow/v1/projects/ensure/complete') {
          const body = (await readJson(req)) || {}
          const atlasProjectId = String(body.atlasProjectId || '').trim()
          const idempotencyKey = String(
            body.idempotencyKey || req.headers['idempotency-key'] || '',
          ).trim()
          const pageResult = body.pageResult || {}
          const existing =
            linksByIdempotency.get(idempotencyKey) || linksByAtlasProject.get(atlasProjectId) || null
          if (!existing) {
            sendJson(res, 404, { error: 'LINK_NOT_FOUND' })
            return
          }

          const certainty = String(pageResult.certainty || 'not_sent')
          if (pageResult.ok === true && pageResult.flowProjectId && certainty === 'accepted') {
            existing.linkState = 'linked'
            existing.submissionCertainty = 'accepted'
            existing.flowProjectId = pageResult.flowProjectId
            existing.flowProjectUrl =
              pageResult.flowProjectUrl || `https://flow.google.com/project/${pageResult.flowProjectId}`
            existing.observedTitle = pageResult.observedTitle || null
            existing.selector = pageResult.selector || null
            existing.evidence = pageResult.evidence || null
            existing.updatedAt = new Date().toISOString()
            linksByIdempotency.set(idempotencyKey, existing)
            linksByAtlasProject.set(atlasProjectId, existing)
            const filePath = persistLink(existing)
            sendJson(res, 200, {
              ok: true,
              action: pageResult.created ? 'created' : 'reused',
              link: existing,
              filePath,
              realFlowValidated: false,
            })
            return
          }

          if (certainty === 'may_have_sent') {
            existing.linkState = 'uncertain'
            existing.submissionCertainty = 'may_have_sent'
            existing.lastError = pageResult.error || 'SUBMISSION_UNCERTAIN'
            existing.evidence = pageResult.evidence || null
            existing.updatedAt = new Date().toISOString()
            linksByIdempotency.set(idempotencyKey, existing)
            linksByAtlasProject.set(atlasProjectId, existing)
            const filePath = persistLink(existing)
            sendJson(res, 200, {
              ok: false,
              action: 'uncertain',
              link: existing,
              filePath,
              error: 'Envio incerto — reconcilie antes de repetir o clique.',
              realFlowValidated: false,
            })
            return
          }

          existing.linkState = 'failed'
          existing.submissionCertainty = certainty
          existing.lastError = pageResult.error || 'ENSURE_FAILED'
          existing.updatedAt = new Date().toISOString()
          linksByIdempotency.set(idempotencyKey, existing)
          linksByAtlasProject.set(atlasProjectId, existing)
          const filePath = persistLink(existing)
          sendJson(res, 200, {
            ok: false,
            action: 'failed',
            link: existing,
            filePath,
            realFlowValidated: false,
          })
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/atlas-flow/v1/projects/links/latest') {
          const latest = [...linksByIdempotency.values()].sort((a, b) =>
            String(b.updatedAt).localeCompare(String(a.updatedAt)),
          )[0]
          sendJson(res, 200, { ok: true, link: latest || null, realFlowValidated: false })
          return
        }

        // Staging de referência no Atlas (bytes + sha256). Ainda NÃO é binding Flow.
        if (req.method === 'POST' && url.pathname === '/api/atlas-flow/v1/references/stage') {
          const body = (await readJson(req)) || {}
          const atlasProjectId = String(body.atlasProjectId || '').trim()
          const displayName = String(body.displayName || 'reference').trim()
          const mimeType = String(body.mimeType || 'application/octet-stream')
          const base64 = String(body.base64 || '')
          if (!atlasProjectId || !base64) {
            sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'atlasProjectId e base64 obrigatórios' })
            return
          }
          const bytes = Buffer.from(base64, 'base64')
          if (!bytes.length || bytes.length > 12 * 1024 * 1024) {
            sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'arquivo vazio ou >12MB' })
            return
          }
          const sha256 = createHash('sha256').update(bytes).digest('hex')
          const referenceId = randomUUID()
          const versionId = randomUUID()
          const fileName = `${versionId}.bin`
          const absPath = path.join(stagingDir, fileName)
          fs.writeFileSync(absPath, bytes)
          const record = {
            referenceId,
            versionId,
            atlasProjectId,
            displayName,
            mimeType,
            byteSize: bytes.length,
            sha256,
            absPath,
            stagedAt: new Date().toISOString(),
            uploadState: 'staged_local', // ainda NÃO enviado ao Flow
            bindingState: 'not_bound',
            attachedState: 'not_attached', // distinto de upload
            flowMediaId: null,
          }
          referencesById.set(referenceId, record)
          persistReferencesStore()
          const filePath = path.join(docsDir, 'last-reference-stage.json')
          fs.writeFileSync(
            filePath,
            `${JSON.stringify({ receivedAt: new Date().toISOString(), realFlowValidated: false, reference: record }, null, 2)}\n`,
          )
          sendJson(res, 200, {
            ok: true,
            reference: {
              ...record,
              absPath: undefined, // não expor path em toda resposta se não preciso
              stagingPath: absPath,
            },
            distinctions: {
              staged_local: 'arquivo no Atlas',
              uploaded_bound: 'identidade no Flow',
              attached: 'selecionado no draft da geração',
            },
            realFlowValidated: false,
          })
          return
        }

        if (req.method === 'GET' && url.pathname.startsWith('/api/atlas-flow/v1/references/') && url.pathname.endsWith('/bytes')) {
          const referenceId = url.pathname.split('/')[5]
          const record = referencesById.get(referenceId)
          if (!record || !fs.existsSync(record.absPath)) {
            sendJson(res, 404, { error: 'REFERENCE_NOT_FOUND' })
            return
          }
          const bytes = fs.readFileSync(record.absPath)
          res.writeHead(200, {
            'Content-Type': record.mimeType || 'application/octet-stream',
            'Content-Length': bytes.length,
            'X-Atlas-Sha256': record.sha256,
            'Cache-Control': 'no-store',
          })
          res.end(bytes)
          return
        }

        if (req.method === 'GET' && url.pathname === '/api/atlas-flow/v1/references') {
          // Recarrega do disco se a memória estiver vazia (outro processo / restart parcial).
          if (referencesById.size === 0) bootstrapPersistedReferences()
          const atlasProjectId = String(url.searchParams.get('atlasProjectId') || '').trim()
          const linked =
            (atlasProjectId && linksByAtlasProject.get(atlasProjectId)) ||
            [...linksByAtlasProject.values()].find((item) => item.linkState === 'linked') ||
            null
          const all = [...referencesById.values()]
          const items = atlasProjectId
            ? all.filter((item) => item.atlasProjectId === atlasProjectId)
            : all
          sendJson(res, 200, {
            ok: true,
            atlasProjectId: atlasProjectId || null,
            linkedFlowProjectId: linked?.flowProjectId || null,
            storePath: referencesStorePath,
            memoryCount: referencesById.size,
            references: items.map((item) => ({
              referenceId: item.referenceId,
              versionId: item.versionId,
              displayName: item.displayName,
              mimeType: item.mimeType,
              byteSize: item.byteSize,
              sha256: item.sha256,
              uploadState: item.uploadState,
              bindingState: item.bindingState,
              attachedState: item.attachedState,
              flowMediaId: item.flowMediaId,
              fileExists: fs.existsSync(item.absPath),
            })),
            realFlowValidated: false,
          })
          return
        }

        if (req.method === 'POST' && url.pathname === '/api/atlas-flow/v1/references/bindings') {
          const body = (await readJson(req)) || {}
          const referenceId = String(body.referenceId || '').trim()
          const record = referencesById.get(referenceId)
          if (!record) {
            sendJson(res, 404, { error: 'REFERENCE_NOT_FOUND' })
            return
          }
          const binding = {
            id: randomUUID(),
            referenceId,
            versionId: record.versionId,
            atlasProjectId: record.atlasProjectId,
            flowProjectId: body.flowProjectId || null,
            flowMediaId: body.flowMediaId || null,
            bindingState: body.bindingState || 'unknown',
            attachedState: body.attachedState || 'not_attached',
            evidence: body.evidence || null,
            sha256: record.sha256,
            updatedAt: new Date().toISOString(),
          }
          const incomingMediaId =
            typeof binding.flowMediaId === 'string' ? binding.flowMediaId.trim() : null
          const mediaIdLegitimate =
            Boolean(incomingMediaId) &&
            incomingMediaId !== '_gd' &&
            !incomingMediaId.startsWith('_') &&
            (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              incomingMediaId,
            ) ||
              /^[a-zA-Z0-9-]{20,}$/.test(incomingMediaId))

          if (binding.bindingState === 'bound' && mediaIdLegitimate) {
            record.uploadState = 'uploaded_bound'
            record.bindingState = 'bound'
            record.flowMediaId = incomingMediaId
            binding.flowMediaId = incomingMediaId
          } else if (binding.bindingState === 'upload_uncertain_needs_reconcile') {
            record.uploadState = 'upload_uncertain'
            record.bindingState = 'upload_uncertain_needs_reconcile'
            // Invalida _gd / IDs ilegítimos — resposta consistente com binding confirmado.
            record.flowMediaId = null
            binding.flowMediaId = null
          } else if (!mediaIdLegitimate) {
            binding.flowMediaId = null
            if (record.flowMediaId === '_gd' || String(record.flowMediaId || '').startsWith('_')) {
              record.flowMediaId = null
            }
          }
          if (binding.attachedState === 'attached') {
            record.attachedState = 'attached'
          }
          referenceBindings.set(binding.id, binding)
          referencesById.set(referenceId, { ...record })
          persistReferencesStore()
          const confirmedReference = { ...referencesById.get(referenceId) }
          const filePath = path.join(docsDir, 'last-reference-binding.json')
          fs.writeFileSync(
            filePath,
            `${JSON.stringify({ receivedAt: new Date().toISOString(), realFlowValidated: false, binding, reference: confirmedReference }, null, 2)}\n`,
          )
          sendJson(res, 200, {
            ok: true,
            binding,
            reference: confirmedReference,
            realFlowValidated: false,
          })
          return
        }

        sendJson(res, 404, { error: 'NOT_FOUND' })
      } catch (error) {
        sendJson(res, 500, {
          error: 'INTERNAL',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

let server = null
for (const port of ports) {
  try {
    server = await listen(port)
    const livePath = writeLive(port)
    console.log(`[atlas-flow-v1] coordinator http://127.0.0.1:${port}`)
    console.log('[atlas-flow-v1] pairingToken omitido do log/diagnóstico (ver coordinator-pairing.local.json)')
    console.log(`[atlas-flow-v1] live file: ${livePath}`)
    console.log('[atlas-flow-v1] realFlowValidated=false')
    break
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') throw error
  }
}
if (!server) {
  console.error('[atlas-flow-v1] nenhuma porta disponível')
  process.exit(1)
}
