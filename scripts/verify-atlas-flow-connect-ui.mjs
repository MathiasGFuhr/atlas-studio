/**
 * Validação estática + smoke do fluxo de conexão Google Flow (sem UI).
 * Não exige Chrome; valida contrato HTTP quando o Coordinator com o código novo estiver no ar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function assert(cond, msg) {
  if (!cond) failures.push(msg)
}

const page = path.join(root, 'src/renderer/pages/FlowPromptsPage.tsx')
const pageSrc = fs.readFileSync(page, 'utf8')
assert(pageSrc.includes('Conectar ao Google Flow'), 'UI deve ter botão Conectar ao Google Flow')
assert(pageSrc.includes('Configurações avançadas'), 'UI deve ter Configurações avançadas')
assert(pageSrc.includes('Diagnóstico'), 'UI deve ter Diagnóstico')
assert(!/Gerar código de pareamento/.test(pageSrc), 'UI normal não deve pedir código de pareamento')
assert(pageSrc.includes('connectGoogleFlow'), 'UI deve chamar connectGoogleFlow')
assert(pageSrc.includes('CONTROL_NOT_FOUND'), 'Diagnóstico deve manter menção a CONTROL_NOT_FOUND')
assert(pageSrc.includes('ATTACH_FAILED'), 'Diagnóstico deve manter menção a ATTACH_FAILED')

const coord = path.join(root, 'src/main/services/atlas-flow-v1/CoordinatorServer.ts')
const coordSrc = fs.readFileSync(coord, 'utf8')
assert(coordSrc.includes('/api/atlas-flow/v1/pairing/pending'), 'Coordinator deve expor pairing/pending')
assert(coordSrc.includes('beginGoogleFlowConnect'), 'Coordinator deve ter beginGoogleFlowConnect')
assert(coordSrc.includes('publishedForAutoClaim'), 'Oferta auto-claim deve existir')

const sw = path.join(root, 'apps/atlas-flow-extension/src/background/serviceWorker.ts')
const swSrc = fs.readFileSync(sw, 'utf8')
assert(swSrc.includes('pollPendingPairingOffer'), 'Extensão deve polir oferta de pareamento')
assert(swSrc.includes('session.ensure'), 'Extensão deve executar session.ensure')
assert(swSrc.includes('ensureFlowSessionAction'), 'Extensão deve ter ensureFlowSessionAction')

const distBg = path.join(root, 'apps/atlas-flow-extension/dist/background.js')
assert(fs.existsSync(distBg), 'dist/background.js deve existir (rode npm run build na extensão)')
const distBgSrc = fs.readFileSync(distBg, 'utf8')
assert(distBgSrc.includes('pairing/pending'), 'dist deve incluir poll de pairing/pending')
assert(distBgSrc.includes('session.ensure'), 'dist deve incluir session.ensure')

const endpoint = process.env.ATLAS_FLOW_ENDPOINT || 'http://127.0.0.1:39301'
let live = null
try {
  const health = await fetch(`${endpoint}/api/atlas-flow/v1/health`)
  live = { healthOk: health.ok, health: await health.json().catch(() => null) }
  const pending = await fetch(`${endpoint}/api/atlas-flow/v1/pairing/pending`)
  live.pendingStatus = pending.status
  live.pending = await pending.json().catch(() => null)
} catch (error) {
  live = { error: error instanceof Error ? error.message : String(error) }
}

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      failures,
      live,
      note:
        live?.pending?.ok === true
          ? 'Coordinator novo responde pairing/pending'
          : 'Se pending falhar/404, reinicie o Atlas para carregar o Coordinator novo.',
    },
    null,
    2,
  ),
)
process.exit(failures.length === 0 ? 0 : 1)
