import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { logger } from '../logging/logger'
import { openInChrome } from '../flow/openInChrome'

type ProjectLinkRecord = {
  id: string
  atlasProjectId: string
  idempotencyKey: string
  commandId: string
  requestedTitle: string
  flowProjectId: string | null
  flowProjectUrl: string | null
  observedTitle: string | null
  linkState: 'pending_create' | 'linked' | 'uncertain' | 'failed'
  submissionCertainty: string
  selector?: unknown
  evidence?: unknown
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

type ReferenceRecord = {
  referenceId: string
  versionId: string
  atlasProjectId: string
  displayName: string
  mimeType: string
  byteSize: number
  sha256: string
  absPath: string
  stagedAt: string
  uploadState: string
  bindingState: string
  attachedState: string
  flowMediaId: string | null
}

/** Porta autoritativa única — sem hop silencioso. */
export const ATLAS_FLOW_V1_PREFERRED_PORT = 39301
export const ATLAS_FLOW_V1_DEFAULT_PORTS = [ATLAS_FLOW_V1_PREFERRED_PORT] as const
export const ATLAS_FLOW_V1_NAMESPACE = 'atlas-flow-v1' as const

type PairingCodeSession = {
  codeHash: string
  codePlainForUi: string
  expiresAt: number
  consumedAt: number | null
  /** Oferta publicada para claim automático pela extensão (sem copiar código). */
  publishedForAutoClaim: boolean
}

/** Estados visíveis na UI de conexão Google Flow. */
export type FlowConnectPhase =
  | 'idle'
  | 'connecting'
  | 'awaiting_login'
  | 'connected'
  | 'browser_unavailable'
  | 'extension_missing'

export type FlowConnectionView = {
  phase: FlowConnectPhase
  label: string
  detail: string | null
  accountLabel: string | null
  sessionUsable: boolean
  loginRequired: boolean
  extensionConnected: boolean
  pairingOfferActive: boolean
  hasPairedInstallation: boolean
  extensionPathHint: string
  endpoint: string | null
  lastInstallationId: string | null
  lastExtensionSeenAt: number | null
  activeExecutorLastSeenAt: string | null
}

type SessionEnsureSummary = {
  sessionUsable: boolean
  loginRequired: boolean
  accountLabel: string | null
  evidenceStatus: string | null
  href: string | null
  observedAt: string | null
  browserUnavailable?: boolean
}

export type CoordinatorListenConfig = {
  host: '127.0.0.1'
  port: number
}

export type CoordinatorServerStatus = {
  running: boolean
  host: '127.0.0.1'
  port: number | null
  protocolNamespace: typeof ATLAS_FLOW_V1_NAMESPACE
  protocolVersion: 1
  /** Token não é exportado em status/diagnóstico — só hasPairingToken. */
  hasPairingToken: boolean
  extensionConnected: boolean
  lastExtensionSeenAt: number | null
  lastInstallationId: string | null
  extensionPathHint: string
  lastError: string | null
  /** Integração Flow real permanece NÃO VALIDADA até evidência na sessão da extensão. */
  realFlowValidated: false
}

type HelloBody = {
  installationId?: unknown
  extensionVersion?: unknown
  protocolVersion?: unknown
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Coordinator atlas-flow-v1 — HTTP em 127.0.0.1 (transporte único).
 * Não reutiliza FlowBridgeServer legado. Sem cookies Google.
 */
export class AtlasFlowCoordinatorServer extends EventEmitter {
  private server: http.Server | null = null
  private port: number | null = null
  private pairingToken: string | null = null
  private lastError: string | null = null
  private lastExtensionSeenAt: number | null = null
  private lastInstallationId: string | null = null
  private lastSessionObservation: unknown | null = null
  private readonly linksByIdempotency = new Map<string, ProjectLinkRecord>()
  private readonly linksByAtlasProject = new Map<string, ProjectLinkRecord>()
  private readonly referencesById = new Map<string, ReferenceRecord>()
  private readonly verifiedReferenceFiles = new Map<
    string,
    { size: number; mtimeMs: number; sha256: string }
  >()
  private readonly referenceBindings = new Map<string, Record<string, unknown>>()
  private readonly extensionPathHint: string
  private pairingCodeSession: PairingCodeSession | null = null
  private connectPhase: FlowConnectPhase = 'idle'
  private connectIntentAt: number | null = null
  private connectMessage: string | null = null
  private sessionSummary: SessionEnsureSummary | null = null
  private hasPairedInstallation = false
  private sessionEnsureQueuedAt: number | null = null

  constructor(extensionPathHint = 'apps/atlas-flow-extension/dist') {
    super()
    this.extensionPathHint = extensionPathHint
    this.on('extension-hello', () => {
      this.hasPairedInstallation = true
      this.persistConnectionState()
      if (this.connectPhase === 'connecting' || this.connectPhase === 'browser_unavailable') {
        if (this.connectPhase === 'browser_unavailable') {
          this.connectPhase = 'connecting'
          this.connectMessage = 'Reconectando e verificando a sessão do Google Flow…'
        }
        void this.queueSessionEnsure('hello')
      } else if (this.connectPhase === 'connected' || this.connectPhase === 'awaiting_login') {
        void this.queueSessionEnsure('hello_refresh')
      } else if (this.connectPhase === 'idle' && this.sessionSummary?.sessionUsable) {
        // Reinício com vínculo prévio: reconfirma sessão sem pedir clique.
        this.connectPhase = 'connecting'
        this.connectMessage = 'Reconectando e verificando a sessão do Google Flow…'
        void this.queueSessionEnsure('auto_reconnect')
      }
    })
  }

  private connectionStatePath(): string {
    return path.join(this.userDataDir(), 'connection-state.json')
  }

  private persistConnectionState(): void {
    try {
      fs.mkdirSync(this.userDataDir(), { recursive: true })
      fs.writeFileSync(
        this.connectionStatePath(),
        `${JSON.stringify(
          {
            phase: this.connectPhase,
            hasPairedInstallation: this.hasPairedInstallation,
            sessionSummary: this.sessionSummary,
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      )
    } catch {
      /* ignore */
    }
  }

  private restoreConnectionState(): void {
    try {
      const filePath = this.connectionStatePath()
      if (!fs.existsSync(filePath)) return
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        phase?: FlowConnectPhase
        hasPairedInstallation?: boolean
        sessionSummary?: SessionEnsureSummary | null
      }
      if (parsed.hasPairedInstallation === true) this.hasPairedInstallation = true
      if (parsed.sessionSummary && typeof parsed.sessionSummary === 'object') {
        this.sessionSummary = parsed.sessionSummary
      }
      if (
        parsed.phase === 'connected' ||
        parsed.phase === 'awaiting_login' ||
        parsed.phase === 'browser_unavailable'
      ) {
        // Após reinício, espera hello da extensão para reconfirmar — não assume conectado.
        this.connectPhase =
          parsed.phase === 'awaiting_login' ? 'awaiting_login' : 'browser_unavailable'
        this.connectMessage =
          'Vínculo preservado. Aguardando o navegador/extensão para reconfirmar a sessão.'
      }
    } catch {
      /* ignore */
    }
  }

  private userDataDir(): string {
    try {
      return path.join(app.getPath('userData'), 'atlas-flow-v1')
    } catch {
      return path.join(process.cwd(), 'docs', 'atlas-flow', '.userdata-fallback')
    }
  }

  private persistentSecretPath(): string {
    return path.join(this.userDataDir(), 'pairing-secret.json')
  }

  private preferredPortPath(): string {
    return path.join(this.userDataDir(), 'preferred-endpoint.json')
  }

  private stagingDir(): string {
    const dir = path.join(process.cwd(), 'docs', 'atlas-flow', 'staging')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  private referencesStorePath(): string {
    return path.join(process.cwd(), 'docs', 'atlas-flow', 'references-store.json')
  }

  private persistReferencesStore(): void {
    const link =
      [...this.linksByAtlasProject.values()].find((item) => item.linkState === 'linked') || null
    const payload = {
      version: 1,
      atlasProjectId: link?.atlasProjectId || null,
      linkedFlowProjectId: link?.flowProjectId || null,
      updatedAt: new Date().toISOString(),
      note: 'Store persistente de referências (sobrevive a restart). Sem pairingToken.',
      references: [...this.referencesById.values()],
    }
    fs.writeFileSync(this.referencesStorePath(), `${JSON.stringify(payload, null, 2)}\n`)
  }

  private bootstrapPersistedReferences(): void {
    const storePath = this.referencesStorePath()
    try {
      if (!fs.existsSync(storePath)) return
      const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as {
        references?: ReferenceRecord[]
      }
      for (const item of parsed.references || []) {
        if (!item?.referenceId || !item?.absPath || !fs.existsSync(item.absPath)) continue
        const stat = fs.statSync(item.absPath)
        if (!stat.isFile() || stat.size <= 0) continue
        const knownSha = typeof item.sha256 === 'string' ? item.sha256 : ''
        const cached = this.verifiedReferenceFiles.get(item.absPath)
        if (
          knownSha &&
          cached &&
          cached.sha256 === knownSha &&
          cached.size === stat.size &&
          cached.mtimeMs === stat.mtimeMs
        ) {
          this.referencesById.set(item.referenceId, { ...item, byteSize: stat.size, sha256: knownSha })
          continue
        }
        if (knownSha && item.byteSize === stat.size) {
          this.verifiedReferenceFiles.set(item.absPath, {
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            sha256: knownSha,
          })
          this.referencesById.set(item.referenceId, { ...item, byteSize: stat.size, sha256: knownSha })
          continue
        }
        const bytes = fs.readFileSync(item.absPath)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        if (item.sha256 && item.sha256 !== sha256) continue
        if (item.byteSize && item.byteSize !== bytes.length) continue
        this.verifiedReferenceFiles.set(item.absPath, {
          size: bytes.length,
          mtimeMs: stat.mtimeMs,
          sha256,
        })
        this.referencesById.set(item.referenceId, { ...item, byteSize: bytes.length, sha256 })
      }
      logger.info('atlas-flow-v1.references.restored', {
        count: this.referencesById.size,
        storePath,
      })
    } catch (error) {
      logger.warn('atlas-flow-v1.references.restore_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  getStatus(): CoordinatorServerStatus {
    const connectedRecently =
      this.lastExtensionSeenAt != null && Date.now() - this.lastExtensionSeenAt < 60_000
    return {
      running: Boolean(this.server && this.port),
      host: '127.0.0.1',
      port: this.port,
      protocolNamespace: ATLAS_FLOW_V1_NAMESPACE,
      protocolVersion: 1,
      hasPairingToken: Boolean(this.pairingToken),
      extensionConnected: connectedRecently,
      lastExtensionSeenAt: this.lastExtensionSeenAt,
      lastInstallationId: this.lastInstallationId,
      extensionPathHint: this.extensionPathHint,
      lastError: this.lastError,
      realFlowValidated: false,
    }
  }

  getLastSessionObservation(): unknown | null {
    return this.lastSessionObservation
  }

  /** Solta o vínculo em memória quando o projeto Atlas deixa de existir. */
  forgetAtlasProject(atlasProjectId: string): void {
    const id = atlasProjectId.trim()
    if (!id) return
    const current = this.linksByAtlasProject.get(id)
    if (current) this.linksByIdempotency.delete(current.idempotencyKey)
    this.linksByAtlasProject.delete(id)
    for (const [key, link] of this.linksByIdempotency) {
      if (link.atlasProjectId === id) this.linksByIdempotency.delete(key)
    }
    for (const [referenceId, reference] of this.referencesById) {
      if (reference.atlasProjectId === id) this.referencesById.delete(referenceId)
    }
    this.persistReferencesStore()
    try {
      const filePath = path.join(process.cwd(), 'docs', 'atlas-flow', 'last-project-link.json')
      if (!fs.existsSync(filePath)) return
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        link?: { atlasProjectId?: string } | null
      }
      if (parsed.link?.atlasProjectId !== id) return
      fs.writeFileSync(
        filePath,
        `${JSON.stringify(
          {
            receivedAt: new Date().toISOString(),
            realFlowValidated: false,
            link: null,
            deletedAtlasProjectId: id,
          },
          null,
          2,
        )}\n`,
      )
    } catch {
      /* o cadastro local já foi arquivado */
    }
  }

  getConnectionView(): FlowConnectionView {
    this.reconcileConnectionPhase()
    const status = this.getStatus()
    const offer = this.getActivePairingOffer()
    const phase = this.connectPhase
    const accountLabel = this.sessionSummary?.accountLabel || null
    const labels: Record<FlowConnectPhase, string> = {
      idle: 'Conectar ao Google Flow',
      connecting: 'Conectando…',
      awaiting_login: 'Conclua o login no navegador',
      connected: accountLabel ? `Flow conectado · ${accountLabel}` : 'Flow conectado',
      browser_unavailable: 'Navegador indisponível',
      extension_missing: 'Instale a extensão Atlas Flow',
    }
    let detail = this.connectMessage
    if (phase === 'awaiting_login') {
      detail =
        'Abra o login oficial do Google no navegador usado pela extensão, conclua as verificações e volte ao Atlas — a verificação continua automaticamente.'
    } else if (phase === 'browser_unavailable') {
      detail =
        'O vínculo com a extensão foi preservado. Abra o Chrome com a extensão Atlas Flow e use Reconectar.'
    } else if (phase === 'extension_missing') {
      detail = `Carregue a extensão em chrome://extensions a partir de ${this.extensionPathHint}, depois toque em Conectar novamente.`
    } else if (phase === 'connecting' && offer) {
      detail =
        'Aguardando a extensão aceitar a autorização local. Não é preciso copiar código nem endpoint.'
    } else if (phase === 'connected' && !accountLabel) {
      detail = 'Sessão utilizável no Flow confirmada. Conta não identificada na página.'
    }
    return {
      phase,
      label: labels[phase],
      detail,
      accountLabel,
      sessionUsable: this.sessionSummary?.sessionUsable === true,
      loginRequired: this.sessionSummary?.loginRequired === true,
      extensionConnected: status.extensionConnected,
      pairingOfferActive: Boolean(offer),
      hasPairedInstallation: this.hasPairedInstallation || Boolean(status.lastInstallationId),
      extensionPathHint: this.extensionPathHint,
      endpoint: status.port ? `http://127.0.0.1:${status.port}` : null,
      lastInstallationId: status.lastInstallationId,
      lastExtensionSeenAt: status.lastExtensionSeenAt,
      activeExecutorLastSeenAt: null,
    }
  }

  private openFlowInChrome(): void {
    void openInChrome('https://flow.google.com/').catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('atlas-flow-v1.connect.chrome_open_failed', { error: message })
      if (!this.connectMessage) this.connectMessage = message
    })
  }

  /**
   * Inicia conexão Google Flow a partir do botão da UI.
   * Reusa pareamento persistente; se necessário, publica oferta temporária para claim automático.
   */
  beginGoogleFlowConnect(): FlowConnectionView {
    if (!this.port || !this.pairingToken) {
      throw new Error('Coordinator não está escutando')
    }
    this.connectIntentAt = Date.now()
    this.connectMessage = null
    this.connectPhase = 'connecting'
    this.persistConnectionState()
    this.openFlowInChrome()

    const status = this.getStatus()
    if (status.extensionConnected) {
      this.hasPairedInstallation = true
      void this.queueSessionEnsure('user_connect')
      this.connectMessage =
        'Extensão já autenticada. Verificando sessão utilizável no Google Flow…'
      this.persistConnectionState()
      return this.getConnectionView()
    }

    // Oferta de uso único no loopback — a extensão reivindica sem o usuário copiar nada.
    this.createPairingCode(5 * 60_000, true)
    this.connectMessage =
      this.hasPairedInstallation || status.lastInstallationId
        ? 'Reconectando à extensão… Se o Chrome estiver fechado, abra-o com a extensão instalada.'
        : 'Publicando autorização temporária para a extensão. Se nada acontecer, instale a extensão Atlas Flow.'
    this.persistConnectionState()
    return this.getConnectionView()
  }

  private getActivePairingOffer(): {
    endpoint: string
    code: string
    expiresAt: string
  } | null {
    const session = this.pairingCodeSession
    if (!session || !session.publishedForAutoClaim || session.consumedAt) return null
    if (Date.now() > session.expiresAt) return null
    if (!this.port) return null
    return {
      endpoint: `http://127.0.0.1:${this.port}`,
      code: session.codePlainForUi,
      expiresAt: new Date(session.expiresAt).toISOString(),
    }
  }

  private async queueSessionEnsure(reason: string): Promise<void> {
    const now = Date.now()
    if (this.sessionEnsureQueuedAt && now - this.sessionEnsureQueuedAt < 8_000) {
      return
    }
    this.sessionEnsureQueuedAt = now
    try {
      const { flowJobService } = await import('./FlowJobService')
      const result = flowJobService.enqueueSessionEnsure()
      logger.info('atlas-flow-v1.session.ensure_queued', {
        reason,
        ok: result.ok,
        commandId: result.commandId ?? null,
        error: result.error ?? null,
      })
      if (!result.ok && result.error === 'NO_EXECUTOR') {
        // Sem hello recente — mantém connecting; oferta de pareamento cobre o caso.
        this.connectPhase = this.connectPhase === 'idle' ? 'connecting' : this.connectPhase
      }
    } catch (error) {
      logger.warn('atlas-flow-v1.session.ensure_queue_failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private reconcileConnectionPhase(): void {
    const status = this.getStatus()
    const offer = this.getActivePairingOffer()
    const intentAge = this.connectIntentAt ? Date.now() - this.connectIntentAt : null

    if (this.sessionSummary?.sessionUsable) {
      this.connectPhase = status.extensionConnected ? 'connected' : 'browser_unavailable'
      return
    }

    if (this.sessionSummary?.loginRequired) {
      this.connectPhase = 'awaiting_login'
      return
    }

    if (this.sessionSummary?.browserUnavailable) {
      this.connectPhase = 'browser_unavailable'
      return
    }

    if (this.connectPhase === 'connecting' || this.connectPhase === 'extension_missing') {
      if (status.extensionConnected) {
        this.connectPhase = 'connecting'
        return
      }
      if (intentAge != null && intentAge > 75_000 && !offer) {
        this.connectPhase =
          this.hasPairedInstallation || status.lastInstallationId
            ? 'browser_unavailable'
            : 'extension_missing'
        return
      }
      if (!status.extensionConnected && (this.hasPairedInstallation || status.lastInstallationId)) {
        // Pareamento existe, mas hello recente sumiu (Chrome fechado).
        if (intentAge == null || intentAge > 20_000) {
          this.connectPhase = 'browser_unavailable'
        }
      }
      return
    }

    if (this.connectPhase === 'connected' && !status.extensionConnected) {
      this.connectPhase = 'browser_unavailable'
      return
    }

    if (this.connectPhase === 'browser_unavailable' && status.extensionConnected) {
      this.connectPhase = this.sessionSummary?.sessionUsable ? 'connected' : 'connecting'
      if (!this.sessionSummary?.sessionUsable) {
        void this.queueSessionEnsure('browser_back')
      }
    }
  }

  private applySessionEnsureFromObservation(payload: unknown): void {
    const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    if (!root) return

    const kind = typeof root.kind === 'string' ? root.kind : null
    const pages = Array.isArray(root.pages) ? root.pages : null
    const firstPage =
      pages && pages[0] && typeof pages[0] === 'object'
        ? (pages[0] as Record<string, unknown>)
        : null
    const observation =
      (root.observation && typeof root.observation === 'object'
        ? (root.observation as Record<string, unknown>)
        : null) ||
      (firstPage?.observation && typeof firstPage.observation === 'object'
        ? (firstPage.observation as Record<string, unknown>)
        : null)

    const evidenceStatus =
      (typeof root.evidenceStatus === 'string' && root.evidenceStatus) ||
      (typeof observation?.evidenceStatus === 'string' && observation.evidenceStatus) ||
      null
    const hints =
      observation?.hints && typeof observation.hints === 'object'
        ? (observation.hints as Record<string, unknown>)
        : null
    const loginRequired =
      root.loginRequired === true ||
      evidenceStatus === 'login_ui_visible' ||
      hints?.signInVisible === true
    const sessionUsable =
      root.sessionUsable === true ||
      (!loginRequired &&
        (evidenceStatus === 'page_observable' || evidenceStatus === 'session_usable') &&
        (kind === 'session_ensure' || Boolean(observation)))
    const accountRaw =
      (typeof root.accountLabel === 'string' && root.accountLabel.trim()) ||
      (typeof observation?.accountLabel === 'string' && observation.accountLabel.trim()) ||
      null
    // Só aceita evidência parecida com e-mail/nome observado — nunca inventa.
    const accountLabel =
      accountRaw && accountRaw.length >= 3 && accountRaw.length <= 120 ? accountRaw : null

    if (root.browserUnavailable === true || root.error === 'BROWSER_UNAVAILABLE') {
      this.sessionSummary = {
        sessionUsable: false,
        loginRequired: false,
        accountLabel: null,
        evidenceStatus,
        href: typeof observation?.href === 'string' ? observation.href : null,
        observedAt: typeof observation?.observedAt === 'string' ? observation.observedAt : null,
        browserUnavailable: true,
      }
      this.connectPhase = 'browser_unavailable'
      return
    }

    if (kind !== 'session_ensure' && !loginRequired && !sessionUsable && !evidenceStatus) {
      return
    }

    this.sessionSummary = {
      sessionUsable: Boolean(sessionUsable) && !loginRequired,
      loginRequired: Boolean(loginRequired),
      accountLabel,
      evidenceStatus,
      href: typeof observation?.href === 'string' ? observation.href : null,
      observedAt:
        (typeof root.inspectedAt === 'string' && root.inspectedAt) ||
        (typeof observation?.observedAt === 'string' && observation.observedAt) ||
        null,
    }

    if (this.sessionSummary.loginRequired) {
      this.connectPhase = 'awaiting_login'
      this.connectMessage =
        'Conclua o login oficial do Google no navegador. O Atlas verifica de novo automaticamente.'
    } else if (this.sessionSummary.sessionUsable) {
      this.connectPhase = 'connected'
      this.connectMessage = accountLabel
        ? null
        : 'Sessão utilizável no Flow confirmada.'
      this.connectIntentAt = null
    }
    this.persistConnectionState()
  }

  /** Registra ref staged no Map HTTP (extensão lista via GET /references). */
  registerStagedReference(record: ReferenceRecord): void {
    this.referencesById.set(record.referenceId, record)
    this.persistReferencesStore()
  }

  /**
   * O apelido mudou e o Flow ainda não confirmou o arquivo.
   * Volta para pendente para o próximo envio usar o nome novo.
   */
  restageReferenceForRename(referenceId: string): void {
    const record = this.referencesById.get(referenceId)
    if (!record) return
    const mediaId = record.flowMediaId || ''
    const bound =
      record.uploadState === 'uploaded_bound' &&
      Boolean(mediaId) &&
      !mediaId.startsWith('_gd')
    if (bound) return
    this.referencesById.set(referenceId, {
      ...record,
      uploadState: 'staged_local',
      bindingState: 'not_bound',
      attachedState: 'not_attached',
      flowMediaId: null,
    })
    this.persistReferencesStore()
  }

  getLinkedAtlasProjectId(): string | null {
    const linked = [...this.linksByAtlasProject.values()].find((item) => item.linkState === 'linked')
    return linked?.atlasProjectId || null
  }

  /** Arquivo diagnóstico local (sem pairingToken). Segredo só em userData (+ espelho docs). */
  private writeLiveConfigFile(): void {
    if (!this.port || !this.pairingToken) return
    this.persistPairingSecret(this.pairingToken)
    this.persistPreferredPort(this.port)
    const publicPayload = {
      namespace: ATLAS_FLOW_V1_NAMESPACE,
      host: '127.0.0.1' as const,
      port: this.port,
      endpoint: `http://127.0.0.1:${this.port}`,
      hasPairingToken: true as const,
      realFlowValidated: false as const,
      writtenAt: new Date().toISOString(),
      note: 'Diagnóstico público. pairingToken NÃO é exportado aqui — vive em userData/atlas-flow-v1/.',
    }
    const targets = [
      path.join(process.cwd(), 'docs', 'atlas-flow', 'coordinator-live.json'),
      path.join(this.userDataDir(), 'coordinator-live.json'),
    ]
    for (const filePath of targets) {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, `${JSON.stringify(publicPayload, null, 2)}\n`, 'utf8')
      } catch (error) {
        logger.warn('atlas-flow-v1.coordinator.live_file_failed', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private persistSessionObservation(payload: unknown): string {
    this.lastSessionObservation = payload
    this.applySessionEnsureFromObservation(payload)
    const dir = path.join(process.cwd(), 'docs', 'atlas-flow')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, 'last-session-observation.json')
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(
        {
          receivedAt: new Date().toISOString(),
          realFlowValidated: false,
          observation: payload,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    // Cópia no userData para builds empacotados
    try {
      const userDir = path.join(app.getPath('userData'), 'atlas-flow-v1')
      fs.mkdirSync(userDir, { recursive: true })
      fs.writeFileSync(path.join(userDir, 'last-session-observation.json'), fs.readFileSync(filePath))
    } catch {
      /* ignore em ambientes sem app pronto */
    }
    return filePath
  }

  private persistProjectLink(link: ProjectLinkRecord): string {
    const dir = path.join(process.cwd(), 'docs', 'atlas-flow')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, 'last-project-link.json')
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(
        {
          receivedAt: new Date().toISOString(),
          realFlowValidated: false,
          link,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    return filePath
  }

  private loadOrCreatePairingToken(): string {
    // 1) Autoridade: userData (fora do repositório)
    try {
      const persistent = this.persistentSecretPath()
      if (fs.existsSync(persistent)) {
        const secret = JSON.parse(fs.readFileSync(persistent, 'utf8')) as {
          pairingToken?: string
        }
        if (typeof secret.pairingToken === 'string' && secret.pairingToken.length >= 32) {
          return secret.pairingToken
        }
      }
    } catch {
      /* ignore */
    }
    // 2) Migração silenciosa do arquivo de desenvolvimento (docs/)
    const legacyPaths = [
      path.join(process.cwd(), 'docs', 'atlas-flow', 'coordinator-pairing.local.json'),
      path.join(this.userDataDir(), 'coordinator-pairing.local.json'),
    ]
    for (const secretPath of legacyPaths) {
      try {
        if (!fs.existsSync(secretPath)) continue
        const secret = JSON.parse(fs.readFileSync(secretPath, 'utf8')) as {
          pairingToken?: string
        }
        if (typeof secret.pairingToken === 'string' && secret.pairingToken.length >= 32) {
          this.persistPairingSecret(secret.pairingToken)
          logger.info('atlas-flow-v1.pairing.migrated_to_userdata', { from: secretPath })
          return secret.pairingToken
        }
      } catch {
        /* ignore */
      }
    }
    const generated = randomBytes(24).toString('hex')
    this.persistPairingSecret(generated)
    return generated
  }

  private persistPairingSecret(pairingToken: string): void {
    const dir = this.userDataDir()
    fs.mkdirSync(dir, { recursive: true })
    const payload = {
      pairingToken,
      endpoint: this.port
        ? `http://127.0.0.1:${this.port}`
        : `http://127.0.0.1:${ATLAS_FLOW_V1_PREFERRED_PORT}`,
      writtenAt: new Date().toISOString(),
      note: 'Segredo local em userData. Não anexar em issues/chats/renderer.',
    }
    fs.writeFileSync(this.persistentSecretPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    // Espelho de desenvolvimento (docs/) — só para diagnóstico local; token não vai ao renderer.
    try {
      const docsDir = path.join(process.cwd(), 'docs', 'atlas-flow')
      fs.mkdirSync(docsDir, { recursive: true })
      fs.writeFileSync(
        path.join(docsDir, 'coordinator-pairing.local.json'),
        `${JSON.stringify(payload, null, 2)}\n`,
        'utf8',
      )
    } catch {
      /* ignore */
    }
  }

  private loadPreferredPort(): number {
    // Porta autoritativa fixa — ignora 39305/legado gravado em preferred-endpoint.
    // A extensão unpaired descobre o Atlas em PREFERRED_LOOPBACK (39301).
    try {
      const filePath = this.preferredPortPath()
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { port?: number }
        if (
          typeof parsed.port === 'number' &&
          parsed.port > 0 &&
          parsed.port !== ATLAS_FLOW_V1_PREFERRED_PORT
        ) {
          logger.warn('atlas-flow-v1.coordinator.preferred_port_reset', {
            from: parsed.port,
            to: ATLAS_FLOW_V1_PREFERRED_PORT,
          })
        }
      }
    } catch {
      /* ignore */
    }
    return ATLAS_FLOW_V1_PREFERRED_PORT
  }

  private persistPreferredPort(port: number): void {
    try {
      fs.mkdirSync(this.userDataDir(), { recursive: true })
      fs.writeFileSync(
        this.preferredPortPath(),
        `${JSON.stringify(
          {
            host: '127.0.0.1',
            port,
            endpoint: `http://127.0.0.1:${port}`,
            writtenAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      )
    } catch {
      /* ignore */
    }
  }

  /** Código de uso único (não é o token permanente). publishedForAutoClaim = oferta para a extensão. */
  createPairingCode(
    ttlMs = 5 * 60_000,
    publishedForAutoClaim = false,
  ): {
    ok: true
    code: string
    endpoint: string
    expiresAt: string
  } {
    if (!this.port || !this.pairingToken) {
      throw new Error('Coordinator não está escutando')
    }
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    const bytes = randomBytes(6)
    for (let i = 0; i < 6; i += 1) code += alphabet[bytes[i]! % alphabet.length]
    const codeHash = createHash('sha256').update(code).digest('hex')
    this.pairingCodeSession = {
      codeHash,
      codePlainForUi: code,
      expiresAt: Date.now() + ttlMs,
      consumedAt: null,
      publishedForAutoClaim,
    }
    return {
      ok: true,
      code,
      endpoint: `http://127.0.0.1:${this.port}`,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    }
  }

  private consumePairingCode(code: string): boolean {
    const session = this.pairingCodeSession
    if (!session || session.consumedAt) return false
    if (Date.now() > session.expiresAt) return false
    const incoming = createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex')
    const left = Buffer.from(incoming)
    const right = Buffer.from(session.codeHash)
    if (left.length !== right.length || !timingSafeEqual(left, right)) return false
    session.consumedAt = Date.now()
    this.pairingCodeSession = session
    return true
  }

  private bootstrapPersistedProjectLink(): void {
    const linkPath = path.join(process.cwd(), 'docs', 'atlas-flow', 'last-project-link.json')
    try {
      if (!fs.existsSync(linkPath)) return
      const parsed = JSON.parse(fs.readFileSync(linkPath, 'utf8')) as {
        link?: ProjectLinkRecord
      }
      const link = parsed.link
      if (!link?.atlasProjectId || !link?.idempotencyKey) return
      if (link.linkState === 'linked' && link.flowProjectId) {
        this.linksByIdempotency.set(link.idempotencyKey, link)
        this.linksByAtlasProject.set(link.atlasProjectId, link)
        void import('./FlowJobService')
          .then(({ flowJobService }) => {
            flowJobService.bootstrapFromDiskLink({
              id: link.id,
              atlasProjectId: link.atlasProjectId,
              flowProjectId: link.flowProjectId,
              flowProjectUrl: link.flowProjectUrl,
              linkState: link.linkState,
              requestedTitle: link.requestedTitle,
              observedTitle: link.observedTitle,
            })
            flowJobService.reconcileInterruptedAttempts()
          })
          .catch((error) => {
            logger.warn('atlas-flow-v1.jobs.bootstrap_failed', {
              error: error instanceof Error ? error.message : String(error),
            })
          })
        logger.info('atlas-flow-v1.project_link.restored', {
          flowProjectId: link.flowProjectId,
          atlasProjectId: link.atlasProjectId,
        })
      }
    } catch (error) {
      logger.warn('atlas-flow-v1.project_link.restore_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async start(ports: readonly number[] = ATLAS_FLOW_V1_DEFAULT_PORTS): Promise<CoordinatorServerStatus> {
    if (this.server && this.port && this.pairingToken) return this.getStatus()

    this.pairingToken = this.loadOrCreatePairingToken()
    this.lastError = null
    this.restoreConnectionState()
    this.bootstrapPersistedReferences()
    this.bootstrapPersistedProjectLink()
    try {
      const { atlasFlowReferenceStore } = await import('./atlasFlowReferenceStore')
      atlasFlowReferenceStore.migrateJsonMirrorIfNeeded()
    } catch (error) {
      logger.warn('atlas-flow-v1.references.sqlite_migrate_skipped', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const preferred = this.loadPreferredPort()
    const candidates = ports.includes(preferred as (typeof ports)[number])
      ? ports
      : ([preferred] as unknown as typeof ports)

    // Uma única porta autoritativa. Sem hop silencioso para outra instância.
    const candidate = candidates[0] ?? preferred
    try {
      await this.listen(candidate)
      this.writeLiveConfigFile()
      logger.info('atlas-flow-v1.coordinator.started', { port: candidate, host: '127.0.0.1' })
      return this.getStatus()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code === 'EADDRINUSE') {
        this.lastError = `Porta ${candidate} ocupada em 127.0.0.1. Feche a outra instância do Coordinator; não há troca silenciosa de porta.`
        throw new Error(this.lastError)
      }
      this.lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.port = null
    this.pairingToken = null
    this.lastExtensionSeenAt = null
    this.lastInstallationId = null
    if (!server) return
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  private authorize(req: http.IncomingMessage): boolean {
    if (!this.pairingToken) return false
    const header = req.headers.authorization?.trim() ?? ''
    if (header.toLowerCase().startsWith('bearer ')) {
      return safeEqual(header.slice(7).trim(), this.pairingToken)
    }
    return false
  }

  private validateHost(req: http.IncomingMessage): boolean {
    const host = (req.headers.host ?? '').split(':')[0]?.toLowerCase() ?? ''
    return host === '127.0.0.1' || host === 'localhost'
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handle(req, res)
      })

      const onError = (error: Error) => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        this.server = server
        this.port = port
        resolve()
      }

      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      if (!this.validateHost(req)) {
        sendJson(res, 403, { error: 'HOST_FORBIDDEN', message: 'Só 127.0.0.1/localhost.' })
        return
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': 'null',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
        res.end()
        return
      }

      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const pathname = url.pathname

      if (req.method === 'GET' && pathname === '/api/atlas-flow/v1/health') {
        const status = this.getStatus()
        sendJson(res, 200, {
          ok: true,
          namespace: status.protocolNamespace,
          protocolVersion: status.protocolVersion,
          host: status.host,
          port: status.port,
          realFlowValidated: false,
          extensionConnected: status.extensionConnected,
          // token NÃO entra no health público
        })
        return
      }

      // Oferta temporária publicada pelo botão "Conectar" — só loopback + Host validado.
      if (req.method === 'GET' && pathname === '/api/atlas-flow/v1/pairing/pending') {
        const offer = this.getActivePairingOffer()
        if (!offer) {
          sendJson(res, 200, {
            ok: true,
            active: false,
            endpoint: this.port ? `http://127.0.0.1:${this.port}` : null,
          })
          return
        }
        sendJson(res, 200, {
          ok: true,
          active: true,
          endpoint: offer.endpoint,
          code: offer.code,
          expiresAt: offer.expiresAt,
          note: 'Autorização temporária de uso único. Claim com installationId.',
        })
        return
      }

      // Claim de código de uso único — público no loopback; devolve token permanente uma vez.
      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/pairing/claim') {
        const body = (await readJson(req)) as Record<string, unknown> | null
        const code = typeof body?.code === 'string' ? body.code.trim() : ''
        const installationId =
          typeof body?.installationId === 'string' ? body.installationId.trim() : ''
        if (!code || !installationId) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'code e installationId obrigatórios' })
          return
        }
        if (!this.pairingToken || !this.port) {
          sendJson(res, 503, { error: 'COORDINATOR_NOT_READY' })
          return
        }
        if (!this.consumePairingCode(code)) {
          sendJson(res, 401, {
            error: 'PAIRING_CODE_INVALID',
            message: 'Código inválido, expirado ou já usado.',
          })
          return
        }
        try {
          const { flowJobService } = await import('./FlowJobService')
          flowJobService.ensureInstallation(
            installationId,
            typeof body?.extensionVersion === 'string' ? body.extensionVersion : undefined,
          )
        } catch {
          /* ignore */
        }
        this.lastInstallationId = installationId
        this.lastExtensionSeenAt = Date.now()
        this.hasPairedInstallation = true
        if (this.connectPhase === 'idle' || this.connectPhase === 'connecting' || this.connectPhase === 'extension_missing') {
          this.connectPhase = 'connecting'
          this.connectMessage = 'Extensão pareada. Verificando sessão no Google Flow…'
        }
        void this.queueSessionEnsure('pairing_claim')
        sendJson(res, 200, {
          ok: true,
          pairingToken: this.pairingToken,
          endpoint: `http://127.0.0.1:${this.port}`,
          installationId,
          note: 'Token permanente entregue uma vez. Não reexibir o código.',
        })
        return
      }

      if (!this.authorize(req)) {
        sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Bearer pairing token obrigatório.' })
        return
      }

      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/executors/hello') {
        const body = (await readJson(req)) as HelloBody
        const installationId =
          typeof body?.installationId === 'string' ? body.installationId.trim() : ''
        if (!installationId || installationId.length > 80) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'installationId inválido.' })
          return
        }
        this.lastInstallationId = installationId
        this.lastExtensionSeenAt = Date.now()
        try {
          const { flowJobService } = await import('./FlowJobService')
          flowJobService.ensureInstallation(
            installationId,
            typeof body.extensionVersion === 'string' ? body.extensionVersion : undefined,
          )
        } catch (error) {
          logger.warn('atlas-flow-v1.installation.ensure_failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
        this.emit('extension-hello', {
          installationId,
          extensionVersion:
            typeof body.extensionVersion === 'string' ? body.extensionVersion : null,
          at: this.lastExtensionSeenAt,
        })
        sendJson(res, 200, {
          ok: true,
          namespace: ATLAS_FLOW_V1_NAMESPACE,
          protocolVersion: 1,
          realFlowValidated: false,
          acknowledgedInstallationId: installationId,
          serverTime: new Date().toISOString(),
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/executors/heartbeat') {
        const body = (await readJson(req)) as HelloBody
        const installationId =
          typeof body?.installationId === 'string' ? body.installationId.trim() : ''
        if (!installationId) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'installationId inválido.' })
          return
        }
        this.lastInstallationId = installationId
        this.lastExtensionSeenAt = Date.now()
        try {
          const { flowJobService } = await import('./FlowJobService')
          flowJobService.ensureInstallation(installationId)
        } catch {
          /* ignore */
        }
        sendJson(res, 200, { ok: true, serverTime: new Date().toISOString(), realFlowValidated: false })
        return
      }

      if (req.method === 'GET' && pathname === '/api/atlas-flow/v1/commands/claim') {
        const installationId =
          typeof req.headers['x-atlas-installation-id'] === 'string'
            ? req.headers['x-atlas-installation-id'].trim()
            : this.lastInstallationId || ''
        if (!installationId) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'installationId obrigatório' })
          return
        }
        this.lastInstallationId = installationId
        this.lastExtensionSeenAt = Date.now()
        const { flowJobService } = await import('./FlowJobService')
        flowJobService.ensureInstallation(installationId)
        const rawWait = Number(url.searchParams.get('waitMs') || 0)
        const waitMs = Number.isFinite(rawWait) ? Math.max(0, Math.min(12_000, Math.floor(rawWait))) : 0
        let dropped = false
        res.on('close', () => {
          dropped = true
        })
        const command = await flowJobService.waitForQueuedCommand(
          installationId,
          waitMs,
          () => dropped,
        )
        if (dropped || res.writableEnded) return
        sendJson(res, 200, {
          ok: true,
          command,
          realFlowValidated: false,
        })
        return
      }

      if (
        req.method === 'POST' &&
        pathname.startsWith('/api/atlas-flow/v1/commands/') &&
        pathname.endsWith('/events')
      ) {
        const commandId = pathname.split('/')[5] || ''
        const body = (await readJson(req)) as Record<string, unknown> | null
        const installationId =
          typeof body?.installationId === 'string'
            ? body.installationId.trim()
            : this.lastInstallationId || ''
        if (!commandId || !installationId) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID' })
          return
        }
        this.lastExtensionSeenAt = Date.now()
        const { flowJobService } = await import('./FlowJobService')
        const appended = flowJobService.appendCommandEvent({
          commandId,
          installationId,
          eventType: typeof body?.eventType === 'string' ? body.eventType : 'progress',
          payload: (body?.payload as Record<string, unknown>) || {},
          attemptId: typeof body?.attemptId === 'string' ? body.attemptId : null,
        })
        sendJson(res, 200, {
          ok: true,
          canceled: appended.canceled === true,
          realFlowValidated: false,
        })
        return
      }

      if (
        req.method === 'POST' &&
        pathname.startsWith('/api/atlas-flow/v1/commands/') &&
        pathname.endsWith('/complete')
      ) {
        const commandId = pathname.split('/')[5] || ''
        const body = (await readJson(req)) as Record<string, unknown> | null
        const installationId =
          typeof body?.installationId === 'string'
            ? body.installationId.trim()
            : this.lastInstallationId || ''
        if (!commandId || !installationId) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID' })
          return
        }
        this.lastExtensionSeenAt = Date.now()
        const { flowJobService } = await import('./FlowJobService')
        flowJobService.completeCommand({
          commandId,
          installationId,
          ok: body?.ok === true,
          attemptState: typeof body?.attemptState === 'string' ? body.attemptState : undefined,
          submissionCertainty:
            typeof body?.submissionCertainty === 'string' ? body.submissionCertainty : undefined,
          failureCode: typeof body?.failureCode === 'string' ? body.failureCode : null,
          resultDigest: typeof body?.resultDigest === 'string' ? body.resultDigest : null,
          retrievedCount:
            typeof body?.retrievedCount === 'number' ? body.retrievedCount : undefined,
          detail:
            body?.detail && typeof body.detail === 'object'
              ? (body.detail as Record<string, unknown>)
              : null,
        })
        sendJson(res, 200, { ok: true, realFlowValidated: body?.ok === true })
        return
      }

      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/session/observations') {
        const body = await readJson(req)
        this.lastExtensionSeenAt = Date.now()
        const filePath = this.persistSessionObservation(body)
        logger.info('atlas-flow-v1.session.observation', { filePath })
        sendJson(res, 200, {
          ok: true,
          stored: true,
          filePath,
          realFlowValidated: false,
          note: 'Observação recebida. Não valida geração nem conta oficial.',
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/atlas-flow/v1/session/observations/latest') {
        sendJson(res, 200, {
          ok: true,
          observation: this.lastSessionObservation,
          realFlowValidated: false,
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/projects/ensure') {
        const body = (await readJson(req)) as Record<string, unknown> | null
        const atlasProjectId =
          typeof body?.atlasProjectId === 'string' ? body.atlasProjectId.trim() : ''
        const idempotencyKey =
          (typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '') ||
          (typeof req.headers['idempotency-key'] === 'string'
            ? req.headers['idempotency-key'].trim()
            : '')
        const requestedTitle =
          typeof body?.requestedTitle === 'string' && body.requestedTitle.trim()
            ? body.requestedTitle.trim()
            : 'Atlas Flow project'
        if (!atlasProjectId || !idempotencyKey) {
          sendJson(res, 400, {
            error: 'SCHEMA_INVALID',
            message: 'atlasProjectId e idempotencyKey obrigatórios',
          })
          return
        }

        const existing =
          this.linksByIdempotency.get(idempotencyKey) ||
          this.linksByAtlasProject.get(atlasProjectId) ||
          null

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

        // Incerto COM flowProjectId → reuse. SEM id → permite novo create (ex.: canal fechou).
        if (existing?.linkState === 'uncertain' && existing.flowProjectId) {
          existing.linkState = 'linked'
          existing.submissionCertainty = 'accepted'
          existing.updatedAt = new Date().toISOString()
          this.linksByIdempotency.set(idempotencyKey, existing)
          this.linksByAtlasProject.set(atlasProjectId, existing)
          this.persistProjectLink(existing)
          sendJson(res, 200, {
            ok: true,
            action: 'reuse',
            commandId: existing.commandId,
            link: existing,
            realFlowValidated: false,
            note: 'Ensure incerto mas com flowProjectId — reutiliza sem novo clique.',
          })
          return
        }

        if (existing?.linkState === 'uncertain' && !existing.flowProjectId) {
          logger.info('atlas-flow-v1.project_ensure.retry_uncertain_without_id', {
            atlasProjectId,
            idempotencyKey,
            lastError: existing.lastError,
          })
          // Cai no create abaixo reusando o mesmo registro.
        }

        // Falha anterior sem projeto: permite novo create no mesmo registro.
        const commandId =
          existing && !existing.flowProjectId ? existing.commandId || randomUUID() : randomUUID()
        const pending: ProjectLinkRecord = {
          id: existing?.id || randomUUID(),
          atlasProjectId,
          idempotencyKey,
          commandId,
          requestedTitle,
          flowProjectId: null,
          flowProjectUrl: null,
          observedTitle: null,
          linkState: 'pending_create',
          submissionCertainty: 'not_sent',
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: null,
        }
        this.linksByIdempotency.set(idempotencyKey, pending)
        this.linksByAtlasProject.set(atlasProjectId, pending)
        this.persistProjectLink(pending)
        this.lastExtensionSeenAt = Date.now()
        sendJson(res, 200, {
          ok: true,
          action: 'create',
          commandId,
          link: pending,
          realFlowValidated: false,
        })
        return
      }

      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/projects/ensure/complete') {
        const body = (await readJson(req)) as Record<string, unknown> | null
        const atlasProjectId =
          typeof body?.atlasProjectId === 'string' ? body.atlasProjectId.trim() : ''
        const idempotencyKey =
          (typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '') ||
          (typeof req.headers['idempotency-key'] === 'string'
            ? req.headers['idempotency-key'].trim()
            : '')
        const pageResult = (body?.pageResult || {}) as Record<string, unknown>
        const existing =
          this.linksByIdempotency.get(idempotencyKey) ||
          this.linksByAtlasProject.get(atlasProjectId) ||
          null
        if (!existing) {
          sendJson(res, 404, { error: 'LINK_NOT_FOUND' })
          return
        }

        const certainty = String(pageResult.certainty || 'not_sent')
        if (pageResult.ok === true && pageResult.flowProjectId && certainty === 'accepted') {
          existing.linkState = 'linked'
          existing.submissionCertainty = 'accepted'
          existing.flowProjectId = String(pageResult.flowProjectId)
          existing.flowProjectUrl =
            typeof pageResult.flowProjectUrl === 'string'
              ? pageResult.flowProjectUrl
              : `https://flow.google.com/project/${pageResult.flowProjectId}`
          existing.observedTitle =
            typeof pageResult.observedTitle === 'string' ? pageResult.observedTitle : null
          existing.selector = pageResult.selector
          existing.evidence = pageResult.evidence
          existing.lastError = null
          existing.updatedAt = new Date().toISOString()
          this.linksByIdempotency.set(idempotencyKey, existing)
          this.linksByAtlasProject.set(atlasProjectId, existing)
          const filePath = this.persistProjectLink(existing)
          // Bancada/SQLite precisa do mesmo vínculo; senão Gerar → PROJECT_NOT_LINKED.
          try {
            const { flowJobService } = await import('./FlowJobService')
            flowJobService.bootstrapFromDiskLink({
              id: existing.id,
              atlasProjectId: existing.atlasProjectId,
              flowProjectId: existing.flowProjectId,
              flowProjectUrl: existing.flowProjectUrl,
              linkState: existing.linkState,
              requestedTitle: existing.requestedTitle,
              observedTitle: existing.observedTitle,
            })
          } catch (error) {
            logger.warn('atlas-flow-v1.project_link.sqlite_sync_failed', {
              atlasProjectId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
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
          existing.lastError = String(pageResult.error || 'SUBMISSION_UNCERTAIN')
          existing.evidence = pageResult.evidence
          existing.updatedAt = new Date().toISOString()
          this.linksByIdempotency.set(idempotencyKey, existing)
          this.linksByAtlasProject.set(atlasProjectId, existing)
          const filePath = this.persistProjectLink(existing)
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
        existing.lastError = String(pageResult.error || 'ENSURE_FAILED')
        existing.updatedAt = new Date().toISOString()
        this.linksByIdempotency.set(idempotencyKey, existing)
        this.linksByAtlasProject.set(atlasProjectId, existing)
        const filePath = this.persistProjectLink(existing)
        sendJson(res, 200, {
          ok: false,
          action: 'failed',
          link: existing,
          filePath,
          realFlowValidated: false,
        })
        return
      }

      // Staging de referência (bytes + sha256). Ainda NÃO é binding Flow.
      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/references/stage') {
        const body = (await readJson(req)) as Record<string, unknown> | null
        const atlasProjectId =
          typeof body?.atlasProjectId === 'string' ? body.atlasProjectId.trim() : ''
        const displayName =
          typeof body?.displayName === 'string' && body.displayName.trim()
            ? body.displayName.trim()
            : 'reference'
        const mimeType =
          typeof body?.mimeType === 'string' ? body.mimeType : 'application/octet-stream'
        const base64 = typeof body?.base64 === 'string' ? body.base64 : ''
        if (!atlasProjectId || !base64) {
          sendJson(res, 400, {
            error: 'SCHEMA_INVALID',
            message: 'atlasProjectId e base64 obrigatórios',
          })
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
        const absPath = path.join(this.stagingDir(), `${versionId}.bin`)
        fs.writeFileSync(absPath, bytes)
        const record: ReferenceRecord = {
          referenceId,
          versionId,
          atlasProjectId,
          displayName,
          mimeType,
          byteSize: bytes.length,
          sha256,
          absPath,
          stagedAt: new Date().toISOString(),
          uploadState: 'staged_local',
          bindingState: 'not_bound',
          attachedState: 'not_attached',
          flowMediaId: null,
        }
        this.referencesById.set(referenceId, record)
        this.persistReferencesStore()
        const filePath = path.join(process.cwd(), 'docs', 'atlas-flow', 'last-reference-stage.json')
        fs.writeFileSync(
          filePath,
          `${JSON.stringify({ receivedAt: new Date().toISOString(), realFlowValidated: false, reference: record }, null, 2)}\n`,
        )
        sendJson(res, 200, {
          ok: true,
          reference: { ...record, absPath: undefined, stagingPath: absPath },
          distinctions: {
            staged_local: 'arquivo no Atlas',
            uploaded_bound: 'identidade no Flow',
            attached: 'selecionado no draft da geração',
          },
          realFlowValidated: false,
        })
        return
      }

      if (
        req.method === 'GET' &&
        pathname.startsWith('/api/atlas-flow/v1/references/') &&
        pathname.endsWith('/bytes')
      ) {
        const referenceId = pathname.split('/')[5] || ''
        let record = this.referencesById.get(referenceId)
        if (!record || !fs.existsSync(record.absPath || '')) {
          this.bootstrapPersistedReferences()
          record = this.referencesById.get(referenceId)
        }
        if ((!record || !fs.existsSync(record.absPath || '')) && referenceId) {
          try {
            const storePath = this.referencesStorePath()
            if (fs.existsSync(storePath)) {
              const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as {
                references?: ReferenceRecord[]
              }
              const hit = (parsed.references || []).find((item) => item.referenceId === referenceId)
              if (hit?.absPath && fs.existsSync(hit.absPath)) {
                this.referencesById.set(referenceId, hit)
                record = hit
              }
            }
          } catch {
            /* ignore */
          }
        }
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

      if (req.method === 'GET' && pathname === '/api/atlas-flow/v1/references') {
        // Sempre rehidrata do espelho (merge); não só quando o Map está vazio.
        this.bootstrapPersistedReferences()
        const atlasProjectId = String(url.searchParams.get('atlasProjectId') || '').trim()
        if (atlasProjectId) {
          try {
            const { atlasFlowReferenceStore } = await import('./atlasFlowReferenceStore')
            for (const rec of atlasFlowReferenceStore.listByAtlasProject(atlasProjectId)) {
              if (!rec.referenceId || !rec.absPath || !fs.existsSync(rec.absPath)) continue
              const existing = this.referencesById.get(rec.referenceId)
              if (existing) {
                const existingRanked =
                  existing.uploadState === 'uploaded_bound' ||
                  existing.uploadState === 'character_ready' ||
                  existing.uploadState === 'upload_uncertain'
                this.referencesById.set(rec.referenceId, {
                  ...rec,
                  uploadState: existingRanked
                    ? existing.uploadState
                    : rec.uploadState || existing.uploadState,
                  bindingState: existingRanked
                    ? existing.bindingState
                    : rec.bindingState || existing.bindingState,
                  attachedState:
                    existing.attachedState === 'attached'
                      ? 'attached'
                      : rec.attachedState || existing.attachedState,
                  flowMediaId: existing.flowMediaId || rec.flowMediaId,
                })
              } else {
                this.referencesById.set(rec.referenceId, rec)
              }
            }
          } catch (error) {
            logger.warn('atlas-flow-v1.references.sqlite_hydrate_failed', {
              atlasProjectId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
        const linked =
          (atlasProjectId && this.linksByAtlasProject.get(atlasProjectId)) ||
          [...this.linksByAtlasProject.values()].find((item) => item.linkState === 'linked') ||
          null
        const all = [...this.referencesById.values()]
        const items = atlasProjectId
          ? all.filter((item) => item.atlasProjectId === atlasProjectId)
          : all
        let aliasById = new Map<string, string>()
        const roleById = new Map<string, boolean>()
        try {
          const { getDb } = await import('../../db/database')
          const db = getDb()
          let rows: Array<{
            id: string
            alias_normalized: string
            use_as_character?: number | null
          }>
          try {
            rows = db
              .prepare(
                `SELECT id, alias_normalized, use_as_character FROM flow_references WHERE archived_at IS NULL`,
              )
              .all() as Array<{
              id: string
              alias_normalized: string
              use_as_character: number | null
            }>
          } catch {
            rows = db
              .prepare(
                `SELECT id, alias_normalized FROM flow_references WHERE archived_at IS NULL`,
              )
              .all() as Array<{ id: string; alias_normalized: string }>
          }
          aliasById = new Map(
            rows.map((row) => [row.id, String(row.alias_normalized || '').trim()]),
          )
          for (const row of rows) {
            const alias = String(row.alias_normalized || '').trim().toLowerCase()
            roleById.set(
              row.id,
              row.use_as_character == null ? alias === 'cantor' : Number(row.use_as_character) === 1,
            )
          }
        } catch {
          /* a lista segue com o nome do arquivo se o apelido não estiver no banco */
        }
        sendJson(res, 200, {
          ok: true,
          atlasProjectId: atlasProjectId || null,
          linkedFlowProjectId: linked?.flowProjectId || null,
          storePath: this.referencesStorePath(),
          memoryCount: this.referencesById.size,
          references: items.map((item) => ({
            referenceId: item.referenceId,
            versionId: item.versionId,
            displayName: item.displayName,
            alias: aliasById.get(item.referenceId) || null,
            useAsCharacter: roleById.get(item.referenceId) === true,
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

      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/references/bindings') {
        const body = (await readJson(req)) as Record<string, unknown> | null
        const referenceId = typeof body?.referenceId === 'string' ? body.referenceId.trim() : ''
        const record = this.referencesById.get(referenceId)
        if (!record) {
          sendJson(res, 404, { error: 'REFERENCE_NOT_FOUND' })
          return
        }
        const binding = {
          id: randomUUID(),
          referenceId,
          versionId: record.versionId,
          atlasProjectId: record.atlasProjectId,
          flowProjectId: body?.flowProjectId || null,
          flowMediaId: body?.flowMediaId || null,
          bindingState: body?.bindingState || 'unknown',
          attachedState: body?.attachedState || 'not_attached',
          evidence: body?.evidence || null,
          sha256: record.sha256,
          updatedAt: new Date().toISOString(),
        }
        const incomingMediaId =
          typeof binding.flowMediaId === 'string' ? binding.flowMediaId.trim() : ''
        const mediaIdLegitimate =
          incomingMediaId.length > 0 &&
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
        } else if (binding.bindingState === 'character_ready') {
          record.uploadState = 'character_ready'
          record.bindingState = 'character_ready'
          record.attachedState = 'attached'
          record.flowMediaId = mediaIdLegitimate ? incomingMediaId : record.flowMediaId || null
          binding.flowMediaId = record.flowMediaId
        } else if (binding.bindingState === 'upload_uncertain_needs_reconcile') {
          record.uploadState = 'upload_uncertain'
          record.bindingState = 'upload_uncertain_needs_reconcile'
          // Invalida _gd / IDs ilegítimos — binding e reference alinhados.
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
        this.referenceBindings.set(String(binding.id), binding)
        this.referencesById.set(referenceId, { ...record })
        this.persistReferencesStore()
        try {
          const linkedProject = this.linksByAtlasProject.get(record.atlasProjectId)
          if (linkedProject?.id) {
            const { atlasFlowReferenceStore } = await import('./atlasFlowReferenceStore')
            atlasFlowReferenceStore.upsertBinding({
              referenceId,
              projectLinkId: linkedProject.id,
              flowMediaId: record.flowMediaId || null,
              bindingState: record.bindingState,
              attachedState: record.attachedState,
            })
          }
        } catch {
          /* ignore SQLite sync error in standalone mode */
        }
        const confirmedReference = { ...(this.referencesById.get(referenceId) || record) }
        const filePath = path.join(process.cwd(), 'docs', 'atlas-flow', 'last-reference-binding.json')
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

      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/projects/removed-on-flow') {
        if (!this.authorize(req)) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' })
          return
        }
        const body = (await readJson(req)) as Record<string, unknown> | null
        const flowProjectId =
          typeof body?.flowProjectId === 'string' ? body.flowProjectId.trim() : ''
        if (!flowProjectId) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'flowProjectId obrigatório' })
          return
        }
        const { flowJobService } = await import('./FlowJobService')
        const { removeAtlasProject } = await import('./removeAtlasProject')
        const atlasProjectId = flowJobService.getAtlasProjectIdByFlowProject(flowProjectId)
        if (!atlasProjectId) {
          sendJson(res, 200, { ok: true, removed: false, alreadyGone: true })
          return
        }
        const result = await removeAtlasProject(atlasProjectId, { skipFlow: true })
        sendJson(res, 200, {
          ok: result.removed,
          atlasProjectId,
          flowProjectId,
          removed: result.removed,
        })
        return
      }

      if (req.method === 'GET' && pathname === '/api/atlas-flow/v1/projects/links/latest') {
        const atlasProjectId = url.searchParams.get('atlasProjectId')?.trim() || ''
        let latest = atlasProjectId
          ? this.linksByAtlasProject.get(atlasProjectId) || null
          : [...this.linksByIdempotency.values()]
              .filter((item) => item.linkState === 'linked' && item.flowProjectId)
              .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null
        if (!latest || latest.linkState !== 'linked' || !latest.flowProjectId) {
          try {
            const { flowJobService } = await import('./FlowJobService')
            const fromDb = flowJobService.findLinkedProject(atlasProjectId || undefined)
            if (fromDb) {
              latest = fromDb
              this.linksByAtlasProject.set(fromDb.atlasProjectId, fromDb)
              this.linksByIdempotency.set(fromDb.idempotencyKey, fromDb)
            }
          } catch {
            /* a memória continua valendo se o sqlite ainda não tiver a coluna */
          }
        }
        sendJson(res, 200, { ok: true, link: latest || null, realFlowValidated: false })
        return
      }

      // Corrige SHA reutilizado entre tentativas e opcionalmente enfileira recover (sem regenerar).
      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/results/correct-reused-shas') {
        if (!this.authorize(req)) {
          sendJson(res, 401, { error: 'UNAUTHORIZED' })
          return
        }
        const body = (await readJson(req)) as Record<string, unknown> | null
        const atlasProjectId =
          typeof body?.atlasProjectId === 'string' ? body.atlasProjectId.trim() : ''
        if (!atlasProjectId) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'atlasProjectId obrigatório' })
          return
        }
        const recoverAttemptIds = Array.isArray(body?.recoverAttemptIds)
          ? body!.recoverAttemptIds.map((id) => String(id)).filter(Boolean)
          : []
        try {
          const { flowJobService } = await import('./FlowJobService')
          const correction = flowJobService.correctReusedResultShas({
            atlasProjectId,
            recoverAttemptIds,
          })
          const evidencePath = path.join(
            process.cwd(),
            'docs',
            'atlas-flow',
            'evidence',
            'misattribution-correction.json',
          )
          fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
          fs.writeFileSync(
            evidencePath,
            `${JSON.stringify(
              {
                correctedAt: new Date().toISOString(),
                atlasProjectId,
                ...correction,
                note: 'Vínculos incorretos marcados MISATTRIBUTED_CAPTURE; arquivos preservados.',
              },
              null,
              2,
            )}\n`,
          )
          sendJson(res, 200, {
            ...correction,
            ok: true,
            evidencePath,
            realFlowValidated: false,
          })
        } catch (error) {
          sendJson(res, 500, {
            error: 'CORRECT_REUSED_FAILED',
            message: error instanceof Error ? error.message : String(error),
          })
        }
        return
      }

      // Staging de resultado gerado (bytes + sha). Prova de aquisição na linha.
      if (req.method === 'POST' && pathname === '/api/atlas-flow/v1/results/stage') {
        const body = (await readJson(req)) as Record<string, unknown> | null
        const atlasProjectId =
          typeof body?.atlasProjectId === 'string' ? body.atlasProjectId.trim() : ''
        const flowProjectId =
          typeof body?.flowProjectId === 'string' ? body.flowProjectId.trim() : null
        const attemptId =
          typeof body?.attemptId === 'string' ? body.attemptId.trim() : ''
        const displayName =
          typeof body?.displayName === 'string' && body.displayName.trim()
            ? body.displayName.trim()
            : 'flow-result.bin'
        const mimeType =
          typeof body?.mimeType === 'string' ? body.mimeType : 'application/octet-stream'
        const expectedSha =
          typeof body?.sha256 === 'string' ? body.sha256.trim().toLowerCase() : ''
        const base64 = typeof body?.base64 === 'string' ? body.base64 : ''
        if (!atlasProjectId || !base64) {
          sendJson(res, 400, {
            error: 'SCHEMA_INVALID',
            message: 'atlasProjectId e base64 obrigatórios',
          })
          return
        }
        const bytes = Buffer.from(base64, 'base64')
        if (!bytes.length || bytes.length > 20 * 1024 * 1024) {
          sendJson(res, 400, { error: 'SCHEMA_INVALID', message: 'arquivo vazio ou >12MB' })
          return
        }
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        if (expectedSha && expectedSha !== sha256) {
          sendJson(res, 400, {
            error: 'SHA256_MISMATCH',
            expected: expectedSha,
            actual: sha256,
          })
          return
        }
        const flowMediaId =
          typeof body?.flowMediaId === 'string' && body.flowMediaId.trim()
            ? body.flowMediaId.trim()
            : null
        const originProof =
          typeof body?.originProof === 'string' && body.originProof.trim()
            ? body.originProof.trim()
            : null
        const automaticCorrelation =
          typeof body?.automaticCorrelation === 'boolean' ? body.automaticCorrelation : null
        const srcKey =
          typeof body?.srcKey === 'string' && body.srcKey.trim() ? body.srcKey.trim() : null
        const allowKnownSha = body?.allowKnownSha === true

        const resultsDir = path.join(process.cwd(), 'docs', 'atlas-flow', 'results')
        fs.mkdirSync(resultsDir, { recursive: true })
        const ext = (() => {
          const m = mimeType.toLowerCase()
          if (m.includes('png')) return 'png'
          if (m.includes('webp')) return 'webp'
          if (m.includes('gif')) return 'gif'
          if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
          return 'bin'
        })()

        let resultId: string = randomUUID()
        let absPath = path.join(resultsDir, `${resultId}.${ext}`)
        let resultBindingId: string | null = null
        let bindError: string | null = null
        let existingAttemptId: string | null = null
        let idempotent = false

        if (attemptId) {
          try {
            const { flowJobService } = await import('./FlowJobService')
            const precheck = flowJobService.precheckResultStage({
              attemptId,
              sha256,
              flowMediaId,
              allowKnownSha,
            })

            if (!precheck.ok) {
              // Bloqueia ANTES de gravar arquivo duplicado em disco!
              bindError = precheck.error || 'RESULT_BIND_REJECTED'
              existingAttemptId = precheck.existingAttemptId || null
              logger.warn('atlas-flow-v1.results.bind_rejected_prewrite', {
                attemptId,
                sha256: sha256.slice(0, 12),
                flowMediaId,
                error: bindError,
                existingAttemptId,
              })
              sendJson(res, 200, {
                ok: false,
                bound: false,
                idempotent: false,
                bindError,
                existingAttemptId,
                result: null,
                realFlowValidated: false,
                note: `Vínculo à tentativa rejeitado antes de gravar cópia duplicada (${bindError}).`,
              })
              return
            }

            if (precheck.idempotent && precheck.existingAbsPath && fs.existsSync(precheck.existingAbsPath)) {
              absPath = precheck.existingAbsPath
              resultId = path.basename(absPath, path.extname(absPath)) || resultId
              idempotent = true
            } else {
              fs.writeFileSync(absPath, bytes)
            }

            const staged = flowJobService.stageResultForAttempt({
              attemptId,
              absPath,
              mimeType,
              byteSize: bytes.length,
              sha256,
              width: typeof body?.width === 'number' ? body.width : null,
              height: typeof body?.height === 'number' ? body.height : null,
              flowMediaId,
              originProof,
              automaticCorrelation,
              srcKey,
              outputIndex: typeof body?.outputIndex === 'number' ? body.outputIndex : undefined,
              allowKnownSha,
            })
            if (staged.ok && staged.resultBindingId) {
              resultBindingId = staged.resultBindingId
              if (staged.idempotent) idempotent = true
              if (staged.absPath) absPath = staged.absPath
            } else {
              bindError = staged.error || 'RESULT_BIND_REJECTED'
              existingAttemptId = staged.existingAttemptId || null
              logger.warn('atlas-flow-v1.results.bind_rejected', {
                attemptId,
                sha256: sha256.slice(0, 12),
                error: bindError,
                existingAttemptId,
              })
            }
          } catch (error) {
            bindError = error instanceof Error ? error.message : String(error)
            logger.warn('atlas-flow-v1.results.sqlite_bind_failed', {
              attemptId,
              error: bindError,
            })
          }
        } else {
          fs.writeFileSync(absPath, bytes)
        }
        const result = {
          resultId,
          resultBindingId,
          idempotent,
          attemptId: attemptId || null,
          atlasProjectId,
          flowProjectId,
          flowMediaId,
          originProof,
          automaticCorrelation,
          displayName,
          mimeType,
          byteSize: bytes.length,
          sha256,
          width: typeof body?.width === 'number' ? body.width : null,
          height: typeof body?.height === 'number' ? body.height : null,
          method: typeof body?.method === 'string' ? body.method : null,
          srcHost: typeof body?.srcHost === 'string' ? body.srcHost : null,
          absPath,
          stagedAt: new Date().toISOString(),
        }
        const evidencePath = path.join(
          process.cwd(),
          'docs',
          'atlas-flow',
          'last-generation-result.json',
        )
        fs.writeFileSync(
          evidencePath,
          `${JSON.stringify(
            {
              receivedAt: new Date().toISOString(),
              realFlowValidated: Boolean(attemptId && resultBindingId),
              idempotent,
              note: idempotent
                ? 'Reingestão idempotente: arquivo e vínculo existentes reutilizados.'
                : 'Bytes do resultado Flow gravados em disco (sha/tamanho).',
              result: { ...result, absPath },
            },
            null,
            2,
          )}\n`,
        )
        sendJson(res, 200, {
          ok: Boolean(resultBindingId) || !attemptId,
          bound: Boolean(resultBindingId),
          idempotent,
          bindError,
          existingAttemptId,
          result: { ...result, absPath: undefined, stagingPath: absPath },
          filePath: evidencePath,
          realFlowValidated: Boolean(attemptId && resultBindingId),
          note: !attemptId
            ? 'Resultado estagiado sem attemptId (diagnóstico popup).'
            : idempotent
              ? 'Resultado já vinculado a esta tentativa (idempotente).'
              : resultBindingId
                ? 'Resultado estagiado e vinculado à attempt.'
                : `Vínculo à attempt rejeitado (${bindError}).`,
        })
        return
      }

      sendJson(res, 404, { error: 'NOT_FOUND', path: pathname })
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      sendJson(res, 500, { error: 'INTERNAL', message: this.lastError })
    }
  }
}

export const atlasFlowCoordinatorServer = new AtlasFlowCoordinatorServer()
