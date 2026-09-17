import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type {
  AnalyzeQuickPromptRequest,
  AnalyzeQuickPromptResult,
  AnalyzeTitleRequest,
  AnalyzeTitleResult,
  AntigravityLoginStartResult,
  AntigravityStatus,
} from '../../../shared/types'
import {
  normalizeQuickPromptAnalysis,
  QUICK_PROMPT_ANALYSIS_SCHEMA,
} from '../../../shared/antigravity/quickPromptAnalysis'
import {
  TITLE_ANALYSIS_FAIL_MESSAGE,
  TITLE_ANALYSIS_SCHEMA,
  buildTitleAnalysisPrompt,
  computeTitleLocalFacts,
  hashTitleAnalysisContext,
  parseTitleAnalysisResponse,
} from '../../../shared/antigravity/titleAnalysis'
import { enrichTitleAnalysisPayload } from './enrichTitleContext'
import { IPC } from '../../../shared/types'
import { logger } from '../logging/logger'
import { settingsRepository } from '../../repositories/settingsRepository'
import { channelRepository } from '../../repositories/channelRepository'
import { getUserDataPath } from '../../paths'

const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'Texto para o usuário, em português' },
    conversationTitle: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          input: { type: 'object' },
        },
        required: ['name'],
      },
    },
  },
  required: ['message'],
}

const TITLE_CACHE_LIMIT = 40

export class AntigravityService {
  private status: AntigravityStatus = {
    connected: false,
    authenticated: false,
    authState: 'initializing',
    version: null,
    runtimePath: null,
    message: 'Procurando Antigravity...',
    lastCheckedAt: new Date().toISOString(),
  }
  private loginProcess: ChildProcess | null = null
  private loginPollTimer: ReturnType<typeof setInterval> | null = null
  private loginTimeout: ReturnType<typeof setTimeout> | null = null
  private currentLoginId: string | null = null
  private readonly titleCache = new Map<string, AnalyzeTitleResult['analysis']>()
  private readonly getWindow: () => BrowserWindow | null

  constructor(opts?: { getWindow?: () => BrowserWindow | null }) {
    this.getWindow = opts?.getWindow ?? (() => null)
  }

  getStatus(): AntigravityStatus {
    return this.status
  }

  async initialize(): Promise<AntigravityStatus> {
    const binary = await this.locateBinary()
    if (!binary) {
      this.setStatus({
        authState: 'not_found',
        message: 'Não instalado. Instale o Antigravity CLI (`agy`) e reconecte.',
      })
      return this.status
    }

    const version = await this.readVersion(binary)
    if (this.hasStoredToken()) {
      this.setStatus({
        authState: 'connected',
        authenticated: true,
        connected: true,
        version,
        runtimePath: binary,
        message: 'Sessão Google encontrada',
      })
    } else {
      this.setStatus({
        authState: 'not_authenticated',
        version,
        runtimePath: binary,
        message: 'CLI encontrado. Entre com o Google para analisar títulos.',
      })
    }
    logger.info('antigravity.found', { binary, version, hasToken: this.hasStoredToken() })
    return this.status
  }

  async healthCheck(): Promise<AntigravityStatus> {
    const binary = await this.locateBinary()
    if (!binary) {
      this.setStatus({
        authState: 'not_found',
        message: 'Não instalado',
      })
      return this.status
    }

    const version = await this.readVersion(binary)
    const probe = await this.runAgy(binary, ['-p', 'Responda exatamente: ok', '--output-format', 'json', '--effort', 'low', '--print-timeout', '45s'], 50_000)

    const combined = `${probe.stdout}\n${probe.stderr}`
    if (/authentication required/i.test(combined)) {
      this.setStatus({
        authState: 'not_authenticated',
        version,
        runtimePath: binary,
        message: 'Entre com o Google para vincular o Antigravity.',
      })
      return this.status
    }

    const envelope = this.parseEnvelope(probe.stdout)
    if (envelope?.status === 'SUCCESS' || /ok/i.test(probe.stdout)) {
      this.setStatus({
        authState: 'connected',
        authenticated: true,
        connected: true,
        version,
        runtimePath: binary,
        message: 'Pronto para analisar títulos',
      })
      return this.status
    }

    this.setStatus({
      authState: 'error',
      version,
      runtimePath: binary,
      message: probe.stderr.trim() || probe.stdout.trim() || 'Não foi possível falar com o Antigravity.',
    })
    return this.status
  }

  async loginStart(): Promise<AntigravityLoginStartResult> {
    const binary = this.status.runtimePath || (await this.locateBinary())
    if (!binary) {
      this.setStatus({
        authState: 'not_found',
        message: 'Antigravity CLI (`agy`) não encontrado.',
      })
      throw new Error('Instale o Antigravity CLI (`agy`) neste computador para entrar com o Google.')
    }

    this.loginCancel()
    const loginId = randomUUID()
    this.currentLoginId = loginId
    this.setStatus({
      authState: 'authenticating',
      version: this.status.version,
      runtimePath: binary,
      message: 'Aguardando login Google no Antigravity...',
    })

    const scriptPath = this.writeLoginScript(binary)
    if (process.platform === 'win32') {
      const title = 'Antigravity Login'
      const command = `start "${title}" cmd.exe /k "${scriptPath}"`
      this.loginProcess = spawn(command, {
        shell: true,
        windowsHide: false,
        detached: true,
        stdio: 'ignore',
        cwd: os.homedir(),
        env: this.agyEnv(),
      })
      this.loginProcess.unref()
    } else {
      this.loginProcess = spawn(binary, [], {
        detached: true,
        stdio: 'ignore',
        cwd: os.homedir(),
        env: this.agyEnv(),
      })
      this.loginProcess.unref()
    }

    this.loginPollTimer = setInterval(() => {
      if (this.currentLoginId !== loginId) return
      if (this.hasStoredToken()) {
        void this.finishLogin(loginId, binary)
      }
    }, 2000)

    this.loginTimeout = setTimeout(() => {
      if (this.currentLoginId !== loginId) return
      this.loginCancel()
      this.setStatus({
        authState: 'not_authenticated',
        version: this.status.version,
        runtimePath: binary,
        message: 'O login Google expirou. Tente de novo.',
      })
    }, 10 * 60 * 1000)

    logger.info('antigravity.login.started', { loginId, binary })
    return { loginId }
  }

  loginCancel(): void {
    if (this.loginPollTimer) {
      clearInterval(this.loginPollTimer)
      this.loginPollTimer = null
    }
    if (this.loginTimeout) {
      clearTimeout(this.loginTimeout)
      this.loginTimeout = null
    }
    this.currentLoginId = null
    this.loginProcess = null
    if (this.status.authState === 'authenticating') {
      this.setStatus({
        authState: this.status.runtimePath ? 'not_authenticated' : 'not_found',
        version: this.status.version,
        runtimePath: this.status.runtimePath,
        message: this.status.runtimePath
          ? 'Login cancelado. Entre com o Google para continuar.'
          : 'Não instalado',
      })
    }
  }

  async loginConfirm(): Promise<AntigravityStatus> {
    this.clearLoginTimers()
    this.currentLoginId = null
    if (this.hasStoredToken()) {
      const binary = this.status.runtimePath || (await this.locateBinary())
      this.setStatus({
        authState: 'connected',
        authenticated: true,
        connected: true,
        version: this.status.version,
        runtimePath: binary,
        message: 'Conta Google vinculada',
      })
      return this.status
    }
    return this.healthCheck()
  }

  async logout(): Promise<AntigravityStatus> {
    this.loginCancel()
    const tokenPath = this.tokenFilePath()
    if (existsSync(tokenPath)) {
      try {
        unlinkSync(tokenPath)
      } catch {
        /* ignore */
      }
    }
    this.setStatus({
      authState: this.status.runtimePath ? 'not_authenticated' : 'not_found',
      version: this.status.version,
      runtimePath: this.status.runtimePath,
      message: this.status.runtimePath
        ? 'Sessão Google encerrada'
        : 'Não instalado',
    })
    return this.status
  }

  async analyzeTitle(request: AnalyzeTitleRequest): Promise<AnalyzeTitleResult> {
    const title = request.title.trim()
    if (!title) throw new Error('O título é obrigatório para analisar.')

    const payload = enrichTitleAnalysisPayload({ ...request, title })
    const localFacts = computeTitleLocalFacts(payload.currentTitle)
    const cacheKey = hashTitleAnalysisContext({ ...payload, localFacts })
    let analysis = this.titleCache.get(cacheKey) ?? null

    if (!analysis) {
      let structured: Record<string, unknown>
      try {
        structured = await this.runStructuredPrompt({
          schemaFile: 'title-schema.json',
          schema: TITLE_ANALYSIS_SCHEMA,
          prompt: buildTitleAnalysisPrompt({ ...payload, localFacts }),
          invalidMessage: TITLE_ANALYSIS_FAIL_MESSAGE,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : TITLE_ANALYSIS_FAIL_MESSAGE
        if (/login google|não encontrado|agy/i.test(message)) throw error
        throw new Error(TITLE_ANALYSIS_FAIL_MESSAGE)
      }

      analysis = parseTitleAnalysisResponse(structured, { profile: payload.projectType, localFacts })
      if (!analysis) throw new Error(TITLE_ANALYSIS_FAIL_MESSAGE)
      this.rememberTitleAnalysis(cacheKey, analysis)
    }

    let video = null
    if (request.videoId) {
      video = channelRepository.updateVideo(request.videoId, {
        titleScore: analysis.score,
        titleAnalysis: analysis,
        titleAnalyzedAt: new Date().toISOString(),
      })
    }

    return { analysis, video }
  }

  private rememberTitleAnalysis(key: string, analysis: AnalyzeTitleResult['analysis']) {
    this.titleCache.set(key, analysis)
    while (this.titleCache.size > TITLE_CACHE_LIMIT) {
      const oldest = this.titleCache.keys().next().value
      if (!oldest) break
      this.titleCache.delete(oldest)
    }
  }

  async analyzeQuickPrompt(request: AnalyzeQuickPromptRequest): Promise<AnalyzeQuickPromptResult> {
    const prompt = request.prompt.trim()
    if (!prompt) throw new Error('O prompt é obrigatório para analisar.')

    const structured = await this.runStructuredPrompt({
      schemaFile: 'quick-prompt-schema.json',
      schema: QUICK_PROMPT_ANALYSIS_SCHEMA,
      prompt: this.buildQuickPromptAudit(request),
      invalidMessage: 'O Antigravity não devolveu uma análise válida do prompt.',
    })

    return { analysis: normalizeQuickPromptAnalysis(structured, prompt) }
  }

  async runChatPrompt(prompt: string): Promise<Record<string, unknown>> {
    return this.runStructuredPrompt({
      schemaFile: 'chat-schema.json',
      schema: CHAT_RESPONSE_SCHEMA,
      prompt,
      invalidMessage: 'O Antigravity não devolveu uma resposta válida para o Chat.',
    })
  }

  private buildQuickPromptAudit(request: AnalyzeQuickPromptRequest): string {
    const kindLabel = request.kind === 'image' ? 'Criar imagem' : 'Animar / Lipsync'
    const intent =
      request.intent === 'clean'
        ? 'Priorize limpar redundâncias e unir restrições equivalentes. Ainda reporte incoerências.'
        : 'Analise a coerência do conjunto. Problemas específicos importam mais que a nota.'
    return [
      'Você é um auditor de prompts de imagem/vídeo musical. NÃO crie um prompt novo do zero.',
      'O compositor local já montou o prompt. Você só audita e, se preciso, devolve uma versão corrigida.',
      intent,
      'Responda só no schema JSON pedido, em português do Brasil.',
      '',
      'Regras da correção:',
      '- preserve a intenção original',
      '- não invente cena nova, personagem, instrumento, ambiente ou elementos',
      '- corrija só incoerências, contradições e clareza',
      '- remova redundâncias literais e semânticas (ex.: a mesma restrição dita 2 ou 3 vezes)',
      '',
      'Verifique obrigatoriamente:',
      '1. COERÊNCIA: combinações incompatíveis entre performance, contexto, lipsync e texto do prompt.',
      '   - Performance Plateia + contexto "No palco" → aviso: plateia deveria estar na área do público.',
      '   - Baterista + lipsync ligado → aviso: não existe vocal principal.',
      '   - Banda sem cantor + prompt com "the singer" → erro.',
      '   - Guitarrista sozinho + instruções de mouth/lipsync → erro.',
      '2. LIPSYNC: se for cantor, o prompt deve manter rosto e boca visíveis, evitar perfil extremo e obstrução por microfone, e usar enquadramento adequado.',
      '   Para guitarrista sozinho, baterista, banda sem cantor e plateia: NÃO exigir singer lip sync.',
      '3. CÂMERA: profissional e fisicamente plausível. Alertar orbit, 360, circular camera movement, spinning, movimentos impossíveis, câmera excessivamente rápida, vários movimentos incompatíveis no mesmo take, câmera incompatível com a ação.',
      '4. PRESERVAÇÃO: identidade, rosto, roupa, instrumento, cenário, iluminação, número de pessoas. Detectar instruções que contradizem a imagem de referência.',
      '5. REDUNDÂNCIA: frases repetidas e restrições equivalentes (não só repetição literal).',
      '6. CONTRADIÇÕES internas (ex.: locked camera + lateral tracking; preserve exact composition + dramatically change framing; audience only + singer in foreground).',
      '',
      `Tipo: ${kindLabel}`,
      `Performance: ${request.performance}`,
      request.action ? `Ação: ${request.action}` : '',
      request.framing ? `Enquadramento: ${request.framing}` : '',
      request.camera ? `Câmera: ${request.camera}` : '',
      request.context ? `Contexto: ${request.context}` : '',
      `Lipsync: ${request.lipSync ? 'ligado' : 'desligado'}`,
      request.target ? `Destino/modelo: ${request.target}` : '',
      request.purpose ? `Finalidade: ${request.purpose}` : '',
      '',
      'Prompt final:',
      request.prompt.trim(),
    ]
      .filter((line) => line !== '')
      .join('\n')
  }

  private async runStructuredPrompt(opts: {
    schemaFile: string
    schema: object
    prompt: string
    invalidMessage: string
  }): Promise<Record<string, unknown>> {
    const binary = this.status.runtimePath || (await this.locateBinary())
    if (!binary) {
      throw new Error('Antigravity CLI (`agy`) não encontrado. Vincule o caminho em Configurações.')
    }

    const schemaPath = path.join(getUserDataPath(), 'antigravity', opts.schemaFile)
    mkdirSync(path.dirname(schemaPath), { recursive: true })
    writeFileSync(schemaPath, JSON.stringify(opts.schema), 'utf8')

    const args = [
      '-p',
      opts.prompt,
      '--output-format',
      'json',
      '--json-schema',
      schemaPath,
      '--effort',
      'low',
      '--print-timeout',
      '3m',
    ]

    const result = await this.runAgy(binary, args, 200_000)
    const combined = `${result.stdout}\n${result.stderr}`
    if (/authentication required/i.test(combined)) {
      this.setStatus({
        authState: 'not_authenticated',
        runtimePath: binary,
        version: this.status.version,
        message: 'Entre com o Google em Configurações para usar o Antigravity.',
      })
      throw new Error('Antigravity precisa do login Google. Abra Configurações e toque em Entrar com o Google.')
    }

    const envelope = this.parseEnvelope(result.stdout)
    const structured =
      envelope?.structured_output && typeof envelope.structured_output === 'object'
        ? (envelope.structured_output as Record<string, unknown>)
        : this.extractJsonObject(envelope?.response || result.stdout)

    if (!structured) {
      throw new Error(result.stderr.trim() || envelope?.error || opts.invalidMessage)
    }

    this.setStatus({
      authState: 'connected',
      authenticated: true,
      connected: true,
      runtimePath: binary,
      version: this.status.version,
      message: 'Pronto para analisar com Antigravity',
    })

    return structured
  }

  private async finishLogin(loginId: string, binary: string) {
    if (this.currentLoginId !== loginId) return
    this.clearLoginTimers()
    this.currentLoginId = null
    this.setStatus({
      authState: 'connected',
      authenticated: true,
      connected: true,
      version: this.status.version,
      runtimePath: binary,
      message: 'Conta Google vinculada',
    })
    logger.info('antigravity.login.success', { loginId })
  }

  private writeLoginScript(binary: string): string {
    const dir = path.join(getUserDataPath(), 'antigravity')
    mkdirSync(dir, { recursive: true })
    const scriptPath = path.join(dir, 'login-google.cmd')
    const content = [
      '@echo off',
      'chcp 65001 >nul',
      'title Antigravity - Login Google',
      'echo.',
      'echo  Atlas Studio — login Google no Antigravity',
      'echo  1. Escolha "Google OAuth"',
      'echo  2. Entre com sua conta Google no navegador',
      'echo  3. Se pedir um codigo, cole nesta janela',
      'echo  4. Depois feche esta janela e volte ao Atlas',
      'echo.',
      'set SSH_CONNECTION=127.0.0.1 22 127.0.0.1 43210',
      'set SSH_CLIENT=127.0.0.1 43210 22',
      'set SSH_TTY=atlas-studio',
      'set GEMINI_FORCE_FILE_STORAGE=true',
      `cd /d "${os.homedir()}"`,
      `"${binary}"`,
      'echo.',
      'echo Login encerrado. Voce ja pode fechar esta janela.',
    ].join('\r\n')
    writeFileSync(scriptPath, content, 'utf8')
    return scriptPath
  }

  private hasStoredToken(): boolean {
    return existsSync(this.tokenFilePath())
  }

  private tokenFilePath(): string {
    return path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token')
  }

  private agyEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      SSH_CONNECTION: process.env.SSH_CONNECTION || '127.0.0.1 22 127.0.0.1 43210',
      SSH_CLIENT: process.env.SSH_CLIENT || '127.0.0.1 43210 22',
      SSH_TTY: process.env.SSH_TTY || 'atlas-studio',
      GEMINI_FORCE_FILE_STORAGE: process.env.GEMINI_FORCE_FILE_STORAGE || 'true',
    }
  }

  private clearLoginTimers() {
    if (this.loginPollTimer) {
      clearInterval(this.loginPollTimer)
      this.loginPollTimer = null
    }
    if (this.loginTimeout) {
      clearTimeout(this.loginTimeout)
      this.loginTimeout = null
    }
  }

  private setStatus(partial: Partial<AntigravityStatus> & { authState: AntigravityStatus['authState'] }) {
    this.status = this.buildStatus(partial)
    this.emitState()
  }

  private emitState() {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.antigravity.authStateChanged, this.status)
    }
  }

  private async locateBinary(): Promise<string | null> {
    const settings = settingsRepository.get()
    const saved = settings.antigravityBinaryPath?.trim()
    const fromPath = await this.findInPath()
    const candidates = [
      fromPath,
      process.env.AGY_PATH,
      process.env.ANTIGRAVITY_PATH,
      saved,
      ...this.knownInstallPaths(),
    ].filter((item): item is string => Boolean(item))

    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue
      const version = await this.readVersion(candidate)
      if (version) return candidate
    }
    return null
  }

  private knownInstallPaths(): string[] {
    const local = process.env.LOCALAPPDATA ?? ''
    const profile = process.env.USERPROFILE ?? ''
    const home = process.env.HOME ?? profile
    const paths = [
      path.join(local, 'agy', 'bin', 'agy.exe'),
      path.join(local, 'Programs', 'Antigravity', 'agy.exe'),
      path.join(local, 'Programs', 'antigravity', 'agy.exe'),
      path.join(local, 'antigravity', 'agy.exe'),
      path.join(profile, '.local', 'bin', 'agy.exe'),
      path.join(profile, '.gemini', 'antigravity-cli', 'agy.exe'),
      path.join(home, '.local', 'bin', 'agy'),
      path.join(home, '.gemini', 'antigravity-cli', 'agy'),
      '/usr/local/bin/agy',
      '/opt/homebrew/bin/agy',
    ]

    const standalone = path.join(profile, '.gemini', 'antigravity-cli')
    if (existsSync(standalone)) {
      try {
        for (const name of readdirSync(standalone)) {
          paths.push(path.join(standalone, name, 'agy.exe'), path.join(standalone, name, 'agy'))
        }
      } catch {
        /* ignore */
      }
    }
    return paths.filter(Boolean)
  }

  private findInPath(): Promise<string | null> {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    return new Promise((resolve) => {
      const child = spawn(cmd, ['agy'], {
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
          resolve(stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null)
        } else {
          resolve(null)
        }
      })
    })
  }

  private async readVersion(binary: string): Promise<string | null> {
    const result = await this.runAgy(binary, ['--version'], 8000)
    const text = `${result.stdout}\n${result.stderr}`.trim()
    const match = text.match(/\d+\.\d+(\.\d+)?/)
    if (result.code === 0 || match) return match?.[0] ?? text.split(/\r?\n/)[0] ?? null
    return null
  }

  private parseEnvelope(stdout: string): {
    status?: string
    response?: string
    error?: string
    structured_output?: unknown
  } | null {
    const trimmed = stdout.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        return parsed as {
          status?: string
          response?: string
          error?: string
          structured_output?: unknown
        }
      }
    } catch {
      const start = trimmed.indexOf('{')
      const end = trimmed.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1)) as {
            status?: string
            response?: string
            error?: string
            structured_output?: unknown
          }
        } catch {
          return null
        }
      }
    }
    return null
  }

  private extractJsonObject(text: string): Record<string, unknown> | null {
    const trimmed = text.trim()
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private runAgy(
    binary: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(binary, args, {
        windowsHide: true,
        cwd: os.homedir(),
        env: this.agyEnv(),
      })
      let stdout = ''
      let stderr = ''
      let done = false
      const finish = (code: number | null) => {
        if (done) return
        done = true
        resolve({ code, stdout, stderr })
      }
      child.stdout?.on('data', (b: Buffer) => {
        stdout += b.toString('utf8')
      })
      child.stderr?.on('data', (b: Buffer) => {
        stderr += b.toString('utf8')
      })
      child.on('error', (error) => {
        stderr += error.message
        finish(1)
      })
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

  private buildStatus(partial: Partial<AntigravityStatus> & { authState: AntigravityStatus['authState'] }): AntigravityStatus {
    const connected = partial.connected ?? partial.authState === 'connected'
    return {
      connected,
      authenticated: partial.authenticated ?? connected,
      authState: partial.authState,
      version: partial.version ?? null,
      runtimePath: partial.runtimePath ?? null,
      message: partial.message ?? '',
      lastCheckedAt: new Date().toISOString(),
    }
  }
}
