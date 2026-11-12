import http from 'node:http'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { app } from 'electron'
import {
  FLOW_BRIDGE_APP_ID,
  FLOW_BRIDGE_DEFAULT_PORTS,
  FLOW_BRIDGE_PROTOCOL_VERSION,
  isFlowBridgeEvent,
  type FlowBridgeCommand,
  type FlowBridgeEvent,
  type FlowBridgeHelloResponse,
} from '../../../shared/flowBridgeProtocol'
import { getMainDir } from '../../paths'
import { logger } from '../logging/logger'

type QueuedCommand = FlowBridgeCommand & { queuedAt: number }

export type FlowBridgeServerStatus = {
  running: boolean
  port: number | null
  token: string | null
  extensionConnected: boolean
  accountHint: string | null
  extensionPath: string
  lastError: string | null
  pendingCommands: number
}

function resolveExtensionPath(): string {
  const candidates = [
    // Dev: pasta fonte da extensão (preferida)
    path.join(process.cwd(), 'extensions', 'atlas-flow-bridge'),
    path.join(process.cwd(), 'resources', 'atlas-flow-bridge'),
    path.join(getMainDir(), '../extensions/atlas-flow-bridge'),
    path.join(getMainDir(), '../resources/atlas-flow-bridge'),
    // Empacotado
    path.join(process.resourcesPath ?? '', 'atlas-flow-bridge'),
  ]
  for (const candidate of candidates) {
    if (
      candidate &&
      fs.existsSync(candidate) &&
      fs.existsSync(path.join(candidate, 'manifest.json'))
    ) {
      return candidate
    }
  }
  return candidates[0]!
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

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(payload)
}

/**
 * Ponte HTTP localhost entre o Atlas e a extensão Chrome.
 * Não armazena senhas nem cookies do Google — só comandos de UI e metadados públicos.
 */
export class FlowBridgeServer extends EventEmitter {
  private server: http.Server | null = null
  private port: number | null = null
  private token: string | null = null
  private extensionConnected = false
  private accountHint: string | null = null
  private lastError: string | null = null
  private lastExtensionSeenAt = 0
  private commands: QueuedCommand[] = []
  private readonly waiters = new Set<{
    resolve: (commands: FlowBridgeCommand[]) => void
    timer: NodeJS.Timeout
  }>()

  getExtensionPath(): string {
    return resolveExtensionPath()
  }

  getStatus(): FlowBridgeServerStatus {
    const connectedRecently =
      this.extensionConnected && Date.now() - this.lastExtensionSeenAt < 45_000
    return {
      running: Boolean(this.server && this.port),
      port: this.port,
      token: this.token,
      extensionConnected: connectedRecently,
      accountHint: this.accountHint,
      extensionPath: this.getExtensionPath(),
      lastError: this.lastError,
      pendingCommands: this.commands.length,
    }
  }

  async start(): Promise<FlowBridgeServerStatus> {
    if (this.server && this.port && this.token) return this.getStatus()

    this.token = randomBytes(24).toString('hex')
    this.lastError = null

    for (const candidate of FLOW_BRIDGE_DEFAULT_PORTS) {
      try {
        await this.listen(candidate)
        logger.info('flow.bridge.started', { port: candidate })
        return this.getStatus()
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'EADDRINUSE') continue
        this.lastError = error instanceof Error ? error.message : String(error)
        throw error
      }
    }

    this.lastError = 'Nenhuma porta localhost disponível para a ponte Flow.'
    throw new Error(this.lastError)
  }

  async stop(): Promise<void> {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.resolve([])
    }
    this.waiters.clear()
    this.commands = []

    const server = this.server
    this.server = null
    this.port = null
    this.token = null
    this.extensionConnected = false

    if (!server) return
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  enqueue(command: FlowBridgeCommand): void {
    // Fila serial (padrão tipo “Fila”): evita entregar 2 creates no mesmo poll
    // e gerar “extensão ocupada” no segundo comando.
    if (command.type === 'create_project' || command.type === 'verify_project') {
      const opId = 'operationId' in command ? command.operationId : null
      const duplicate = this.commands.some((queued) => {
        if (queued.type !== command.type) return false
        if (opId && 'operationId' in queued && queued.operationId === opId) return true
        return queued.requestId === command.requestId
      })
      if (duplicate) {
        logger.info('flow.bridge.enqueue_deduped', {
          type: command.type,
          requestId: command.requestId,
        })
        return
      }
    }
    this.commands.push({ ...command, queuedAt: Date.now() })
    this.flushWaiters()
  }

  /** Entrega no máximo 1 comando por poll — a extensão processa em série. */
  private flushWaiters() {
    if (this.commands.length === 0 || this.waiters.size === 0) return
    const next = this.commands.shift()
    if (!next) return
    const { queuedAt: _queuedAt, ...command } = next
    for (const waiter of [...this.waiters]) {
      clearTimeout(waiter.timer)
      this.waiters.delete(waiter)
      waiter.resolve([command])
    }
  }

  private authorize(req: http.IncomingMessage): boolean {
    if (!this.token) return false
    const header = req.headers.authorization?.trim() ?? ''
    if (header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim() === this.token
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    return url.searchParams.get('token') === this.token
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
      if (req.method === 'OPTIONS') {
        sendJson(res, 204, {})
        return
      }

      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const pathname = url.pathname

      if (req.method === 'GET' && pathname === '/v1/hello') {
        const body: FlowBridgeHelloResponse = {
          app: FLOW_BRIDGE_APP_ID,
          protocolVersion: FLOW_BRIDGE_PROTOCOL_VERSION,
          token: this.token ?? '',
          extensionPath: this.getExtensionPath(),
          pendingOperation: this.commands.length > 0,
        }
        sendJson(res, 200, body)
        return
      }

      if (!this.authorize(req)) {
        sendJson(res, 401, { error: 'unauthorized' })
        return
      }

      if (req.method === 'GET' && pathname === '/v1/status') {
        sendJson(res, 200, {
          ...this.getStatus(),
          appName: app.getName(),
        })
        return
      }

      if (req.method === 'GET' && pathname === '/v1/commands') {
        this.extensionConnected = true
        this.lastExtensionSeenAt = Date.now()
        const waitMs = Math.min(25_000, Number(url.searchParams.get('waitMs') ?? 20_000) || 20_000)

        if (this.commands.length > 0) {
          const next = this.commands.shift()!
          const { queuedAt: _queuedAt, ...command } = next
          sendJson(res, 200, [command])
          return
        }

        const commands = await new Promise<FlowBridgeCommand[]>((resolve) => {
          const waiter = {
            resolve: (items: FlowBridgeCommand[]) => resolve(items),
            timer: setTimeout(() => {
              this.waiters.delete(waiter)
              resolve([])
            }, waitMs),
          }
          this.waiters.add(waiter)
        })
        sendJson(res, 200, commands)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/events') {
        const body = await readJson(req)
        if (!isFlowBridgeEvent(body)) {
          sendJson(res, 400, { error: 'invalid_event' })
          return
        }
        this.extensionConnected = true
        this.lastExtensionSeenAt = Date.now()
        if (body.type === 'extension_hello') {
          this.accountHint = body.accountHint?.trim() || this.accountHint
        }
        if (body.type === 'project_linked' && body.accountHint) {
          this.accountHint = body.accountHint
        }
        this.emit('event', body as FlowBridgeEvent)
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'not_found' })
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      logger.warn('flow.bridge.request_failed', { error: this.lastError })
      sendJson(res, 500, { error: 'internal_error', message: this.lastError })
    }
  }
}

export const flowBridgeServer = new FlowBridgeServer()
