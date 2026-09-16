import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import crypto from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { shell, type BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import type {
  CodexAuthState,
  CodexAccountInfo,
  CodexStatus,
  CodexLoginStartResult,
  CodexRuntimeInfo,
} from '../../../shared/types'
import { IPC } from '../../../shared/types'
import { logger } from '../logging/logger'
import { settingsRepository } from '../../repositories/settingsRepository'
import { resolveEffectiveCodexModel } from './codexModels'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  method?: string
  result?: unknown
  params?: unknown
  error?: { code?: number; message: string; data?: unknown }
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type LocateSource = CodexRuntimeInfo['locatedVia']

export class CodexRuntimeManager extends EventEmitter {
  private binaryPath: string | null = null
  private codexVersion: string | null = null
  private locatedVia: LocateSource = null
  private appServerProcess: ChildProcessWithoutNullStreams | null = null
  private authState: CodexAuthState = 'initializing'
  private account: CodexAccountInfo | null = null
  private pendingRequests = new Map<number, PendingRequest>()
  private nextId = 1
  private buffer = ''
  private currentLoginId: string | null = null
  private loginProcess: ChildProcess | null = null
  private restartAttempts = 0
  private maxRestartAttempts = 3
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private shuttingDown = false
  private getWindow: () => BrowserWindow | null

  constructor(opts: { getWindow: () => BrowserWindow | null }) {
    super()
    this.getWindow = opts.getWindow
  }

  // ──────────────────── Public API ────────────────────

  async initialize(): Promise<CodexStatus> {
    this.authState = 'initializing'
    this.emitStateToRenderer()

    this.binaryPath = await this.locateCodex()
    if (!this.binaryPath) {
      this.authState = 'not_found'
      this.codexVersion = null
      this.emitStateToRenderer()
      logger.warn('codex.runtime.not_found', { message: 'Codex binary not found' })
      return this.getStatus()
    }

    this.codexVersion = await this.readVersion(this.binaryPath)
    logger.info('codex.runtime.found', {
      binaryPath: this.binaryPath,
      version: this.codexVersion,
      locatedVia: this.locatedVia,
    })

    // Auth via CLI first (does not depend on app-server)
    try {
      const authenticated = await this.checkAuthViaCli()
      this.authState = authenticated ? 'connected' : 'not_authenticated'
      if (authenticated && !this.account) {
        this.account = { email: null, name: null, loginType: 'chatgpt' }
      }
    } catch {
      this.authState = 'not_authenticated'
    }

    this.emitStateToRenderer()

    // Start App Server automatically and wait briefly so cold start reports readiness
    try {
      await this.startAppServer()
      if (this.authState === 'connected') {
        const info = await this.accountRead()
        if (info) {
          this.account = {
            ...info,
            loginType: info.loginType || this.account?.loginType || 'chatgpt',
          }
        }
      }
      this.restartAttempts = 0
    } catch (err) {
      logger.warn('codex.runtime.appserver_start_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      // Auth can still be valid even if app-server failed; keep reconnect available
    }

    this.emitStateToRenderer()
    return this.getStatus()
  }

  getStatus(): CodexStatus {
    const settings = settingsRepository.get()
    const connected = this.authState === 'connected'
    const modelLabel = resolveEffectiveCodexModel(settings.codexModel)

    const messageMap: Record<CodexAuthState, string> = {
      initializing: 'Inicializando Codex...',
      not_found: 'Não instalado',
      not_authenticated: 'Não vinculado',
      authenticating: 'Vinculando com ChatGPT...',
      connected: 'Pronto',
      error: 'Não foi possível conectar ao Codex',
    }

    return {
      connected,
      authenticated: connected,
      authState: this.authState,
      account: this.account,
      model: connected ? modelLabel : null,
      message: messageMap[this.authState],
      lastCheckedAt: new Date().toISOString(),
      runtimePath: this.binaryPath,
      codexVersion: this.codexVersion,
      appServerRunning: this.isAppServerRunning(),
    }
  }

  getRuntimeStatus(): CodexRuntimeInfo {
    return {
      binaryPath: this.binaryPath,
      version: this.codexVersion,
      appServerRunning: this.isAppServerRunning(),
      locatedVia: this.locatedVia,
    }
  }

  getAuthState(): CodexAuthState {
    return this.authState
  }

  isConnected(): boolean {
    return this.authState === 'connected'
  }

  getBinaryPath(): string | null {
    return this.binaryPath
  }

  isAppServerRunning(): boolean {
    return this.appServerProcess !== null && !this.appServerProcess.killed
  }

  isOnboardingDismissed(): boolean {
    return Boolean(settingsRepository.get().codexOnboardingDismissed)
  }

  dismissOnboarding(): void {
    settingsRepository.update({ codexOnboardingDismissed: true })
  }

  async healthCheck(): Promise<CodexStatus> {
    if (this.authState === 'authenticating') {
      return this.getStatus()
    }

    this.binaryPath = await this.locateCodex()
    if (!this.binaryPath) {
      this.authState = 'not_found'
      this.account = null
      this.codexVersion = null
      this.emitStateToRenderer()
      return this.getStatus()
    }

    this.codexVersion = await this.readVersion(this.binaryPath)

    try {
      if (!this.isAppServerRunning()) {
        await this.startAppServer()
      }
    } catch (err) {
      logger.warn('codex.health.appserver_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    try {
      const authenticated = await this.checkAuthViaCli()
      if (authenticated) {
        this.authState = 'connected'
        const info = await this.accountRead()
        if (info) {
          this.account = {
            ...info,
            loginType: info.loginType || this.account?.loginType || 'chatgpt',
          }
        } else if (!this.account) {
          this.account = { email: null, name: null, loginType: 'chatgpt' }
        }
      } else {
        this.authState = 'not_authenticated'
        this.account = null
      }
    } catch {
      this.authState = 'error'
    }

    this.emitStateToRenderer()
    return this.getStatus()
  }

  /**
   * account/read — tries app-server RPC, falls back to null (CLI has no account email).
   */
  async accountRead(): Promise<CodexAccountInfo | null> {
    if (this.isAppServerRunning()) {
      try {
        const result = (await this.sendRpcShort('account/read', {}, 4000)) as Record<
          string,
          unknown
        > | null
        if (result) {
          return {
            email: (result.email as string) || null,
            name: (result.name as string) || (result.displayName as string) || null,
            loginType: (result.loginType as string) || (result.type as string) || null,
          }
        }
      } catch {
        /* ignore */
      }
    }
    return null
  }

  /**
   * Starts the login flow by spawning `codex login` (or `--device-auth`).
   * Opens the browser via shell.openExternal when a URL appears.
   * Device-auth is preferred: URL fixa + código, sem depender do localhost:1455.
   */
  async loginStart(type: string = 'chatgpt'): Promise<CodexLoginStartResult> {
    if (!this.binaryPath) {
      this.authState = 'not_found'
      this.emitStateToRenderer()
      throw new Error('Codex precisa ser configurado neste computador.')
    }

    this.killLoginProcess()

    const loginId = crypto.randomUUID()
    this.currentLoginId = loginId
    this.authState = 'authenticating'
    this.emitStateToRenderer()

    // Fluxo browser OAuth (`codex login`) e device-auth usam --device-auth por padrão
    // no botão principal — mais confiável no app empacotado Windows.
    const useDeviceAuth =
      type === 'chatgptDeviceCode' ||
      type === 'device' ||
      type === 'device-auth' ||
      type === 'chatgpt'
    const args = useDeviceAuth ? ['login', '--device-auth'] : ['login']
    const knownDeviceUrl = 'https://auth.openai.com/codex/device'

    if (useDeviceAuth) {
      // Abre imediatamente a página conhecida — não espera o CLI imprimir a URL.
      void openAuthInBrowser(knownDeviceUrl)
      this.emitLoginUrl(knownDeviceUrl)
    }

    return new Promise<CodexLoginStartResult>((resolve, reject) => {
      const child = spawn(this.binaryPath!, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        shell: false,
      })

      this.loginProcess = child
      let stdout = ''
      let stderr = ''
      let authUrl: string | undefined = useDeviceAuth ? knownDeviceUrl : undefined
      let userCode: string | undefined
      let verificationUrl: string | undefined = useDeviceAuth ? knownDeviceUrl : undefined
      let resolved = false
      let processExited = false

      const doResolve = (result: CodexLoginStartResult) => {
        if (resolved) return
        resolved = true
        resolve(result)
      }

      const doReject = (err: Error) => {
        if (resolved) return
        resolved = true
        this.authState = 'not_authenticated'
        this.emitStateToRenderer()
        reject(err)
      }

      const consumeOutput = (text: string, source: 'stdout' | 'stderr') => {
        if (source === 'stdout') stdout += text
        else stderr += text

        const combined = stripAnsi(`${stdout}\n${stderr}`)
        const cleanChunk = stripAnsi(text)

        logger.info('codex.login.output', {
          source,
          length: cleanChunk.length,
          hasUrl: /https?:\/\//i.test(combined),
          hasCode: /\b[A-Z0-9]{4}-[A-Z0-9]{4,}\b/.test(combined),
        })

        const preferred = pickAuthUrl(combined)
        if (preferred && preferred !== authUrl) {
          authUrl = preferred
          verificationUrl = preferred
          void openAuthInBrowser(preferred)
          this.emitLoginUrl(preferred, userCode)
        }

        const codeMatch =
          combined.match(
            /(?:user\s*code|enter\s*(?:the\s*)?code|código(?:\s+de\s+verificação)?)\s*[:=]?\s*([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})?)/i,
          ) || combined.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4,})\b/)
        if (codeMatch?.[1] && codeMatch[1].toUpperCase() !== userCode) {
          userCode = codeMatch[1].toUpperCase()
          this.emitLoginUrl(verificationUrl ?? authUrl ?? knownDeviceUrl, userCode)
        }

        if (useDeviceAuth && userCode && (verificationUrl || authUrl)) {
          doResolve({
            loginId,
            authUrl: authUrl ?? verificationUrl,
            userCode,
            verificationUrl: verificationUrl ?? authUrl,
          })
        } else if (!useDeviceAuth && authUrl && !isLocalCallbackUrl(authUrl)) {
          doResolve({ loginId, authUrl })
        }
      }

      child.stdout?.on('data', (buf: Buffer) => consumeOutput(buf.toString('utf8'), 'stdout'))
      child.stderr?.on('data', (buf: Buffer) => consumeOutput(buf.toString('utf8'), 'stderr'))

      child.on('error', (err) => {
        logger.error('codex.login.spawn_error', { error: err.message })
        this.loginProcess = null
        doReject(new Error('Não foi possível iniciar a vinculação com o Codex.'))
      })

      child.on('close', (code) => {
        processExited = true
        this.loginProcess = null
        logger.info('codex.login.exited', { code })

        if (code === 0) {
          void this.markAuthenticatedAfterLogin(loginId)
          doResolve({
            loginId,
            authUrl,
            userCode,
            verificationUrl: verificationUrl ?? authUrl,
          })
          return
        }

        if (!resolved) {
          doReject(
            new Error(
              sanitizeUserFacingError(
                stderr.trim() || stdout.trim() || 'A vinculação com o Codex não foi concluída.',
              ),
            ),
          )
          return
        }

        if (this.authState === 'authenticating') {
          this.authState = 'not_authenticated'
          this.currentLoginId = null
          this.emitStateToRenderer()
        }
      })

      // Desbloqueia a UI cedo com a URL conhecida (device) ou o que já tiver.
      setTimeout(() => {
        if (!resolved && !processExited) {
          doResolve({
            loginId,
            authUrl: authUrl ?? (useDeviceAuth ? knownDeviceUrl : undefined),
            userCode,
            verificationUrl: verificationUrl ?? authUrl ?? (useDeviceAuth ? knownDeviceUrl : undefined),
          })
        }
      }, useDeviceAuth ? 1500 : 3000)

      setTimeout(() => {
        if (!processExited && this.loginProcess === child) {
          logger.warn('codex.login.timeout')
          this.killLoginProcess()
          if (this.authState === 'authenticating') {
            this.authState = 'not_authenticated'
            this.currentLoginId = null
            this.emitStateToRenderer()
          }
        }
      }, 5 * 60 * 1000)
    })
  }

  private emitLoginUrl(authUrl: string, userCode?: string) {
    const win =
      this.getWindow() ??
      ((): BrowserWindow | undefined => {
        try {
          const { BrowserWindow: BW } = require('electron') as typeof import('electron')
          return BW.getAllWindows()[0]
        } catch {
          return undefined
        }
      })()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.codex.loginUrl, { authUrl, userCode })
    }
  }

  /** Cancel login — keeps the App Server running. */
  loginCancel(): void {
    this.killLoginProcess()
    this.currentLoginId = null
    if (this.authState === 'authenticating' || this.authState === 'error') {
      this.authState = this.binaryPath ? 'not_authenticated' : 'not_found'
    }
    this.emitStateToRenderer()
    logger.info('codex.login.cancelled')
  }

  /**
   * Logout via Codex CLI (`codex logout`) + best-effort app-server RPC.
   * Does not touch skills or scripts.
   */
  async logout(): Promise<void> {
    this.killLoginProcess()
    this.account = null
    this.authState = this.binaryPath ? 'not_authenticated' : 'not_found'
    this.emitStateToRenderer()

    if (this.isAppServerRunning()) {
      this.sendRpcShort('account/logout', {}, 3000).catch(() => {
        /* ignore */
      })
    }

    if (this.binaryPath) {
      try {
        await this.runCli(['logout'], 15000)
      } catch (err) {
        logger.warn('codex.logout.cli_failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Confirm final state without storing credentials ourselves
    try {
      const stillAuthed = await this.checkAuthViaCli()
      this.authState = stillAuthed
        ? 'connected'
        : this.binaryPath
          ? 'not_authenticated'
          : 'not_found'
      if (!stillAuthed) this.account = null
    } catch {
      this.authState = this.binaryPath ? 'not_authenticated' : 'not_found'
      this.account = null
    }

    this.emitStateToRenderer()
    logger.info('codex.logout.done', { authState: this.authState })
  }

  async startAppServer(): Promise<void> {
    if (this.appServerProcess && !this.appServerProcess.killed) return
    if (!this.binaryPath) throw new Error('Codex binary not found')

    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath!, ['app-server'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      this.appServerProcess = child
      this.buffer = ''

      child.stdout.on('data', (buf: Buffer) => this.handleStdout(buf.toString('utf8')))
      child.stderr.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8')
        if (text.trim()) {
          logger.warn('codex.appserver.stderr', { text: text.slice(0, 200) })
        }
      })
      child.on('error', (err) => {
        logger.error('codex.appserver.spawn_error', { error: err.message })
        this.appServerProcess = null
        reject(err)
      })
      child.on('close', (code) => {
        logger.info('codex.appserver.closed', { code })
        this.appServerProcess = null
        this.rejectAllPending(new Error(`App server exited with code ${code}`))
        if (!this.shuttingDown) this.handleUnexpectedClose()
      })

      const initId = this.nextId++
      this.sendRaw({
        jsonrpc: '2.0',
        id: initId,
        method: 'initialize',
        params: { clientInfo: { name: 'atlas-studio', version: '1.0.0' } },
      })

      const timeout = setTimeout(() => resolve(), 3000)
      this.pendingRequests.set(initId, {
        resolve: () => {
          clearTimeout(timeout)
          logger.info('codex.appserver.initialized')
          resolve()
        },
        reject: () => {
          clearTimeout(timeout)
          resolve()
        },
        timer: timeout,
      })
    })
  }

  async stopAppServer(): Promise<void> {
    this.killAppServer()
  }

  async restartAppServer(): Promise<void> {
    this.killAppServer()
    this.restartAttempts = 0
    await this.startAppServer()
  }

  async ensureAppServer(): Promise<void> {
    if (!this.isAppServerRunning()) await this.startAppServer()
  }

  async locateCodex(): Promise<string | null> {
    const settings = settingsRepository.get()
    const savedPath = settings.codexBinaryPath?.trim() || undefined

    const fromPath = await this.findInPath()
    if (fromPath) {
      const works = await this.probeVersion(fromPath)
      if (works) {
        this.locatedVia = 'path'
        logger.info('codex.locate.path', { binary: fromPath })
        return fromPath
      }
    }

    const candidates: Array<{ path: string; via: LocateSource }> = [
      ...(process.env.CODEX_PATH
        ? [{ path: process.env.CODEX_PATH, via: 'env' as const }]
        : []),
      ...(savedPath ? [{ path: savedPath, via: 'settings' as const }] : []),
      ...this.getKnownInstallPaths().map((p) => ({ path: p, via: 'known' as const })),
    ]

    for (const candidate of candidates) {
      if (!candidate.path || !existsSync(candidate.path)) continue
      const works = await this.probeVersion(candidate.path)
      if (works) {
        this.locatedVia = candidate.via
        logger.info('codex.locate.found', {
          binary: candidate.path,
          via: candidate.via,
        })
        return candidate.path
      }
    }

    this.locatedVia = null
    logger.warn('codex.locate.not_found', {
      searched: candidates.map((c) => c.path),
    })
    return null
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.killLoginProcess()
    this.killAppServer()
  }

  // ──────────────────── Private — login helpers ────────────────────

  private async markAuthenticatedAfterLogin(loginId: string): Promise<void> {
    if (this.currentLoginId && this.currentLoginId !== loginId) return

    // Brief settle time for credential write by Codex
    await new Promise((r) => setTimeout(r, 400))

    let authenticated = false
    try {
      authenticated = await this.checkAuthViaCli()
    } catch {
      authenticated = true // login process exited 0 — trust it
    }

    if (authenticated) {
      this.account = { email: null, name: null, loginType: 'chatgpt' }
      this.authState = 'connected'
      this.currentLoginId = null
      this.emitStateToRenderer()

      try {
        await this.ensureAppServer()
        const info = await this.accountRead()
        if (info) {
          this.account = {
            ...info,
            loginType: info.loginType || 'chatgpt',
          }
          this.emitStateToRenderer()
        }
      } catch {
        /* ignore */
      }
    } else if (this.authState === 'authenticating') {
      this.authState = 'not_authenticated'
      this.currentLoginId = null
      this.emitStateToRenderer()
    }
  }

  private killLoginProcess(): void {
    if (!this.loginProcess) return
    try {
      if (process.platform === 'win32' && this.loginProcess.pid) {
        spawn('taskkill', ['/pid', String(this.loginProcess.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })
      } else {
        this.loginProcess.kill('SIGTERM')
      }
    } catch {
      try {
        this.loginProcess.kill()
      } catch {
        /* ignore */
      }
    }
    this.loginProcess = null
  }

  /**
   * Real auth probe via `codex login status` (not `--version`).
   * Falls back to app-server account/read when available.
   */
  private async checkAuthViaCli(): Promise<boolean> {
    if (this.isAppServerRunning()) {
      try {
        const info = await this.accountRead()
        if (info && (info.email || info.name || info.loginType)) {
          this.account = {
            ...info,
            loginType: info.loginType || 'chatgpt',
          }
          return true
        }
      } catch {
        /* fall through */
      }
    }

    if (!this.binaryPath) return false

    const result = await this.runCli(['login', 'status'], 8000)
    const output = `${result.stdout}\n${result.stderr}`.trim()

    if (/not\s+logged\s+in|logged\s+out|no\s+(?:active\s+)?(?:login|account|credentials)/i.test(output)) {
      return false
    }

    if (
      result.code === 0 &&
      /logged\s+in|authenticated|chatgpt|api\s*key/i.test(output)
    ) {
      const viaChatGpt = /chatgpt/i.test(output)
      const viaApiKey = /api\s*key/i.test(output)
      this.account = {
        email: this.account?.email ?? null,
        name: this.account?.name ?? null,
        loginType: viaApiKey && !viaChatGpt ? 'api_key' : 'chatgpt',
      }
      return true
    }

    return false
  }

  // ──────────────────── Private — codex binary discovery ────────────────────

  private getKnownInstallPaths(): string[] {
    const local = process.env.LOCALAPPDATA ?? ''
    const profile = process.env.USERPROFILE ?? ''
    const home = process.env.HOME ?? profile
    const standaloneRoot = path.join(profile, '.codex', 'packages', 'standalone', 'releases')

    const paths = [
      path.join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
      path.join(local, 'Programs', 'codex', 'codex.exe'),
      path.join(profile, '.local', 'bin', 'codex.exe'),
      path.join(profile, '.codex', 'bin', 'codex.exe'),
      path.join(home, '.local', 'bin', 'codex'),
      path.join(home, '.codex', 'bin', 'codex'),
      '/usr/local/bin/codex',
      '/opt/homebrew/bin/codex',
    ]

    // Also try the standalone package layout used by Codex desktop installs
    if (existsSync(standaloneRoot)) {
      try {
        const releases = readdirSync(standaloneRoot)
        for (const release of releases) {
          paths.push(
            path.join(standaloneRoot, release, 'bin', 'codex.exe'),
            path.join(standaloneRoot, release, 'bin', 'codex'),
          )
        }
      } catch {
        /* ignore */
      }
    }

    return paths.filter(Boolean)
  }

  private async findInPath(): Promise<string | null> {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    return new Promise((resolve) => {
      const child = spawn(cmd, ['codex'], {
        windowsHide: true,
        shell: process.platform === 'win32',
      })
      let stdout = ''
      child.stdout?.on('data', (b: Buffer) => {
        stdout += b.toString('utf8')
      })
      child.on('error', () => resolve(null))
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || null)
        } else {
          resolve(null)
        }
      })
      setTimeout(() => {
        child.kill()
        resolve(null)
      }, 5000)
    })
  }

  private async probeVersion(binary: string): Promise<boolean> {
    const result = await this.runCliOn(binary, ['--version'], 5000)
    const output = `${result.stdout}\n${result.stderr}`
    return result.code === 0 || /codex/i.test(output)
  }

  private async readVersion(binary: string): Promise<string | null> {
    const result = await this.runCliOn(binary, ['--version'], 5000)
    const line = `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean)
    if (!line) return null
    const semver = line.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/)
    return semver?.[1] ?? line
  }

  private runCli(args: string[], timeoutMs: number) {
    if (!this.binaryPath) {
      return Promise.resolve({ code: 1, stdout: '', stderr: 'no binary' })
    }
    return this.runCliOn(this.binaryPath, args, timeoutMs)
  }

  private runCliOn(
    binary: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(binary, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })
      let stdout = ''
      let stderr = ''
      let settled = false

      const finish = (code: number | null) => {
        if (settled) return
        settled = true
        resolve({ code, stdout, stderr })
      }

      child.stdout?.on('data', (b: Buffer) => {
        stdout += b.toString('utf8')
      })
      child.stderr?.on('data', (b: Buffer) => {
        stderr += b.toString('utf8')
      })
      child.on('error', () => finish(1))
      child.on('close', (code) => finish(code))
      setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* ignore */
        }
        finish(1)
      }, timeoutMs)
    })
  }

  // ──────────────────── Private — app-server management ────────────────────

  private killAppServer(): void {
    if (!this.appServerProcess || this.appServerProcess.killed) return
    try {
      if (process.platform === 'win32' && this.appServerProcess.pid) {
        spawn('taskkill', ['/pid', String(this.appServerProcess.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })
      } else {
        this.appServerProcess.kill('SIGTERM')
      }
    } catch {
      try {
        this.appServerProcess.kill()
      } catch {
        /* ignore */
      }
    }
    this.appServerProcess = null
    this.rejectAllPending(new Error('App server killed'))
  }

  private handleUnexpectedClose(): void {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      logger.warn('codex.appserver.restart_limit', { attempts: this.restartAttempts })
      if (this.authState === 'connected' || this.authState === 'authenticating') {
        // Auth credentials remain with Codex; surface a recoverable error for the server only
        this.emitStateToRenderer()
      } else if (this.authState !== 'not_found' && this.authState !== 'not_authenticated') {
        this.authState = 'error'
        this.emitStateToRenderer()
      }
      return
    }

    this.restartAttempts++
    const delay = Math.min(2000 * this.restartAttempts, 10000)
    logger.info('codex.appserver.restarting', {
      attempt: this.restartAttempts,
      delayMs: delay,
    })
    this.restartTimer = setTimeout(() => {
      void this.startAppServer()
        .then(() => {
          this.restartAttempts = 0
          this.emitStateToRenderer()
        })
        .catch(() => {
          if (this.restartAttempts >= this.maxRestartAttempts) {
            this.authState =
              this.authState === 'connected' ? 'connected' : 'error'
            this.emitStateToRenderer()
          }
        })
    }, delay)
  }

  // ──────────────────── Private — JSON-RPC ────────────────────

  private handleStdout(text: string): void {
    this.buffer += text
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        this.handleMessage(JSON.parse(line) as JsonRpcResponse)
      } catch {
        /* ignore non-JSON */
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse): void {
    if (msg.id != null && this.pendingRequests.has(msg.id)) {
      const pending = this.pendingRequests.get(msg.id)!
      this.pendingRequests.delete(msg.id)
      clearTimeout(pending.timer)
      if (msg.error) pending.reject(new Error(msg.error.message))
      else pending.resolve(msg.result)
      return
    }
    if (msg.method) this.handleNotification(msg.method, msg.params)
  }

  private handleNotification(method: string, _params: unknown): void {
    if (method === 'account/login/completed' || method === 'account/updated') {
      void this.accountRead().then((info) => {
        if (info && (info.email || info.name || info.loginType)) {
          this.account = {
            ...info,
            loginType: info.loginType || 'chatgpt',
          }
          this.authState = 'connected'
          this.currentLoginId = null
        }
        this.emitStateToRenderer()
      })
    } else {
      logger.info('codex.appserver.notification', { method })
    }
  }

  private sendRpcShort(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.appServerProcess || this.appServerProcess.killed) {
        reject(new Error('App server not running'))
        return
      }
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC timeout: ${method}`))
      }, timeoutMs)
      this.pendingRequests.set(id, { resolve, reject, timer })
      this.sendRaw({ jsonrpc: '2.0', id, method, params })
    })
  }

  private sendRaw(msg: JsonRpcRequest): void {
    if (!this.appServerProcess || this.appServerProcess.killed) return
    try {
      this.appServerProcess.stdin.write(`${JSON.stringify(msg)}\n`)
    } catch {
      /* ignore */
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  private emitStateToRenderer(): void {
    const win =
      this.getWindow() ??
      ((): BrowserWindow | undefined => {
        try {
          const { BrowserWindow: BW } = require('electron') as typeof import('electron')
          return BW.getAllWindows()[0]
        } catch {
          return undefined
        }
      })()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.codex.authStateChanged, this.getStatus())
    }
    this.emit('stateChanged', this.getStatus())
  }
}

function sanitizeUserFacingError(raw: string): string {
  const lower = raw.toLowerCase()
  if (/token|authorization|cookie|api[_-]?key|bearer/i.test(raw)) {
    return 'A vinculação com o Codex não foi concluída.'
  }
  if (/enoent|not found|não encontrado/i.test(lower)) {
    return 'Codex precisa ser configurado neste computador.'
  }
  if (raw.length > 180) {
    return 'A vinculação com o Codex não foi concluída.'
  }
  return raw || 'A vinculação com o Codex não foi concluída.'
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function isLocalCallbackUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url)
}

function isPreferredAuthUrl(url: string): boolean {
  return /auth\.openai\.com|chatgpt\.com|openai\.com\/(oauth|codex)/i.test(url)
}

/** Extrai a melhor URL de login do texto do CLI (ignora localhost:1455). */
function pickAuthUrl(text: string): string | undefined {
  const matches = text.match(/https?:\/\/[^\s"'<>\]]+/gi) ?? []
  const cleaned = matches.map((u) => u.replace(/[.,;)]+$/, ''))
  const preferred = cleaned.find((u) => isPreferredAuthUrl(u) && !isLocalCallbackUrl(u))
  if (preferred) return preferred
  return cleaned.find((u) => !isLocalCallbackUrl(u))
}

async function openAuthInBrowser(url: string): Promise<void> {
  if (process.platform === 'win32') {
    try {
      spawn('cmd', ['/c', 'start', '', url], {
        windowsHide: true,
        stdio: 'ignore',
        detached: true,
      }).unref()
      logger.info('codex.login.browser_opened', { via: 'cmd_start', host: safeUrlHost(url) })
    } catch (error) {
      logger.warn('codex.login.cmd_start_failed', {
        error: error instanceof Error ? error.message : String(error),
        host: safeUrlHost(url),
      })
    }
  }

  try {
    await shell.openExternal(url)
    logger.info('codex.login.browser_opened', { via: 'openExternal', host: safeUrlHost(url) })
  } catch (error) {
    logger.warn('codex.login.openExternal_failed', {
      error: error instanceof Error ? error.message : String(error),
      host: safeUrlHost(url),
    })
  }
}

function safeUrlHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'invalid'
  }
}
