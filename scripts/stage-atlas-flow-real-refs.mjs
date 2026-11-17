/**
 * Gera 2 PNGs reais distintos e faz stage no Coordinator (staged_local).
 * Não imprime pairingToken. Marco de geração permanece NÃO VALIDADO.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const docsDir = path.join(root, 'docs', 'atlas-flow')
const fixturesDir = path.join(docsDir, 'fixtures')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** PNG RGB 96x96 com cor sólida + faixa — imagem real (não 1x1). */
function makePng(r, g, b, band) {
  const width = 96
  const height = 96
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3)
    row[0] = 0
    for (let x = 0; x < width; x += 1) {
      const i = 1 + x * 3
      const inBand = y >= 40 && y <= 55
      row[i] = inBand ? band[0] : r
      row[i + 1] = inBand ? band[1] : g
      row[i + 2] = inBand ? band[2] : b
    }
    rows.push(row)
  }
  const raw = Buffer.concat(rows)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function loadPairing() {
  const secretPath = path.join(docsDir, 'coordinator-pairing.local.json')
  const livePath = path.join(docsDir, 'coordinator-live.json')
  const secret = JSON.parse(fs.readFileSync(secretPath, 'utf8'))
  const live = JSON.parse(fs.readFileSync(livePath, 'utf8'))
  if (!secret.pairingToken || !live.endpoint) {
    throw new Error('pairing local / live incompletos')
  }
  return { token: secret.pairingToken, endpoint: live.endpoint }
}

async function stageOne(endpoint, token, atlasProjectId, displayName, bytes, mimeType) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const res = await fetch(`${endpoint}/api/atlas-flow/v1/references/stage`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      atlasProjectId,
      displayName,
      mimeType,
      base64: bytes.toString('base64'),
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok !== true) {
    throw new Error(`stage ${displayName} falhou HTTP ${res.status}: ${JSON.stringify(body)}`)
  }
  return {
    displayName,
    byteSize: bytes.length,
    sha256,
    referenceId: body.reference?.referenceId,
    uploadState: body.reference?.uploadState,
  }
}

const atlasProjectId = '359ddd99-a504-40c5-86d7-c2e28658e01a'
fs.mkdirSync(fixturesDir, { recursive: true })
const refA = makePng(32, 96, 180, [240, 200, 40])
const refB = makePng(180, 64, 48, [40, 200, 160])
fs.writeFileSync(path.join(fixturesDir, 'ref-a-real.png'), refA)
fs.writeFileSync(path.join(fixturesDir, 'ref-b-real.png'), refB)

const { token, endpoint } = loadPairing()
const a = await stageOne(endpoint, token, atlasProjectId, 'atlas-ref-a', refA, 'image/png')
const b = await stageOne(endpoint, token, atlasProjectId, 'atlas-ref-b', refB, 'image/png')

const out = {
  ok: true,
  endpoint,
  atlasProjectId,
  staged: [a, b],
  realFlowValidated: false,
  note: '2 PNGs reais staged_local. Sem pairingToken neste arquivo.',
  writtenAt: new Date().toISOString(),
}
fs.writeFileSync(
  path.join(docsDir, 'last-real-refs-stage.json'),
  `${JSON.stringify(out, null, 2)}\n`,
)
console.log(JSON.stringify(out, null, 2))
