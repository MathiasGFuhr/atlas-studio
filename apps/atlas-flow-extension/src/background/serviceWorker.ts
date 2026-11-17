/**
 * Service worker atlas-flow-v1.
 * Roda no Chrome do usuário (onde o Flow autenticado está).
 * Sem cookies Google, sem bridge legado, integração Flow: NÃO VALIDADA.
 */

import { decideReferencesAvailability } from './pairedAuthority'
import {
  deriveConnectionState,
  mergePairingCredentials,
  normalizePairingRecord,
  reconnectDelayMs,
} from './pairingStore.mjs'
import {
  PACKAGE_VERSION,
  PROTOCOL_VERSION,
  SENSOR_VERSION,
  evaluateSensorHandshake,
} from '../versionContract.mjs'
import {
  createAttemptCorrelationSession,
  diagnoseMissingCorrelation,
  evaluateAttemptBusyState,
} from '../content/resultIdentityContract.mjs'
import { normalizeFlowImageSettings } from '../content/imageSettingsContract.mjs'

const ALARM_RECOVERY = 'atlas-flow-v1-recovery'
const ALARM_HEARTBEAT = 'atlas-flow-v1-heartbeat'
const ALARM_JOBS = 'atlas-flow-v1-jobs'
const ALARM_PAIRING_OFFER = 'atlas-flow-v1-pairing-offer'
const LOG_LIMIT = 80
/** Porta preferida autoritativa — sem hop silencioso entre instâncias. */
const PREFERRED_LOOPBACK_ENDPOINT = 'http://127.0.0.1:39301'
const FLOW_HOME_URL = 'https://flow.google.com/'

/** Personagem marcado na barra, ou o cantor antigo quando o campo ainda não veio no payload. */
function isSingerCharacter(item: Record<string, unknown>): boolean {
  if ('useAsCharacter' in item && item.useAsCharacter != null) {
    return item.useAsCharacter === true || item.useAsCharacter === 1 || item.useAsCharacter === '1'
  }
  const alias = typeof item.alias === 'string' ? item.alias.trim().toLowerCase() : ''
  return alias === 'cantor'
}

function promptWithSingerCharacter(
  text: string,
  refs: Array<Record<string, unknown>> = [],
): string {
  const names = new Set<string>()
  for (const ref of refs) {
    if (!isSingerCharacter(ref)) continue
    const alias = typeof ref.alias === 'string' ? ref.alias.trim() : ''
    if (alias) names.add(alias)
  }
  let out = text
  for (const alias of names) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\[${escaped}\\]`, 'gi'), `@${alias}`)
  }
  return out
}

function projectHintFromPayload(payload: Record<string, unknown>) {
  return {
    atlasProjectId: typeof payload.atlasProjectId === 'string' ? payload.atlasProjectId : '',
    flowProjectId: typeof payload.flowProjectId === 'string' ? payload.flowProjectId : '',
    flowProjectUrl: typeof payload.flowProjectUrl === 'string' ? payload.flowProjectUrl : '',
  }
}

const SENSOR_BUILD_ID = '0.3.76'
const tabDebuggerLocks = new Map<number, Promise<unknown>>()

async function withTabDebuggerLock<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = tabDebuggerLocks.get(tabId) || Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  tabDebuggerLocks.set(tabId, next)
  try {
    return await next
  } finally {
    if (tabDebuggerLocks.get(tabId) === next) {
      tabDebuggerLocks.delete(tabId)
    }
  }
}

async function ensureSingerCharacterOnPage(
  refs: Array<Record<string, unknown>>,
  hint?: { atlasProjectId?: string; flowProjectId?: string; flowProjectUrl?: string },
): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(hint)
  if (!ctx.ok || ctx.tabId == null || !ctx.state?.endpoint || !ctx.state.pairingToken) {
    return { ok: false, error: 'CHARACTER_PAGE_UNAVAILABLE', step: 'project_context' }
  }
  let last: Record<string, unknown> = { ok: false, error: 'CHARACTER_NOT_CREATED', step: 'ensure_singer_character' }
  for (const ref of refs) {
    const referenceId = String(ref.referenceId || '')
    if (!referenceId) continue
    const bytesRes = await fetch(
      `${ctx.state.endpoint}/api/atlas-flow/v1/references/${referenceId}/bytes`,
      { headers: { Authorization: `Bearer ${ctx.state.pairingToken}` } },
    )
    if (!bytesRes.ok) {
      last = { ok: false, error: 'CHARACTER_BYTES_UNAVAILABLE', step: 'fetch_bytes', referenceId }
      continue
    }
    const buffer = await bytesRes.arrayBuffer()
    const mimeType = String(ref.mimeType || bytesRes.headers.get('Content-Type') || 'image/png')
    const charAlias =
      typeof ref.alias === 'string' && ref.alias.trim() ? ref.alias.trim() : 'cantor'
    const charName = flowReferenceFileName({ ...ref, alias: charAlias, mimeType })
    try {
      const page = (await chrome.tabs.sendMessage(ctx.tabId, {
        type: 'atlas-flow-v1.page.ensureSingerCharacter',
        payload: {
          alias: charAlias,
          name: charName,
          mimeType,
          base64: await arrayBufferToBase64(buffer),
          expectedFlowProjectId: ctx.flowProjectId,
        },
      })) as Record<string, unknown>
      last = page && typeof page === 'object' ? page : { ok: false, error: 'CHARACTER_NO_RESPONSE' }
    } catch (error) {
      last = {
        ok: false,
        error: error instanceof Error ? error.message : 'CHARACTER_SENSOR_MISSING',
        step: 'ensure_singer_character',
      }
    }
    if (last.ok === true) return last
  }
  return last
}

async function trustedInsertAt(tabId: number, x: number, y: number, text: string, pressEnter = false) {
  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    try {
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true
      await dispatchMouse(target, Math.round(x), Math.round(y), 1)
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
        modifiers: 2,
      })
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
        modifiers: 2,
      })
      await chrome.debugger.sendCommand(target, 'Input.insertText', { text })
      if (pressEnter) {
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
        })
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
        })
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

function flowReferenceFileName(item: Record<string, unknown>): string {
  const alias = typeof item.alias === 'string' ? item.alias.trim() : ''
  const display = String(item.displayName || item.referenceId || 'reference').trim()
  const base = (alias || display).replace(/\.(png|jpe?g|webp|gif)$/i, '').trim() || 'reference'
  const safe = base.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'reference'
  const mime = String(item.mimeType || '').toLowerCase()
  const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
  return `${safe}.${ext}`
}
const GOOGLE_ACCOUNTS_URL =
  'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fflow.google.com%2F'
let jobRunnerBusy = false
/** O compositor do Flow só recebe um prompt por vez. A observação das imagens espera a vez. */
let composerBusy = false

async function waitUntilComposerFree(): Promise<void> {
  while (composerBusy) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let jobPollTimer: ReturnType<typeof setInterval> | null = null
let pairingOfferTimer: ReturnType<typeof setInterval> | null = null

type LogEntry = {
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
  data?: Record<string, unknown>
}

type PairingState = {
  installationId: string | null
  paired: boolean
  endpoint: string | null
  preferredEndpoint: string | null
  pairingToken: string | null
  connectionState:
    | 'unpaired'
    | 'reconnecting'
    | 'atlas_unavailable'
    | 'credential_rejected'
    | 'connected'
  lastError: string | null
  lastHealthOk: boolean | null
  lastHelloOk: boolean | null
  reconnectAttempt: number
  lastReconnectAt: string | null
}

async function appendLog(
  level: LogEntry['level'],
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const stored = await chrome.storage.local.get(['diagnosticLogs'])
  const prev = Array.isArray(stored.diagnosticLogs) ? (stored.diagnosticLogs as LogEntry[]) : []
  const next = [
    ...prev,
    {
      at: new Date().toISOString(),
      level,
      message,
      ...(data ? { data } : {}),
    },
  ].slice(-LOG_LIMIT)
  await chrome.storage.local.set({ diagnosticLogs: next })
}

const CAPTURE_CORRELATION_PREFIX = 'atlasFlowV1.captureCorrelation.'

function mergeShaLists(...lists: string[][]): string[] {
  const out = new Set<string>()
  for (const list of lists) {
    for (const raw of list) {
      const sha = String(raw || '').toLowerCase()
      if (sha.length >= 16) out.add(sha)
    }
  }
  return [...out]
}

function mergeIdentityLists(...lists: Array<unknown>): string[] {
  const out = new Set<string>()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      const value = String(raw || '').trim()
      if (value) out.add(value)
    }
  }
  return [...out]
}

async function loadCaptureCorrelation(
  attemptId: string,
): Promise<Record<string, unknown> | null> {
  const key = `${CAPTURE_CORRELATION_PREFIX}${attemptId}`
  const stored = await chrome.storage.local.get([key])
  const value = stored[key]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

async function saveCaptureCorrelation(
  attemptId: string,
  correlation: Record<string, unknown>,
): Promise<void> {
  const key = `${CAPTURE_CORRELATION_PREFIX}${attemptId}`
  await chrome.storage.local.set({ [key]: correlation })
}

async function readPairingState(): Promise<PairingState> {
  const stored = await chrome.storage.local.get(null)
  return normalizePairingRecord(stored as Record<string, unknown>) as PairingState
}

async function writePairingPatch(patch: Record<string, unknown>): Promise<void> {
  await chrome.storage.local.set(patch)
}

async function disconnectPairing(): Promise<Record<string, unknown>> {
  await writePairingPatch({
    pairingToken: null,
    paired: false,
    connectionState: 'unpaired',
    lastHelloOk: false,
    lastError: null,
    reconnectAttempt: 0,
  })
  await appendLog('info', 'Pareamento desconectado explicitamente')
  return { ok: true, connectionState: 'unpaired' }
}

async function ensureBoot(): Promise<void> {
  const state = await readPairingState()
  if (!state.installationId) {
    const installationId = crypto.randomUUID()
    await writePairingPatch({
      installationId,
      paired: false,
      connectionState: 'unpaired',
      // preferredEndpoint só após claim/hello bem-sucedido (evita 39301 fantasma).
      protocolNamespace: 'atlas-flow-v1',
      schemaVersion: 1,
      diagnosticLogs: [],
    })
    await appendLog('info', 'Boot: installationId criado', { installationId })
  } else if (!state.preferredEndpoint && state.endpoint) {
    // Só promove endpoint já pareado; não inventa porta default.
    await writePairingPatch({ preferredEndpoint: state.endpoint })
  }

  await chrome.alarms.create(ALARM_RECOVERY, { periodInMinutes: 0.5 })
  await chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 0.5 })
  await chrome.alarms.create(ALARM_JOBS, { periodInMinutes: 1 })
  await chrome.alarms.create(ALARM_PAIRING_OFFER, { periodInMinutes: 0.5 })

  // Chrome pode limitar alarms; poll curto enquanto o SW está vivo.
  if (jobPollTimer) clearInterval(jobPollTimer)
  jobPollTimer = setInterval(() => {
    void pollAndRunClaimedJob()
  }, 2_000)
  if (pairingOfferTimer) clearInterval(pairingOfferTimer)
  pairingOfferTimer = setInterval(() => {
    void pollPendingPairingOffer('timer')
  }, 4_000)

  // Reconexão automática — não depende do popup nem só de onStartup.
  void attemptReconnect('boot')
  void pollPendingPairingOffer('boot')
}

/**
 * Reconecta com token salvo. Rede fora ≠ apagar credencial.
 * Só 401/403 marca credential_rejected.
 */
async function attemptReconnect(reason: string): Promise<void> {
  const state = await readPairingState()
  if (!state.pairingToken || !state.installationId) {
    await writePairingPatch({
      connectionState: 'unpaired',
      paired: false,
    })
    return
  }

  if (state.connectionState === 'credential_rejected') {
    return
  }

  const endpoint = state.preferredEndpoint || state.endpoint
  if (!endpoint) {
    await writePairingPatch({
      connectionState: 'reconnecting',
      lastError:
        'Endpoint pareado ausente. Abra o popup uma vez e cole o endpoint mostrado no Atlas → Conexão.',
    })
    return
  }
  await writePairingPatch({
    connectionState: 'reconnecting',
    lastReconnectAt: new Date().toISOString(),
  })
  await appendLog('info', 'Reconectando ao Coordinator', { reason, endpoint })

  const health = await probeHealth(endpoint)
  if (!health.ok) {
    const attempt = (state.reconnectAttempt || 0) + 1
    await writePairingPatch({
      connectionState: 'atlas_unavailable',
      paired: false,
      lastHealthOk: false,
      lastHelloOk: false,
      lastError: 'Atlas indisponível (Coordinator não responde). Credencial preservada.',
      reconnectAttempt: attempt,
      // NÃO apaga pairingToken
    })
    scheduleReconnect(attempt)
    return
  }

  const hello = await postHello(endpoint, state.pairingToken, state.installationId)
  if (hello.ok) {
    await writePairingPatch({
      endpoint,
      preferredEndpoint: endpoint,
      paired: true,
      connectionState: 'connected',
      lastHealthOk: true,
      lastHelloOk: true,
      lastError: null,
      reconnectAttempt: 0,
    })
    await appendLog('info', 'Hello automático OK', { endpoint, reason })
    void pollAndRunClaimedJob()
    return
  }

  const conn = deriveConnectionState({
    helloOk: false,
    httpStatus: hello.httpStatus ?? null,
    networkError: !hello.httpStatus,
  })
  const attempt = (state.reconnectAttempt || 0) + 1
  await writePairingPatch({
    connectionState: conn,
    paired: false,
    lastHealthOk: true,
    lastHelloOk: false,
    lastError:
      conn === 'credential_rejected'
        ? 'Credencial rejeitada (401/403). Gere um novo código de pareamento no Atlas.'
        : hello.error || 'Hello falhou',
    reconnectAttempt: attempt,
  })
  if (conn !== 'credential_rejected') {
    scheduleReconnect(attempt)
  }
}

function scheduleReconnect(attempt: number): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  const delay = reconnectDelayMs(attempt)
  reconnectTimer = setTimeout(() => {
    void attemptReconnect('backoff')
  }, delay)
}

async function probeHealth(endpoint: string): Promise<{ ok: boolean; body?: unknown; error?: string }> {
  try {
    const res = await fetch(`${endpoint}/api/atlas-flow/v1/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, body, error: `HTTP ${res.status}` }
    }
    return { ok: true, body }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function sha256HexUtf8(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Fingerprint curto do token — nunca o token em si. */
async function pairingTokenFingerprint(token: string | null | undefined): Promise<string | null> {
  if (!token) return null
  const hex = await sha256HexUtf8(token)
  return hex.slice(0, 12)
}

async function postHello(
  endpoint: string,
  pairingToken: string,
  installationId: string,
): Promise<{ ok: boolean; body?: unknown; error?: string; httpStatus?: number }> {
  try {
    const res = await fetch(`${endpoint}/api/atlas-flow/v1/executors/hello`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pairingToken}`,
      },
      body: JSON.stringify({
        installationId,
        extensionVersion: chrome.runtime.getManifest().version,
        protocolVersion: PROTOCOL_VERSION,
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const authError = res.status === 401 || res.status === 403
      return {
        ok: false,
        body,
        httpStatus: res.status,
        error: authError
          ? `UNAUTHORIZED HTTP ${res.status} — credencial rejeitada. Gere um novo código em Atlas → Flow → Conexão.`
          : `HTTP ${res.status}`,
      }
    }
    return { ok: true, body, httpStatus: res.status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function postHeartbeat(
  endpoint: string,
  pairingToken: string,
  installationId: string,
): Promise<void> {
  try {
    await fetch(`${endpoint}/api/atlas-flow/v1/executors/heartbeat`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pairingToken}`,
      },
      body: JSON.stringify({ installationId }),
    })
  } catch {
    // heartbeat falho não derruba journal; próximo ciclo tenta de novo
  }
}

/**
 * Autoridade = preferredEndpoint/endpoint salvos. Sem hop silencioso entre portas.
 * (discoverEndpoint legado removido — varredura de portas violava a autoridade pareada.)
 */
async function resolveAuthoritativeEndpoint(
  state: PairingState,
): Promise<{ endpoint: string | null; reason?: string }> {
  const endpoint = state.preferredEndpoint || state.endpoint
  if (!endpoint) {
    return {
      endpoint: null,
      reason: 'Sem endpoint pareado salvo. Use o endpoint exibido no Atlas → Conexão.',
    }
  }
  return { endpoint }
}

async function discoverPairedEndpoint(
  pairingToken: string,
  installationId: string,
  preferredEndpoint?: string | null,
): Promise<{ endpoint: string | null; probes: Array<Record<string, unknown>> }> {
  const endpoint = preferredEndpoint || null
  const probes: Array<Record<string, unknown>> = []
  if (!endpoint) {
    return { endpoint: null, probes }
  }
  const health = await probeHealth(endpoint)
  if (!health.ok) {
    probes.push({ endpoint, healthOk: false, helloOk: false })
    return { endpoint: null, probes }
  }
  const hello = await postHello(endpoint, pairingToken, installationId)
  probes.push({ endpoint, healthOk: true, helloOk: hello.ok, helloError: hello.error ?? null })
  if (hello.ok) {
    await appendLog('info', 'Coordinator pareado reconfirmado via hello', { endpoint })
    return { endpoint, probes }
  }
  return { endpoint: null, probes }
}

/**
 * Instalação ainda não pareada: busca oferta temporária publicada pelo botão do Atlas.
 * Só usa a porta preferida (sem varredura). Claim preserva installationId + validação no Coordinator.
 */
async function pollPendingPairingOffer(reason: string): Promise<void> {
  const state = await readPairingState()
  if (state.pairingToken && state.connectionState === 'connected') return
  if (state.connectionState === 'credential_rejected') return
  // Com token e Atlas só “indisponível” no endpoint antigo, ainda aceita oferta nova
  // (ex.: porta preferida voltou para 39301 após reinício).
  if (state.pairingToken && state.connectionState !== 'atlas_unavailable') return

  const endpoint = PREFERRED_LOOPBACK_ENDPOINT
  try {
    const res = await fetch(`${endpoint}/api/atlas-flow/v1/pairing/pending`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return
    const body = (await res.json().catch(() => null)) as {
      active?: boolean
      code?: string
      endpoint?: string
    } | null
    if (!body?.active || !body.code) return
    await appendLog('info', 'Oferta de pareamento detectada', { reason, endpoint: body.endpoint || endpoint })
    const claimed = await claimPairingCode({
      code: body.code,
      endpoint: body.endpoint || endpoint,
    })
    if (claimed.ok === true) {
      await appendLog('info', 'Pareamento automático via oferta OK', { reason })
      void pollAndRunClaimedJob()
    }
  } catch {
    // Atlas offline — silencioso; tenta de novo no próximo ciclo.
  }
}

/**
 * Troca código de uso único (Atlas) pela credencial persistente.
 */
async function claimPairingCode(input: {
  code?: string
  endpoint?: string
}): Promise<Record<string, unknown>> {
  const state = await readPairingState()
  const code = String(input.code || '').trim().toUpperCase()
  const endpoint =
    mergePairingCredentials({ endpoint: input.endpoint }, state).endpoint ||
    (input.endpoint ? String(input.endpoint).trim() : null) ||
    PREFERRED_LOOPBACK_ENDPOINT
  if (!code || code.length < 6) {
    return { ok: false, error: 'PAIRING_CODE_REQUIRED', connectionState: state.connectionState }
  }
  if (!endpoint) {
    return {
      ok: false,
      error: 'ENDPOINT_REQUIRED',
      connectionState: state.connectionState,
      message:
        'Endpoint do Atlas indisponível na porta preferida. Abra o Atlas e toque em Conectar ao Google Flow.',
    }
  }
  if (!state.installationId) {
    return { ok: false, error: 'INSTALLATION_MISSING' }
  }
  try {
    const res = await fetch(`${endpoint}/api/atlas-flow/v1/pairing/claim`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        installationId: state.installationId,
        extensionVersion: chrome.runtime.getManifest().version,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const conn = deriveConnectionState({
        httpStatus: res.status,
        networkError: false,
        helloOk: false,
      })
      await writePairingPatch({
        connectionState: conn,
        lastError:
          res.status === 401 || res.status === 403
            ? 'Código inválido ou expirado.'
            : `Falha ao reivindicar código (HTTP ${res.status}).`,
      })
      return { ok: false, error: body.error || `HTTP_${res.status}`, connectionState: conn }
    }
    const pairingToken = String(body.pairingToken || '')
    if (!pairingToken) {
      return { ok: false, error: 'PAIRING_TOKEN_MISSING_IN_RESPONSE' }
    }
    await writePairingPatch({
      pairingToken,
      endpoint,
      preferredEndpoint: endpoint,
      paired: true,
      connectionState: 'connected',
      lastHealthOk: true,
      lastHelloOk: true,
      lastError: null,
      reconnectAttempt: 0,
    })
    await appendLog('info', 'Pareamento via código OK', { endpoint })
    return {
      ok: true,
      endpoint,
      connectionState: 'connected',
      pairingTokenFingerprint: await pairingTokenFingerprint(pairingToken),
      note: 'Credencial persistente salva. Código de uso único consumido.',
    }
  } catch (error) {
    await writePairingPatch({
      connectionState: 'atlas_unavailable',
      lastError: 'Atlas indisponível ao reivindicar código. Credencial anterior preservada.',
    })
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      connectionState: 'atlas_unavailable',
    }
  }
}

async function runDiagnostics(input?: {
  endpoint?: string
  pairingToken?: string
  pairingCode?: string
}): Promise<Record<string, unknown>> {
  const state = await readPairingState()

  if (input?.pairingCode?.trim()) {
    const claimed = await claimPairingCode({
      code: input.pairingCode,
      endpoint: input.endpoint,
    })
    if (claimed.ok === true) return claimed
    // se código falhou, continua com token salvo (se houver)
  }

  const merged = mergePairingCredentials(
    { endpoint: input?.endpoint, pairingToken: input?.pairingToken },
    state,
  )
  let endpoint = merged.endpoint || state.preferredEndpoint || state.endpoint
  const pairingToken = merged.pairingToken
  const installationId = state.installationId

  if (!endpoint) {
    const result = {
      ok: false,
      step: 'health',
      error:
        'Endpoint ausente. Cole o endpoint mostrado no Atlas → Flow → Conexão (não use porta fixa antiga).',
      connectionState: 'atlas_unavailable',
      realFlowValidated: false,
    }
    await writePairingPatch({
      lastError: result.error,
      lastHealthOk: false,
      lastHelloOk: false,
      connectionState: 'atlas_unavailable',
      // não apaga token
    })
    await appendLog('error', result.error)
    return result
  }

  await writePairingPatch({ endpoint, preferredEndpoint: endpoint })

  const health = await probeHealth(endpoint)
  await writePairingPatch({ lastHealthOk: health.ok })
  await appendLog(health.ok ? 'info' : 'error', 'Health check', {
    endpoint,
    ok: health.ok,
    error: health.error ?? null,
  })

  if (!health.ok) {
    const error = 'Atlas indisponível (health). Credencial preservada.'
    await writePairingPatch({
      lastError: error,
      lastHelloOk: false,
      paired: false,
      connectionState: 'atlas_unavailable',
    })
    scheduleReconnect((state.reconnectAttempt || 0) + 1)
    return {
      ok: false,
      step: 'health',
      endpoint,
      error,
      connectionState: 'atlas_unavailable',
      realFlowValidated: false,
    }
  }

  if (!pairingToken || !installationId) {
    const error = !pairingToken
      ? 'Sem pareamento. Use o código gerado no Atlas (bancada Flow → Conexão).'
      : 'installationId ausente'
    await writePairingPatch({
      lastError: error,
      paired: false,
      connectionState: 'unpaired',
    })
    await appendLog('warn', error)
    return {
      ok: false,
      step: 'pairing',
      endpoint,
      health: health.body,
      error,
      connectionState: 'unpaired',
      realFlowValidated: false,
    }
  }

  // Só grava token se veio input não-vazio (merge já preservou o salvo).
  if (asNonEmptyInputToken(input?.pairingToken)) {
    await writePairingPatch({ pairingToken })
  }
  const hello = await postHello(endpoint, pairingToken, installationId)
  const conn = deriveConnectionState({
    helloOk: hello.ok,
    httpStatus: hello.httpStatus ?? null,
    networkError: !hello.httpStatus && !hello.ok,
  })
  await writePairingPatch({
    lastHelloOk: hello.ok,
    paired: hello.ok,
    connectionState: conn,
    lastError: hello.ok ? null : (hello.error ?? 'Hello falhou'),
    reconnectAttempt: hello.ok ? 0 : (state.reconnectAttempt || 0) + 1,
  })
  await appendLog(hello.ok ? 'info' : 'error', 'Hello com Coordinator', {
    ok: hello.ok,
    error: hello.error ?? null,
    connectionState: conn,
  })
  if (!hello.ok && conn !== 'credential_rejected') {
    scheduleReconnect((state.reconnectAttempt || 0) + 1)
  }

  const tokenFp = await pairingTokenFingerprint(pairingToken)
  return {
    ok: hello.ok,
    step: hello.ok ? 'connected' : 'hello',
    endpoint,
    connectionState: conn,
    health: health.body,
    hello: hello.body,
    httpStatus: hello.httpStatus ?? null,
    pairingTokenFingerprint: tokenFp,
    hasPairingToken: true,
    error: hello.error ?? null,
    realFlowValidated: false,
    note: hello.ok
      ? 'Conexão Atlas↔extensão ≠ autenticação Flow nem geração validada.'
      : conn === 'credential_rejected'
        ? 'Credencial rejeitada. Gere novo código no Atlas — não é ausência de projeto/refs.'
        : 'Hello falhou. Credencial preservada se for falha de rede.',
  }
}

function asNonEmptyInputToken(value?: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

async function postCommandEvent(
  endpoint: string,
  token: string,
  commandId: string,
  installationId: string,
  eventType: string,
  attemptId: string | null,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/api/atlas-flow/v1/commands/${commandId}/events`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ installationId, eventType, attemptId, payload }),
    })
    const body = (await res.json().catch(() => ({}))) as { canceled?: boolean }
    return body?.canceled === true
  } catch {
    return false
  }
}

async function postCommandComplete(
  endpoint: string,
  token: string,
  commandId: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${endpoint}/api/atlas-flow/v1/commands/${commandId}/complete`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    /* ignore */
  }
}

/**
 * Contenção de envio. false após probe CDP confirmado (2026-11-14):
 * direct_image_cdp_write_confirmed — Agente inativo, compositor direto.
 * Reativar (true) se o Agente voltar a hijackar writes.
 */
const GENERATION_SEND_PAUSED = false

/**
 * Poll do Coordinator: executa o mesmo adaptador do popup, sem depender do popup aberto.
 */
async function pollAndRunClaimedJob(): Promise<void> {
  if (jobRunnerBusy) return
  const state = await readPairingState()
  if (!state.paired || !state.endpoint || !state.pairingToken || !state.installationId) return

  // Pausa sem claim: preserva comandos queued (generation.run e demais).
  if (GENERATION_SEND_PAUSED) {
    await appendLog('info', 'Generation send paused — skip claim', {
      code: 'GENERATION_SEND_PAUSED',
      note: 'Fila preservada. Sem clique em Aprovar/Omni.',
    })
    return
  }

  jobRunnerBusy = true
  let activeCommand: {
    commandId: string
    attemptId: string | null
    endpoint: string
    token: string
    installationId: string
  } | null = null
  let generationAccepted = false
  try {
    const claimRes = await fetch(`${state.endpoint}/api/atlas-flow/v1/commands/claim?waitMs=10000`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${state.pairingToken}`,
        'X-Atlas-Installation-Id': state.installationId,
      },
    })
    if (!claimRes.ok) return
    const claimBody = (await claimRes.json().catch(() => ({}))) as {
      command?: Record<string, unknown> | null
    }
    const command = claimBody.command
    if (!command || typeof command.commandId !== 'string') return

    const commandId = command.commandId
    const attemptId = typeof command.attemptId === 'string' ? command.attemptId : null
    const operation = String(command.operation || '')
    const payload = (command.payload || {}) as Record<string, unknown>
    const knownStems = Array.isArray(payload.knownStems)
      ? payload.knownStems.map((s) => String(s))
      : []
    const refs = Array.isArray(payload.references)
      ? (payload.references as Array<Record<string, unknown>>)
      : []
    const referenceIds = refs.map((r) => String(r.referenceId || '')).filter(Boolean)
    const recoverOnly = payload.recoverOnly === true
    const payloadExcludeShas = Array.isArray(payload.excludeShas)
      ? payload.excludeShas.map((s) => String(s).toLowerCase()).filter((s) => s.length >= 16)
      : []

    activeCommand = {
      commandId,
      attemptId,
      endpoint: state.endpoint,
      token: state.pairingToken,
      installationId: state.installationId,
    }

    await appendLog('info', 'Job claimed', { commandId, operation, attemptId })
    await postCommandEvent(
      state.endpoint,
      state.pairingToken,
      commandId,
      state.installationId,
      'claimed',
      attemptId,
      { state: 'preparing', executionStage: 'claimed' },
    )

    if (operation === 'result.list_candidates') {
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'listing_candidates',
        attemptId,
        { state: 'partial', executionStage: 'listing_candidates' },
      )
      const storedCorrelation = attemptId ? await loadCaptureCorrelation(attemptId) : null
      const payloadCorrelation =
        payload.captureCorrelation && typeof payload.captureCorrelation === 'object'
          ? (payload.captureCorrelation as Record<string, unknown>)
          : null
      const excludeSrcs = mergeIdentityLists(
        storedCorrelation?.excludeSrcs,
        payloadCorrelation?.excludeSrcs,
        payload.excludeSrcs,
      )
      const excludeMediaIds = mergeIdentityLists(
        storedCorrelation?.excludeMediaIds,
        payloadCorrelation?.excludeMediaIds,
        payload.excludeMediaIds,
      )
      const listed = await listRecoveryCandidatesAction({
        knownStems: knownStems.length ? knownStems : undefined,
        excludeSrcs,
        excludeMediaIds,
        excludeShas: payloadExcludeShas,
        ...projectHintFromPayload(payload),
      })
      const ok = listed.ok === true
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: typeof payload.preserveAttemptState === 'string' ? payload.preserveAttemptState : 'partial',
        submissionCertainty: 'accepted',
        failureCode: ok ? 'IDENTITY_UNCERTAIN' : String(listed.error || 'LIST_CANDIDATES_FAILED'),
        resultDigest: ok ? 'candidates_listed' : 'list_candidates_failed',
        detail: {
          candidates: Array.isArray(listed.candidates) ? listed.candidates : [],
          observedAt: listed.observedAt ?? new Date().toISOString(),
          missingCorrelation: diagnoseMissingCorrelation(
            (storedCorrelation || payloadCorrelation) ?? null,
          ),
          note: 'Candidatos observados na página para seleção explícita — sem vínculo automático.',
        },
      })
      return
    }

    if (operation === 'result.retrieve' || recoverOnly) {
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'retrieving',
        attemptId,
        { state: 'retrieving', executionStage: 'observe_capture' },
      )
      const recoverPrompt = String(
        payload.promptTextForEvidence || payload.promptText || '',
      )
      const storedCorrelation = attemptId
        ? await loadCaptureCorrelation(attemptId)
        : null
      const payloadCorrelation =
        payload.captureCorrelation && typeof payload.captureCorrelation === 'object'
          ? (payload.captureCorrelation as Record<string, unknown>)
          : null
      const explicitSelectionKeys = mergeIdentityLists(payload.explicitSelectionKeys)
      const isExplicitSelection = explicitSelectionKeys.length > 0
      const excludeShas = mergeShaLists(
        payloadExcludeShas,
        Array.isArray(storedCorrelation?.excludeShas)
          ? (storedCorrelation!.excludeShas as string[])
          : [],
        Array.isArray(payloadCorrelation?.excludeShas)
          ? (payloadCorrelation!.excludeShas as string[])
          : [],
      )
      const excludeSrcs = mergeIdentityLists(
        storedCorrelation?.excludeSrcs,
        payloadCorrelation?.excludeSrcs,
        payload.excludeSrcs,
      )
      const excludeMediaIds = mergeIdentityLists(
        storedCorrelation?.excludeMediaIds,
        payloadCorrelation?.excludeMediaIds,
        payload.excludeMediaIds,
      )
      const normalizedCorr = createAttemptCorrelationSession({
        ...(payloadCorrelation || {}),
        ...(storedCorrelation || {}),
        attemptId: attemptId || '',
        excludeSrcs,
        excludeMediaIds,
        excludeShas,
      })
      const allowSrcs = mergeIdentityLists(
        normalizedCorr.acceptedSrcs,
        payload.acceptedSrcs,
      )
      const allowMediaIds = mergeIdentityLists(
        normalizedCorr.acceptedMediaIds,
        payload.acceptedMediaIds,
      )
      const requirePositiveOrigin = false
      const retrieveHint = projectHintFromPayload(payload)
      if (!isExplicitSelection) {
        await waitUntilComposerFree()
        const observe = await observeGenerationResultAction({
          timeoutMs: 30_000,
          knownStems: knownStems.length ? knownStems : undefined,
          ...retrieveHint,
        })
        void observe
      }
      await waitUntilComposerFree()
      const capture = await captureGenerationBytesAction({
        attemptId: attemptId || undefined,
        knownStems: knownStems.length ? knownStems : undefined,
        maxCandidates: isExplicitSelection
          ? Math.max(1, explicitSelectionKeys.length)
          : Math.max(1, Number(payload.expectedOutputs) || 3),
        promptFingerprint: recoverPrompt.slice(0, 120) || undefined,
        settleTimeoutMs: isExplicitSelection ? 5_000 : 30_000,
        skipSettle: isExplicitSelection,
        excludeSrcs,
        excludeShas,
        excludeMediaIds,
        allowSrcs,
        allowMediaIds,
        explicitSelectionKeys: isExplicitSelection ? explicitSelectionKeys : undefined,
        originProofByKey: normalizedCorr.originProofByKey,
        allowKnownSha: isExplicitSelection && payload.allowKnownSha === true,
        requirePositiveOrigin,
        preferDebuggerFallback: true,
        ...retrieveHint,
      })
      const stagedRetrieveCount = Array.isArray(capture.staged) ? capture.staged.length : 0
      let candidatesOnIncomplete: unknown[] = []
      if (stagedRetrieveCount < 1) {
        await waitUntilComposerFree()
        const listed = await listRecoveryCandidatesAction({
          knownStems: knownStems.length ? knownStems : undefined,
          excludeSrcs,
          excludeMediaIds,
          excludeShas,
          ...retrieveHint,
        })
        if (Array.isArray(listed.candidates)) {
          candidatesOnIncomplete = listed.candidates
        }
      }
      const ok = capture.ok === true || stagedRetrieveCount >= 1
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : 'partial',
        submissionCertainty: 'accepted',
        failureCode: ok ? null : 'CAPTURE_INCOMPLETE',
        retrievedCount: stagedRetrieveCount,
        resultDigest: ok
          ? isExplicitSelection
            ? 'retrieve_explicit_selection_ok'
            : 'retrieve_ok'
          : 'retrieve_failed',
        detail: {
          promptEvidence: capture.promptEvidence ?? null,
          settle: capture.settle ?? null,
          correlationUncertain: false,
          automaticCorrelation: !isExplicitSelection && ok,
          explicitUserSelection: isExplicitSelection,
          missingCorrelation: [],
          candidates: candidatesOnIncomplete,
          allowSrcCount: allowSrcs.length,
          allowMediaIdCount: allowMediaIds.length,
          note: isExplicitSelection
            ? 'Recuperado por seleção explícita do usuário.'
            : null,
        },
      })
      await appendLog(ok ? 'info' : 'error', 'Job retrieve finished', {
        commandId,
        ok,
        uncertain: false,
        explicitUserSelection: isExplicitSelection,
      })
      return
    }

    if (operation === 'composer.clear') {
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'clearing_composer',
        attemptId,
        { state: 'preparing', executionStage: 'clear_composer' },
      )
      const cleared = await clearComposerAttachmentsAction(projectHintFromPayload(payload))
      const ok = cleared.ok === true
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : 'failed',
        submissionCertainty: 'not_sent',
        failureCode: ok ? null : String(cleared.error || 'COMPOSER_CLEAR_FAILED'),
        detail: {
          removed: cleared.removed ?? null,
          readBack: cleared.readBack ?? null,
          note: 'Cancelamento: chips e texto do composer limpos.',
        },
      })
      await appendLog(ok ? 'info' : 'warn', 'Composer cleared after cancel', {
        commandId,
        ok,
        removed: cleared.removed ?? null,
      })
      return
    }

    if (operation === 'references.upload') {
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'uploading',
        attemptId,
        { state: 'preparing', executionStage: 'upload_staged' },
      )
      const upload = await attachTwoReferencesOnLinkedProject({
        runGenerate: false,
        referenceIds: referenceIds.length ? referenceIds : undefined,
        ...projectHintFromPayload(payload),
      })
      const ok = upload.ok === true
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : 'failed',
        submissionCertainty: 'not_sent',
        failureCode: ok ? null : String(upload.error || 'UPLOAD_STAGED_FAILED'),
        detail: {
          step: upload.step ?? null,
          error: upload.error ?? null,
          referenceIds,
          uploadErrors: Array.isArray(upload.page?.uploads)
            ? upload.page.uploads
                .filter((item) => item && item.ok !== true)
                .slice(0, 4)
                .map((item) => ({
                  referenceId: item.referenceId || null,
                  error: item.error || null,
                  step: item.step || null,
                  uploadState: item.uploadState || null,
                }))
            : [],
          note: 'Upload só de staged_local; fixtures bound não são reenviadas.',
        },
      })
      await appendLog(ok ? 'info' : 'error', 'Job upload staged finished', { commandId, ok })
      return
    }

    if (operation === 'project.ensure') {
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'project_ensure',
        attemptId,
        { state: 'preparing', executionStage: 'project_ensure' },
      )
      const ensured = await ensureProjectFromAtlas({
        atlasProjectId: String(payload.atlasProjectId || ''),
        requestedTitle: String(payload.requestedTitle || ''),
        idempotencyKey: String(payload.idempotencyKey || ''),
      })
      const ok = ensured.ok === true
      const pageResult = (ensured.pageResult || {}) as Record<string, unknown>
      const ensureError = String(
        pageResult.error || ensured.error || 'PROJECT_ENSURE_FAILED',
      )
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : 'failed',
        submissionCertainty:
          typeof ensured.certainty === 'string' ? String(ensured.certainty) : 'not_sent',
        failureCode: ok ? null : ensureError,
        detail: {
          step: ensured.step ?? null,
          flowProjectId:
            ensured.flowProjectId ??
            (ensured.link as { flowProjectId?: string } | undefined)?.flowProjectId ??
            null,
          action: ensured.action ?? ensured.step ?? null,
          error: ok ? null : ensureError,
          href: pageResult.href ?? null,
          labelsSample: Array.isArray(pageResult.labelsSample)
            ? pageResult.labelsSample.slice(0, 24)
            : null,
        },
      })
      await appendLog(ok ? 'info' : 'error', 'Job project.ensure finished', { commandId, ok })
      return
    }

    if (operation === 'session.ensure') {
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'session_ensure',
        attemptId,
        { state: 'waiting_session', executionStage: 'session_ensure' },
      )
      const ensured = await ensureFlowSessionAction({
        openFlowIfNeeded: payload.openFlowIfNeeded !== false,
        openLoginIfNeeded: payload.openLoginIfNeeded !== false,
        flowHomeUrl:
          typeof payload.flowHomeUrl === 'string' ? payload.flowHomeUrl : FLOW_HOME_URL,
      })
      const ok = ensured.sessionUsable === true
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : ensured.loginRequired ? 'needs_user_action' : 'failed',
        submissionCertainty: 'not_sent',
        failureCode: ok
          ? null
          : ensured.loginRequired
            ? 'LOGIN_REQUIRED'
            : String(ensured.error || 'SESSION_ENSURE_FAILED'),
        detail: {
          sessionUsable: ensured.sessionUsable === true,
          loginRequired: ensured.loginRequired === true,
          accountLabel: ensured.accountLabel ?? null,
          evidenceStatus: ensured.evidenceStatus ?? null,
        },
      })
      await appendLog(ok ? 'info' : 'warn', 'Job session.ensure finished', {
        commandId,
        ok,
        loginRequired: ensured.loginRequired === true,
      })
      return
    }

    if (operation === 'project.delete') {
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'project_delete',
        attemptId,
        { state: 'preparing', executionStage: 'project_delete' },
      )
      const deleted = await deleteFlowProjectInBrowser({
        flowProjectId: String(payload.flowProjectId || ''),
        flowProjectUrl:
          typeof payload.flowProjectUrl === 'string' ? payload.flowProjectUrl : null,
      })
      const alreadyGone = deleted.alreadyGone === true || deleted.code === 'ALREADY_GONE'
      const ok = deleted.ok === true || alreadyGone || deleted.code === 'PROJECT_NOT_FOUND'
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : 'failed',
        submissionCertainty: 'not_sent',
        failureCode: ok ? null : String(deleted.code || deleted.error || 'PROJECT_DELETE_FAILED'),
        resultDigest: JSON.stringify({
          outcome: ok ? 'project_deleted' : 'project_delete_failed',
          failureCode: ok ? null : String(deleted.code || 'PROJECT_DELETE_FAILED'),
          alreadyGone,
          error: ok ? null : String(deleted.error || ''),
          href: deleted.href ?? null,
        }),
      })
      await appendLog(ok ? 'info' : 'error', 'Job project.delete finished', {
        commandId,
        ok,
        code: deleted.code ?? null,
      })
      return
    }

    if (operation === 'result.delete') {
      const flowMediaId = String(payload.flowMediaId || '')
      const flowProjectId = String(payload.flowProjectId || '')
      const flowProjectUrl =
        typeof payload.flowProjectUrl === 'string' ? payload.flowProjectUrl : null
      if (!flowMediaId || !flowProjectId) {
        await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
          installationId: state.installationId,
          ok: false,
          attemptState: 'failed',
          submissionCertainty: 'not_sent',
          failureCode: 'DELETE_PAYLOAD_INVALID',
          resultDigest: JSON.stringify({ error: 'DELETE_PAYLOAD_INVALID' }),
        })
        return
      }
      const trashed = await trashFlowImageInBrowser({
        flowProjectId,
        flowProjectUrl,
        flowMediaId,
      })
      const ok = trashed.ok === true
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : 'failed',
        submissionCertainty: 'not_sent',
        failureCode: ok ? null : String(trashed.error || 'DELETE_FAILED'),
        resultDigest: JSON.stringify({
          outcome: ok ? 'trashed' : 'trash_failed',
          flowMediaId,
          step: trashed.step || null,
          error: ok ? null : String(trashed.error || 'DELETE_FAILED'),
        }),
      })
      return
    }

    if (operation === 'result.download') {
      const resolution = String(payload.resolution || '').toLowerCase()
      const flowMediaId = String(payload.flowMediaId || '')
      const flowProjectId = String(payload.flowProjectId || '')
      const flowProjectUrl =
        typeof payload.flowProjectUrl === 'string' ? payload.flowProjectUrl : null
      const validResolution = resolution === '1k' || resolution === '2k' || resolution === '4k'
      if (!validResolution || !flowMediaId || !flowProjectId) {
        await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
          installationId: state.installationId,
          ok: false,
          attemptState: 'failed',
          submissionCertainty: 'not_sent',
          failureCode: 'DOWNLOAD_PAYLOAD_INVALID',
        })
        return
      }
      const downloaded = await downloadFlowImageInBrowser({
        flowProjectId,
        flowProjectUrl,
        flowMediaId,
        resolution,
      })
      const ok = downloaded.ok === true
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok,
        attemptState: ok ? 'completed' : 'failed',
        submissionCertainty: 'not_sent',
        failureCode: ok ? null : String(downloaded.error || 'DOWNLOAD_FAILED'),
        resultDigest: JSON.stringify({
          outcome: ok ? 'download_clicked' : 'download_failed',
          resolution,
          flowMediaId,
          step: downloaded.step || null,
          error: ok ? null : String(downloaded.error || ''),
        }),
      })
      return
    }

    if (operation !== 'generation.run') {
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok: false,
        attemptState: 'failed',
        failureCode: 'UNSUPPORTED_OPERATION',
      })
      return
    }

    const selectedRefs = Array.isArray(payload.references)
      ? (payload.references as Array<Record<string, unknown>>)
      : []
    const projectHint = projectHintFromPayload(payload)
    const promptText = promptWithSingerCharacter(String(payload.promptText || ''), selectedRefs)
    const skipUpload = payload.skipUpload === true
    const needsUpload =
      !skipUpload ||
      selectedRefs.some((item) => {
        const stateName = String(item.uploadState || '')
        if (stateName === 'character_ready') return false
        return (
          stateName === 'staged_local' ||
          stateName === 'upload_uncertain' ||
          (!item.flowMediaId && !isSingerCharacter(item))
        )
      })

    // Enquanto este prompt ocupa o compositor, a observação dos anteriores não clica na página.
    composerBusy = true
    // Upload automático das staged + anexação das selecionadas (sem fixtures).
    await postCommandEvent(
      state.endpoint,
      state.pairingToken,
      commandId,
      state.installationId,
      needsUpload ? 'uploading' : 'attaching',
      attemptId,
      {
        state: 'preparing',
        executionStage: needsUpload ? 'upload_and_attach' : 'attach_bound',
      },
    )

    let prepare: Record<string, unknown>
    if (needsUpload) {
      const uploaded = await attachTwoReferencesOnLinkedProject({
        runGenerate: false,
        referenceIds: referenceIds.length ? referenceIds : undefined,
        ...projectHint,
      })
      if (uploaded.ok !== true) {
        prepare = uploaded
      } else {
        await postCommandEvent(
          state.endpoint,
          state.pairingToken,
          commandId,
          state.installationId,
          'attaching',
          attemptId,
          {
            state: 'preparing',
            executionStage: 'attach_bound',
          },
        )
        prepare = await attachBoundReferencesOnlyAction({
          referenceIds: referenceIds.length ? referenceIds : undefined,
          ...projectHint,
        })
      }
    } else {
      prepare = await attachBoundReferencesOnlyAction({
        referenceIds: referenceIds.length ? referenceIds : undefined,
        ...projectHint,
      })
    }

    if (prepare.ok !== true) {
      const attachments = Array.isArray(prepare.attachments)
        ? (prepare.attachments as Array<Record<string, unknown>>)
        : []
      const failedAttach = attachments.find((item) => item.ok !== true) || null
      const panelGate =
        prepare.panelGate && typeof prepare.panelGate === 'object'
          ? (prepare.panelGate as Record<string, unknown>)
          : null
      const ingredients =
        panelGate?.ingredients && typeof panelGate.ingredients === 'object'
          ? (panelGate.ingredients as Record<string, unknown>)
          : null
      const failureCode = String(
        prepare.pageError ||
          prepare.error ||
          failedAttach?.error ||
          ingredients?.error ||
          'ATTACH_FAILED',
      )
      const detail = {
        step: prepare.step ?? prepare.pageStep ?? panelGate?.step ?? null,
        pageError: prepare.pageError ?? null,
        sought: ingredients?.sought ?? null,
        matchCount: ingredients?.matchCount ?? null,
        nearbyCandidateLabels: ingredients?.nearbyCandidateLabels ?? null,
        panelGate,
        exit: prepare.exit ?? null,
        targets: prepare.targets ?? null,
        failedReferenceId: failedAttach?.referenceId ?? null,
        failedFlowMediaId: failedAttach?.flowMediaId ?? null,
        attachments,
        expectedFlowProjectId: prepare.expectedFlowProjectId ?? null,
        endpointUsed: prepare.endpointUsed ?? null,
        observationHref:
          (ingredients?.before as Record<string, unknown> | undefined)?.href ||
          (panelGate?.observation as Record<string, unknown> | undefined)?.href ||
          null,
        projectIdFromUrl:
          (ingredients?.before as Record<string, unknown> | undefined)?.projectIdFromUrl ||
          (panelGate?.observation as Record<string, unknown> | undefined)?.projectIdFromUrl ||
          null,
        readyState:
          (ingredients?.before as Record<string, unknown> | undefined)?.readyState || null,
      }
      await postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'attach_failed',
        attemptId,
        {
          state: 'preparing',
          executionStage: needsUpload ? 'upload_and_attach' : 'attach_bound',
          failureCode,
          ...detail,
        },
      )
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok: false,
        attemptState: 'failed',
        submissionCertainty: 'not_sent',
        failureCode,
        detail,
        resultDigest: `attach_failed:${failureCode}`,
      })
      return
    }

    // Garante personagem ANTES de capturar o baseline pré-envio, pois ensureSingerCharacter
    // pode abrir o painel de Assets para checar/criar @cantor e preparePreSubmitBaseline
    // precisa fechar o painel por último antes do clique em Start generation.
    if (selectedRefs.some((item) => isSingerCharacter(item))) {
      const character = await ensureSingerCharacterOnPage(
        selectedRefs.filter((item) => isSingerCharacter(item)),
        projectHint,
      )
      if (character.ok !== true) {
        await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
          installationId: state.installationId,
          ok: false,
          attemptState: 'failed',
          submissionCertainty: 'not_sent',
          failureCode: String(character.error || 'CHARACTER_NOT_CREATED'),
          detail: {
            step: character.step || 'ensure_singer_character',
            character,
          },
        })
        return
      }
    }

    // Fecha o painel de Assets, registra todos os assets/slots pré-existentes e arma
    // o observador DOM + RPC passivo ANTES do clique em Start generation!
    const generationBaseline = await preparePreSubmitBaselineAction({
      attemptId: attemptId || undefined,
      commandId,
      promptText,
      ...projectHint,
    })
    const storedCorrelation = attemptId ? await loadCaptureCorrelation(attemptId) : null
    const payloadExcludeMediaIds = Array.isArray(payload.excludeMediaIds)
      ? payload.excludeMediaIds.map((id) => String(id).trim()).filter(Boolean)
      : []
    const excludeSrcs = mergeIdentityLists(
      generationBaseline.srcs,
      storedCorrelation?.excludeSrcs,
    )
    const excludeMediaIds = mergeIdentityLists(
      generationBaseline.mediaIds,
      payloadExcludeMediaIds,
      storedCorrelation?.excludeMediaIds,
    )
    const preExistingSlotKeys = mergeIdentityLists(
      generationBaseline.preExistingSlotKeys,
      storedCorrelation?.preExistingSlotKeys,
    )
    const baselineEvidenceCount = Math.max(0, Number(generationBaseline.evidenceCount) || 0)
    const baselineClosedPanel = generationBaseline.baselineClosedPanel === true
    const excludeShas = mergeShaLists(
      payloadExcludeShas,
      Array.isArray(storedCorrelation?.excludeShas)
        ? (storedCorrelation!.excludeShas as string[])
        : [],
    )
    let correlationSession = createAttemptCorrelationSession({
      ...(storedCorrelation || {}),
      attemptId: attemptId || '',
      commandId,
      promptText,
      submittedAfterMs: Date.now(),
      baselineClosedPanel,
      baselineEvidenceCount,
      excludeSrcs,
      excludeMediaIds,
      excludeShas,
      preExistingSlotKeys,
    })
    if (attemptId) {
      await saveCaptureCorrelation(attemptId, {
        ...correlationSession,
        capturedAt: new Date().toISOString(),
      })
    }

    await postCommandEvent(
      state.endpoint,
      state.pairingToken,
      commandId,
      state.installationId,
      'capture_correlation',
      attemptId,
      {
        executionStage: 'baseline_captured',
        captureCorrelation: correlationSession,
        baselineClosedPanel,
        baselineSrcCount: excludeSrcs.length,
        baselineMediaIdCount: excludeMediaIds.length,
        preExistingSlotCount: preExistingSlotKeys.length,
        baselineEvidenceCount,
        excludeShaCount: excludeShas.length,
      },
    )

    await postCommandEvent(
      state.endpoint,
      state.pairingToken,
      commandId,
      state.installationId,
      'submitting',
      attemptId,
      {
        state: 'submitting',
        executionStage: 'prompt_generate',
        baselineSrcCount: excludeSrcs.length,
        baselineMediaIdCount: excludeMediaIds.length,
        baselineEvidenceCount,
        excludeShaCount: excludeShas.length,
      },
    )

    const userCanceledNow = () =>
      postCommandEvent(
        state.endpoint,
        state.pairingToken,
        commandId,
        state.installationId,
        'cancel_poll',
        attemptId,
        {},
      )
    const finishUserCancel = async (accepted: boolean) => {
      const stopped = await stopGenerationOnPageAction(projectHint)
      await appendLog('info', 'Generation canceled by user', {
        commandId,
        attemptId,
        accepted,
        stop: stopped.ok === true,
        stopError: stopped.error || null,
      })
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok: false,
        attemptState: 'canceled',
        submissionCertainty: accepted ? 'accepted' : 'not_sent',
        failureCode: 'CANCELED_BY_USER',
        resultDigest: JSON.stringify({ canceled: true, reason: 'CANCELED_BY_USER' }),
      })
    }

    if (await userCanceledNow()) {
      await finishUserCancel(false)
      return
    }

    const generate = await promptAndGenerateOnlyAction({
      promptText,
      // Prepare já confirmou anexação na página; store attached é efêmero entre reinícios.
      skipAttachedStoreCheck: true,
      minAttached: Math.max(1, Math.min(2, referenceIds.length || 1)),
      imageSettings: normalizeFlowImageSettings(payload.imageSettings),
      ...projectHint,
    })

    const generatePage = (generate.page || {}) as Record<string, unknown>
    const generateInner = (generatePage.generate || {}) as Record<string, unknown>
    const certainty = String(generateInner.certainty || '')
    if (generate.ok !== true) {
      const mayHaveSent = certainty === 'may_have_sent' || generateInner.error === 'GENERATE_NO_EFFECT'
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok: false,
        attemptState: mayHaveSent ? 'submission_uncertain' : 'failed',
        submissionCertainty: mayHaveSent ? 'may_have_sent' : 'not_sent',
        failureCode: String(
          generatePage.error ||
            generateInner.error ||
            generate.error ||
            'GENERATE_FAILED',
        ),
        detail: {
          step: generatePage.step ?? generate.step ?? null,
          classicMode: generatePage.classicMode ?? null,
          promptWrite: generatePage.promptWrite ?? null,
        },
      })
      return
    }

    if (await userCanceledNow()) {
      generationAccepted = true
      await finishUserCancel(true)
      return
    }

    generationAccepted = true
    const generatingCanceled = await postCommandEvent(
      state.endpoint,
      state.pairingToken,
      commandId,
      state.installationId,
      'generating',
      attemptId,
      { state: 'generating', executionStage: 'observe', submissionCertainty: 'accepted' },
    )
    if (generatingCanceled) {
      await finishUserCancel(true)
      return
    }

    // Libera o compositor e o jobRunner para o próximo prompt do lote assim que a geração
    // desta tentativa iniciou no Flow. A observação roda em segundo plano sem bloquear a fila,
    // e aguarda waitUntilComposerFree() antes de capturar bytes para não colidir com o painel de Assets.
    composerBusy = false
    void (async () => {
    try {
    const expectedOutputsRaw = Number(payload.expectedOutputs)
    const expectedOutputs =
      Number.isFinite(expectedOutputsRaw) && expectedOutputsRaw > 0
        ? Math.min(8, Math.floor(expectedOutputsRaw))
        : null
    const captureTarget = expectedOutputs ?? 4
    const observeStartedAt = Date.now()
    const observeDeadline = observeStartedAt + 180_000
    let clientSequence = 0
    let lastProgressKey = ''
    let sawBusy = false
    let freshStableSince = 0
    let lastFreshKey = ''
    // Só reagir a evidência NOVA (acima do baseline pré-geração).
    let lastCompletedEvidence = 0
    let incrementalStaged = 0
    const stagedSha = new Set<string>()
    let stopForUser = false

    while (Date.now() < observeDeadline) {
      // Observação é só leitura no DOM — não espera o compositor. Esperar apagava a
      // correlação quando o lote mandava o próximo prompt.
      if (await userCanceledNow()) {
        stopForUser = true
        break
      }
      clientSequence += 1
      const sample = await sampleGenerationProgressAction({
        attemptId: attemptId || undefined,
        excludeSrcs,
        excludeMediaIds,
        baselineEvidenceCount,
        ...projectHint,
      })
      const attemptPercent =
        typeof sample.attemptPercent === 'number' && Number.isFinite(sample.attemptPercent)
          ? sample.attemptPercent
          : null
      const slotPercents = Array.isArray(sample.slotPercents)
        ? sample.slotPercents
            .map((p) => Number(p))
            .filter((p) => Number.isFinite(p) && p >= 0 && p <= 100)
        : null
      const trackedGeneratingSlotCount = Math.max(
        0,
        Number(sample.trackedGeneratingSlotCount) || 0,
      )
      const generatingCardCount = Math.max(
        0,
        Number(sample.generatingCardCount) || 0,
        slotPercents?.length || 0,
        trackedGeneratingSlotCount,
      )
      const busyEval = evaluateAttemptBusyState({
        domBusy: sample.busy === true || sample.domBusy === true,
        slotPercents,
        generatingCardCount,
        trackedGeneratingSlotCount,
      })
      const busy = busyEval.busy
      if (busy || sample.sawAcceptedProgress === true) sawBusy = true
      const freshSceneSrcs = Array.isArray(sample.freshSceneSrcs)
        ? sample.freshSceneSrcs.map((src) => String(src || '')).filter(Boolean).slice(0, captureTarget)
        : []
      const percentBusy =
        busyEval.hasIncompletePercent || trackedGeneratingSlotCount > 0
      const imagesReady = !percentBusy && freshSceneSrcs.length > 0
      const freshKey = freshSceneSrcs.join('|')
      if (imagesReady && freshKey === lastFreshKey && freshStableSince > 0) {
        /* mesma leva de imagens prontas */
      } else if (imagesReady) {
        lastFreshKey = freshKey
        freshStableSince = Date.now()
      } else {
        lastFreshKey = ''
        freshStableSince = 0
      }
      const freshSettled = imagesReady && Date.now() - freshStableSince >= 2_500
      const waitBusy = percentBusy || (busy && !imagesReady)

      const completedEvidence = Math.max(
        0,
        Number(sample.newSceneCount) || 0,
        freshSettled ? freshSceneSrcs.length : 0,
      )

      // Cadeia send→accepted→outputs: APENAS outputs correlacionados por RPC ou linhagem
      // de slot de progresso entram na sessão (nunca imgs soltas de virtualização/painel!).
      const prevAllowSrcCount = correlationSession.acceptedSrcs.length
      const prevAllowMediaCount = correlationSession.acceptedMediaIds.length
      const prevWfCount = correlationSession.rpcWorkflowIds.length
      correlationSession = createAttemptCorrelationSession({
        ...correlationSession,
        rpcWorkflowIds: mergeIdentityLists(
          correlationSession.rpcWorkflowIds,
          sample.rpcWorkflowIds,
        ),
        rpcMediaIds: mergeIdentityLists(correlationSession.rpcMediaIds, sample.rpcMediaIds),
        rpcSrcs: mergeIdentityLists(correlationSession.rpcSrcs, sample.rpcSrcs),
        slotLineageMediaIds: mergeIdentityLists(
          correlationSession.slotLineageMediaIds,
          sample.slotLineageMediaIds,
          sample.correlatedMediaIds,
        ),
        slotLineageSrcs: mergeIdentityLists(
          correlationSession.slotLineageSrcs,
          sample.slotLineageSrcs,
          sample.correlatedSrcs,
        ),
        trackedSlotKeys: mergeIdentityLists(
          correlationSession.trackedSlotKeys,
          sample.trackedSlotKeys,
        ),
        sawAcceptedProgress:
          correlationSession.sawAcceptedProgress || busy || sample.sawAcceptedProgress === true,
        originProofByKey: {
          ...correlationSession.originProofByKey,
          ...(sample.originProofByKey && typeof sample.originProofByKey === 'object'
            ? (sample.originProofByKey as Record<string, string>)
            : {}),
        },
      })
      const acceptedSrcs = correlationSession.acceptedSrcs
      const acceptedMediaIds = correlationSession.acceptedMediaIds
      if (
        attemptId &&
        (acceptedSrcs.length !== prevAllowSrcCount ||
          acceptedMediaIds.length !== prevAllowMediaCount ||
          correlationSession.rpcWorkflowIds.length !== prevWfCount)
      ) {
        await saveCaptureCorrelation(attemptId, {
          ...correlationSession,
          acceptedAt: new Date().toISOString(),
        })
        await postCommandEvent(
          state.endpoint,
          state.pairingToken,
          commandId,
          state.installationId,
          'capture_correlation',
          attemptId,
          {
            executionStage: 'post_accept_allowlist',
            captureCorrelation: correlationSession,
            allowSrcCount: acceptedSrcs.length,
            allowMediaIdCount: acceptedMediaIds.length,
            rpcWorkflowCount: correlationSession.rpcWorkflowIds.length,
            trackedSlotCount: correlationSession.trackedSlotKeys.length,
            // Diagnóstico do hook RPC no mundo MAIN (quantas respostas viu/casou).
            rpcStats: (sample as { rpcStats?: unknown }).rpcStats ?? null,
            clientSequence,
          },
        )
      }
      const stageObserved =
        busy || busyEval.hasIncompletePercent
          ? 'generating'
          : completedEvidence > 0
            ? 'receiving_image'
            : String(sample.stage || 'observe')
      const progressKey = [
        busy ? 1 : 0,
        attemptPercent ?? 'na',
        generatingCardCount,
        completedEvidence,
        acceptedSrcs.length,
        acceptedMediaIds.length,
        stageObserved,
        Array.isArray(slotPercents) ? slotPercents.join(',') : '',
      ].join('|')

      if (progressKey !== lastProgressKey) {
        lastProgressKey = progressKey
        const progressCanceled = await postCommandEvent(
          state.endpoint,
          state.pairingToken,
          commandId,
          state.installationId,
          'generation_progress',
          attemptId,
          {
            state: completedEvidence > 0 && !busy ? 'retrieving' : 'generating',
            executionStage: stageObserved,
            submissionCertainty: 'accepted',
            observedAt:
              typeof sample.observedAt === 'string' ? sample.observedAt : new Date().toISOString(),
            clientSequence,
            attemptPercent,
            slotPercents,
            generatingCardCount: generatingCardCount || null,
            completedEvidenceCount: completedEvidence,
            sceneCount: Number(sample.sceneCount) || 0,
            allowSrcCount: acceptedSrcs.length,
            allowMediaIdCount: acceptedMediaIds.length,
            expectedOutputs,
            percentSamples: Array.isArray(sample.percentSamples)
              ? sample.percentSamples.slice(0, 8)
              : null,
            labelsSample: Array.isArray(sample.labelsSample)
              ? sample.labelsSample.slice(0, 8)
              : null,
          },
        )
        if (progressCanceled) {
          stopForUser = true
          break
        }
      }

      // Captura incremental SOMENTE quando NÃO há nenhum slot gerando (<100%)
      if (
        !waitBusy &&
        (sawBusy || freshSettled) &&
        completedEvidence > lastCompletedEvidence &&
        incrementalStaged < captureTarget &&
        (acceptedSrcs.length > 0 || acceptedMediaIds.length > 0 || freshSceneSrcs.length > 0)
      ) {
        lastCompletedEvidence = completedEvidence
        await postCommandEvent(
          state.endpoint,
          state.pairingToken,
          commandId,
          state.installationId,
          'retrieving',
          attemptId,
          {
            state: 'retrieving',
            executionStage: 'receiving_image',
            submissionCertainty: 'accepted',
            observedAt: new Date().toISOString(),
            clientSequence: ++clientSequence,
            attemptPercent,
          },
        )
        await waitUntilComposerFree()
        const partial = await captureGenerationBytesAction({
          attemptId: attemptId || undefined,
          knownStems: knownStems.length ? knownStems : undefined,
          maxCandidates: captureTarget,
          promptFingerprint: promptText.slice(0, 120),
          skipSettle: true,
          excludeSrcs,
          excludeShas,
          excludeMediaIds,
          allowSrcs: mergeIdentityLists(acceptedSrcs, freshSceneSrcs),
          allowMediaIds: acceptedMediaIds,
          originProofByKey: correlationSession.originProofByKey,
          requirePositiveOrigin: false,
          ...projectHint,
        })
        if (Array.isArray(partial.staged)) {
          for (const item of partial.staged) {
            const sha =
              item && typeof item === 'object' && 'result' in item
                ? String(
                    (item as { result?: { sha256?: string } }).result?.sha256 || '',
                  )
                : ''
            const bound =
              item && typeof item === 'object' && (item as { bound?: unknown }).bound !== false
            if (sha && bound && !stagedSha.has(sha)) {
              stagedSha.add(sha)
              incrementalStaged += 1
            }
          }
        }
      }

      const elapsedMs = Date.now() - observeStartedAt
      const settledEnough =
        !waitBusy &&
        (sawBusy || freshSettled) &&
        (incrementalStaged >= (expectedOutputs ?? 1) ||
          freshSettled ||
          (completedEvidence >= (expectedOutputs ?? 1) && elapsedMs > 6_000) ||
          (completedEvidence >= 1 && elapsedMs > 8_000 && attemptPercent == null) ||
          (attemptPercent === 100 && elapsedMs > 2_500))

      if (settledEnough) break
      await new Promise((resolve) => setTimeout(resolve, 1_400))
    }

    if (stopForUser) {
      await finishUserCancel(true)
      return
    }

    // Re-amostra uma última vez após sair do loop para garantir última mutação de slot.
    {
      const finalSample = await sampleGenerationProgressAction({
        attemptId: attemptId || undefined,
        excludeSrcs,
        excludeMediaIds,
        baselineEvidenceCount,
        ...projectHint,
      })
      correlationSession = createAttemptCorrelationSession({
        ...correlationSession,
        rpcWorkflowIds: mergeIdentityLists(
          correlationSession.rpcWorkflowIds,
          finalSample.rpcWorkflowIds,
        ),
        rpcMediaIds: mergeIdentityLists(correlationSession.rpcMediaIds, finalSample.rpcMediaIds),
        rpcSrcs: mergeIdentityLists(correlationSession.rpcSrcs, finalSample.rpcSrcs),
        slotLineageMediaIds: mergeIdentityLists(
          correlationSession.slotLineageMediaIds,
          finalSample.slotLineageMediaIds,
          finalSample.correlatedMediaIds,
          finalSample.freshSceneMediaIds,
        ),
        slotLineageSrcs: mergeIdentityLists(
          correlationSession.slotLineageSrcs,
          finalSample.slotLineageSrcs,
          finalSample.correlatedSrcs,
          finalSample.freshSceneSrcs,
        ),
        originProofByKey: {
          ...correlationSession.originProofByKey,
          ...(finalSample.originProofByKey && typeof finalSample.originProofByKey === 'object'
            ? (finalSample.originProofByKey as Record<string, string>)
            : {}),
        },
      })
      if (attemptId) {
        await saveCaptureCorrelation(attemptId, {
          ...correlationSession,
          finalSampleAt: new Date().toISOString(),
        })
      }
    }

    const acceptedSrcs = correlationSession.acceptedSrcs
    const acceptedMediaIds = correlationSession.acceptedMediaIds

    if (incrementalStaged < 1) {
      await waitUntilComposerFree()
      await observeGenerationResultAction({
        timeoutMs: 30_000,
        knownStems: knownStems.length ? knownStems : undefined,
        ...projectHint,
      })
    }

    await postCommandEvent(
      state.endpoint,
      state.pairingToken,
      commandId,
      state.installationId,
      'retrieving',
      attemptId,
      {
        state: 'retrieving',
        executionStage: 'capture_bytes',
        submissionCertainty: 'accepted',
        observedAt: new Date().toISOString(),
        clientSequence: ++clientSequence,
      },
    )
    await waitUntilComposerFree()
    const capture = await captureGenerationBytesAction({
      attemptId: attemptId || undefined,
      knownStems: knownStems.length ? knownStems : undefined,
      maxCandidates: captureTarget,
      promptFingerprint: promptText.slice(0, 120),
      settleTimeoutMs: acceptedSrcs.length > 0 || incrementalStaged > 0 ? 8_000 : 20_000,
      excludeSrcs,
      excludeShas,
      excludeMediaIds,
      allowSrcs: acceptedSrcs,
      allowMediaIds: acceptedMediaIds,
      originProofByKey: correlationSession.originProofByKey,
      requirePositiveOrigin: false,
      preferDebuggerFallback: true,
      ...projectHint,
    })
    if (Array.isArray(capture.staged)) {
      for (const item of capture.staged) {
        const sha =
          item && typeof item === 'object' && 'result' in item
            ? String((item as { result?: { sha256?: string } }).result?.sha256 || '')
            : ''
        const bound =
          item && typeof item === 'object' && (item as { bound?: unknown }).bound !== false
        if (sha && bound) stagedSha.add(sha)
      }
    }
    const stagedCount = Math.max(
      stagedSha.size,
      Array.isArray(capture.staged) ? capture.staged.length : 0,
      incrementalStaged,
    )
    let candidatesOnIncomplete: unknown[] = []
    if (stagedCount < 1) {
      await waitUntilComposerFree()
      const listed = await listRecoveryCandidatesAction({
        knownStems: knownStems.length ? knownStems : undefined,
        excludeSrcs,
        excludeMediaIds,
        excludeShas,
        ...projectHint,
      })
      if (Array.isArray(listed.candidates)) {
        candidatesOnIncomplete = listed.candidates
      }
    }
    const ok = (capture.ok === true || incrementalStaged > 0) && stagedCount >= 1
    await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
      installationId: state.installationId,
      ok,
      attemptState: ok ? 'completed' : 'partial',
      submissionCertainty: 'accepted',
      failureCode: ok ? null : 'CAPTURE_INCOMPLETE',
      retrievedCount: stagedCount,
      resultDigest: ok ? 'generation_bytes_ok' : 'generation_bytes_partial',
      detail: {
        stagedCount,
        expectedOutputs,
        weak: false,
        uncertain: false,
        automaticCorrelation: ok,
        missingCorrelation: [],
        candidates: candidatesOnIncomplete,
        incrementalStaged,
        progressEvents: clientSequence,
        allowSrcCount: acceptedSrcs.length,
        allowMediaIdCount: acceptedMediaIds.length,
        rpcWorkflowIds: correlationSession.rpcWorkflowIds,
        trackedSlotCount: correlationSession.trackedSlotKeys.length,
        promptEvidence: capture.promptEvidence ?? null,
        settle: capture.settle ?? null,
      },
    })
    await appendLog(ok ? 'info' : 'warn', 'Job generation finished', {
      commandId,
      attemptId,
      ok,
      weak: false,
      uncertain: false,
      staged: stagedCount,
      progressEvents: clientSequence,
    })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appendLog('error', 'Generation observe error', { commandId, attemptId, error: message })
      await postCommandComplete(state.endpoint, state.pairingToken, commandId, {
        installationId: state.installationId,
        ok: false,
        attemptState: 'partial',
        submissionCertainty: 'accepted',
        failureCode: 'CAPTURE_OR_OBSERVE_FAILED',
        detail: { error: message, generationAccepted: true },
        resultDigest: `observe_exception:${message.slice(0, 120)}`,
      })
    }
    })()
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await appendLog('error', 'Job runner error', { error: message, generationAccepted })
    if (activeCommand) {
      // Se a geração já foi aceita, não rotular not_sent nem autorizar reenvio cego.
      await postCommandComplete(activeCommand.endpoint, activeCommand.token, activeCommand.commandId, {
        installationId: activeCommand.installationId,
        ok: false,
        attemptState: generationAccepted ? 'partial' : 'failed',
        submissionCertainty: generationAccepted ? 'accepted' : 'not_sent',
        failureCode: generationAccepted ? 'CAPTURE_OR_OBSERVE_FAILED' : 'JOB_RUNNER_EXCEPTION',
        detail: { error: message, generationAccepted },
        resultDigest: `runner_exception:${message.slice(0, 120)}`,
      })
    }
  } finally {
    composerBusy = false
    jobRunnerBusy = false
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureBoot()
})

chrome.runtime.onStartup.addListener(() => {
  void ensureBoot()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_RECOVERY) {
    void (async () => {
      const state = await readPairingState()
      if (!state.pairingToken) return
      if (state.connectionState === 'connected' && state.paired) return
      if (state.connectionState === 'credential_rejected') return
      await attemptReconnect('alarm_recovery')
    })()
  }
  if (alarm.name === ALARM_HEARTBEAT) {
    void (async () => {
      const state = await readPairingState()
      if (!state.endpoint || !state.pairingToken || !state.installationId) return
      if (state.connectionState === 'connected' || state.paired) {
        await postHeartbeat(state.endpoint, state.pairingToken, state.installationId)
        void pollAndRunClaimedJob()
        return
      }
      if (state.connectionState !== 'credential_rejected') {
        await attemptReconnect('heartbeat_gap')
      }
    })()
  }
  if (alarm.name === ALARM_JOBS) {
    void pollAndRunClaimedJob()
  }
  if (alarm.name === ALARM_PAIRING_OFFER) {
    void pollPendingPairingOffer('alarm')
  }
})

chrome.runtime.onConnect.addListener((port) => {
  // Qualquer conexão (popup) dispara tentativa se houver credencial.
  if (port.name === 'atlas-flow-v1-popup') {
    void attemptReconnect('popup_open')
  }
})

/** Uma tentativa de injeção por chave tabId+url (sem loops). Limpa ao navegar/fechar aba. */
const injectAttempted = new Set<string>()

function clearInjectAttemptedForTab(tabId: number): void {
  const prefix = `${tabId}::`
  for (const key of Array.from(injectAttempted)) {
    if (key.startsWith(prefix)) injectAttempted.delete(key)
  }
}

try {
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearInjectAttemptedForTab(tabId)
  })
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading') {
      clearInjectAttemptedForTab(tabId)
    }
  })
} catch {
  /* ambiente de teste sem chrome.tabs */
}

type ContentReceiverResult = {
  ready: boolean
  injected: boolean
  ping: unknown
  error?: string
  code?: string | null
  pipelineBlocked?: boolean
  authRequired?: boolean
  expectedSensorVersion?: string
  actualSensorVersion?: string | null
  packageVersion?: string
  protocolVersion?: number
}

function sensorVersionFromPing(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const version = (body as { sensorVersion?: unknown }).sensorVersion
  return typeof version === 'string' ? version : null
}

function sensorBuildIdFromPing(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const buildId = (body as { sensorBuildId?: unknown }).sensorBuildId
  return typeof buildId === 'string' ? buildId : null
}

function isFlowUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'flow.google.com'
  } catch {
    return false
  }
}

function waitForTabStatusComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }, timeoutMs)
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id !== tabId || info.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

async function pingContent(tabId: number): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  try {
    const body = await chrome.tabs.sendMessage(tabId, { type: 'atlas-flow-v1.page.ping' })
    if (body && typeof body === 'object' && (body as { pong?: boolean }).pong === true) {
      return { ok: true, body }
    }
    return { ok: false, error: 'Resposta sem pong=true' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function receiverFromHandshake(
  handshake: ReturnType<typeof evaluateSensorHandshake>,
  injected: boolean,
  ping: unknown,
): ContentReceiverResult {
  return {
    ready: handshake.ready,
    injected,
    ping,
    error: handshake.error || undefined,
    code: handshake.code,
    pipelineBlocked: handshake.pipelineBlocked,
    authRequired: handshake.authRequired,
    expectedSensorVersion: handshake.expectedSensorVersion,
    actualSensorVersion: handshake.actualSensorVersion,
    packageVersion: handshake.packageVersion,
    protocolVersion: handshake.protocolVersion,
  }
}

async function ensureContentReceiver(
  tabId: number,
  tabUrl: string,
): Promise<ContentReceiverResult> {
  const firstPing = await pingContent(tabId)
  if (firstPing.ok) {
    const handshake = evaluateSensorHandshake({
      actualSensorVersion: sensorVersionFromPing(firstPing.body),
      expectedSensorVersion: SENSOR_VERSION,
    })
    const actualBuildId = sensorBuildIdFromPing(firstPing.body)
    if (handshake.ok && actualBuildId === SENSOR_BUILD_ID) {
      return receiverFromHandshake(handshake, false, firstPing.body)
    }
    // Sensor incompatível ou build anterior: tenta hot-upgrade in-place antes de recarregar.
  }

  if (!isFlowUrl(tabUrl)) {
    return {
      ready: false,
      injected: false,
      ping: null,
      error: `Origem não autorizada para injeção: ${tabUrl}`,
      code: 'ORIGIN_NOT_ALLOWED',
      pipelineBlocked: true,
      authRequired: false,
      expectedSensorVersion: SENSOR_VERSION,
      packageVersion: PACKAGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
    }
  }

  const needsUpgrade =
    firstPing.ok &&
    (!evaluateSensorHandshake({
      actualSensorVersion: sensorVersionFromPing(firstPing.body),
      expectedSensorVersion: SENSOR_VERSION,
    }).ok ||
      sensorBuildIdFromPing(firstPing.body) !== SENSOR_BUILD_ID)
  if (needsUpgrade) {
    const hotUpgradeKey = `${tabId}::hot:${SENSOR_VERSION}:${SENSOR_BUILD_ID}`
    if (!injectAttempted.has(hotUpgradeKey)) {
      injectAttempted.add(hotUpgradeKey)
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: false },
          files: ['content.js'],
        })
        const hotPing = await pingContent(tabId)
        if (hotPing.ok) {
          const hotHandshake = evaluateSensorHandshake({
            actualSensorVersion: sensorVersionFromPing(hotPing.body),
            expectedSensorVersion: SENSOR_VERSION,
          })
          if (hotHandshake.ok) {
            return receiverFromHandshake(hotHandshake, true, hotPing.body)
          }
        }
      } catch {
        /* fallback para reload abaixo */
      }
    }
    const reloadKey = `${tabId}::reload:${SENSOR_VERSION}`
    if (injectAttempted.has(reloadKey)) {
      const actual = sensorVersionFromPing(firstPing.body)
      const handshake = evaluateSensorHandshake({
        actualSensorVersion: actual,
        expectedSensorVersion: SENSOR_VERSION,
      })
      if (handshake.ok) {
        return receiverFromHandshake(handshake, false, firstPing.body)
      }
      return {
        ...receiverFromHandshake(handshake, false, firstPing.body),
        error:
          handshake.error ||
          `Sensor ${actual ?? 'ausente'} diferente de ${SENSOR_VERSION} depois de recarregar a aba do Flow.`,
        code: 'SENSOR_INCOMPATIBLE',
        pipelineBlocked: true,
        authRequired: false,
      }
    }
    injectAttempted.add(reloadKey)
    try {
      await chrome.tabs.reload(tabId)
      await waitForTabStatusComplete(tabId, 12_000)
    } catch (error) {
      return {
        ready: false,
        injected: false,
        ping: null,
        error: `Falha ao recarregar a aba do Flow: ${error instanceof Error ? error.message : String(error)}`,
        code: 'CONTENT_INJECT_FAILED',
        pipelineBlocked: true,
        authRequired: false,
        expectedSensorVersion: SENSOR_VERSION,
        packageVersion: PACKAGE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
      }
    }
    const reloadedPing = await pingContent(tabId)
    if (!reloadedPing.ok) {
      return {
        ready: false,
        injected: true,
        ping: null,
        error: `PING falhou depois de recarregar a aba: ${reloadedPing.error}`,
        code: 'CONTENT_PING_FAILED',
        pipelineBlocked: true,
        authRequired: false,
        expectedSensorVersion: SENSOR_VERSION,
        packageVersion: PACKAGE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
      }
    }
    return receiverFromHandshake(
      evaluateSensorHandshake({
        actualSensorVersion: sensorVersionFromPing(reloadedPing.body),
        expectedSensorVersion: SENSOR_VERSION,
      }),
      true,
      reloadedPing.body,
    )
  }
  const attemptKey = `${tabId}::${tabUrl}`
  if (injectAttempted.has(attemptKey)) {
    const actual = sensorVersionFromPing(firstPing.ok ? firstPing.body : null)
    const handshake = evaluateSensorHandshake({
      actualSensorVersion: actual,
      expectedSensorVersion: SENSOR_VERSION,
    })
    return {
      ...receiverFromHandshake(handshake, false, firstPing.ok ? firstPing.body : null),
      error: `Receptor ausente após 1 tentativa neste documento. ${'error' in firstPing ? firstPing.error : ''}`,
      code: 'CONTENT_RECEIVER_MISSING',
      pipelineBlocked: true,
      authRequired: false,
    }
  }
  injectAttempted.add(attemptKey)

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['content.js'],
    })
  } catch (error) {
    return {
      ready: false,
      injected: false,
      ping: null,
      error: `Falha ao injetar content.js: ${error instanceof Error ? error.message : String(error)}`,
      code: 'CONTENT_INJECT_FAILED',
      pipelineBlocked: true,
      authRequired: false,
      expectedSensorVersion: SENSOR_VERSION,
      packageVersion: PACKAGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
    }
  }

  const secondPing = await pingContent(tabId)
  if (!secondPing.ok) {
    return {
      ready: false,
      injected: true,
      ping: null,
      error: `PING falhou após injeção: ${secondPing.error}`,
      code: 'CONTENT_PING_FAILED',
      pipelineBlocked: true,
      authRequired: false,
      expectedSensorVersion: SENSOR_VERSION,
      packageVersion: PACKAGE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
    }
  }
  const handshake = evaluateSensorHandshake({
    actualSensorVersion: sensorVersionFromPing(secondPing.body),
    expectedSensorVersion: SENSOR_VERSION,
  })
  return receiverFromHandshake(handshake, true, secondPing.body)
}

function extractAccountLabel(observation: Record<string, unknown> | null | undefined): string | null {
  if (!observation) return null
  if (typeof observation.accountLabel === 'string' && observation.accountLabel.trim()) {
    return observation.accountLabel.trim().slice(0, 120)
  }
  const labels = Array.isArray(observation.labelsSample)
    ? observation.labelsSample.map((x) => String(x))
    : []
  for (const label of labels) {
    const email = label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    if (email?.[0]) return email[0].slice(0, 120)
  }
  return null
}

function observationNeedsLogin(observation: Record<string, unknown> | null | undefined): boolean {
  if (!observation) return false
  if (observation.evidenceStatus === 'login_ui_visible') return true
  const hints =
    observation.hints && typeof observation.hints === 'object'
      ? (observation.hints as Record<string, unknown>)
      : null
  return hints?.signInVisible === true
}

function observationSessionUsable(observation: Record<string, unknown> | null | undefined): boolean {
  if (!observation) return false
  if (observationNeedsLogin(observation)) return false
  const evidence = String(observation.evidenceStatus || '')
  if (evidence === 'page_observable' || evidence === 'session_usable') return true
  const hints =
    observation.hints && typeof observation.hints === 'object'
      ? (observation.hints as Record<string, unknown>)
      : null
  return Boolean(
    hints?.ultraMention ||
      hints?.newProjectMention ||
      hints?.imageMention ||
      hints?.generateMention,
  )
}

async function findOrOpenFlowTab(flowHomeUrl: string): Promise<{
  tabId: number | null
  url: string | null
  opened: boolean
  error?: string
}> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://flow.google.com/*', 'https://www.flow.google.com/*'],
    })
    const existing = tabs.find((tab) => tab.id != null && isFlowUrl(tab.url ?? null))
    if (existing?.id != null) {
      try {
        await chrome.tabs.update(existing.id, { active: true })
      } catch {
        /* ignore focus errors */
      }
      return { tabId: existing.id, url: existing.url ?? null, opened: false }
    }
    const created = await chrome.tabs.create({ url: flowHomeUrl, active: true })
    return { tabId: created.id ?? null, url: created.url ?? flowHomeUrl, opened: true }
  } catch (error) {
    return {
      tabId: null,
      url: null,
      opened: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function inspectSingleFlowTab(tabId: number, tabUrl: string): Promise<{
  ok: boolean
  observation: Record<string, unknown> | null
  error?: string
}> {
  const receiver = await ensureContentReceiver(tabId, tabUrl)
  if (!receiver.ready) {
    return { ok: false, observation: null, error: receiver.error || 'CONTENT_NOT_READY' }
  }
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'atlas-flow-v1.page.inspect',
    })) as { ok?: boolean; observation?: Record<string, unknown>; error?: string }
    if (response?.ok === true && response.observation) {
      return { ok: true, observation: response.observation }
    }
    return { ok: false, observation: null, error: response?.error || 'INSPECT_FAILED' }
  } catch (error) {
    return {
      ok: false,
      observation: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function postSessionEnsureObservation(
  state: PairingState,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!state.endpoint || !state.pairingToken) return false
  try {
    const res = await fetch(`${state.endpoint}/api/atlas-flow/v1/session/observations`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.pairingToken}`,
      },
      body: JSON.stringify(payload),
    })
    return res.ok === true
  } catch {
    return false
  }
}

/**
 * Localiza/abre o Flow no perfil da extensão, verifica sessão e, se preciso,
 * abre o login oficial do Google — sem inventar API do Flow.
 */
async function ensureFlowSessionAction(input?: {
  openFlowIfNeeded?: boolean
  openLoginIfNeeded?: boolean
  flowHomeUrl?: string
}): Promise<Record<string, unknown>> {
  const state = await readPairingState()
  const flowHomeUrl = input?.flowHomeUrl || FLOW_HOME_URL
  const openFlowIfNeeded = input?.openFlowIfNeeded !== false
  const openLoginIfNeeded = input?.openLoginIfNeeded !== false

  if (!state.endpoint || !state.pairingToken || !state.installationId) {
    return {
      ok: false,
      error: 'NOT_PAIRED',
      sessionUsable: false,
      loginRequired: false,
    }
  }

  let tab = openFlowIfNeeded
    ? await findOrOpenFlowTab(flowHomeUrl)
    : await (async () => {
        const tabs = await chrome.tabs.query({
          url: ['https://flow.google.com/*', 'https://www.flow.google.com/*'],
        })
        const existing = tabs.find((item) => item.id != null && isFlowUrl(item.url ?? null))
        return {
          tabId: existing?.id ?? null,
          url: existing?.url ?? null,
          opened: false,
          error: existing ? undefined : 'NO_FLOW_TAB',
        }
      })()

  if (tab.tabId == null) {
    const payload = {
      kind: 'session_ensure',
      installationId: state.installationId,
      inspectedAt: new Date().toISOString(),
      sessionUsable: false,
      loginRequired: false,
      browserUnavailable: true,
      error: tab.error || 'BROWSER_UNAVAILABLE',
      accountLabel: null,
      evidenceStatus: null,
    }
    await postSessionEnsureObservation(state, payload)
    return { ...payload, ok: false }
  }

  // Aguarda carga inicial se acabamos de abrir a aba.
  if (tab.opened) {
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }

  let inspect = await inspectSingleFlowTab(tab.tabId, tab.url || flowHomeUrl)
  let observation = inspect.observation
  let loginRequired = observationNeedsLogin(observation)
  let sessionUsable = observationSessionUsable(observation)
  let accountLabel = extractAccountLabel(observation)
  let openedLogin = false

  if (!sessionUsable && loginRequired && openLoginIfNeeded) {
    openedLogin = true
    try {
      await chrome.tabs.create({ url: GOOGLE_ACCOUNTS_URL, active: true })
    } catch {
      try {
        await chrome.tabs.update(tab.tabId, { url: flowHomeUrl, active: true })
      } catch {
        /* ignore */
      }
    }
    // Publica estado intermediário para a UI mostrar "Conclua o login".
    await postSessionEnsureObservation(state, {
      kind: 'session_ensure',
      installationId: state.installationId,
      inspectedAt: new Date().toISOString(),
      sessionUsable: false,
      loginRequired: true,
      accountLabel,
      evidenceStatus: observation?.evidenceStatus || 'login_ui_visible',
      observation,
      openedLogin: true,
      note: 'Aguardando login oficial do Google no navegador da extensão.',
    })

    // Reverifica periodicamente enquanto o usuário conclui login/verificações.
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 4_000))
      const refreshed = await findOrOpenFlowTab(flowHomeUrl)
      if (refreshed.tabId == null) continue
      tab = refreshed
      inspect = await inspectSingleFlowTab(refreshed.tabId, refreshed.url || flowHomeUrl)
      observation = inspect.observation
      loginRequired = observationNeedsLogin(observation)
      sessionUsable = observationSessionUsable(observation)
      accountLabel = extractAccountLabel(observation) || accountLabel
      if (sessionUsable) break
      await postSessionEnsureObservation(state, {
        kind: 'session_ensure',
        installationId: state.installationId,
        inspectedAt: new Date().toISOString(),
        sessionUsable: false,
        loginRequired: true,
        accountLabel,
        evidenceStatus: observation?.evidenceStatus || 'login_ui_visible',
        observation,
        openedLogin: true,
        note: 'Ainda aguardando sessão utilizável no Flow.',
      })
    }
  }

  const payload = {
    kind: 'session_ensure',
    installationId: state.installationId,
    inspectedAt: new Date().toISOString(),
    sessionUsable,
    loginRequired: !sessionUsable && loginRequired,
    accountLabel,
    evidenceStatus:
      (observation && typeof observation.evidenceStatus === 'string'
        ? observation.evidenceStatus
        : null) || (sessionUsable ? 'session_usable' : loginRequired ? 'login_ui_visible' : null),
    href: observation && typeof observation.href === 'string' ? observation.href : tab.url,
    observation,
    openedFlowTab: tab.opened === true,
    openedLogin,
    pages: [
      {
        tabId: tab.tabId,
        tabUrl: tab.url,
        ok: inspect.ok,
        observation,
        error: inspect.error ?? null,
      },
    ],
    note: sessionUsable
      ? 'Sessão utilizável no Flow confirmada (não é prova de geração).'
      : loginRequired
        ? 'Login Google necessário no perfil da extensão.'
        : 'Não foi possível confirmar sessão utilizável no Flow.',
  }
  const posted = await postSessionEnsureObservation(state, payload)
  return { ...payload, ok: sessionUsable, posted }
}

async function inspectFlowSession(): Promise<Record<string, unknown>> {
  let state = await readPairingState()

  // Autoridade pareada apenas — sem varredura de portas.
  if (!state.endpoint) {
    const resolved = await resolveAuthoritativeEndpoint(state)
    if (resolved.endpoint) {
      await writePairingPatch({ endpoint: resolved.endpoint })
      state = await readPairingState()
    }
  } else {
    const health = await probeHealth(state.endpoint)
    if (!health.ok) {
      await writePairingPatch({
        lastHealthOk: false,
        connectionState: state.pairingToken ? 'atlas_unavailable' : state.connectionState,
        lastError:
          'Atlas indisponível no endpoint pareado. Credencial preservada; sem troca de porta.',
      })
      void attemptReconnect('inspect_health_gap')
    }
  }

  const tabs = await chrome.tabs.query({ url: ['https://flow.google.com/*', 'https://www.flow.google.com/*'] })
  const flowTabs = tabs.filter((tab) => isFlowUrl(tab.url ?? null))
  await appendLog('info', 'session.inspect: abas Flow', { count: flowTabs.length })

  if (!flowTabs.length) {
    const result = {
      ok: false,
      step: 'find_tab',
      error: 'Nenhuma aba https://flow.google.com/* aberta neste perfil.',
      realFlowValidated: false,
      contentScriptOk: false,
      posted: null,
    }
    await chrome.storage.local.set({ lastError: result.error })
    return result
  }

  const pageObservations: Array<Record<string, unknown>> = []
  let pagesOk = 0
  let pagesFailed = 0

  for (const tab of flowTabs) {
    if (tab.id == null) continue
    const tabUrl = tab.url ?? ''
    const receiver = await ensureContentReceiver(tab.id, tabUrl)
    if (!receiver.ready) {
      pagesFailed += 1
      pageObservations.push({
        tabId: tab.id,
        tabUrl,
        tabTitle: tab.title ?? null,
        active: tab.active === true,
        ok: false,
        step: 'content_handshake',
        injected: receiver.injected,
        error: receiver.error ?? 'Receptor não disponível',
      })
      continue
    }

    try {
      const response = (await chrome.tabs.sendMessage(tab.id, {
        type: 'atlas-flow-v1.page.inspect',
      })) as { ok?: boolean; observation?: unknown; error?: string }

      if (response?.ok === true && response.observation) {
        pagesOk += 1
        pageObservations.push({
          tabId: tab.id,
          tabUrl,
          tabTitle: tab.title ?? null,
          active: tab.active === true,
          ok: true,
          injected: receiver.injected,
          ping: receiver.ping,
          observation: response.observation,
        })
      } else {
        pagesFailed += 1
        pageObservations.push({
          tabId: tab.id,
          tabUrl,
          tabTitle: tab.title ?? null,
          active: tab.active === true,
          ok: false,
          step: 'page_inspect',
          injected: receiver.injected,
          error: response?.error ?? 'Inspect sem observation',
          response,
        })
      }
    } catch (error) {
      pagesFailed += 1
      pageObservations.push({
        tabId: tab.id,
        tabUrl,
        tabTitle: tab.title ?? null,
        active: tab.active === true,
        ok: false,
        step: 'page_inspect',
        injected: receiver.injected,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const payload = {
    installationId: state.installationId,
    inspectedAt: new Date().toISOString(),
    tabCount: flowTabs.length,
    pagesOk,
    pagesFailed,
    pages: pageObservations,
    realFlowValidated: false,
  }

  let posted: unknown = null
  let postOk = false
  if (!state.endpoint || !state.pairingToken) {
    posted = {
      ok: false,
      error: 'Sem endpoint/token. Rode o diagnóstico com o pairingToken do Atlas.',
      endpoint: state.endpoint,
      hasToken: Boolean(state.pairingToken),
    }
    await appendLog('warn', 'Sem endpoint/token — observação não postada ao Atlas', {
      endpoint: state.endpoint,
      hasToken: Boolean(state.pairingToken),
    })
  } else if (pagesOk === 0) {
    posted = {
      ok: false,
      error: 'Nenhuma página inspecionada com sucesso; não postar observação vazia como sucesso.',
    }
  } else {
    try {
      const res = await fetch(`${state.endpoint}/api/atlas-flow/v1/session/observations`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.pairingToken}`,
        },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({ httpStatus: res.status }))
      postOk = res.ok === true
      posted = { ok: postOk, httpStatus: res.status, body }
      await appendLog(postOk ? 'info' : 'error', 'session.inspect postado ao Coordinator', {
        httpStatus: res.status,
      })
    } catch (error) {
      posted = { ok: false, error: error instanceof Error ? error.message : String(error) }
      await appendLog('error', 'Falha ao postar observação', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await chrome.storage.local.set({
    lastSessionInspection: payload,
    lastError:
      pagesFailed > 0 || !postOk
        ? `inspect parcial/falha pagesOk=${pagesOk} pagesFailed=${pagesFailed} postOk=${postOk}`
        : null,
  })

  const ok = pagesOk > 0 && pagesFailed === 0 && postOk
  return {
    ok,
    partial: pagesOk > 0 && (pagesFailed > 0 || !postOk),
    step: ok ? 'session_inspect' : pagesOk > 0 ? 'session_inspect_partial' : 'session_inspect_failed',
    contentScriptOk: pagesOk > 0,
    pagesOk,
    pagesFailed,
    realFlowValidated: false,
    payload,
    posted,
    endpoint: state.endpoint,
    note: 'ok=true só se todas as páginas responderam e o Atlas recebeu a observação.',
  }
}

async function inspectLinkedProject(): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext()
  if (!ctx.ok || !ctx.link) {
    const authBlocked =
      ctx.error === 'UNAUTHORIZED' ||
      ctx.error === 'HELLO_REQUIRED' ||
      (ctx as { authRequired?: boolean }).authRequired === true
    const sensorBlocked =
      (ctx as { code?: string }).code === 'SENSOR_INCOMPATIBLE' ||
      (typeof ctx.error === 'string' && /Sensor ainda em|esperado \d+\.\d+\.\d+/.test(ctx.error))
    const blocked =
      authBlocked ||
      sensorBlocked ||
      (ctx as { pipelineBlocked?: boolean }).pipelineBlocked === true
    return {
      ok: false,
      step: authBlocked ? 'auth' : sensorBlocked ? 'sensor' : 'context',
      error: ctx.error || 'PROJECT_LINK_ABSENT',
      code: (ctx as { code?: string }).code ?? (sensorBlocked ? 'SENSOR_INCOMPATIBLE' : null),
      authRequired: authBlocked,
      pipelineBlocked: blocked,
      httpStatus: (ctx as { httpStatus?: number }).httpStatus ?? null,
      pairingTokenFingerprint: (ctx as { pairingTokenFingerprint?: string | null })
        .pairingTokenFingerprint,
      pairingFileHint: (ctx as { pairingFileHint?: string }).pairingFileHint,
      expectedSensorVersion: (ctx as { expectedSensorVersion?: string }).expectedSensorVersion,
      actualSensorVersion: (ctx as { actualSensorVersion?: string | null }).actualSensorVersion,
      note: authBlocked
        ? '401/403/HELLO_REQUIRED preservados — não converter em projeto ausente.'
        : sensorBlocked
          ? 'Sensor incompatível — pipelineBlocked; sem efeito externo.'
          : undefined,
      realFlowValidated: false,
    }
  }

  const state = ctx.state!
  const link = ctx.link
  const flowProjectUrl =
    typeof link?.flowProjectUrl === 'string' ? link.flowProjectUrl : null
  const flowProjectId =
    typeof link?.flowProjectId === 'string' ? link.flowProjectId : null
  if (!flowProjectUrl || !flowProjectId || link?.linkState !== 'linked') {
    return {
      ok: false,
      step: 'no_linked_project',
      error: 'Nenhum projeto linked no Coordinator. Rode project.ensure antes.',
      link,
      realFlowValidated: false,
    }
  }

  let tab =
    (await chrome.tabs.query({ url: ['https://flow.google.com/project/*'] })).find((item) =>
      (item.url || '').includes(flowProjectId),
    ) || null

  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: flowProjectUrl, active: false })
  } else if (!(tab.url || '').includes(flowProjectId)) {
    await chrome.tabs.update(tab.id!, { url: flowProjectUrl, active: false })
  }
  // Não ativar aba existente — jobs rodam com Atlas em primeiro plano.

  // Espera curta de navegação SPA/load.
  await new Promise((r) => setTimeout(r, 1200))
  if (tab.id == null) {
    return { ok: false, step: 'tab', error: 'tabId ausente', realFlowValidated: false }
  }

  const receiver = await ensureContentReceiver(tab.id, flowProjectUrl)
  if (!receiver.ready) {
    return {
      ok: false,
      step: receiver.code === 'SENSOR_INCOMPATIBLE' ? 'sensor' : 'content_handshake',
      error: receiver.error,
      code: receiver.code ?? null,
      pipelineBlocked: receiver.pipelineBlocked !== false,
      authRequired: receiver.authRequired === true,
      expectedSensorVersion: receiver.expectedSensorVersion ?? SENSOR_VERSION,
      actualSensorVersion: receiver.actualSensorVersion ?? null,
      packageVersion: receiver.packageVersion ?? PACKAGE_VERSION,
      protocolVersion: receiver.protocolVersion ?? PROTOCOL_VERSION,
      realFlowValidated: false,
    }
  }

  let pageResponse: Record<string, unknown>
  try {
    pageResponse = (await chrome.tabs.sendMessage(tab.id, {
      type: 'atlas-flow-v1.page.inspect',
    })) as Record<string, unknown>
  } catch (error) {
    return {
      ok: false,
      step: 'page_inspect',
      error: error instanceof Error ? error.message : String(error),
      realFlowValidated: false,
    }
  }

  const observation = (pageResponse as { observation?: Record<string, unknown> }).observation
  const observedId =
    typeof observation?.projectIdFromUrl === 'string' ? observation.projectIdFromUrl : null
  if (observedId !== flowProjectId) {
    return {
      ok: false,
      partial: true,
      step: 'project_url_mismatch',
      error: `URL observada não confirma o projeto vinculado (${observedId} ≠ ${flowProjectId})`,
      expectedFlowProjectId: flowProjectId,
      observation,
      realFlowValidated: false,
    }
  }

  const payload = {
    kind: 'project_page',
    linkedFlowProjectId: flowProjectId,
    linkedFlowProjectUrl: flowProjectUrl,
    inspectedAt: new Date().toISOString(),
    observation,
    realFlowValidated: false,
  }

  let posted: unknown = null
  try {
    const res = await fetch(`${state.endpoint}/api/atlas-flow/v1/session/observations`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.pairingToken}`,
      },
      body: JSON.stringify(payload),
    })
    // Também grava arquivo dedicado via complete-like path: reusa observations + side write no client log
    posted = await res.json().catch(() => ({ httpStatus: res.status }))
    await chrome.storage.local.set({ lastProjectPageInspection: payload })
    await appendLog(res.ok ? 'info' : 'error', 'project page observation postada', {
      httpStatus: res.status,
    })
  } catch (error) {
    posted = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  return {
    ok: true,
    step: 'project_page_inspected',
    contentScriptOk: true,
    flowProjectId,
    flowProjectUrl,
    observation,
    posted,
    realFlowValidated: false,
    note: 'Inspeção do projeto. Não valida upload/anexo/geração.',
  }
}

async function fetchLinkedProjectContext(options?: {
  /** Quando true, não ativa a aba nem traz o Chrome à frente. */
  background?: boolean
  /** Projeto desta geração. Tem prioridade sobre o “último vínculo” em memória. */
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<{
  ok: boolean
  error?: string
  state?: PairingState
  link?: Record<string, unknown>
  tabId?: number
  flowProjectId?: string
  flowProjectUrl?: string
  navigated?: boolean
}> {
  let state = await readPairingState()
  if (!state.endpoint && state.pairingToken && state.installationId) {
    const rediscovery = await discoverPairedEndpoint(
      state.pairingToken,
      state.installationId,
      state.preferredEndpoint || state.endpoint,
    )
    if (rediscovery.endpoint) {
      await chrome.storage.local.set({ endpoint: rediscovery.endpoint, paired: true })
      state = await readPairingState()
    }
  } else if (!state.endpoint) {
    const resolved = await resolveAuthoritativeEndpoint(state)
    if (resolved.endpoint) {
      await writePairingPatch({ endpoint: resolved.endpoint })
      state = await readPairingState()
    }
  }
  if (!state.endpoint || !state.pairingToken) {
    return { ok: false, error: 'Sem endpoint/token.', authRequired: true }
  }
  if (state.paired !== true || state.lastHelloOk !== true) {
    return {
      ok: false,
      error: 'HELLO_REQUIRED',
      authRequired: true,
      pipelineBlocked: true,
      state: {
        ...state,
        pairingToken: undefined,
        hasPairingToken: Boolean(state.pairingToken),
      },
      note: 'Hello/pareamento obrigatório antes de operações protegidas.',
    }
  }

  const hintedProjectId = options?.flowProjectId?.trim() || ''
  const hintedProjectUrl = options?.flowProjectUrl?.trim() || ''
  let link: Record<string, unknown> | null = null
  let flowProjectUrl: string | null = null
  let flowProjectId: string | null = null
  if (hintedProjectId && hintedProjectUrl) {
    link = {
      atlasProjectId: options?.atlasProjectId || '',
      flowProjectId: hintedProjectId,
      flowProjectUrl: hintedProjectUrl,
      linkState: 'linked',
    }
    flowProjectId = hintedProjectId
    flowProjectUrl = hintedProjectUrl
  }

  let res: Response | null = null
  if (!link) {
  const latestQuery = options?.atlasProjectId
    ? `?atlasProjectId=${encodeURIComponent(options.atlasProjectId)}`
    : ''
  try {
    res = await fetch(`${state.endpoint}/api/atlas-flow/v1/projects/links/latest${latestQuery}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${state.pairingToken}`,
      },
    })
  } catch {
    if (state.pairingToken && state.installationId) {
      const rediscovery = await discoverPairedEndpoint(
      state.pairingToken,
      state.installationId,
      state.preferredEndpoint || state.endpoint,
    )
      if (rediscovery.endpoint) {
        await chrome.storage.local.set({ endpoint: rediscovery.endpoint, paired: true })
        state = await readPairingState()
        res = await fetch(`${state.endpoint}/api/atlas-flow/v1/projects/links/latest${latestQuery}`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${state.pairingToken}`,
          },
        })
      } else {
        return {
          ok: false,
          error: 'PAIRED_COORDINATOR_UNAVAILABLE',
          state,
        }
      }
    } else {
      return { ok: false, error: 'PAIRED_COORDINATOR_UNAVAILABLE', state }
    }
  }

  if (!res) {
    return { ok: false, error: 'PAIRED_COORDINATOR_UNAVAILABLE', state }
  }

  if (res.status === 401 || res.status === 403) {
    const authBody = await res.json().catch(() => ({ error: 'UNAUTHORIZED' }))
    await chrome.storage.local.set({ paired: false, lastHelloOk: false, lastError: 'UNAUTHORIZED' })
    return {
      ok: false,
      error: 'UNAUTHORIZED',
      httpStatus: res.status,
      authRequired: true,
      pipelineBlocked: true,
      body: authBody,
      endpointUsed: state.endpoint,
      pairingTokenFingerprint: await pairingTokenFingerprint(state.pairingToken),
      pairingFileHint: 'docs/atlas-flow/coordinator-pairing.local.json',
      note: '401/403 preservado — não converter em projeto ausente / lista vazia.',
    }
  }

  const body = (await res.json()) as { link?: Record<string, unknown> | null }
  link = body.link ?? null
  flowProjectUrl = typeof link?.flowProjectUrl === 'string' ? link.flowProjectUrl : null
  flowProjectId = typeof link?.flowProjectId === 'string' ? link.flowProjectId : null
  if (!link || link.linkState !== 'linked' || !flowProjectUrl || !flowProjectId) {
    return {
      ok: false,
      error: 'PROJECT_LINK_ABSENT',
      httpStatus: res.status,
      state: {
        endpoint: state.endpoint,
        paired: state.paired,
        hasPairingToken: Boolean(state.pairingToken),
      },
      link: link || undefined,
      note: 'Consulta autenticada sem vínculo linked. Não criar projeto novo automaticamente.',
    }
  }
  }

  if (!link || !flowProjectId || !flowProjectUrl) {
    return { ok: false, error: 'PROJECT_LINK_ABSENT', state }
  }

  // Default: segundo plano (Atlas em foco). Só ativa aba se background===false (login/sessão).
  const background = options?.background !== false
  let tab =
    (await chrome.tabs.query({ url: ['https://flow.google.com/project/*'] })).find((item) =>
      (item.url || '').includes(flowProjectId),
    ) || null
  let navigated = false
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: flowProjectUrl, active: !background })
    navigated = true
  } else {
    const alreadyOnProject = (tab.url || '').includes(`/project/${flowProjectId}`)
    if (!alreadyOnProject) {
      await chrome.tabs.update(tab.id, { url: flowProjectUrl, active: !background })
      navigated = true
    }
    // Já no projeto: nunca ativar — evita roubar foco do Atlas.
  }
  if (tab.id == null) return { ok: false, error: 'tabId ausente', state, link }
  if (navigated) {
    tab = await waitUntilTabShows(tab.id, flowProjectId, 15_000)
  }
  // Sem loop de reload. Só espera receiver; prontidão de UI fica no content script.
  const receiver = await ensureContentReceiver(tab.id, tab.url || flowProjectUrl)
  if (!receiver.ready) {
    return {
      ok: false,
      error: receiver.error,
      code: receiver.code ?? 'CONTENT_RECEIVER_UNAVAILABLE',
      pipelineBlocked: receiver.pipelineBlocked !== false,
      authRequired: receiver.authRequired === true,
      expectedSensorVersion: receiver.expectedSensorVersion ?? SENSOR_VERSION,
      actualSensorVersion: receiver.actualSensorVersion ?? null,
      packageVersion: receiver.packageVersion ?? PACKAGE_VERSION,
      protocolVersion: receiver.protocolVersion ?? PROTOCOL_VERSION,
      state,
      link,
    }
  }
  return {
    ok: true,
    state,
    link,
    tabId: tab.id,
    flowProjectId,
    flowProjectUrl,
    navigated,
  }
}

async function openUploadUiOnLinkedProject(): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext()
  if (!ctx.ok || ctx.tabId == null) {
    const authBlocked =
      ctx.error === 'UNAUTHORIZED' ||
      ctx.error === 'HELLO_REQUIRED' ||
      (ctx as { authRequired?: boolean }).authRequired === true
    const sensorBlocked =
      (ctx as { code?: string }).code === 'SENSOR_INCOMPATIBLE' ||
      (typeof ctx.error === 'string' && /Sensor ainda em|esperado \d+\.\d+\.\d+/.test(ctx.error))
    const blocked =
      authBlocked ||
      sensorBlocked ||
      (ctx as { pipelineBlocked?: boolean }).pipelineBlocked === true
    return {
      ok: false,
      step: authBlocked ? 'auth' : sensorBlocked ? 'sensor' : 'context',
      error: ctx.error,
      code: (ctx as { code?: string }).code ?? (sensorBlocked ? 'SENSOR_INCOMPATIBLE' : null),
      authRequired: authBlocked,
      pipelineBlocked: blocked,
      httpStatus: (ctx as { httpStatus?: number }).httpStatus ?? null,
      pairingTokenFingerprint: (ctx as { pairingTokenFingerprint?: string | null })
        .pairingTokenFingerprint,
      pairingFileHint: (ctx as { pairingFileHint?: string }).pairingFileHint,
      expectedSensorVersion: (ctx as { expectedSensorVersion?: string }).expectedSensorVersion,
      actualSensorVersion: (ctx as { actualSensorVersion?: string | null }).actualSensorVersion,
      packageVersion: (ctx as { packageVersion?: string }).packageVersion,
      protocolVersion: (ctx as { protocolVersion?: number }).protocolVersion,
      note: authBlocked
        ? 'Operação protegida bloqueada até hello OK. 401/403 ≠ projeto ausente.'
        : sensorBlocked
          ? 'Sensor incompatível com o build atual — pipelineBlocked; sem efeito externo.'
          : undefined,
      realFlowValidated: false,
    }
  }
  const page = (await chrome.tabs.sendMessage(ctx.tabId, {
    type: 'atlas-flow-v1.page.openUploadUi',
    payload: { expectedFlowProjectId: ctx.flowProjectId },
  })) as Record<string, unknown>

  const pageError = typeof page.error === 'string' ? page.error : undefined
  const pageStep = typeof page.step === 'string' ? page.step : 'upload_ui'
  const resultBase = {
    ok: page.ok === true,
    step: pageStep,
    error: page.ok === true ? undefined : pageError,
    navigated: ctx.navigated === true,
    flowProjectId: ctx.flowProjectId,
    page,
    realFlowValidated: false as const,
  }

  // Persiste observação pós-abertura no Coordinator
  if (ctx.state?.endpoint && ctx.state.pairingToken) {
    const payload = {
      kind: 'project_page',
      subtype: 'upload_ui_opened',
      linkedFlowProjectId: ctx.flowProjectId,
      linkedFlowProjectUrl: ctx.flowProjectUrl,
      inspectedAt: new Date().toISOString(),
      page,
      realFlowValidated: false,
    }
    try {
      const res = await fetch(`${ctx.state.endpoint}/api/atlas-flow/v1/session/observations`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.state.pairingToken}`,
        },
        body: JSON.stringify(payload),
      })
      const posted = await res.json().catch(() => ({ httpStatus: res.status }))
      return { ...resultBase, posted }
    } catch (error) {
      return {
        ...resultBase,
        posted: { ok: false, error: error instanceof Error ? error.message : String(error) },
      }
    }
  }
  return resultBase
}

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function postReferenceBinding(
  endpoint: string,
  pairingToken: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const bindingRes = await fetch(`${endpoint}/api/atlas-flow/v1/references/bindings`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pairingToken}`,
    },
    body: JSON.stringify(body),
  })
  return (await bindingRes.json().catch(() => ({
    ok: false,
    httpStatus: bindingRes.status,
  }))) as Record<string, unknown>
}

function isLegitimateMediaId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  const value = id.trim()
  if (!value || value === '_gd' || value.startsWith('_')) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true
  }
  return /^[a-zA-Z0-9-]{20,}$/.test(value)
}

function contextFailureResponse(ctx: {
  error?: string
  authRequired?: boolean
  pipelineBlocked?: boolean
  code?: string
  httpStatus?: number
  pairingTokenFingerprint?: string | null
  pairingFileHint?: string
  expectedSensorVersion?: string
  actualSensorVersion?: string | null
  packageVersion?: string
  protocolVersion?: number
}): Record<string, unknown> {
  const authBlocked =
    ctx.error === 'UNAUTHORIZED' ||
    ctx.error === 'HELLO_REQUIRED' ||
    ctx.authRequired === true
  const sensorBlocked =
    ctx.code === 'SENSOR_INCOMPATIBLE' ||
    (typeof ctx.error === 'string' && /Sensor ainda em|esperado \d+\.\d+\.\d+/.test(ctx.error))
  const blocked = authBlocked || sensorBlocked || ctx.pipelineBlocked === true
  return {
    ok: false,
    step: authBlocked ? 'auth' : sensorBlocked ? 'sensor' : 'context',
    error: ctx.error || 'contexto inválido',
    code: ctx.code ?? (sensorBlocked ? 'SENSOR_INCOMPATIBLE' : null),
    authRequired: authBlocked,
    pipelineBlocked: blocked,
    httpStatus: ctx.httpStatus ?? null,
    pairingTokenFingerprint: ctx.pairingTokenFingerprint,
    pairingFileHint: ctx.pairingFileHint,
    expectedSensorVersion: ctx.expectedSensorVersion,
    actualSensorVersion: ctx.actualSensorVersion,
    packageVersion: ctx.packageVersion,
    protocolVersion: ctx.protocolVersion,
    didUpload: false,
    didAttach: false,
    didWritePrompt: false,
    didGenerate: false,
    note: authBlocked
      ? 'Operação protegida bloqueada até hello OK. 401/403 ≠ projeto/refs ausentes.'
      : sensorBlocked
        ? 'Sensor incompatível com o build atual — pipelineBlocked; sem efeito externo.'
        : undefined,
    realFlowValidated: false,
  }
}

/**
 * Reconciliação isolada: localiza refs existentes no DOM, devolve structureDiagnosis,
 * atualiza binding só se inequívoco. Sem upload/anexar/prompt/gerar.
 * Reusa atlas-flow-v1.page.reconcileUploadIdentities (sem duplicar a lógica DOM).
 */
async function reconcileReferencesOnly(): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext()
  if (!ctx.ok || ctx.tabId == null || !ctx.state?.endpoint || !ctx.state.pairingToken) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }

  const atlasProjectId = String(ctx.link?.atlasProjectId || '')
  const expectedFlowProjectId = String(ctx.flowProjectId || ctx.link?.flowProjectId || '')
  const pairedEndpoint = ctx.state.endpoint

  let listRes: Response
  try {
    listRes = await fetch(
      `${pairedEndpoint}/api/atlas-flow/v1/references?atlasProjectId=${encodeURIComponent(atlasProjectId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${ctx.state.pairingToken}`,
        },
      },
    )
  } catch (error) {
    return {
      ok: false,
      step: 'staging',
      error: 'PAIRED_COORDINATOR_UNAVAILABLE',
      detail: error instanceof Error ? error.message : String(error),
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  const listBody = (await listRes.json().catch(() => ({}))) as Record<string, unknown>
  const allRefs = Array.isArray(listBody.references)
    ? (listBody.references as Array<Record<string, unknown>>)
    : []
  const availability = decideReferencesAvailability({
    pairedEndpoint,
    httpOk: listRes.ok,
    references: allRefs,
  })
  if (!availability.available) {
    return {
      ok: false,
      step: 'staging',
      error: availability.error || 'REFERENCES_NOT_AVAILABLE',
      references: allRefs,
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  // Duas imagens já existentes (não só uncertain) — diagnóstico isolado.
  const targets = allRefs.slice(0, 2)
  if (targets.length === 0) {
    return {
      ok: false,
      step: 'reconcile_only',
      error: 'NO_REFERENCES_TO_RECONCILE',
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      realFlowValidated: false,
    }
  }

  const reconcilePage = (await chrome.tabs.sendMessage(ctx.tabId, {
    type: 'atlas-flow-v1.page.reconcileUploadIdentities',
    payload: {
      expectedFlowProjectId: ctx.flowProjectId,
      references: targets.map((item) => ({
        referenceId: item.referenceId,
        displayName: item.displayName,
        name: flowReferenceFileName(item),
        flowMediaId: item.flowMediaId ?? null,
        uploadState: item.uploadState,
        bindingState: item.bindingState,
      })),
    },
  })) as {
    ok?: boolean
    results?: Array<Record<string, unknown>>
    error?: string
  }

  const bindingReports: Array<Record<string, unknown>> = []
  const results: Array<Record<string, unknown>> = []
  const structureDiagnoses: Array<unknown> = []

  for (const result of reconcilePage.results || []) {
    const referenceId = String(result.referenceId || '')
    const evidence =
      result.evidence && typeof result.evidence === 'object'
        ? (result.evidence as Record<string, unknown>)
        : {}
    const structureDiagnosis = evidence.structureDiagnosis ?? null
    structureDiagnoses.push({ referenceId, structureDiagnosis })
    const flowMediaId = isLegitimateMediaId(result.flowMediaId) ? result.flowMediaId : null
    const boundOk = result.ok === true && Boolean(flowMediaId)

    let bindingReport: Record<string, unknown> | null = null
    // Binding persistido SOMENTE quando associação inequívoca.
    if (boundOk) {
      bindingReport = (await postReferenceBinding(ctx.state.endpoint, ctx.state.pairingToken, {
        referenceId,
        flowProjectId: ctx.flowProjectId,
        flowMediaId,
        bindingState: 'bound',
        attachedState: 'not_attached',
        evidence: {
          reconcileOnly: true,
          result,
          note: 'Binding atualizado só com identidade inequívoca. Sem upload/anexo/gerar.',
        },
      })) as Record<string, unknown>
      bindingReports.push({
        ...bindingReport,
        confirmedFlowMediaId: flowMediaId,
      })
    }

    results.push({
      referenceId,
      name: result.name ?? null,
      ok: boundOk,
      flowMediaId: boundOk ? flowMediaId : null,
      error: boundOk ? null : result.error || 'UPLOAD_IDENTITY_UNCERTAIN',
      bindingUpdated: boundOk,
      structureDiagnosis,
      evidence,
      note: boundOk
        ? 'Associação inequívoca — binding atualizado.'
        : 'Sem associação inequívoca — binding NÃO atualizado; uncertain preservado.',
    })
  }

  const allBound = results.length > 0 && results.every((item) => item.ok === true)
  return {
    ok: allBound,
    step: 'reconcile_only',
    atlasProjectId,
    expectedFlowProjectId,
    endpointUsed: pairedEndpoint,
    targets: targets.map((item) => ({
      referenceId: item.referenceId,
      displayName: item.displayName,
      uploadState: item.uploadState,
      flowMediaId: item.flowMediaId ?? null,
    })),
    results,
    structureDiagnoses,
    bindingReports,
    didUpload: false,
    didAttach: false,
    didWritePrompt: false,
    didGenerate: false,
    pipelineBlocked: !allBound,
    authRequired: false,
    realFlowValidated: false,
    packageVersion: PACKAGE_VERSION,
    sensorVersion: SENSOR_VERSION,
    note: 'Ação isolada de reconciliação. Sem upload, anexo, prompt ou geração.',
  }
}

/**
 * Anexa só refs já uploaded_bound. Sem upload, reconcile, prompt ou geração.
 * Reusa selectBoundAssetForPrompt via page.attachBoundReferences.
 */
async function attachBoundReferencesOnlyAction(input?: {
  referenceIds?: string[]
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null || !ctx.state?.endpoint || !ctx.state.pairingToken) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }

  const atlasProjectId = String(ctx.link?.atlasProjectId || '')
  const expectedFlowProjectId = String(ctx.flowProjectId || ctx.link?.flowProjectId || '')
  const pairedEndpoint = ctx.state.endpoint

  let listRes: Response
  try {
    listRes = await fetch(
      `${pairedEndpoint}/api/atlas-flow/v1/references?atlasProjectId=${encodeURIComponent(atlasProjectId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${ctx.state.pairingToken}`,
        },
      },
    )
  } catch (error) {
    return {
      ok: false,
      step: 'staging',
      error: 'PAIRED_COORDINATOR_UNAVAILABLE',
      detail: error instanceof Error ? error.message : String(error),
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  const listBody = (await listRes.json().catch(() => ({}))) as Record<string, unknown>
  const allRefs = Array.isArray(listBody.references)
    ? (listBody.references as Array<Record<string, unknown>>)
    : []
  const availability = decideReferencesAvailability({
    pairedEndpoint,
    httpOk: listRes.ok,
    references: allRefs,
  })
  if (!availability.available) {
    return {
      ok: false,
      step: 'staging',
      error: availability.error || 'REFERENCES_NOT_AVAILABLE',
      references: allRefs,
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  const wantedIds = Array.isArray(input?.referenceIds)
    ? input.referenceIds.map((id) => String(id)).filter(Boolean)
    : []
  const minNeeded = wantedIds.length > 0 ? Math.max(1, wantedIds.length) : 2
  const characterReadyAll = allRefs.filter(
    (item) =>
      item.uploadState === 'character_ready' ||
      (isSingerCharacter(item) && isLegitimateMediaId(item.flowMediaId)),
  )
  const characterTargets =
    wantedIds.length > 0
      ? characterReadyAll.filter((item) => wantedIds.includes(String(item.referenceId)))
      : []
  const characterIds = new Set(characterTargets.map((item) => String(item.referenceId)))
  const boundAll = allRefs.filter(
    (item) =>
      !characterIds.has(String(item.referenceId)) &&
      item.uploadState === 'uploaded_bound' &&
      isLegitimateMediaId(item.flowMediaId),
  )
  const boundTargets = (
    wantedIds.length > 0
      ? boundAll.filter((item) => wantedIds.includes(String(item.referenceId)))
      : boundAll
  ).slice(0, Math.max(minNeeded, wantedIds.length || 2))

  if (boundTargets.length + characterTargets.length < minNeeded) {
    return {
      ok: false,
      step: 'attach_only',
      error: 'NEED_UPLOADED_BOUND',
      boundCount: boundTargets.length,
      characterReadyCount: characterTargets.length,
      minNeeded,
      references: allRefs,
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
      note: 'Precisa de refs uploaded_bound com flowMediaId (ou character_ready) na seleção da linha.',
    }
  }

  if (boundTargets.length === 0 && characterTargets.length >= minNeeded) {
    try {
      await chrome.tabs.sendMessage(ctx.tabId, {
        type: 'atlas-flow-v1.page.clearComposerAttachments',
      })
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      step: 'attach_only_character_ready',
      atlasProjectId,
      expectedFlowProjectId,
      endpointUsed: pairedEndpoint,
      targets: characterTargets.map((item) => ({
        referenceId: item.referenceId,
        displayName: item.displayName,
        flowMediaId: item.flowMediaId,
        uploadState: item.uploadState,
      })),
      attachments: characterTargets.map((item) => ({
        ok: true,
        referenceId: item.referenceId,
        flowMediaId: item.flowMediaId ?? null,
        characterReady: true,
      })),
      bindingReports: [],
      didUpload: false,
      didAttach: true,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: false,
      authRequired: false,
      realFlowValidated: false,
      packageVersion: PACKAGE_VERSION,
      sensorVersion: SENSOR_VERSION,
      note: 'Apenas refs character_ready na linha; anexação por @menção.',
    }
  }

  // Nunca confiar só em attachedState do store: o draft do Flow pode ter
  // sido limpo (refresh, novo prompt, falha anterior). Sempre confirma na página.
  const page = (await chrome.tabs.sendMessage(ctx.tabId, {
    type: 'atlas-flow-v1.page.attachBoundReferences',
    payload: {
      expectedFlowProjectId: ctx.flowProjectId,
      bounds: boundTargets.map((item) => ({
        referenceId: item.referenceId,
        displayName: item.displayName,
        name: flowReferenceFileName(item),
        flowMediaId: item.flowMediaId,
      })),
    },
  })) as {
    ok?: boolean
    attachments?: Array<Record<string, unknown>>
    error?: string
    step?: string
    panelGate?: Record<string, unknown>
    exit?: Record<string, unknown>
  }

  const attachments = Array.isArray(page.attachments) ? page.attachments : []
  const bindingReports: Array<Record<string, unknown>> = []

  for (const target of boundTargets) {
    const referenceId = String(target.referenceId)
    const attachResult =
      attachments.find((item) => String(item.referenceId) === referenceId) || null
    const attachOk = attachResult?.ok === true
    const flowMediaId = isLegitimateMediaId(target.flowMediaId) ? target.flowMediaId : null
    bindingReports.push(
      await postReferenceBinding(ctx.state.endpoint, ctx.state.pairingToken, {
        referenceId,
        flowProjectId: ctx.flowProjectId,
        flowMediaId,
        bindingState: 'bound',
        attachedState: attachOk ? 'attached' : 'not_attached',
        evidence: {
          attachOnly: true,
          attachResult,
          alreadyAttached: false,
          note: attachOk
            ? 'Anexado ao draft sem reenvio (confirmado na página).'
            : 'Clique/anexo não confirmado; bound preservado, attached=false.',
        },
      }),
    )
  }

  const attachedOkCount = attachments.filter((item) => item.ok === true).length
  const allAttached =
    attachedOkCount >= minNeeded &&
    attachments.length >= minNeeded &&
    attachments.every((item) => item.ok === true)

  return {
    ok: allAttached,
    step: 'attach_only',
    atlasProjectId,
    expectedFlowProjectId,
    endpointUsed: pairedEndpoint,
    targets: boundTargets.map((item) => ({
      referenceId: item.referenceId,
      displayName: item.displayName,
      flowMediaId: item.flowMediaId,
      uploadState: item.uploadState,
    })),
    // Sempre confirma na página; não há atalho por attachedState do store.
    attachments,
    bindingReports,
    pageStep: page.step ?? null,
    pageError: page.error ?? null,
    panelGate: page.panelGate ?? null,
    exit: page.exit ?? null,
    didUpload: false,
    didAttach: allAttached,
    didWritePrompt: false,
    didGenerate: false,
    pipelineBlocked: !allAttached,
    authRequired: false,
    realFlowValidated: false,
    packageVersion: PACKAGE_VERSION,
    sensorVersion: SENSOR_VERSION,
    note: 'Ação isolada de anexação. Sem upload, prompt ou geração. Exige panelRoot.',
  }
}

/**
 * Escreve prompt e clica Start generation. Exige 2 refs attached no store + na página.
 * Sem upload/anexo. realFlowValidated permanece false.
 */
async function promptAndGenerateOnlyAction(input?: {
  promptText?: string
  /** Quando true, aceita refs bound do payload do job sem exigir attached no store. */
  skipAttachedStoreCheck?: boolean
  minAttached?: number
  imageSettings?: Record<string, unknown> | null
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  if (GENERATION_SEND_PAUSED) {
    return {
      ok: false,
      step: 'generation_send_paused',
      error: 'GENERATION_SEND_PAUSED',
      intent: 'direct_image_generation',
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
      note: 'Envio de geração pausado até comprovar compositor direto de imagem (sem Agente/Omni).',
    }
  }

  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null || !ctx.state?.endpoint || !ctx.state.pairingToken) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }

  const atlasProjectId = String(ctx.link?.atlasProjectId || '')
  const expectedFlowProjectId = String(ctx.flowProjectId || ctx.link?.flowProjectId || '')
  const pairedEndpoint = ctx.state.endpoint

  let listRes: Response
  try {
    listRes = await fetch(
      `${pairedEndpoint}/api/atlas-flow/v1/references?atlasProjectId=${encodeURIComponent(atlasProjectId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${ctx.state.pairingToken}`,
        },
      },
    )
  } catch (error) {
    return {
      ok: false,
      step: 'staging',
      error: 'PAIRED_COORDINATOR_UNAVAILABLE',
      detail: error instanceof Error ? error.message : String(error),
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  const listBody = (await listRes.json().catch(() => ({}))) as Record<string, unknown>
  const allRefs = Array.isArray(listBody.references)
    ? (listBody.references as Array<Record<string, unknown>>)
    : []
  const availability = decideReferencesAvailability({
    pairedEndpoint,
    httpOk: listRes.ok,
    references: allRefs,
  })
  if (!availability.available) {
    return {
      ok: false,
      step: 'staging',
      error: availability.error || 'REFERENCES_NOT_AVAILABLE',
      references: allRefs,
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  const minAttached = typeof input?.minAttached === 'number' ? input.minAttached : 2
  const attached = allRefs.filter(
    (item) =>
      item.uploadState === 'character_ready' ||
      (item.uploadState === 'uploaded_bound' &&
        isLegitimateMediaId(item.flowMediaId) &&
        (input?.skipAttachedStoreCheck === true || item.attachedState === 'attached')),
  )
  if (attached.length < minAttached) {
    return {
      ok: false,
      step: 'require_attached',
      error: 'NEED_ATTACHED_REFS',
      attachedCount: attached.length,
      minAttached,
      references: allRefs,
      didUpload: false,
      didAttach: false,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
      note: 'Precisa de refs uploaded_bound+attached na tentativa atual.',
    }
  }

  const promptText = input?.promptText?.trim() || ''
  if (!promptText) {
    return {
      ok: false,
      step: 'prompt_text',
      error: 'PROMPT_TEXT_REQUIRED',
      note: 'O texto da tentativa é obrigatório; sem prompt de teste.',
      didUpload: false,
      didAttach: true,
      didWritePrompt: false,
      didGenerate: false,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  const page = (await chrome.tabs.sendMessage(ctx.tabId, {
    type: 'atlas-flow-v1.page.promptAndGenerate',
    payload: {
      expectedFlowProjectId: ctx.flowProjectId,
      promptText,
      imageSettings: normalizeFlowImageSettings(input?.imageSettings),
    },
  })) as Record<string, unknown>

  let posted: Record<string, unknown> | null = null
  try {
    const res = await fetch(`${pairedEndpoint}/api/atlas-flow/v1/session/observations`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.state.pairingToken}`,
      },
      body: JSON.stringify({
        kind: 'project_page',
        subtype: 'prompt_and_generate_only',
        linkedFlowProjectId: ctx.flowProjectId,
        linkedFlowProjectUrl: ctx.flowProjectUrl,
        inspectedAt: new Date().toISOString(),
        page,
        attachedRefs: attached.slice(0, 2).map((item) => ({
          referenceId: item.referenceId,
          displayName: item.displayName,
          flowMediaId: item.flowMediaId,
          attachedState: item.attachedState,
        })),
        realFlowValidated: false,
      }),
    })
    posted = (await res.json().catch(() => ({ httpStatus: res.status }))) as Record<
      string,
      unknown
    >
  } catch (error) {
    posted = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const didGenerate = page.didGenerate === true || page.ok === true
  return {
    ok: page.ok === true,
    step: typeof page.step === 'string' ? page.step : 'prompt_generate',
    atlasProjectId,
    expectedFlowProjectId,
    endpointUsed: pairedEndpoint,
    attachedRefs: attached.slice(0, 2).map((item) => ({
      referenceId: item.referenceId,
      displayName: item.displayName,
      flowMediaId: item.flowMediaId,
      attachedState: item.attachedState,
    })),
    promptText,
    page,
    posted,
    didUpload: false,
    didAttach: false,
    didWritePrompt: page.didWritePrompt === true,
    didGenerate,
    pipelineBlocked: page.ok !== true,
    authRequired: false,
    realFlowValidated: false,
    packageVersion: PACKAGE_VERSION,
    sensorVersion: SENSOR_VERSION,
    note: 'Ação isolada prompt+gerar. Clique em Start generation ≠ marco validado (falta imagem na linha).',
  }
}

/**
 * Injeta (de forma idempotente e somente-leitura) observador passivo no mundo MAIN
 * para observar respostas reais das interações `fetch`/`XMLHttpRequest` da própria página do Flow
 * (sem inventar endpoints e sem alterar payloads/respostas).
 */
async function ensureMainWorldRpcObserver(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const w = window as unknown as Record<string, unknown>
        // 0.3.75: XHR + corpo em Request/FormData + respostas batchexecute/JSON aninhado.
        // As versões anteriores só viam fetch com JSON puro e nunca observaram saídas no Flow.
        const OBS_VERSION = '0.3.75'
        if (w.__ATLAS_FLOW_V1_RPC_OBSERVER_INSTALLED__ === OBS_VERSION) return
        w.__ATLAS_FLOW_V1_RPC_OBSERVER_INSTALLED__ = OBS_VERSION

        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const MEDIA_HOST_RE = /flow-content\.google|googleusercontent\.com|ggpht\.com|flow\.google\.com/i

        function absorbMediaUrl(acc: { mediaIds: Set<string>; mediaUrls: Set<string> }, raw: string): void {
          const trimmed = String(raw || '').trim()
          if (!trimmed) return
          if (/^https:\/\//i.test(trimmed) && MEDIA_HOST_RE.test(trimmed)) {
            acc.mediaUrls.add(trimmed)
          }
          const fromPath = trimmed.match(
            /\/(?:image|media|asset|file|generated)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
          )
          if (fromPath && UUID_RE.test(fromPath[1])) {
            acc.mediaIds.add(fromPath[1])
          }
        }

        function extractFromJsonValue(
          node: unknown,
          acc: { workflowIds: Set<string>; mediaIds: Set<string>; mediaUrls: Set<string> },
          depth = 0,
        ): void {
          if (depth > 10 || node == null) return
          if (typeof node === 'string') {
            const t = node.trim()
            // batchexecute embute JSON como string dentro do array externo.
            if ((t.startsWith('[') || t.startsWith('{')) && t.length < 1_000_000) {
              try {
                extractFromJsonValue(JSON.parse(t), acc, depth + 1)
                return
              } catch {
                /* não era JSON */
              }
            }
            absorbMediaUrl(acc, t)
            return
          }
          if (Array.isArray(node)) {
            for (const item of node.slice(0, 60)) extractFromJsonValue(item, acc, depth + 1)
            return
          }
          if (typeof node === 'object') {
            const obj = node as Record<string, unknown>
            for (const [k, v] of Object.entries(obj)) {
              const kl = k.toLowerCase()
              if (typeof v === 'string') {
                const trimmed = v.trim()
                if (
                  UUID_RE.test(trimmed) &&
                  (kl.includes('media') ||
                    kl.includes('asset') ||
                    kl.includes('image') ||
                    kl.includes('output') ||
                    kl.includes('result') ||
                    kl === 'name' ||
                    kl === 'id')
                ) {
                  // Antes de workflow: "mediaGenerationId" contém "generationid" e virava workflow.
                  acc.mediaIds.add(trimmed)
                } else if (
                  (kl.includes('workflow') || kl.includes('batch') || kl.includes('generationid') || kl === 'operationname') &&
                  trimmed.length >= 8 &&
                  trimmed.length <= 160
                ) {
                  acc.workflowIds.add(trimmed)
                } else {
                  extractFromJsonValue(trimmed, acc, depth + 1)
                }
              } else if (v && typeof v === 'object') {
                extractFromJsonValue(v, acc, depth + 1)
              }
            }
          }
        }

        function findPromptInJson(parsed: unknown): string | null {
          const stack: unknown[] = [parsed]
          let guard = 0
          while (stack.length > 0 && guard < 5000) {
            guard += 1
            const cur = stack.pop()
            if (typeof cur === 'string') {
              const t = cur.trim()
              if ((t.startsWith('[') || t.startsWith('{')) && t.length < 400_000) {
                try {
                  stack.push(JSON.parse(t))
                } catch {
                  /* ignore */
                }
              }
              continue
            }
            if (!cur || typeof cur !== 'object') continue
            if (Array.isArray(cur)) {
              for (const el of cur.slice(0, 40)) stack.push(el)
            } else {
              for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
                const kl = k.toLowerCase()
                if (typeof v === 'string' && (kl.includes('prompt') || kl === 'text' || kl === 'rawtext') && v.trim().length >= 4) {
                  return v.trim()
                }
                if (v && typeof v === 'object') stack.push(v)
              }
            }
          }
          return null
        }

        function findPromptInBody(rawBody: string): string | null {
          if (!rawBody || rawBody.length > 400_000) return null
          try {
            return findPromptInJson(JSON.parse(rawBody))
          } catch {
            /* pode ser form-encoded (batchexecute: f.req=...) */
          }
          try {
            const params = new URLSearchParams(rawBody)
            const freq = params.get('f.req')
            if (freq) return findPromptInJson(JSON.parse(freq))
          } catch {
            /* ignore */
          }
          return null
        }

        function parseResponsePayloads(respText: string): unknown[] {
          const cleaned = respText.replace(/^\)\]\}'\s*/, '').trim()
          const out: unknown[] = []
          if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
            try {
              out.push(JSON.parse(cleaned))
              return out
            } catch {
              /* pode ser batchexecute com tamanhos de chunk entre linhas */
            }
          }
          for (const line of cleaned.split('\n')) {
            const t = line.trim()
            if (!t.startsWith('[') && !t.startsWith('{')) continue
            try {
              out.push(JSON.parse(t))
            } catch {
              /* ignore */
            }
          }
          return out
        }

        function emitRpcText(url: string, reqBody: string, respText: string, startedAtMs: number): void {
          if (!respText || respText.length > 4_000_000) return
          if (!/flow\.google\.com|googleapis\.com|labs\.google/i.test(url)) return
          const payloads = parseResponsePayloads(respText)
          if (payloads.length === 0) return
          try {
            const acc = {
              workflowIds: new Set<string>(),
              mediaIds: new Set<string>(),
              mediaUrls: new Set<string>(),
            }
            for (const data of payloads) extractFromJsonValue(data, acc, 0)
            const requestPromptText = findPromptInBody(reqBody)
            if (!requestPromptText && acc.workflowIds.size === 0 && acc.mediaIds.size === 0 && acc.mediaUrls.size === 0) {
              return
            }
            let urlPath = ''
            try {
              const u = new URL(url, location.href)
              urlPath = `${u.host}${u.pathname}`
            } catch {
              urlPath = ''
            }
            window.dispatchEvent(
              new CustomEvent('__atlas_flow_v1_rpc_observed__', {
                detail: {
                  requestStartedAtMs: startedAtMs,
                  requestPromptText,
                  urlPath,
                  workflowId: Array.from(acc.workflowIds)[0] || null,
                  mediaIds: Array.from(acc.mediaIds).slice(0, 24),
                  mediaUrls: Array.from(acc.mediaUrls).slice(0, 24),
                },
              }),
            )
          } catch {
            /* ignore */
          }
        }

        async function bodyToText(body: unknown): Promise<string> {
          try {
            if (typeof body === 'string') return body
            if (body instanceof URLSearchParams) return body.toString()
            if (body instanceof FormData) {
              const params = new URLSearchParams()
              body.forEach((value, key) => {
                if (typeof value === 'string') params.append(key, value)
              })
              return params.toString()
            }
            if (body instanceof Blob) return await body.text()
            if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
            if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body as ArrayBufferView)
          } catch {
            /* ignore */
          }
          return ''
        }

        const origFetch = window.fetch.bind(window)
        window.fetch = async function (...args: Parameters<typeof fetch>) {
          const startedAtMs = Date.now()
          let url = ''
          let reqBodyPromise: Promise<string> = Promise.resolve('')
          try {
            const first = args[0]
            url = typeof first === 'string' ? first : first instanceof URL ? first.href : first?.url || ''
            const init = args[1]
            if (init && init.body != null) {
              reqBodyPromise = bodyToText(init.body)
            } else if (first instanceof Request) {
              reqBodyPromise = first.clone().text().catch(() => '')
            }
          } catch {
            /* ignore */
          }
          const res = await origFetch(...args)
          try {
            const ct = String(res.headers.get('content-type') || '').toLowerCase()
            const binary = /^(image|video|audio)\//.test(ct) || ct.includes('octet-stream')
            if (!binary && /flow\.google\.com|googleapis\.com|labs\.google/i.test(url)) {
              void Promise.all([reqBodyPromise, res.clone().text()])
                .then(([reqBody, txt]) => emitRpcText(url, reqBody, txt, startedAtMs))
                .catch(() => {})
            }
          } catch {
            /* ignore */
          }
          return res
        }

        // Parte do Flow usa XMLHttpRequest (o hook antigo só via fetch).
        const XhrProto = XMLHttpRequest.prototype
        const origOpen = XhrProto.open
        const origSend = XhrProto.send
        XhrProto.open = function (this: XMLHttpRequest, ...openArgs: unknown[]) {
          try {
            ;(this as unknown as Record<string, unknown>).__atlasUrl = String(openArgs[1] || '')
          } catch {
            /* ignore */
          }
          return (origOpen as (...a: unknown[]) => void).apply(this, openArgs)
        } as typeof XhrProto.open
        XhrProto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
          const startedAtMs = Date.now()
          const url = String((this as unknown as Record<string, unknown>).__atlasUrl || '')
          try {
            if (/flow\.google\.com|googleapis\.com|labs\.google/i.test(url)) {
              const reqBodyPromise = bodyToText(body)
              this.addEventListener('load', () => {
                try {
                  const ct = String(this.getResponseHeader('content-type') || '').toLowerCase()
                  if (/^(image|video|audio)\//.test(ct) || ct.includes('octet-stream')) return
                  const rt = this.responseType
                  if (rt && rt !== 'text' && rt !== 'json') return
                  const txt = rt === 'json' ? JSON.stringify(this.response) : String(this.responseText || '')
                  void reqBodyPromise.then((reqBody) => emitRpcText(url, reqBody, txt, startedAtMs))
                } catch {
                  /* ignore */
                }
              })
            }
          } catch {
            /* ignore */
          }
          return origSend.call(this, body as XMLHttpRequestBodyInit | null)
        }
      },
    })
  } catch {
    /* ignore: se scripting MAIN falhar, Canal B (linhagem de slot DOM) continua ativo */
  }
}

async function preparePreSubmitBaselineAction(input?: {
  attemptId?: string
  commandId?: string
  promptText?: string
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null) {
    return { ok: false, srcs: [], mediaIds: [], preExistingSlotKeys: [], evidenceCount: 0, sceneCount: 0 }
  }
  await ensureMainWorldRpcObserver(ctx.tabId)
  try {
    const page = (await chrome.tabs.sendMessage(ctx.tabId, {
      type: 'atlas-flow-v1.page.preparePreSubmitBaseline',
      payload: {
        expectedFlowProjectId: ctx.flowProjectId,
        attemptId: input?.attemptId || null,
        commandId: input?.commandId || null,
        promptText: input?.promptText || '',
      },
    })) as Record<string, unknown>
    return { ok: page?.ok !== false, ...page, tabId: ctx.tabId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      srcs: [],
      mediaIds: [],
      preExistingSlotKeys: [],
      evidenceCount: 0,
      sceneCount: 0,
    }
  }
}

async function listRecoveryCandidatesAction(input?: {
  knownStems?: string[]
  excludeSrcs?: string[]
  excludeMediaIds?: string[]
  excludeShas?: string[]
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }
  try {
    const page = (await chrome.tabs.sendMessage(ctx.tabId, {
      type: 'atlas-flow-v1.page.listRecoveryCandidates',
      payload: {
        expectedFlowProjectId: ctx.flowProjectId,
        knownStems: input?.knownStems || [],
        excludeSrcs: input?.excludeSrcs || [],
        excludeMediaIds: input?.excludeMediaIds || [],
      },
    })) as Record<string, unknown>
    const rawCandidates = Array.isArray(page?.candidates)
      ? (page.candidates as Array<Record<string, unknown>>)
      : []
    const excludeShaSet = new Set(
      (input?.excludeShas || []).map((s) => String(s || '').toLowerCase()).filter(Boolean),
    )
    const enriched: Array<Record<string, unknown>> = []
    for (const cand of rawCandidates.slice(0, 12)) {
      const src = typeof cand.src === 'string' ? cand.src : ''
      let previewDataUrl: string | null = null
      let sha256: string | null = null
      let alreadyBoundElsewhere = false
      if (src && enriched.length < 9) {
        const fetched = await fetchMediaBytesViaHostOrDebugger(src, ctx.tabId)
        if (fetched.ok === true && typeof fetched.base64 === 'string') {
          const bin = atob(fetched.base64)
          const buf = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i)
          sha256 = await sha256HexOfBytes(buf)
          alreadyBoundElsewhere = excludeShaSet.has(sha256)
          const mime =
            typeof fetched.mimeType === 'string' && fetched.mimeType.startsWith('image/')
              ? fetched.mimeType
              : 'image/jpeg'
          previewDataUrl = `data:${mime};base64,${fetched.base64}`
        }
      }
      enriched.push({
        candidateKey: cand.candidateKey,
        flowMediaId: cand.flowMediaId ?? null,
        srcKey: cand.srcKey ?? null,
        alt: cand.alt ?? null,
        width: cand.width ?? null,
        height: cand.height ?? null,
        inBaseline: cand.inBaseline === true,
        sha256,
        alreadyBoundElsewhere,
        previewDataUrl,
      })
    }
    return {
      ok: page?.ok !== false,
      candidates: enriched,
      observedAt: page?.observedAt ?? new Date().toISOString(),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      candidates: [],
    }
  }
}

/**
 * Lê bytes das imgs geradas na linha e faz staging no Coordinator (hash em disco).
 * realFlowValidated só sobe quando o staging confirma sha/tamanho.
 */
async function snapshotGenerationBaselineAction(): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext()
  if (!ctx.ok || ctx.tabId == null) {
    return { ok: false, srcs: [], evidenceCount: 0, sceneCount: 0 }
  }
  try {
    const page = (await chrome.tabs.sendMessage(ctx.tabId, {
      type: 'atlas-flow-v1.page.snapshotGenerationBaseline',
      payload: {},
    })) as Record<string, unknown>
    return { ok: page?.ok !== false, ...page, tabId: ctx.tabId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      srcs: [],
      evidenceCount: 0,
      sceneCount: 0,
    }
  }
}

async function sampleGenerationProgressAction(input?: {
  attemptId?: string
  excludeSrcs?: string[]
  excludeMediaIds?: string[]
  baselineEvidenceCount?: number
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }
  try {
    const page = (await chrome.tabs.sendMessage(ctx.tabId, {
      type: 'atlas-flow-v1.page.sampleGenerationProgress',
      payload: {
        attemptId: input?.attemptId || null,
        excludeSrcs: Array.isArray(input?.excludeSrcs) ? input.excludeSrcs : [],
        excludeMediaIds: Array.isArray(input?.excludeMediaIds) ? input.excludeMediaIds : [],
        baselineEvidenceCount: input?.baselineEvidenceCount ?? 0,
      },
    })) as Record<string, unknown>
    return { ok: page?.ok !== false, ...page, tabId: ctx.tabId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      attemptPercent: null,
      busy: false,
    }
  }
}

async function stopGenerationOnPageAction(input?: {
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null) {
    return { ok: false, error: 'NO_FLOW_TAB' }
  }
  try {
    const page = (await chrome.tabs.sendMessage(ctx.tabId, {
      type: 'atlas-flow-v1.page.stopGeneration',
    })) as Record<string, unknown>
    return { ok: page?.ok === true, ...page, tabId: ctx.tabId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function clearComposerAttachmentsAction(input?: {
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null) {
    return { ok: false, error: 'NO_FLOW_TAB', removed: 0 }
  }
  try {
    const page = (await chrome.tabs.sendMessage(ctx.tabId, {
      type: 'atlas-flow-v1.page.clearComposerAttachments',
    })) as Record<string, unknown>
    return { ok: page?.ok === true, ...page, tabId: ctx.tabId }
  } catch (error) {
    return {
      ok: false,
      removed: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function captureGenerationBytesAction(input?: {
  attemptId?: string
  knownStems?: string[]
  maxCandidates?: number
  promptFingerprint?: string
  settleTimeoutMs?: number
  skipSettle?: boolean
  excludeSrcs?: string[]
  excludeShas?: string[]
  excludeMediaIds?: string[]
  allowSrcs?: string[]
  allowMediaIds?: string[]
  explicitSelectionKeys?: string[]
  originProofByKey?: Record<string, string>
  allowKnownSha?: boolean
  requirePositiveOrigin?: boolean
  preferDebuggerFallback?: boolean
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null || !ctx.state?.endpoint || !ctx.state.pairingToken) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }

  const knownStems =
    Array.isArray(input?.knownStems) && input.knownStems.length > 0 ? input.knownStems : []
  const excludeShas = Array.isArray(input?.excludeShas) ? input.excludeShas : []
  const excludeSrcs = Array.isArray(input?.excludeSrcs) ? input.excludeSrcs : []
  const excludeMediaIds = Array.isArray(input?.excludeMediaIds) ? input.excludeMediaIds : []
  const allowSrcs = Array.isArray(input?.allowSrcs) ? input.allowSrcs : []
  const allowMediaIds = Array.isArray(input?.allowMediaIds) ? input.allowMediaIds : []
  const explicitSelectionKeys = Array.isArray(input?.explicitSelectionKeys)
    ? input.explicitSelectionKeys
    : []
  const isExplicitSelection = explicitSelectionKeys.length > 0
  const requirePositiveOrigin = !isExplicitSelection && input?.requirePositiveOrigin === true

  const page = (await chrome.tabs.sendMessage(ctx.tabId, {
    type: 'atlas-flow-v1.page.captureGenerationBytes',
    payload: {
      expectedFlowProjectId: ctx.flowProjectId,
      attemptId: input?.attemptId || null,
      knownStems,
      maxCandidates: input?.maxCandidates ?? 4,
      promptFingerprint: input?.promptFingerprint || undefined,
      settleTimeoutMs: input?.settleTimeoutMs ?? 120_000,
      skipSettle: input?.skipSettle === true,
      excludeSrcs,
      excludeShas,
      excludeMediaIds,
      allowSrcs,
      allowMediaIds,
      explicitSelectionKeys,
      originProofByKey: input?.originProofByKey || {},
      requirePositiveOrigin,
    },
  })) as Record<string, unknown>

  let filesWithBytes = Array.isArray((page as { _filesWithBytes?: unknown })._filesWithBytes)
    ? ((page as { _filesWithBytes: Array<Record<string, unknown>> })._filesWithBytes)
    : []

  // Fallback: CORS de flow-content.google — SW lista imgs elegíveis e baixa via debugger.
  let debuggerCapture: Record<string, unknown> | null = null
  if (
    (input?.preferDebuggerFallback === true ||
      filesWithBytes.length < (input?.maxCandidates ?? 3)) &&
    page.error !== 'GENERATION_STILL_BUSY'
  ) {
    debuggerCapture = await captureCandidateBytesViaDebugger(ctx.tabId, {
      maxCandidates: input?.maxCandidates ?? 3,
      excludeShas: isExplicitSelection && input?.allowKnownSha ? [] : excludeShas,
      excludeSrcs,
      excludeMediaIds,
      allowSrcs,
      allowMediaIds,
      explicitSelectionKeys,
      originProofByKey: input?.originProofByKey || {},
      requirePositiveOrigin,
      promptFingerprint: input?.promptFingerprint || '',
      knownStems,
    })
    if (Array.isArray(debuggerCapture.files) && debuggerCapture.files.length) {
      const have = new Set(filesWithBytes.map((f) => String(f.sha256 || '').toLowerCase()))
      for (const file of debuggerCapture.files as Array<Record<string, unknown>>) {
        const sha = String(file.sha256 || '').toLowerCase()
        if (!sha || have.has(sha)) continue
        have.add(sha)
        filesWithBytes.push(file)
      }
    }
  }

  const staged: Array<Record<string, unknown>> = []
  const rejected: Array<Record<string, unknown>> = []
  let stageError: Record<string, unknown> | null = null

  for (const file of filesWithBytes) {
    const base64 = typeof file.base64 === 'string' ? file.base64 : ''
    if (!base64) continue
    try {
      const res = await fetch(`${ctx.state.endpoint}/api/atlas-flow/v1/results/stage`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.state.pairingToken}`,
        },
        body: JSON.stringify({
          atlasProjectId: ctx.link?.atlasProjectId,
          flowProjectId: ctx.flowProjectId,
          attemptId: input?.attemptId || undefined,
          displayName: file.displayName || 'flow-result.bin',
          mimeType: file.mimeType || 'application/octet-stream',
          sha256: file.sha256,
          byteSize: file.byteSize,
          width: file.width,
          height: file.height,
          method: file.method,
          srcHost: file.srcHost,
          srcKey: file.srcKey || undefined,
          flowMediaId: file.flowMediaId || undefined,
          originProof:
            file.originProof ||
            (isExplicitSelection ? 'explicit_user_selection' : undefined),
          automaticCorrelation:
            typeof file.automaticCorrelation === 'boolean'
              ? file.automaticCorrelation
              : !isExplicitSelection,
          allowKnownSha: isExplicitSelection && input?.allowKnownSha === true,
          outputIndex: staged.length,
          base64,
        }),
      })
      const body = (await res.json().catch(() => ({ httpStatus: res.status }))) as Record<
        string,
        unknown
      >
      if (!res.ok) {
        stageError = { httpStatus: res.status, body }
        break
      }
      // SHA conhecido de outra tentativa: arquivo pode ter sido gravado, mas não conta como bound.
      if (body.ok !== true || body.bound === false) {
        rejected.push({
          sha256: file.sha256,
          bindError: body.bindError || body.error || 'RESULT_BIND_REJECTED',
          existingAttemptId: body.existingAttemptId ?? null,
        })
        continue
      }
      staged.push(body)
    } catch (error) {
      stageError = { error: error instanceof Error ? error.message : String(error) }
      break
    }
  }

  const bytesCaptured = staged.length > 0
  const marcoBytesOk = bytesCaptured && stageError == null

  let posted: Record<string, unknown> | null = null
  try {
    const res = await fetch(`${ctx.state.endpoint}/api/atlas-flow/v1/session/observations`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.state.pairingToken}`,
      },
      body: JSON.stringify({
        kind: 'project_page',
        subtype: 'capture_generation_bytes',
        linkedFlowProjectId: ctx.flowProjectId,
        linkedFlowProjectUrl: ctx.flowProjectUrl,
        attemptId: input?.attemptId || null,
        inspectedAt: new Date().toISOString(),
        page: {
          ok: page.ok === true,
          step: page.step,
          files: page.files,
          attempts: page.attempts,
          candidateCount: page.candidateCount,
          bytesCaptured,
          observation: page.observation,
        },
        staged: staged.map((s) => ({
          ok: s.ok,
          bound: s.bound,
          result: s.result,
          filePath: s.filePath,
          realFlowValidated: s.realFlowValidated,
        })),
        rejected,
        excludeShaCount: excludeShas.length,
        allowSrcCount: allowSrcs.length,
        allowMediaIdCount: allowMediaIds.length,
        requirePositiveOrigin,
        realFlowValidated: marcoBytesOk,
      }),
    })
    posted = (await res.json().catch(() => ({ httpStatus: res.status }))) as Record<
      string,
      unknown
    >
  } catch (error) {
    posted = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  return {
    ok: marcoBytesOk,
    step: marcoBytesOk ? 'generation_bytes_staged' : 'capture_generation_bytes',
    endpointUsed: ctx.state.endpoint,
    atlasProjectId: ctx.link?.atlasProjectId,
    flowProjectId: ctx.flowProjectId,
    page: {
      ok: page.ok,
      step: page.step,
      files: page.files,
      attempts: page.attempts,
      candidateCount: page.candidateCount,
      bytesCaptured: page.bytesCaptured,
      error: page.error,
      note: page.note,
    },
    staged,
    rejected,
    stageError,
    posted,
    bytesCaptured,
    marcoBytesOk,
    correlationUncertain: page.correlationUncertain === true,
    promptEvidence: page.promptEvidence ?? null,
    settle: page.settle ?? null,
    pipelineBlocked: !marcoBytesOk,
    authRequired: false,
    realFlowValidated: marcoBytesOk,
    packageVersion: PACKAGE_VERSION,
    sensorVersion: SENSOR_VERSION,
    note: marcoBytesOk
      ? 'Bytes do resultado gravados no Coordinator (sha/tamanho). Marco de bytes OK.'
      : 'Falha ao capturar/estagiar bytes. Ver attempts/stageError.',
  }
}

/**
 * Aguarda evidência de mídia nova após gerar. Não valida marco por bytes ainda.
 */
async function observeGenerationResultAction(input?: {
  timeoutMs?: number
  knownStems?: string[]
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null || !ctx.state?.endpoint || !ctx.state.pairingToken) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }

  const knownStems =
    Array.isArray(input?.knownStems) && input.knownStems.length > 0 ? input.knownStems : []

  const page = (await chrome.tabs.sendMessage(ctx.tabId, {
    type: 'atlas-flow-v1.page.observeGenerationResult',
    payload: {
      expectedFlowProjectId: ctx.flowProjectId,
      timeoutMs: input?.timeoutMs ?? 90_000,
      knownStems,
    },
  })) as Record<string, unknown>

  let posted: Record<string, unknown> | null = null
  try {
    const res = await fetch(`${ctx.state.endpoint}/api/atlas-flow/v1/session/observations`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.state.pairingToken}`,
      },
      body: JSON.stringify({
        kind: 'project_page',
        subtype: 'observe_generation_result',
        linkedFlowProjectId: ctx.flowProjectId,
        linkedFlowProjectUrl: ctx.flowProjectUrl,
        inspectedAt: new Date().toISOString(),
        page,
        realFlowValidated: false,
      }),
    })
    posted = (await res.json().catch(() => ({ httpStatus: res.status }))) as Record<
      string,
      unknown
    >
  } catch (error) {
    posted = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  return {
    ok: page.ok === true,
    step: typeof page.step === 'string' ? page.step : 'observe_generation',
    endpointUsed: ctx.state.endpoint,
    page,
    posted,
    didUpload: false,
    didAttach: false,
    didWritePrompt: false,
    didGenerate: false,
    pipelineBlocked: page.ok !== true,
    authRequired: false,
    realFlowValidated: false,
    packageVersion: PACKAGE_VERSION,
    sensorVersion: SENSOR_VERSION,
    note: 'Observação pós-gerar. Mídia nova ≠ marco validado por bytes.',
  }
}

async function attachTwoReferencesOnLinkedProject(input?: {
  promptText?: string
  runGenerate?: boolean
  /** Quando definido, só considera estes referenceIds (staged ou bound). */
  referenceIds?: string[]
  atlasProjectId?: string
  flowProjectId?: string
  flowProjectUrl?: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext(input)
  if (!ctx.ok || ctx.tabId == null || !ctx.state?.endpoint || !ctx.state.pairingToken) {
    return contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0])
  }

  const atlasProjectId = String(ctx.link?.atlasProjectId || '')
  const expectedFlowProjectId = String(ctx.flowProjectId || ctx.link?.flowProjectId || '')
  const pairedEndpoint = ctx.state.endpoint

  // Autoridade = endpoint pareado. Lista vazia NÃO migra para outra porta.
  let listRes: Response
  try {
    listRes = await fetch(
      `${pairedEndpoint}/api/atlas-flow/v1/references?atlasProjectId=${encodeURIComponent(atlasProjectId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${ctx.state.pairingToken}`,
        },
      },
    )
  } catch (error) {
    // Indisponível: só então tenta redescobrir com hello (não por lista vazia).
    if (ctx.state.pairingToken && ctx.state.installationId) {
      const rediscovery = await discoverPairedEndpoint(
        ctx.state.pairingToken,
        ctx.state.installationId,
        ctx.state.endpoint,
      )
      if (rediscovery.endpoint) {
        await chrome.storage.local.set({ endpoint: rediscovery.endpoint })
        ctx.state.endpoint = rediscovery.endpoint
        return {
          ok: false,
          step: 'paired_endpoint_rediscovered',
          error: 'PAIRED_COORDINATOR_MOVED',
          previousEndpoint: pairedEndpoint,
          newEndpoint: rediscovery.endpoint,
          probes: rediscovery.probes,
          pipelineBlocked: true,
          realFlowValidated: false,
          note: 'Instância reconfirmada via hello. Repita a operação no endpoint pareado novo; não foi feito upload.',
        }
      }
    }
    return {
      ok: false,
      step: 'staging',
      error: 'PAIRED_COORDINATOR_UNAVAILABLE',
      atlasProjectId,
      expectedFlowProjectId,
      endpointUsed: pairedEndpoint,
      detail: error instanceof Error ? error.message : String(error),
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }

  const listBody = (await listRes.json().catch(() => ({}))) as Record<string, unknown>
  const allRefs = Array.isArray(listBody.references)
    ? (listBody.references as Array<Record<string, unknown>>)
    : []
  const availability = decideReferencesAvailability({
    pairedEndpoint,
    httpOk: listRes.ok,
    references: allRefs,
  })

  if (!availability.available) {
    return {
      ok: false,
      step: 'staging',
      error: availability.error || 'REFERENCES_NOT_AVAILABLE',
      atlasProjectId,
      expectedFlowProjectId,
      endpointUsed: pairedEndpoint,
      linkedFlowProjectId: listBody.linkedFlowProjectId ?? null,
      memoryCount: listBody.memoryCount ?? null,
      storePath: listBody.storePath ?? null,
      staged: 0,
      boundPendingAttach: 0,
      references: allRefs,
      realFlowValidated: false,
      pipelineBlocked: true,
      note: 'Endpoint pareado é a autoridade. Lista vazia não troca de Coordinator.',
    }
  }

  // Reconciliar nomes já visíveis: uncertain + bound com ID ilegítimo (_gd). Sem reenvio.
  const needsReconcile = allRefs.filter((item) => {
    if (isSingerCharacter(item)) return false
    const uncertain =
      item.uploadState === 'upload_uncertain' ||
      item.bindingState === 'upload_uncertain_needs_reconcile'
    const invalidBound =
      item.uploadState === 'uploaded_bound' && !isLegitimateMediaId(item.flowMediaId)
    return uncertain || invalidBound
  })

  const reconcileReports: Array<Record<string, unknown>> = []
  if (needsReconcile.length > 0) {
    const reconcilePage = (await chrome.tabs.sendMessage(ctx.tabId, {
      type: 'atlas-flow-v1.page.reconcileUploadIdentities',
      payload: {
        expectedFlowProjectId: ctx.flowProjectId,
        references: needsReconcile.map((item) => ({
          referenceId: item.referenceId,
          displayName: item.displayName,
          name: flowReferenceFileName(item),
          flowMediaId: item.flowMediaId ?? null,
          uploadState: item.uploadState,
          bindingState: item.bindingState,
        })),
      },
    })) as {
      ok?: boolean
      results?: Array<Record<string, unknown>>
      error?: string
    }

    for (const result of reconcilePage.results || []) {
      const referenceId = String(result.referenceId || '')
      const flowMediaId = isLegitimateMediaId(result.flowMediaId) ? result.flowMediaId : null
      const boundOk = result.ok === true && Boolean(flowMediaId)
      const report = (await postReferenceBinding(ctx.state.endpoint, ctx.state.pairingToken, {
        referenceId,
        flowProjectId: ctx.flowProjectId,
        flowMediaId,
        bindingState: boundOk ? 'bound' : 'upload_uncertain_needs_reconcile',
        attachedState: 'not_attached',
        evidence: {
          reconcile: true,
          result,
          note: boundOk
            ? 'Identidade reconciliada no DOM; uploaded_bound sem reenvio.'
            : 'Permanece uncertain; não reenviar.',
        },
      })) as Record<string, unknown>
      const reportBinding =
        report.binding && typeof report.binding === 'object'
          ? (report.binding as Record<string, unknown>)
          : {}
      const reportReference =
        report.reference && typeof report.reference === 'object'
          ? (report.reference as Record<string, unknown>)
          : {}
      // Resposta consistente com estado confirmado (não ecoar _gd persistido antigo).
      reconcileReports.push({
        ...report,
        binding: {
          ...reportBinding,
          flowMediaId: boundOk ? flowMediaId : null,
          bindingState: boundOk ? 'bound' : 'upload_uncertain_needs_reconcile',
        },
        reference: {
          ...reportReference,
          referenceId,
          flowMediaId: boundOk ? flowMediaId : null,
          uploadState: boundOk ? 'uploaded_bound' : 'upload_uncertain',
          bindingState: boundOk ? 'bound' : 'upload_uncertain_needs_reconcile',
          attachedState: 'not_attached',
        },
        confirmedFlowMediaId: boundOk ? flowMediaId : null,
      })
      const idx = allRefs.findIndex((item) => String(item.referenceId) === referenceId)
      if (idx >= 0) {
        allRefs[idx] = {
          ...allRefs[idx],
          flowMediaId,
          uploadState: boundOk ? 'uploaded_bound' : 'upload_uncertain',
          bindingState: boundOk ? 'bound' : 'upload_uncertain_needs_reconcile',
          attachedState: 'not_attached',
        }
      }
    }

    const stillUncertain = allRefs.filter(
      (item) =>
        item.uploadState === 'upload_uncertain' ||
        item.bindingState === 'upload_uncertain_needs_reconcile' ||
        (item.uploadState === 'uploaded_bound' && !isLegitimateMediaId(item.flowMediaId)),
    )
    if (stillUncertain.length > 0) {
      return {
        ok: false,
        step: 'reconcile_required',
        error: 'UPLOAD_UNCERTAIN_RECONCILE_BEFORE_RESEND',
        uncertain: stillUncertain,
        reconcileReports,
        references: allRefs,
        endpointUsed: pairedEndpoint,
        atlasProjectId,
        expectedFlowProjectId,
        realFlowValidated: false,
        pipelineBlocked: true,
        note: 'Há upload incerto após reconcile DOM. Não reenviar automaticamente. Use “Reconciliar referências”.',
      }
    }
  }

  const wantedIds = Array.isArray(input?.referenceIds)
    ? input.referenceIds.map((id) => String(id)).filter(Boolean)
    : []
  const scopedRefs =
    wantedIds.length > 0
      ? allRefs.filter((item) => wantedIds.includes(String(item.referenceId)))
      : allRefs

  const needUpload = scopedRefs
    .filter((item) => {
      const onFlow =
        isLegitimateMediaId(item.flowMediaId) &&
        (item.uploadState === 'uploaded_bound' || item.uploadState === 'character_ready')
      return !onFlow
    })
    .slice(0, Math.max(2, wantedIds.length || 2))
  const alreadyAttached = scopedRefs.filter(
    (item) =>
      item.uploadState === 'character_ready' ||
      (item.uploadState === 'uploaded_bound' &&
        isLegitimateMediaId(item.flowMediaId) &&
        item.attachedState === 'attached'),
  )
  const alreadyBound = scopedRefs.filter(
    (item) =>
      item.uploadState === 'uploaded_bound' &&
      isLegitimateMediaId(item.flowMediaId) &&
      item.attachedState !== 'attached',
  )

  const minNeeded = wantedIds.length > 0 ? Math.max(1, wantedIds.length) : 2
  if (needUpload.length + alreadyBound.length + alreadyAttached.length < minNeeded) {
    return {
      ok: false,
      step: 'staging',
      error: `Precisa de ${minNeeded} ref(s) staged_local (ou bound); staged=${needUpload.length} boundPendingAttach=${alreadyBound.length} alreadyAttached=${alreadyAttached.length}`,
      staged: needUpload.length,
      boundPendingAttach: alreadyBound.length,
      alreadyAttached: alreadyAttached.length,
      wantedIds,
      references: allRefs,
      endpointUsed: pairedEndpoint,
      atlasProjectId,
      expectedFlowProjectId,
      linkedFlowProjectId: listBody.linkedFlowProjectId ?? null,
      realFlowValidated: false,
      pipelineBlocked: true,
    }
  }

  const runGenerate = input?.runGenerate !== false
  const promptText = input?.promptText?.trim() || ''
  if (runGenerate && !promptText) {
    return {
      ok: false,
      step: 'prompt_text',
      error: 'PROMPT_TEXT_REQUIRED',
      note: 'Geração exige o texto da tentativa; sem prompt de teste.',
      realFlowValidated: false,
      pipelineBlocked: true,
    }
  }

  // Seleção já anexada e sem staged: nada a enviar/anexar nesta preparação.
  // Se runGenerate+prompt, não retorna aqui — segue para prompt/gerar (mesmo adaptador do popup).
  if (
    needUpload.length === 0 &&
    alreadyBound.length === 0 &&
    alreadyAttached.length >= minNeeded &&
    !(runGenerate && promptText)
  ) {
    return {
      ok: true,
      step: 'already_attached',
      atlasProjectId,
      expectedFlowProjectId,
      endpointUsed: pairedEndpoint,
      staged: 0,
      boundPendingAttach: 0,
      attachments: alreadyAttached.map((item) => ({
        ok: true,
        referenceId: item.referenceId,
        flowMediaId: item.flowMediaId,
        alreadyAttached: true,
      })),
      runGenerate: false,
      realFlowValidated: false,
      pipelineBlocked: false,
      note: 'Refs da seleção já anexadas; upload/anexo omitidos.',
    }
  }

  if (
    needUpload.length === 0 &&
    alreadyBound.length === 0 &&
    alreadyAttached.length >= minNeeded &&
    runGenerate &&
    promptText
  ) {
    const generateOnly = await promptAndGenerateOnlyAction({
      promptText,
      skipAttachedStoreCheck: true,
      minAttached: minNeeded,
    })
    return {
      ...generateOnly,
      step: typeof generateOnly.step === 'string' ? generateOnly.step : 'already_attached_generate',
      attachments: alreadyAttached.map((item) => ({
        ok: true,
        referenceId: item.referenceId,
        flowMediaId: item.flowMediaId,
        alreadyAttached: true,
      })),
      runGenerate: true,
      note: 'Refs já anexadas; prompt+gerar pelo mesmo adaptador isolado do popup.',
    }
  }

  const fetched = await Promise.all(
    needUpload.map(async (ref) => {
      const referenceId = String(ref.referenceId)
      const expectedSha = String(ref.sha256 || '').toLowerCase()
      const expectedSize = Number(ref.byteSize)
      const bytesRes = await fetch(
        `${ctx.state.endpoint}/api/atlas-flow/v1/references/${referenceId}/bytes`,
        {
          headers: { Authorization: `Bearer ${ctx.state.pairingToken}` },
        },
      )
      if (bytesRes.status === 401 || bytesRes.status === 403) {
        return {
          ok: false as const,
          auth: true as const,
          referenceId,
          httpStatus: bytesRes.status,
        }
      }
      if (!bytesRes.ok) {
        return {
          ok: false as const,
          auth: false as const,
          referenceId,
          error: `Falha ao ler bytes de ${referenceId}: HTTP ${bytesRes.status}`,
        }
      }
      const headerSha = String(bytesRes.headers.get('X-Atlas-Sha256') || '').toLowerCase()
      const buffer = await bytesRes.arrayBuffer()
      const actualSha = await sha256Hex(buffer)
      if (expectedSha && actualSha !== expectedSha) {
        return {
          ok: false as const,
          auth: false as const,
          referenceId,
          error: 'SHA256_MISMATCH',
          expectedSha,
          actualSha,
        }
      }
      if (headerSha && headerSha !== actualSha) {
        return {
          ok: false as const,
          auth: false as const,
          referenceId,
          error: 'SHA256_HEADER_MISMATCH',
          headerSha,
          actualSha,
        }
      }
      if (Number.isFinite(expectedSize) && expectedSize > 0 && buffer.byteLength !== expectedSize) {
        return {
          ok: false as const,
          auth: false as const,
          referenceId,
          error: 'BYTE_SIZE_MISMATCH',
          expectedSize,
          actualSize: buffer.byteLength,
        }
      }
      const mimeType = String(ref.mimeType || 'image/png')
      return {
        ok: true as const,
        file: {
          referenceId,
          sha256: actualSha,
          byteSize: buffer.byteLength,
          name: flowReferenceFileName({ ...ref, mimeType }),
          alias: typeof ref.alias === 'string' ? ref.alias : '',
          asCharacter: isSingerCharacter(ref),
          mimeType,
          base64: await arrayBufferToBase64(buffer),
        },
      }
    }),
  )

  const authFail = fetched.find((item) => item.ok === false && item.auth)
  if (authFail && authFail.ok === false) {
    await chrome.storage.local.set({ paired: false, lastHelloOk: false, lastError: 'UNAUTHORIZED' })
    return {
      ok: false,
      step: 'auth',
      error: 'UNAUTHORIZED',
      httpStatus: authFail.httpStatus,
      authRequired: true,
      pipelineBlocked: true,
      referenceId: authFail.referenceId,
      note: '401/403 ao ler bytes — não converter em refs ausentes.',
      realFlowValidated: false,
    }
  }
  const fetchFail = fetched.find((item) => item.ok === false)
  if (fetchFail && fetchFail.ok === false) {
    return {
      ok: false,
      step: 'fetch_bytes',
      error: fetchFail.error || 'FETCH_BYTES_FAILED',
      referenceId: fetchFail.referenceId,
      expectedSha: 'expectedSha' in fetchFail ? fetchFail.expectedSha : undefined,
      actualSha: 'actualSha' in fetchFail ? fetchFail.actualSha : undefined,
      headerSha: 'headerSha' in fetchFail ? fetchFail.headerSha : undefined,
      expectedSize: 'expectedSize' in fetchFail ? fetchFail.expectedSize : undefined,
      actualSize: 'actualSize' in fetchFail ? fetchFail.actualSize : undefined,
      realFlowValidated: false,
    }
  }
  const files = fetched
    .filter((item): item is { ok: true; file: Record<string, unknown> } => item.ok === true)
    .map((item) => item.file)

  const preBound = alreadyBound.map((item) => ({
    referenceId: item.referenceId,
    name: flowReferenceFileName(item),
    flowMediaId: item.flowMediaId,
    uploadState: 'uploaded_bound_evidence',
  }))

  // Upload (só staged_local) + attach dos bound confirmados. Sem reenvio de uncertain.
  const page = (await chrome.tabs.sendMessage(ctx.tabId, {
    type: 'atlas-flow-v1.page.attachFiles',
    payload: {
      files,
      preBound,
      expectedFlowProjectId: ctx.flowProjectId,
      promptText,
      runGenerate: runGenerate && files.length + preBound.length >= 1,
    },
  })) as Record<string, unknown>

  const uploads = Array.isArray(page.uploads) ? (page.uploads as Array<Record<string, unknown>>) : []
  const attachments = Array.isArray(page.attachments)
    ? (page.attachments as Array<Record<string, unknown>>)
    : []

  const bindingReports = [...reconcileReports]
  const refsToPersist = [
    ...files.map((file) => ({ kind: 'upload' as const, file })),
    ...preBound
      .filter((item) => !files.some((file) => file.referenceId === item.referenceId))
      .map((item) => ({ kind: 'prebound' as const, file: item })),
  ]

  for (const entry of refsToPersist) {
    const file = entry.file
    const uploadResult =
      entry.kind === 'upload'
        ? uploads.find((item) => item.referenceId === file.referenceId) || null
        : {
            ok: true,
            uploadState: 'uploaded_bound_evidence',
            flowMediaId: file.flowMediaId,
          }
    const attachResult =
      attachments.find((item) => item.referenceId === file.referenceId) || null
    const rawMediaId =
      typeof uploadResult?.flowMediaId === 'string'
        ? uploadResult.flowMediaId
        : typeof file.flowMediaId === 'string'
          ? file.flowMediaId
          : null
    const flowMediaId = isLegitimateMediaId(rawMediaId) ? rawMediaId : null
    const uploadOk = Boolean(flowMediaId) && uploadResult?.ok !== false
    const attachOk = attachResult?.ok === true

    const characterReady =
      file.asCharacter === true && uploadResult?.ok === true && uploadResult?.asCharacter === true
    if (characterReady) {
      bindingReports.push(
        await postReferenceBinding(ctx.state.endpoint, ctx.state.pairingToken, {
          referenceId: file.referenceId,
          flowProjectId: ctx.flowProjectId,
          flowMediaId,
          bindingState: 'character_ready',
          attachedState: 'attached',
          evidence: {
            sha256: file.sha256,
            characterName: uploadResult?.characterName || file.alias || null,
            uploadResult,
          },
        }),
      )
      continue
    }

    if (
      uploadResult?.uploadState === 'upload_uncertain_needs_reconcile' ||
      (!flowMediaId && entry.kind === 'upload')
    ) {
      bindingReports.push(
        await postReferenceBinding(ctx.state.endpoint, ctx.state.pairingToken, {
          referenceId: file.referenceId,
          flowProjectId: ctx.flowProjectId,
          flowMediaId: null,
          bindingState: 'upload_uncertain_needs_reconcile',
          attachedState: 'not_attached',
          evidence: { sha256: file.sha256, uploadResult, attachResult },
        }),
      )
      continue
    }

    // uploaded_bound só com ID legítimo confirmado.
    bindingReports.push(
      await postReferenceBinding(ctx.state.endpoint, ctx.state.pairingToken, {
        referenceId: file.referenceId,
        flowProjectId: ctx.flowProjectId,
        flowMediaId,
        bindingState: uploadOk ? 'bound' : 'upload_attempted',
        attachedState: attachOk ? 'attached' : 'not_attached',
        evidence: {
          sha256: file.sha256,
          byteSize: file.byteSize,
          uploadResult,
          attachResult,
          certainty: page.certainty,
          preBound: entry.kind === 'prebound',
        },
      }),
    )
  }

  // Persiste observação do ciclo (sem token).
  if (ctx.state.endpoint && ctx.state.pairingToken) {
    try {
      await fetch(`${ctx.state.endpoint}/api/atlas-flow/v1/session/observations`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.state.pairingToken}`,
        },
        body: JSON.stringify({
          kind: 'project_page',
          subtype: 'upload_bind_attach_generate',
          linkedFlowProjectId: ctx.flowProjectId,
          linkedFlowProjectUrl: ctx.flowProjectUrl,
          inspectedAt: new Date().toISOString(),
          page: {
            ok: page.ok,
            step: page.step,
            certainty: page.certainty,
            uploads,
            attachments,
            promptWrite: page.promptWrite,
            generate: page.generate,
            distinctions: page.distinctions,
          },
          realFlowValidated: false,
        }),
      })
    } catch {
      /* ignore */
    }
  }

  const uploadedOkCount = uploads.filter(
    (item) => item.ok === true && isLegitimateMediaId(item.flowMediaId),
  ).length
  const uploadsDone =
    files.length === 0 ||
    files.every((file) =>
      uploads.some((item) => {
        if (item.referenceId !== file.referenceId || item.ok !== true) return false
        if (file.asCharacter === true) return item.asCharacter === true
        return isLegitimateMediaId(item.flowMediaId)
      }),
    )
  const attachedOkCount = attachments.filter((item) => item.ok === true).length
  const prepareOk = !runGenerate ? uploadsDone : page.ok === true

  return {
    ok: prepareOk,
    step: typeof page.step === 'string' ? page.step : 'attach_two_references',
    error: prepareOk
      ? null
      : String(
          page.error ||
            (!uploadsDone ? 'UPLOAD_STAGED_FAILED' : 'ATTACH_FAILED'),
        ),
    createdProject: false,
    reusedProject: true,
    flowProjectId: ctx.flowProjectId,
    promptText: promptText || null,
    runGenerate,
    attachments: [
      ...alreadyAttached.map((item) => ({
        ok: true,
        referenceId: item.referenceId,
        flowMediaId: item.flowMediaId,
        alreadyAttached: true,
      })),
      ...attachments,
    ],
    distinctions: {
      staged_local: 'bytes no Atlas (sha/tamanho conferidos)',
      uploaded_bound: 'flowMediaId observado após conclusão real',
      attached: 'selecionado no draft (etapa separada)',
      generate: 'Start generation — marco NÃO VALIDADO até imagem na linha',
    },
    page,
    bindingReports,
    reconcileReports,
    uploadedOkCount,
    attachedOkCount,
    realFlowValidated: false,
    note: runGenerate
      ? 'Não marca realFlowValidated. Reconciliar se upload uncertain. Não reenviar sem identidade. Geração só após anexação confirmada.'
      : 'Upload staged_local + anexação confirmada. Sem geração. Sem fixtures.',
  }
}

async function trashFlowImageInBrowser(input: {
  flowProjectId: string
  flowProjectUrl: string | null
  flowMediaId: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext({ background: false })
  if (!ctx.ok || ctx.tabId == null) {
    return { ok: false, error: ctx.error || 'FLOW_TAB_MISSING', step: 'flow_tab' }
  }
  const tabId = ctx.tabId
  const target = input.flowProjectUrl || `https://flow.google.com/project/${input.flowProjectId}`
  const tab = await chrome.tabs.get(tabId)
  if (!(tab.url || '').includes(input.flowProjectId)) {
    await chrome.tabs.update(tabId, { url: target, active: true })
    await waitUntilTabShows(tabId, input.flowProjectId, 20000)
  } else {
    await chrome.tabs.update(tabId, { active: true })
  }
  const receiver = await ensureContentReceiver(tabId, target)
  if (!receiver.ready) {
    return { ok: false, error: receiver.error || 'CONTENT_RECEIVER_UNAVAILABLE', step: 'receiver' }
  }
  try {
    const page = (await chrome.tabs.sendMessage(tabId, {
      type: 'atlas-flow-v1.page.trashResult',
      payload: {
        flowMediaId: input.flowMediaId,
        expectedFlowProjectId: input.flowProjectId,
      },
    })) as Record<string, unknown>
    return page && typeof page === 'object' ? page : { ok: false, error: 'DELETE_NO_RESPONSE' }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'DELETE_SENSOR_MISSING',
      step: 'trash_result',
    }
  }
}

async function downloadFlowImageInBrowser(input: {
  flowProjectId: string
  flowProjectUrl: string | null
  flowMediaId: string
  resolution: string
}): Promise<Record<string, unknown>> {
  const ctx = await fetchLinkedProjectContext({ background: false })
  if (!ctx.ok || ctx.tabId == null) {
    return { ok: false, error: ctx.error || 'FLOW_TAB_MISSING', step: 'flow_tab' }
  }
  const tabId = ctx.tabId
  const target = input.flowProjectUrl || `https://flow.google.com/project/${input.flowProjectId}`
  const tab = await chrome.tabs.get(tabId)
  if (!(tab.url || '').includes(input.flowProjectId)) {
    await chrome.tabs.update(tabId, { url: target, active: true })
    await waitUntilTabShows(tabId, input.flowProjectId, 20000)
    const receiver = await ensureContentReceiver(tabId, target)
    if (!receiver.ready) {
      return { ok: false, error: receiver.error || 'CONTENT_RECEIVER_UNAVAILABLE', step: 'receiver' }
    }
  } else {
    await chrome.tabs.update(tabId, { active: true })
  }
  try {
    const page = (await chrome.tabs.sendMessage(tabId, {
      type: 'atlas-flow-v1.page.downloadResult',
      payload: {
        flowMediaId: input.flowMediaId,
        resolution: input.resolution,
        expectedFlowProjectId: input.flowProjectId,
      },
    })) as Record<string, unknown>
    return page && typeof page === 'object' ? page : { ok: false, error: 'DOWNLOAD_NO_RESPONSE' }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'DOWNLOAD_SENSOR_MISSING',
      step: 'download_result',
    }
  }
}

async function waitUntilTabShows(tabId: number, needle: string, timeoutMs = 15000) {
  const started = Date.now()
  let tab = await chrome.tabs.get(tabId)
  while (Date.now() - started < timeoutMs) {
    tab = await chrome.tabs.get(tabId)
    if ((tab.url || '').includes(needle) && tab.status === 'complete') return tab
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return tab
}

async function locateFlowDelete(
  tabId: number,
  flowProjectId: string,
  where: 'project' | 'home',
): Promise<{ phase?: string; x?: number; y?: number; href?: string; label?: string }> {
  try {
    const result = (await chrome.tabs.sendMessage(tabId, {
      type: 'atlas-flow-v1.page.locateDelete',
      payload: { flowProjectId, where },
    })) as { phase?: string; x?: number; y?: number; href?: string; label?: string } | undefined
    return result || { phase: 'missing' }
  } catch {
    return { phase: 'missing' }
  }
}

/** Abre o projeto pelo ID vinculado e confirma a exclusão desse mesmo ID. */
async function commitFlowProjectDelete(
  tabId: number,
  flowProjectId: string,
): Promise<Record<string, unknown>> {
  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    try {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'atlas-flow-v1.page.ownDelete',
          payload: { flowProjectId },
        })
      } catch {
        /* o sensor antigo não conhece a marca; a exclusão segue */
      }
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true
      await new Promise((resolve) => setTimeout(resolve, 200))
      const read = () => locateFlowDelete(tabId, flowProjectId, 'project')
      let clickedDelete = false
      let menuOpenedAt = 0
      for (let step = 0; step < 8; step += 1) {
        const state = await read()
        if (state.phase === 'gone' || state.phase === 'left') {
          return { ok: true, alreadyGone: state.phase === 'gone', flowProjectId, href: state.href || null }
        }
        if (state.phase === 'menu' && menuOpenedAt && Date.now() - menuOpenedAt < 1600) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          continue
        }
        if (state.phase === 'missing' || !Number.isFinite(state.x) || !Number.isFinite(state.y)) {
          if (clickedDelete) break
          return {
            ok: false,
            code: 'DELETE_CONTROL_MISSING',
            error: 'Não encontrei a lixeira desse ID no Google Flow.',
            href: state.href || null,
            flowProjectId,
          }
        }
        const x = Math.round(state.x!)
        const y = Math.round(state.y!)
        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x,
          y,
          pointerType: 'mouse',
        })
        await dispatchMouse(target, x, y, 1)
        if (state.phase === 'menu') menuOpenedAt = Date.now()
        if (state.phase === 'delete' || state.phase === 'confirm') clickedDelete = true
        await new Promise((resolve) => setTimeout(resolve, state.phase === 'menu' ? 800 : 500))
      }
      const started = Date.now()
      while (Date.now() - started < 12000) {
        const state = await read()
        if (state.phase === 'gone' || state.phase === 'left') {
          return { ok: true, flowProjectId, href: state.href || null }
        }
        const tab = await chrome.tabs.get(tabId)
        if (!(tab.url || '').toLowerCase().includes(flowProjectId.toLowerCase())) {
          return { ok: true, flowProjectId, href: tab.url || null }
        }
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
      const tab = await chrome.tabs.get(tabId)
      return {
        ok: false,
        code: 'DELETE_UNCONFIRMED',
        error: 'O Google Flow não confirmou a exclusão desse projeto.',
        href: tab.url || null,
        flowProjectId,
      }
    } catch (error) {
      return {
        ok: false,
        code: 'DELETE_FAILED',
        error: error instanceof Error ? error.message : String(error),
        flowProjectId,
      }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

/** Abre exatamente o projeto vinculado e exclui esse ID. */
async function deleteFlowProjectInBrowser(input: {
  flowProjectId: string
  flowProjectUrl?: string | null
}): Promise<Record<string, unknown>> {
  const flowProjectId = input.flowProjectId.trim()
  if (!flowProjectId) {
    return { ok: false, code: 'PROJECT_NOT_FOUND', error: 'Sem ID do projeto no Google Flow.' }
  }
  const flowProjectUrl =
    input.flowProjectUrl?.trim() || `https://flow.google.com/project/${flowProjectId}`

  const projectTabs = await chrome.tabs.query({ url: ['https://flow.google.com/*'] })
  let tab =
    projectTabs.find((item) => (item.url || '').toLowerCase().includes(flowProjectId.toLowerCase())) ||
    projectTabs[0] ||
    null

  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: flowProjectUrl, active: true })
  } else if (!(tab.url || '').toLowerCase().includes(flowProjectId.toLowerCase())) {
    await chrome.tabs.update(tab.id, { url: flowProjectUrl, active: true })
  } else {
    await chrome.tabs.update(tab.id, { active: true })
  }
  if (tab.id == null) {
    return { ok: false, code: 'NEED_FLOW_TAB', error: 'Não foi possível abrir o Google Flow.' }
  }

  const openedAt = Date.now()
  let ready = await chrome.tabs.get(tab.id)
  while (Date.now() - openedAt < 15000) {
    ready = await chrome.tabs.get(tab.id)
    const current = ready.url || ''
    if (/accounts\.google\.com/i.test(current)) {
      return {
        ok: false,
        code: 'LOGIN_REQUIRED',
        error: 'Faça login no Google Flow no Chrome e tente excluir de novo.',
        href: current,
      }
    }
    if (ready.status === 'complete' && current.toLowerCase().includes(flowProjectId.toLowerCase())) break
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  const url = ready.url || ''
  const receiver = await ensureContentReceiver(tab.id, url)
  if (!receiver.ready) {
    return {
      ok: false,
      code: receiver.code || 'CONTENT_RECEIVER_MISSING',
      error: receiver.error || 'A extensão não conseguiu falar com a página do Flow.',
      href: url,
    }
  }
  const onProject = url.toLowerCase().includes(flowProjectId.toLowerCase())
    ? await commitFlowProjectDelete(tab.id, flowProjectId)
    : { ok: false, code: 'DELETE_CONTROL_MISSING', flowProjectId }
  if (onProject.ok) return onProject
  if (onProject.code !== 'DELETE_CONTROL_MISSING' && onProject.code !== 'DELETE_UNCONFIRMED') {
    return onProject
  }
  await chrome.tabs.update(tab.id, { url: FLOW_HOME_URL, active: true })
  const openedHome = Date.now()
  let home = await chrome.tabs.get(tab.id)
  while (Date.now() - openedHome < 12000) {
    home = await chrome.tabs.get(tab.id)
    if (home.status === 'complete' && /flow\.google\.com/i.test(home.url || '')) break
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  const homeReceiver = await ensureContentReceiver(tab.id, home.url || FLOW_HOME_URL)
  if (!homeReceiver.ready) return onProject
  return commitFlowHomeCardDelete(tab.id, flowProjectId)
}

/** Na página inicial, clica a lixeira do card que contém exatamente esse ID. */
async function commitFlowHomeCardDelete(
  tabId: number,
  flowProjectId: string,
): Promise<Record<string, unknown>> {
  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    try {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'atlas-flow-v1.page.ownDelete',
          payload: { flowProjectId },
        })
      } catch {
        /* sensor antigo */
      }
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true
      let clickedDelete = false
      let sawCard = false
      let menuOpenedAt = 0
      for (let step = 0; step < 8; step += 1) {
        const state = await locateFlowDelete(tabId, flowProjectId, 'home')
        if (state.phase === 'gone' || (clickedDelete && state.phase === 'absent')) {
          return { ok: true, flowProjectId, href: state.href || null, via: 'home-card' }
        }
        if (state.phase === 'absent') {
          if (sawCard) {
            return { ok: true, flowProjectId, href: state.href || null, via: 'home-card' }
          }
          await new Promise((resolve) => setTimeout(resolve, 400))
          continue
        }
        sawCard = true
        if (state.phase === 'menu' && menuOpenedAt && Date.now() - menuOpenedAt < 1600) {
          await new Promise((resolve) => setTimeout(resolve, 400))
          continue
        }
        if (state.phase === 'reveal' && Number.isFinite(state.x) && Number.isFinite(state.y)) {
          await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: state.x,
            y: state.y,
            pointerType: 'mouse',
          })
          await new Promise((resolve) => setTimeout(resolve, 350))
          continue
        }
        if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) break
        const x = Math.round(state.x!)
        const y = Math.round(state.y!)
        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x,
          y,
          pointerType: 'mouse',
        })
        await dispatchMouse(target, x, y, 1)
        if (state.phase === 'menu') menuOpenedAt = Date.now()
        if (state.phase === 'delete' || state.phase === 'confirm') clickedDelete = true
        await new Promise((resolve) => setTimeout(resolve, state.phase === 'menu' ? 800 : 500))
      }
      const started = Date.now()
      while (Date.now() - started < 8000) {
        const state = await locateFlowDelete(tabId, flowProjectId, 'home')
        if (state.phase === 'gone' || (clickedDelete && state.phase === 'absent')) {
          return { ok: true, flowProjectId, href: state.href || null, via: 'home-card' }
        }
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
      return {
        ok: false,
        code: 'DELETE_UNCONFIRMED',
        error: 'O Google Flow não confirmou a exclusão desse projeto.',
        flowProjectId,
      }
    } catch (error) {
      return {
        ok: false,
        code: 'DELETE_FAILED',
        error: error instanceof Error ? error.message : String(error),
        flowProjectId,
      }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

function flowTitleProbe(name: string) {
  return `(() => {
    const name = ${JSON.stringify(name)};
    const dated = /\\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|feb|apr|may|aug|sep|oct|dec)[a-z.]*\\s+\\d{1,2}\\s*[-–]\\s*\\d{1,2}:\\d{2}\\b/i;
    const shown = (el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    const textOf = (el) => String(el.innerText || el.value || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], h1, h2, [contenteditable="true"], input, textarea, span, a, p'));
    let datedEl = null;
    let namedEl = null;
    for (const el of nodes) {
      if (!shown(el)) continue;
      const label = textOf(el);
      if (!label || label.length > 80) continue;
      if (!datedEl && label.length < 48 && dated.test(label)) datedEl = el;
      if (!namedEl && label === name) namedEl = el;
    }
    const pencil = nodes.find((el) => {
      if (!shown(el)) return false;
      const raw = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
      return /rename|renomear|edit project|editar projeto|edit title|editar t/.test(raw);
    });
    if (namedEl && !datedEl) return { named: true, dated: false };
    const target = datedEl || pencil;
    if (!target) return { named: false, dated: false, missing: true };
    try { target.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {}
    const rect = target.getBoundingClientRect();
    const pencilRect = pencil ? pencil.getBoundingClientRect() : null;
    return {
      named: false,
      dated: Boolean(datedEl),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      pencilX: pencilRect ? pencilRect.left + pencilRect.width / 2 : null,
      pencilY: pencilRect ? pencilRect.top + pencilRect.height / 2 : null,
    };
  })()`
}

async function dispatchMouse(
  target: { tabId: number },
  x: number,
  y: number,
  clickCount: number,
) {
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount,
    pointerType: 'mouse',
  })
  await new Promise((resolve) => setTimeout(resolve, 50))
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount,
    pointerType: 'mouse',
  })
}

/** Grava o nome de verdade. Escrever no DOM faz o Flow mostrar e depois voltar para a data. */
async function commitFlowProjectTitle(
  tabId: number,
  requestedTitle: string,
): Promise<Record<string, unknown>> {
  const name = requestedTitle.trim()
  if (!name) return { ok: false, skipped: true, reason: 'empty' }
  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    try {
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true
      await new Promise((resolve) => setTimeout(resolve, 200))

      const read = async () => {
        const evaluated = (await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: flowTitleProbe(name),
          returnByValue: true,
        })) as {
          result?: {
            value?: {
              named?: boolean
              dated?: boolean
              missing?: boolean
              x?: number
              y?: number
              pencilX?: number | null
              pencilY?: number | null
            } | null
          }
        }
        return evaluated?.result?.value || { missing: true }
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const state = await read()
        if (state.named && !state.dated) {
          return { ok: true, alreadyNamed: attempt === 0, observedTitle: name }
        }
        const useTitle = state.dated === true && Number.isFinite(state.x) && Number.isFinite(state.y)
        const x = Math.round(useTitle ? state.x! : state.pencilX || state.x || 0)
        const y = Math.round(useTitle ? state.y! : state.pencilY || state.y || 0)
        if (!x && !y) {
          return { ok: false, error: 'TITLE_FIELD_MISSING', observedTitle: null }
        }
        await dispatchMouse(target, x, y, useTitle ? 2 : 1)
        await new Promise((resolve) => setTimeout(resolve, 250))
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          modifiers: 2,
          key: 'a',
          code: 'KeyA',
          windowsVirtualKeyCode: 65,
        })
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          modifiers: 2,
          key: 'a',
          code: 'KeyA',
          windowsVirtualKeyCode: 65,
        })
        await chrome.debugger.sendCommand(target, 'Input.insertText', { text: name })
        await new Promise((resolve) => setTimeout(resolve, 80))
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
        })
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
        })
        await new Promise((resolve) => setTimeout(resolve, 1200))
        const after = await read()
        await new Promise((resolve) => setTimeout(resolve, 900))
        const later = await read()
        if (after.named && !after.dated && later.named && !later.dated) {
          return { ok: true, alreadyNamed: false, observedTitle: name, attempt }
        }
      }
      return {
        ok: false,
        error: 'TITLE_REVERTED',
        observedTitle: null,
        note: 'O Flow mostrou o nome e voltou para a data.',
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

async function renameLinkedFlowProject(
  flowProjectId: string,
  requestedTitle: string,
): Promise<Record<string, unknown>> {
  const title = requestedTitle.trim()
  if (!flowProjectId || !title) {
    return { ok: false, skipped: true, reason: 'empty' }
  }
  const flowProjectUrl = `https://flow.google.com/project/${flowProjectId}`
  const projectTabs = await chrome.tabs.query({ url: ['https://flow.google.com/project/*'] })
  let tab =
    projectTabs.find((item) => (item.url || '').includes(flowProjectId)) ||
    (await chrome.tabs.query({ url: ['https://flow.google.com/*'] }))[0] ||
    null
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: flowProjectUrl, active: false })
  } else if (!(tab.url || '').includes(flowProjectId)) {
    await chrome.tabs.update(tab.id, { url: flowProjectUrl, active: false })
  }
  if (tab.id == null) {
    return { ok: false, error: 'NEED_FLOW_TAB' }
  }
  const ready = await waitUntilTabShows(tab.id, flowProjectId)
  const receiver = await ensureContentReceiver(tab.id, ready.url || flowProjectUrl)
  if (!receiver.ready) {
    return {
      ok: false,
      code: receiver.code || 'CONTENT_RECEIVER_MISSING',
      error: receiver.error || 'Recarregue a extensão Atlas Flow no Chrome para gravar o nome.',
    }
  }
  try {
    const page = await commitFlowProjectTitle(tab.id, title)
    await appendLog(page.ok === true ? 'info' : 'error', 'project.rename', {
      flowProjectId,
      title,
      ok: page.ok === true,
      error: page.error || null,
    })
    return page
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function ensureProjectFromAtlas(input?: {
  requestedTitle?: string
  atlasProjectId?: string
  idempotencyKey?: string
}): Promise<Record<string, unknown>> {
  let state = await readPairingState()
  if (!state.endpoint) {
    const resolved = await resolveAuthoritativeEndpoint(state)
    if (resolved.endpoint) {
      await writePairingPatch({ endpoint: resolved.endpoint })
      state = await readPairingState()
    }
  }

  const atlasProjectId = input?.atlasProjectId?.trim() || ''
  if (!atlasProjectId) {
    return {
      ok: false,
      step: 'atlas_project',
      error: 'ATLAS_PROJECT_REQUIRED',
      note: 'Informe o atlasProjectId do projeto Atlas selecionado. Sem ID de teste automático.',
      realFlowValidated: false,
    }
  }
  const idempotencyKey =
    input?.idempotencyKey?.trim() || `project.ensure:${atlasProjectId}`
  const requestedTitle =
    input?.requestedTitle?.trim() || `Atlas Flow ${new Date().toISOString().slice(0, 19)}`

  if (!state.endpoint || !state.pairingToken) {
    return {
      ok: false,
      step: 'pairing',
      error: 'Sem endpoint/token. Rode o diagnóstico com pairingToken antes.',
      authRequired: true,
      pipelineBlocked: true,
      realFlowValidated: false,
    }
  }
  if (state.paired !== true || state.lastHelloOk !== true) {
    return {
      ok: false,
      step: 'auth',
      error: 'HELLO_REQUIRED',
      authRequired: true,
      pipelineBlocked: true,
      pairingTokenFingerprint: await pairingTokenFingerprint(state.pairingToken),
      pairingFileHint: 'docs/atlas-flow/coordinator-pairing.local.json',
      note: 'Hello obrigatório antes de project.ensure.',
      realFlowValidated: false,
    }
  }

  // 1) Pedido idempotente no Coordinator (Atlas) antes de qualquer clique.
  let ensureOrder: {
    ok?: boolean
    action?: string
    link?: Record<string, unknown>
    commandId?: string
    error?: string
  } | null = null
  try {
    const res = await fetch(`${state.endpoint}/api/atlas-flow/v1/projects/ensure`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.pairingToken}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        atlasProjectId,
        requestedTitle,
        installationId: state.installationId,
        idempotencyKey,
      }),
    })
    ensureOrder = (await res.json().catch(() => null)) as typeof ensureOrder
    if (res.status === 401 || res.status === 403) {
      await chrome.storage.local.set({ paired: false, lastHelloOk: false, lastError: 'UNAUTHORIZED' })
      return {
        ok: false,
        step: 'auth',
        error: 'UNAUTHORIZED',
        httpStatus: res.status,
        authRequired: true,
        pipelineBlocked: true,
        ensureOrder,
        pairingTokenFingerprint: await pairingTokenFingerprint(state.pairingToken),
        pairingFileHint: 'docs/atlas-flow/coordinator-pairing.local.json',
        note: '401/403 preservado — não converter em projeto ausente.',
        realFlowValidated: false,
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        step: 'coordinator_ensure',
        error: ensureOrder?.error || `HTTP ${res.status}`,
        ensureOrder,
        realFlowValidated: false,
      }
    }
  } catch (error) {
    return {
      ok: false,
      step: 'coordinator_ensure',
      error: error instanceof Error ? error.message : String(error),
      realFlowValidated: false,
    }
  }

  // Já vinculado: não criar outro. Ainda grava o nome no card do Flow.
  if (ensureOrder?.action === 'reuse' && ensureOrder.link?.flowProjectId) {
    const flowProjectId = String(ensureOrder.link.flowProjectId)
    await appendLog('info', 'project.ensure reutilizado (idempotente)', {
      flowProjectId,
    })
    let titleApply: Record<string, unknown> | null = null
    titleApply = await renameLinkedFlowProject(flowProjectId, requestedTitle)
    if (titleApply.ok === true && state.endpoint && state.pairingToken) {
        try {
          await fetch(`${state.endpoint}/api/atlas-flow/v1/projects/ensure/complete`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.pairingToken}`,
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({
              atlasProjectId,
              idempotencyKey,
              pageResult: {
                ok: true,
                certainty: 'accepted',
                created: false,
                flowProjectId,
                flowProjectUrl: `https://flow.google.com/project/${flowProjectId}`,
                observedTitle: titleApply.observedTitle || requestedTitle,
              },
            }),
          })
        } catch {
          /* o nome já foi escrito na página */
        }
    }
    return {
      ok: true,
      step: 'project_ensure_reused',
      created: false,
      reused: true,
      realFlowValidated: false,
      flowProjectId,
      flowProjectUrl: ensureOrder.link.flowProjectUrl,
      link: ensureOrder.link,
      ensureOrder,
      titleApply,
    }
  }

  if (ensureOrder?.action === 'uncertain_reconcile') {
    // Tenta recuperar pela aba aberta; se não houver /project/{id}, falha tipada.
    const tabsForReconcile = await chrome.tabs.query({ url: ['https://flow.google.com/*'] })
    const flowTab =
      tabsForReconcile.find((item) => item.active && isFlowUrl(item.url ?? null)) ||
      tabsForReconcile.find((item) => isFlowUrl(item.url ?? null)) ||
      null
    const href = flowTab?.url || ''
    const recovered = href.match(/\/project\/([0-9a-f-]{20,})/i)?.[1] || null
    if (recovered && state.endpoint && state.pairingToken) {
      try {
        await fetch(`${state.endpoint}/api/atlas-flow/v1/projects/ensure/complete`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.pairingToken}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            atlasProjectId,
            idempotencyKey,
            commandId: ensureOrder.commandId ?? null,
            installationId: state.installationId,
            pageResult: {
              ok: true,
              certainty: 'accepted',
              created: false,
              flowProjectId: recovered,
              flowProjectUrl: `https://flow.google.com/project/${recovered}`,
              note: 'Reconciliado via URL da aba após ensure incerto.',
            },
          }),
        })
        return {
          ok: true,
          step: 'project_ensure_reconciled',
          created: false,
          reused: true,
          flowProjectId: recovered,
          flowProjectUrl: `https://flow.google.com/project/${recovered}`,
          realFlowValidated: false,
          ensureOrder,
        }
      } catch {
        /* cai no erro abaixo */
      }
    }
    return {
      ok: false,
      step: 'uncertain_reconcile',
      error:
        'Ensure anterior incerto sem projeto na URL. Abra o Flow e tente Enviar de novo (retry liberado se o canal tinha fechado).',
      realFlowValidated: false,
      ensureOrder,
    }
  }

  const tabs = await chrome.tabs.query({ url: ['https://flow.google.com/*'] })
  const flowTabs = tabs.filter((tab) => isFlowUrl(tab.url ?? null))
  let tab =
    flowTabs.find((item) => item.active) ||
    flowTabs[0] ||
    null
  if (!tab?.id) {
    return {
      ok: false,
      step: 'find_tab',
      error: 'Nenhuma aba flow.google.com aberta.',
      realFlowValidated: false,
    }
  }

  // Novo projeto só existe na home. Se a aba está em /project/…, o Flow
  // frequentemente “gruda” nela — forçar home via tabs.update antes do sensor.
  {
    const onProject = /\/project\//i.test(tab.url || '')
    const onHome = /^https:\/\/flow\.google\.com\/?\??/i.test(tab.url || '') && !onProject
    if (!onHome) {
      await chrome.tabs.update(tab.id, { url: `${FLOW_HOME_URL}?pli=1`, active: true })
      await new Promise((r) => setTimeout(r, 1600))
      try {
        tab = await chrome.tabs.get(tab.id)
      } catch {
        /* keep previous */
      }
    }
  }

  const receiver = await ensureContentReceiver(tab.id, tab.url ?? '')
  if (!receiver.ready) {
    return {
      ok: false,
      step: receiver.code === 'SENSOR_INCOMPATIBLE' ? 'sensor' : 'content_handshake',
      error: receiver.error,
      code: receiver.code ?? null,
      pipelineBlocked: receiver.pipelineBlocked !== false,
      authRequired: receiver.authRequired === true,
      expectedSensorVersion: receiver.expectedSensorVersion ?? SENSOR_VERSION,
      actualSensorVersion: receiver.actualSensorVersion ?? null,
      packageVersion: receiver.packageVersion ?? PACKAGE_VERSION,
      protocolVersion: receiver.protocolVersion ?? PROTOCOL_VERSION,
      realFlowValidated: false,
      note:
        receiver.code === 'SENSOR_INCOMPATIBLE'
          ? 'Sensor incompatível — aborta antes de efeito externo (project.ensure na aba).'
          : undefined,
    }
  }

  // Journal local: intent antes do efeito externo.
  const actionId = crypto.randomUUID()
  await chrome.storage.local.set({
    lastProjectEnsureIntent: {
      actionId,
      atlasProjectId,
      idempotencyKey,
      commandId: ensureOrder?.commandId ?? null,
      intentAt: new Date().toISOString(),
      certainty: 'not_sent',
    },
  })
  await appendLog('info', 'project.ensure intent gravado', { actionId, atlasProjectId })

  let pageResult: Record<string, unknown>
  try {
    pageResult = (await chrome.tabs.sendMessage(tab.id, {
      type: 'atlas-flow-v1.page.ensureProject',
      payload: {
        requestedTitle,
        existingFlowProjectId: null,
      },
    })) as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const channelClosed = /message channel closed|asynchronous response/i.test(message)
    // Tenta reconciliar pela URL da aba antes de marcar incerto.
    let recoveredId: string | null = null
    try {
      const refreshed = await chrome.tabs.get(tab.id)
      const href = refreshed.url || ''
      const match = href.match(/\/project\/([0-9a-f-]{20,})/i)
      recoveredId = match?.[1] || null
    } catch {
      recoveredId = null
    }
    if (recoveredId) {
      pageResult = {
        ok: true,
        certainty: 'accepted',
        created: true,
        flowProjectId: recoveredId,
        flowProjectUrl: `https://flow.google.com/project/${recoveredId}`,
        error: null,
        note: 'Canal fechou, mas URL do projeto foi observada — vínculo recuperado.',
        channelError: message,
      }
    } else {
      pageResult = {
        ok: false,
        // Canal fechou sem URL de projeto: permite retry (não trava em uncertain).
        certainty: channelClosed ? 'not_sent' : 'may_have_sent',
        error: message,
        note: channelClosed
          ? 'Canal de mensagem fechou sem /project/{id}. Pode repetir o ensure.'
          : 'Falha de mensagem após possível clique. Não repetir automaticamente.',
      }
    }
  }

  if (pageResult.ok === true && tab?.id && requestedTitle) {
    const titleApply = await commitFlowProjectTitle(tab.id, requestedTitle)
    pageResult.titleApply = titleApply
    if (titleApply.ok === true && typeof titleApply.observedTitle === 'string') {
      pageResult.observedTitle = titleApply.observedTitle
    }
  }

  const certainty =
    typeof pageResult.certainty === 'string' ? pageResult.certainty : 'not_sent'
  await chrome.storage.local.set({
    lastProjectEnsureIntent: {
      actionId,
      atlasProjectId,
      idempotencyKey,
      commandId: ensureOrder?.commandId ?? null,
      intentAt: new Date().toISOString(),
      certainty,
      pageResult,
    },
  })

  // 2) Reportar resultado ao Coordinator (confirmação ou incerteza).
  let committed: unknown = null
  try {
    const res = await fetch(`${state.endpoint}/api/atlas-flow/v1/projects/ensure/complete`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.pairingToken}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        atlasProjectId,
        idempotencyKey,
        commandId: ensureOrder?.commandId ?? null,
        actionId,
        installationId: state.installationId,
        pageResult,
      }),
    })
    committed = await res.json().catch(() => ({ httpStatus: res.status }))
  } catch (error) {
    committed = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const ok = pageResult.ok === true && certainty === 'accepted'
  await appendLog(ok ? 'info' : 'error', 'project.ensure concluído', {
    ok,
    certainty,
    flowProjectId: pageResult.flowProjectId ?? null,
  })

  return {
    ok,
    step: ok ? 'project_ensure_accepted' : 'project_ensure_failed',
    created: pageResult.created === true,
    reused: pageResult.reused === true,
    realFlowValidated: false,
    flowProjectId: pageResult.flowProjectId ?? null,
    flowProjectUrl: pageResult.flowProjectUrl ?? null,
    selector: pageResult.selector ?? null,
    certainty,
    error: ok ? null : String(pageResult.error || 'PROJECT_ENSURE_FAILED'),
    pageResult,
    ensureOrder,
    committed,
    note: 'Geração de imagem permanece NÃO VALIDADA.',
  }
}

function bytesToBase64(buf: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function sha256HexOfBytes(buf: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf.buffer as ArrayBuffer)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Lista candidatos no DOM (inject) e baixa bytes via host fetch/CDP — independe do content.js antigo.
 */
async function captureCandidateBytesViaDebugger(
  tabId: number,
  input: {
    maxCandidates: number
    excludeShas: string[]
    excludeSrcs?: string[]
    excludeMediaIds?: string[]
    allowSrcs?: string[]
    allowMediaIds?: string[]
    explicitSelectionKeys?: string[]
    originProofByKey?: Record<string, string>
    requirePositiveOrigin?: boolean
    promptFingerprint: string
    knownStems: string[]
  },
): Promise<Record<string, unknown>> {
  try {
    const explicitKeys = Array.isArray(input.explicitSelectionKeys)
      ? input.explicitSelectionKeys.filter(Boolean)
      : []
    const isExplicit = explicitKeys.length > 0 && !explicitKeys.includes('*')
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      args: [
        {
          maxCandidates: input.maxCandidates,
          promptFingerprint: input.promptFingerprint,
          knownStems: input.knownStems,
          excludeSrcs: input.excludeSrcs || [],
          excludeMediaIds: input.excludeMediaIds || [],
          allowSrcs: input.allowSrcs || [],
          allowMediaIds: input.allowMediaIds || [],
          explicitSelectionKeys: explicitKeys,
          requirePositiveOrigin: false,
        },
      ],
      func: (opts: {
        maxCandidates: number
        promptFingerprint: string
        knownStems: string[]
        excludeSrcs: string[]
        excludeMediaIds: string[]
        allowSrcs: string[]
        allowMediaIds: string[]
        explicitSelectionKeys: string[]
        requirePositiveOrigin: boolean
      }) => {
        const normalize = (src: string) => {
          try {
            const u = new URL(String(src || ''), location.href)
            if (u.protocol === 'blob:') return src
            const cleanPath = u.pathname.replace(/=w\d+[^/]*$/i, '').replace(/=s\d+[^/]*$/i, '')
            return `${u.origin}${cleanPath}`
          } catch {
            return String(src || '').split('?')[0].split('#')[0]
          }
        }
        const excludeSrcSet = new Set((opts.excludeSrcs || []).map(normalize))
        const excludeMediaSet = new Set((opts.excludeMediaIds || []).map(String))
        const allowSrcSet = new Set((opts.allowSrcs || []).map(normalize))
        const allowMediaSet = new Set((opts.allowMediaIds || []).map(String))
        const explicitSet = new Set((opts.explicitSelectionKeys || []).map(String))
        const isExplicitSel = explicitSet.size > 0 && !explicitSet.has('*')
        const aliases: Record<string, string[]> = {
          navio: ['navio', 'ship', 'boat', 'vessel'],
          mar: ['mar', 'sea', 'ocean'],
          luxoso: ['luxoso', 'luxury', 'luxurious'],
          gospel: ['gospel'],
          praia: ['praia', 'beach'],
          mata: ['mata', 'woods', 'forest'],
          floresta: ['floresta', 'forest', 'woods'],
          cantando: ['cantando', 'singing', 'singer', 'performing'],
        }
        const stop = new Set([
          'cantor',
          'singer',
          'no',
          'na',
          'do',
          'da',
          'de',
          'em',
          'um',
          'uma',
          'foco',
          'meio',
        ])
        const tokens = String(opts.promptFingerprint || '')
          .toLowerCase()
          .replace(/[\[\].,;:!?]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 3 && !stop.has(t))
        const needles = new Set<string>()
        for (const t of tokens) {
          needles.add(t)
          for (const a of aliases[t] || []) needles.add(a)
        }
        const needleList = [...needles]
        const score = (alt: string, src: string) => {
          const hay = `${alt} ${src}`.toLowerCase()
          return needleList.filter((n) => hay.includes(n)).length
        }
        const readMediaId = (img: Element, rawSrc: string) => {
          for (const key of ['data-media-id', 'data-asset-id', 'data-tile-id', 'data-entity-id', 'data-item-id', 'data-key', 'data-id']) {
            const value = img.getAttribute(key)
            if (value && /^[a-zA-Z0-9-]{8,}$/.test(value) && !value.startsWith('_')) return value
          }
          const host = img.closest(
            '[data-media-id], [data-asset-id], [data-tile-id], [data-entity-id], [data-item-id], [data-key], [data-id]',
          )
          if (host) {
            for (const key of ['data-media-id', 'data-asset-id', 'data-tile-id', 'data-entity-id', 'data-item-id', 'data-key', 'data-id']) {
              const value = host.getAttribute(key)
              if (value && /^[a-zA-Z0-9-]{8,}$/.test(value) && !value.startsWith('_')) return value
            }
          }
          try {
            const u = new URL(rawSrc, location.href)
            const projMatch = location.pathname.match(/\/project\/([a-f0-9-]{8,})/i)
            const projId = projMatch ? projMatch[1].toLowerCase() : ''
            const segs = u.pathname.replace(/=w\d+[^/]*$/i, '').split('/').filter(Boolean)
            for (let i = segs.length - 1; i >= 0; i -= 1) {
              const seg = decodeURIComponent(segs[i]!).replace(/\.(png|jpe?g|webp|gif|bin)$/i, '')
              if (seg.toLowerCase() === projId) continue
              if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
                return seg
              }
            }
          } catch {
            /* ignore */
          }
          return null
        }
        const domImgs = Array.from(document.querySelectorAll('img'))
          .map((img) => {
            const rect = img.getBoundingClientRect()
            const src = String(img.currentSrc || img.src || '')
            const alt = String(img.alt || img.getAttribute('aria-label') || '')
            const srcKey = normalize(src)
            const mediaId = readMediaId(img, src)
            const candidateKey = mediaId ? `media:${mediaId}` : `src:${srcKey || src}`
            const inExplicit =
              isExplicitSel &&
              (explicitSet.has(candidateKey) ||
                (mediaId ? explicitSet.has(mediaId) : false) ||
                (srcKey ? explicitSet.has(srcKey) : false) ||
                explicitSet.has(src))
            const inAllowlist =
              (mediaId && allowMediaSet.has(mediaId)) || (srcKey && allowSrcSet.has(srcKey))
            return {
              src,
              srcKey,
              mediaId,
              candidateKey,
              alt,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              naturalWidth: img.naturalWidth || 0,
              naturalHeight: img.naturalHeight || 0,
              inExplicit,
              inAllowlist,
              sceneScore: score(alt, src),
            }
          })
          .filter((item) => {
            if (!item.src || item.src.startsWith('data:')) return false
            if (isExplicitSel) return item.inExplicit
            if (item.srcKey && excludeSrcSet.has(item.srcKey)) return false
            if (item.mediaId && excludeMediaSet.has(item.mediaId)) return false
            if (!item.inAllowlist) {
              if (item.width < 120 && item.naturalWidth < 480) return false
              if (item.height < 120 && item.naturalHeight < 320) return false
            }
            const hay = `${item.alt} ${item.src}`.toLowerCase()
            if ((opts.knownStems || []).some((s) => hay.includes(`${String(s).toLowerCase()}.png`))) {
              return false
            }
            return true
          })

        const seenKeys = new Set(
          domImgs.flatMap((i) => [i.srcKey, i.mediaId ? `media:${i.mediaId}` : '']).filter(Boolean),
        )
        const directAllow: typeof domImgs = []
        for (const mediaId of allowMediaSet) {
          if (!mediaId || excludeMediaSet.has(mediaId) || seenKeys.has(`media:${mediaId}`)) continue
          const url = `https://flow-content.google/image/${mediaId}`
          const srcKey = normalize(url)
          if (excludeSrcSet.has(srcKey)) continue
          seenKeys.add(`media:${mediaId}`)
          seenKeys.add(srcKey)
          directAllow.push({
            src: url,
            srcKey,
            mediaId,
            candidateKey: `media:${mediaId}`,
            alt: '',
            width: 1376,
            height: 768,
            naturalWidth: 1376,
            naturalHeight: 768,
            inExplicit: isExplicitSel,
            inAllowlist: true,
            sceneScore: 10,
          })
        }
        for (const rawSrc of opts.allowSrcs || []) {
          if (!rawSrc) continue
          if ((opts.allowSrcs || []).length > 6 && /googleusercontent\.com\/asb\//i.test(rawSrc)) {
            continue
          }
          const srcKey = normalize(rawSrc)
          if (!srcKey || excludeSrcSet.has(srcKey) || seenKeys.has(srcKey)) continue
          seenKeys.add(srcKey)
          directAllow.push({
            src: rawSrc,
            srcKey,
            mediaId: null,
            candidateKey: `src:${srcKey}`,
            alt: '',
            width: 1376,
            height: 768,
            naturalWidth: 1376,
            naturalHeight: 768,
            inExplicit: isExplicitSel,
            inAllowlist: true,
            sceneScore: 8,
          })
        }

        const imgs = [...domImgs, ...directAllow]
          .sort(
            (a, b) =>
              Number(b.inExplicit) - Number(a.inExplicit) ||
              Number(b.inAllowlist) - Number(a.inAllowlist) ||
              Number(/flow-content\.google/i.test(b.src)) - Number(/flow-content\.google/i.test(a.src)) ||
              b.sceneScore - a.sceneScore ||
              b.naturalWidth - a.naturalWidth,
          )
          .slice(0, Math.max(opts.maxCandidates * 3, 6))
        return imgs
      },
    })
    const candidates = (injected?.[0]?.result || []) as Array<{
      src: string
      srcKey?: string
      mediaId?: string | null
      candidateKey?: string
      inExplicit?: boolean
      inAllowlist?: boolean
      alt: string
      width: number
      height: number
      naturalWidth: number
      naturalHeight: number
      sceneScore: number
    }>
    const exclude = new Set(input.excludeShas.map((s) => s.toLowerCase()))
    const proofMap = input.originProofByKey || {}
    const files: Array<Record<string, unknown>> = []
    for (const item of candidates) {
      if (files.length >= input.maxCandidates) break
      const fetched = await fetchMediaBytesViaHostOrDebugger(item.src, tabId)
      if (fetched.ok !== true || typeof fetched.base64 !== 'string') continue
      const bin = atob(fetched.base64)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i)
      const sha256 = await sha256HexOfBytes(buf)
      if (exclude.has(sha256)) continue
      if (files.some((f) => f.sha256 === sha256)) continue
      const originProof = item.inExplicit
        ? 'explicit_user_selection'
        : (item.mediaId && proofMap[`media:${item.mediaId}`]) ||
          (item.srcKey && proofMap[`src:${item.srcKey}`]) ||
          (item.inAllowlist ? 'tracked_progress_slot' : null)
      files.push({
        sha256,
        byteSize: buf.length,
        mimeType: fetched.mimeType || 'application/octet-stream',
        method: fetched.via || 'debugger_fallback',
        width: item.naturalWidth || item.width,
        height: item.naturalHeight || item.height,
        srcHost: (() => {
          try {
            return new URL(item.src).host
          } catch {
            return null
          }
        })(),
        srcKey: item.srcKey || null,
        candidateKey: item.candidateKey || null,
        flowMediaId: item.mediaId || null,
        originProof,
        automaticCorrelation: !item.inExplicit && Boolean(item.inAllowlist),
        displayName: `flow-result-${files.length + 1}.bin`,
        base64: fetched.base64,
        alt: item.alt,
        sceneScore: item.sceneScore,
      })
    }
    return { ok: files.length > 0, files, candidateCount: candidates.length }
  } catch (error) {
    return {
      ok: false,
      files: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Bytes de mídia Flow: fetch direto (host_permissions) ou CDP Network.loadNetworkResource
 * (credenciais da página — contorna CORS de flow-content.google).
 */
async function fetchMediaBytesViaHostOrDebugger(
  url: string,
  tabId?: number,
): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-cache' })
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.length >= 8_000) {
        return {
          ok: true,
          base64: bytesToBase64(buf),
          byteSize: buf.length,
          mimeType: res.headers.get('content-type') || 'application/octet-stream',
          via: 'extension_fetch',
        }
      }
    }
  } catch {
    /* tenta debugger */
  }

  if (tabId == null) {
    return { ok: false, error: 'FETCH_NEEDS_TAB_OR_HOST_PERMISSION' }
  }

  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    try {
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true

      const tree = (await chrome.debugger.sendCommand(target, 'Page.getFrameTree', {})) as {
        frameTree?: { frame?: { id?: string } }
      }
      const frameId = tree?.frameTree?.frame?.id
      if (!frameId) return { ok: false, error: 'NO_FRAME_ID', via: 'debugger' }

      const loaded = (await chrome.debugger.sendCommand(target, 'Network.loadNetworkResource', {
        frameId,
        url,
        options: { disableCache: false, includeCredentials: true },
      })) as {
        resource?: { success?: boolean; stream?: string; httpStatusCode?: number; netError?: string }
      }
      const resource = loaded?.resource
      if (!resource?.success || !resource.stream) {
        return {
          ok: false,
          error: resource?.netError || `LOAD_FAILED_${resource?.httpStatusCode || 'na'}`,
          via: 'debugger',
        }
      }

      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const read = (await chrome.debugger.sendCommand(target, 'IO.read', {
          handle: resource.stream,
          size: 1_048_576,
        })) as { data?: string; base64Encoded?: boolean; eof?: boolean }
        if (read?.data) {
          const part = read.base64Encoded
            ? Uint8Array.from(atob(read.data), (c) => c.charCodeAt(0))
            : new TextEncoder().encode(read.data)
          chunks.push(part)
          total += part.length
        }
        if (read?.eof) break
        if (total > 20 * 1024 * 1024) break
      }
      try {
        await chrome.debugger.sendCommand(target, 'IO.close', { handle: resource.stream })
      } catch {
        /* ignore */
      }
      if (total < 8_000) {
        return { ok: false, error: 'TOO_SMALL', byteSize: total, via: 'debugger' }
      }
      const buf = new Uint8Array(total)
      let offset = 0
      for (const part of chunks) {
        buf.set(part, offset)
        offset += part.length
      }
      return {
        ok: true,
        base64: bytesToBase64(buf),
        byteSize: buf.length,
        mimeType: 'application/octet-stream',
        via: 'debugger_loadNetworkResource',
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        via: 'debugger',
      }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

/**
 * Clique trusted via CDP. Flow ignora isTrusted=false; clique manual funciona.
 * Importante: o banner amarelo do debugger desloca o layout — por isso
 * re-resolve o alvo por aria-label DEPOIS do attach, não usa coords pré-banner.
 */
async function trustedClickViaDebugger(
  tabId: number,
  x: number,
  y: number,
  ariaLabel?: string | null,
  mouseButton: 'left' | 'right' = 'left',
): Promise<Record<string, unknown>> {
  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    try {
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        // Já anexado (retry): segue.
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true
      // Banner do debugger empurra o conteúdo — esperar estabilizar.
      await new Promise((resolve) => setTimeout(resolve, 180))

      let point = {
        x: Math.round(x),
        y: Math.round(y),
        button: mouseButton,
        clickCount: 1,
        pointerType: 'mouse' as const,
      }
      let resolvedFromLabel = false
      const label = typeof ariaLabel === 'string' ? ariaLabel.trim() : ''
      if (label) {
        const evaluated = (await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: `(() => {
          const marked = document.querySelector('[data-atlas-flow-click="1"]');
          if (marked) {
            const r = marked.getBoundingClientRect();
            if (r && r.width >= 2 && r.height >= 2) {
              return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5, width: r.width, height: r.height, label: 'marked' };
            }
          }
          const needle = ${JSON.stringify(label.toLowerCase())};
          const originX = ${JSON.stringify(Math.round(x))};
          const originY = ${JSON.stringify(Math.round(y))};
          const nodes = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], [role="option"], [aria-label]'));
          let best = null;
          let bestScore = Infinity;
          for (const el of nodes) {
            const raw = (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            if (!raw) continue;
            const exact = raw === needle;
            const loose = !exact && (raw.endsWith(needle) || raw.includes(needle));
            if (!exact && !loose) continue;
            const r = el.getBoundingClientRect();
            if (!r || r.width < 2 || r.height < 2) continue;
            const cx = r.left + r.width * 0.5;
            const cy = r.top + r.height * 0.5;
            const dist = Math.hypot(cx - originX, cy - originY);
            const score = dist + (exact ? 0 : 500);
            if (score < bestScore) {
              bestScore = score;
              best = { el, r, raw };
            }
          }
          if (!best) return null;
          const r = best.r;
          return {
            x: r.left + r.width * (best.raw === needle ? 0.5 : 0.72),
            y: r.top + r.height * 0.5,
            width: r.width,
            height: r.height,
            label: (best.el.getAttribute('aria-label') || best.el.textContent || '').trim().slice(0, 80),
          };
        })()`,
          returnByValue: true,
          awaitPromise: false,
        })) as { result?: { value?: { x: number; y: number; width: number; height: number; label: string } | null } }
        const box = evaluated?.result?.value
        if (box && Number.isFinite(box.x) && Number.isFinite(box.y)) {
          point = {
            ...point,
            x: Math.round(box.x),
            y: Math.round(box.y),
          }
          resolvedFromLabel = true
        }
      }

      const pressedButtons = mouseButton === 'right' ? 2 : 1
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x,
        y: point.y,
        button: 'none',
        buttons: 0,
        pointerType: 'mouse',
      })
      await new Promise((resolve) => setTimeout(resolve, 30))
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: mouseButton,
        buttons: pressedButtons,
        clickCount: 1,
        pointerType: 'mouse',
      })
      await new Promise((resolve) => setTimeout(resolve, 55))
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: mouseButton,
        buttons: 0,
        clickCount: 1,
        pointerType: 'mouse',
      })
      return {
        ok: true,
        via: 'chrome.debugger',
        x: point.x,
        y: point.y,
        resolvedFromLabel,
        ariaLabel: label || null,
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        via: 'chrome.debugger',
        x: Math.round(x),
        y: Math.round(y),
        ariaLabel: ariaLabel || null,
        note: 'Permita a permissão debugger ao recarregar a extensão. Banner amarelo é esperado e breve.',
      }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

async function trustedTypeViaDebugger(
  tabId: number,
  text: string,
  x: number,
  y: number,
  ariaLabel?: string | null,
): Promise<Record<string, unknown>> {
  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    try {
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true
      // Banner do debugger empurra o layout — igual ao trustedClick: re-resolver DEPOIS.
      await new Promise((resolve) => setTimeout(resolve, 180))

      let point = { x: Math.round(x), y: Math.round(y) }
      let resolvedFromLabel = false
      let resolveMeta: Record<string, unknown> | null = null
      const label = typeof ariaLabel === 'string' ? ariaLabel.trim() : ''
      // Sempre re-resolver por âncoras do compositor direto (Start + placeholder).
      // top>=140 é só verificação auxiliar — seleção é por proximidade às âncoras.
      {
        const evaluated = (await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: `(() => {
          const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\\p{M}/gu, '').replace(/\\s+/g, ' ').trim();
          const isStart = (n) => n === 'start generation' || n === 'iniciar geracao' || n.endsWith('start generation') || n.endsWith('iniciar geracao');
          const isPlaceholder = (n) => n === 'what do you want to create?' || n === 'o que voce quer criar?';
          const isIngredient = (n) => n === 'add ingredients to the prompt box' || n === 'adicionar elementos a caixa de comando';
          const isAgentInstr = (n) => n.includes('instrucoes para o agente') || n.includes('instructions for the agent');
          const controls = Array.from(document.querySelectorAll('button, [role="button"], [aria-label], [contenteditable="true"], textarea'));
          const startRects = [];
          const placeholderRects = [];
          const ingredientRects = [];
          for (const el of controls) {
            const raw = norm(el.getAttribute('aria-label') || el.textContent || '');
            const r = el.getBoundingClientRect();
            if (!r || r.width < 1 || r.height < 1) continue;
            const box = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
            if (isStart(raw)) startRects.push(box);
            if (isPlaceholder(raw)) placeholderRects.push({ ...box, el });
            if (isIngredient(raw)) ingredientRects.push(box);
          }
          if (startRects.length < 1 && placeholderRects.length < 1 && ingredientRects.length < 1) {
            return { error: 'DIRECT_COMPOSER_ANCHOR_MISSING' };
          }
          const needle = ${JSON.stringify(label.toLowerCase())};
          const editables = Array.from(document.querySelectorAll('[contenteditable="true"], textarea'));
          let best = null;
          let bestScore = Infinity;
          for (const el of editables) {
            const aria = norm(
              el.getAttribute('aria-label') ||
              el.getAttribute('aria-placeholder') ||
              el.getAttribute('data-placeholder') ||
              el.getAttribute('placeholder') ||
              ''
            );
            if (isAgentInstr(aria)) continue;
            const r = el.getBoundingClientRect();
            if (!r || r.width < 2 || r.height < 2) continue;
            let score = 50000;
            for (const ar of startRects) {
              score = Math.min(score, Math.abs(r.bottom - ar.bottom) * 2 + Math.abs(r.right - ar.left));
            }
            for (const ar of ingredientRects) {
              const dist = Math.abs(r.left - ar.left) + Math.abs(r.bottom - ar.top) + Math.abs(r.top - ar.top) * 0.25;
              if (dist < score) score = dist;
            }
            for (const ar of placeholderRects) {
              score = Math.min(score, Math.abs(r.top - ar.top) + Math.abs(r.left - ar.left) + 500);
            }
            if (isPlaceholder(aria) || (needle && (aria === needle || aria.endsWith(needle)))) score -= 8000;
            if (/editable text|texto editavel|project name|nome do projeto/.test(aria)) score += 12000;
            // top é auxiliar (penalidade), não critério exclusivo.
            if (r.top < 160) score += 10000;
            if (score < bestScore) {
              bestScore = score;
              best = { el, r, aria, score };
            }
          }
          if (!best) return { error: 'PROMPT_EDITOR_NOT_FOUND' };
          // Auxiliar: recusar só se ficou no topo E sem âncora Start próxima.
          const nearStart = startRects.some((ar) => Math.abs(best.r.bottom - ar.bottom) < 120);
          if (best.r.top < 140 && !nearStart) {
            return { error: 'PROMPT_EDITOR_TOP_SUSPECT', top: best.r.top, score: best.score };
          }
          try { best.el.focus(); } catch (_) {}
          return {
            x: best.r.left + Math.min(best.r.width * 0.4, 40),
            y: best.r.top + Math.max(best.r.height / 2, 8),
            top: best.r.top,
            score: best.score,
            label: (best.el.getAttribute('aria-label') || best.el.getAttribute('aria-placeholder') || best.aria || '').trim().slice(0, 80),
            anchors: {
              start: startRects.length,
              placeholder: placeholderRects.length,
              ingredients: ingredientRects.length,
              nearStart,
            },
          };
        })()`,
          returnByValue: true,
          awaitPromise: false,
        })) as {
          result?: {
            value?: {
              x?: number
              y?: number
              top?: number
              score?: number
              label?: string
              anchors?: Record<string, unknown>
              error?: string
            } | null
          }
        }
        const box = evaluated?.result?.value
        if (box?.error) {
          return {
            ok: false,
            error: box.error,
            via: 'chrome.debugger',
            x: point.x,
            y: point.y,
            ariaLabel: label || null,
            resolveMeta: box,
            note: 'Após banner do debugger, âncoras do compositor direto não resolveram o editor — não digitar.',
          }
        }
        if (box && Number.isFinite(box.x) && Number.isFinite(box.y)) {
          point = { x: Math.round(box.x!), y: Math.round(box.y!) }
          resolvedFromLabel = true
          resolveMeta = {
            top: box.top,
            score: box.score,
            label: box.label,
            anchors: box.anchors,
          }
        } else {
          return {
            ok: false,
            error: 'TRUSTED_TYPE_COMPOSER_NOT_RESOLVED',
            via: 'chrome.debugger',
            x: point.x,
            y: point.y,
            ariaLabel: label || null,
            note: 'Após banner do debugger, compositor direto não resolvido por âncoras — não digitar (evita Agente).',
          }
        }
      }

      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        pointerType: 'mouse',
      })
      await new Promise((resolve) => setTimeout(resolve, 40))
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: point.x,
        y: point.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
        pointerType: 'mouse',
      })
      await new Promise((resolve) => setTimeout(resolve, 60))
      // Seleciona tudo e substitui pelo texto da tentativa.
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        modifiers: 2,
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
      })
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        modifiers: 2,
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
      })
      await new Promise((resolve) => setTimeout(resolve, 40))
      if (text.length === 0) {
        // Limpar seleção (rascunho vazio no restore do probe).
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Backspace',
          code: 'Backspace',
          windowsVirtualKeyCode: 8,
        })
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Backspace',
          code: 'Backspace',
          windowsVirtualKeyCode: 8,
        })
        return {
          ok: true,
          via: 'chrome.debugger',
          method: 'selectAll+backspace',
          x: point.x,
          y: point.y,
          resolvedFromLabel,
          resolveMeta,
          ariaLabel: label || null,
          cleared: true,
        }
      }
      await chrome.debugger.sendCommand(target, 'Input.insertText', { text })
      return {
        ok: true,
        via: 'chrome.debugger',
        method: 'insertText',
        x: point.x,
        y: point.y,
        resolvedFromLabel,
        resolveMeta,
        ariaLabel: label || null,
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        via: 'chrome.debugger',
        note: 'Falha ao digitar via debugger. Banner amarelo é esperado.',
      }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

async function trustedKeyViaDebugger(
  tabId: number,
  key: string,
): Promise<Record<string, unknown>> {
  return withTabDebuggerLock(tabId, async () => {
    const target = { tabId }
    let attached = false
    const code = key === 'Escape' ? 'Escape' : key
    const windowsVirtualKeyCode = key === 'Escape' ? 27 : 0
    try {
      try {
        await chrome.debugger.attach(target, '1.3')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!/already attached/i.test(msg)) throw error
      }
      attached = true
      await new Promise((resolve) => setTimeout(resolve, 80))
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode,
      })
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode,
      })
      return { ok: true, via: 'chrome.debugger', key }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        key,
      }
    } finally {
      if (attached) {
        try {
          await chrome.debugger.detach(target)
        } catch {
          /* ignore */
        }
      }
    }
  })
}

async function reportFlowProjectDeletedByUser(flowProjectId: string) {
  const id = flowProjectId.trim()
  if (!id) return { ok: false, error: 'PROJECT_NOT_FOUND' }
  const state = await readPairingState()
  if (!state.endpoint || !state.pairingToken) {
    return { ok: false, error: 'HELLO_REQUIRED' }
  }
  const res = await fetch(`${state.endpoint}/api/atlas-flow/v1/projects/removed-on-flow`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.pairingToken}`,
    },
    body: JSON.stringify({ flowProjectId: id }),
  })
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  await appendLog(res.ok ? 'info' : 'error', 'flow project removed by user', {
    flowProjectId: id,
    status: res.status,
    atlasProjectId: body?.atlasProjectId || null,
  })
  return { ok: res.ok, status: res.status, body }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'atlas-flow-v1.flowProjectDeletedByUser') {
    const flowProjectId =
      typeof message.flowProjectId === 'string' ? message.flowProjectId : ''
    void reportFlowProjectDeletedByUser(flowProjectId).then(sendResponse)
    return true
  }
  if (message?.type === 'atlas-flow-v1.fetchMediaBytes') {
    const url = typeof message.payload?.url === 'string' ? message.payload.url : ''
    const tabId = sender.tab?.id
    if (!url || !/^https:\/\//i.test(url)) {
      sendResponse({ ok: false, error: 'FETCH_URL_INVALID' })
      return true
    }
    void fetchMediaBytesViaHostOrDebugger(url, tabId).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.trustedKey') {
    const tabId = sender.tab?.id
    const key = typeof message.payload?.key === 'string' ? message.payload.key : ''
    if (tabId == null || key !== 'Escape') {
      sendResponse({ ok: false, error: 'TRUSTED_KEY_BAD_ARGS' })
      return true
    }
    void trustedKeyViaDebugger(tabId, key).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.trustedClick') {
    const tabId = sender.tab?.id
    const x = Number(message.payload?.x)
    const y = Number(message.payload?.y)
    const ariaLabel =
      typeof message.payload?.ariaLabel === 'string' ? message.payload.ariaLabel : null
    const button =
      message.payload?.button === 'right' || message.payload?.button === 'left'
        ? (message.payload.button as 'left' | 'right')
        : 'left'
    if (tabId == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      sendResponse({ ok: false, error: 'TRUSTED_CLICK_BAD_ARGS', tabId: tabId ?? null, x, y })
      return true
    }
    void trustedClickViaDebugger(tabId, x, y, ariaLabel, button).then(sendResponse)
    return true
  }
  if (message?.type === 'atlas-flow-v1.trustedInsert') {
    const tabId = sender.tab?.id
    const text = typeof message.payload?.text === 'string' ? message.payload.text : ''
    const x = Number(message.payload?.x)
    const y = Number(message.payload?.y)
    if (tabId == null || !text || !Number.isFinite(x) || !Number.isFinite(y)) {
      sendResponse({ ok: false, error: 'TRUSTED_INSERT_BAD_ARGS' })
      return true
    }
    void trustedInsertAt(tabId, x, y, text, message.payload?.enter === true).then(sendResponse)
    return true
  }
  if (message?.type === 'atlas-flow-v1.trustedType') {
    const tabId = sender.tab?.id
    // text pode ser "" (limpar rascunho vazio no probe de restore).
    const text = typeof message.payload?.text === 'string' ? message.payload.text : null
    const x = Number(message.payload?.x)
    const y = Number(message.payload?.y)
    const ariaLabel =
      typeof message.payload?.ariaLabel === 'string' ? message.payload.ariaLabel : null
    if (tabId == null || text == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      sendResponse({ ok: false, error: 'TRUSTED_TYPE_BAD_ARGS', tabId: tabId ?? null })
      return true
    }
    void trustedTypeViaDebugger(tabId, text, x, y, ariaLabel).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.getStatus') {
    void (async () => {
      const state = await readPairingState()
      const logs = await chrome.storage.local.get(['diagnosticLogs'])
      sendResponse({
        namespace: 'atlas-flow-v1',
        realFlowValidated: false,
        installationId: state.installationId,
        paired: state.paired,
        endpoint: state.endpoint || state.preferredEndpoint,
        preferredEndpoint: state.preferredEndpoint,
        connectionState: state.connectionState,
        hasPairingToken: Boolean(state.pairingToken),
        pairingTokenFingerprint: await pairingTokenFingerprint(state.pairingToken),
        // pairingToken omitido de dumps diagnósticos
        lastError: state.lastError,
        lastHealthOk: state.lastHealthOk,
        lastHelloOk: state.lastHelloOk,
        reconnectAttempt: state.reconnectAttempt,
        logs: Array.isArray(logs.diagnosticLogs) ? logs.diagnosticLogs : [],
      })
    })()
    return true
  }

  if (message?.type === 'atlas-flow-v1.runDiagnostics') {
    void runDiagnostics(message.payload).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.claimPairingCode') {
    void claimPairingCode(message.payload || {}).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.disconnect') {
    void disconnectPairing().then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.reconnect') {
    void attemptReconnect('manual').then(async () => {
      const state = await readPairingState()
      sendResponse({
        ok: state.connectionState === 'connected',
        connectionState: state.connectionState,
        endpoint: state.endpoint,
        lastError: state.lastError,
      })
    })
    return true
  }

  if (message?.type === 'atlas-flow-v1.inspectSession') {
    void inspectFlowSession().then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.ensureProject') {
    void ensureProjectFromAtlas(message.payload).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.inspectLinkedProject') {
    void inspectLinkedProject().then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.openUploadUi') {
    void openUploadUiOnLinkedProject().then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.attachTwoReferences') {
    void attachTwoReferencesOnLinkedProject(message.payload).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.reconcileReferences') {
    void reconcileReferencesOnly().then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.attachBoundReferences') {
    void attachBoundReferencesOnlyAction().then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.verifyDirectImageComposer') {
    void (async () => {
      const ctx = await fetchLinkedProjectContext()
      if (!ctx.ok || ctx.tabId == null) {
        sendResponse(contextFailureResponse(ctx as Parameters<typeof contextFailureResponse>[0]))
        return
      }
      const page = (await chrome.tabs.sendMessage(ctx.tabId, {
        type: 'atlas-flow-v1.page.verifyDirectImageComposer',
        payload: { expectedFlowProjectId: ctx.flowProjectId },
      })) as Record<string, unknown>
      sendResponse({
        ok: page.ok === true,
        step: page.step ?? 'verify_direct_image_composer',
        page,
        intent: 'direct_image_generation',
        didGenerate: false,
        generationSendPaused: GENERATION_SEND_PAUSED,
        note: 'Probe CDP no compositor (marcador+restore). Sem Start generation. generationSendPaused permanece.',
      })
    })()
    return true
  }

  if (message?.type === 'atlas-flow-v1.promptAndGenerate') {
    void promptAndGenerateOnlyAction(message.payload).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.observeGenerationResult') {
    void observeGenerationResultAction(message.payload).then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.captureGenerationBytes') {
    void captureGenerationBytesAction().then(sendResponse)
    return true
  }

  if (message?.type === 'atlas-flow-v1.clearLogs') {
    void chrome.storage.local.set({ diagnosticLogs: [] }).then(() => sendResponse({ ok: true }))
    return true
  }

  return false
})

void ensureBoot()
