import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { CodexStatus } from '../../../shared/types'
import { settingsRepository } from '../../repositories/settingsRepository'
import {
  buildStatus,
  detectCodexTransport,
  runCodexPrompt,
  type CodexTransport,
} from './transport'
import { type ICodexService, type CodexServiceOptions } from './types'
import { logger } from '../logging/logger'
import { resolveEffectiveCodexModel } from './codexModels'
import { resolveRunConfig } from '../../../shared/agents/resolveRunConfig'

export class CodexService implements ICodexService {
  private status: CodexStatus = buildStatus({
    connected: false,
    message: 'Codex desconectado',
  })
  private transport: CodexTransport = { mode: 'unavailable', binaryPath: null }
  private abortController: AbortController | null = null
  private readonly workspaceRoot: string
  private readonly getWindow: () => BrowserWindow | null
  private readonly runtimeManager?: import('./CodexRuntimeManager').CodexRuntimeManager

  constructor(options: CodexServiceOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.getWindow = options.getWindow
    this.runtimeManager = options.runtimeManager
  }

  getStatus(): CodexStatus {
    if (this.runtimeManager) {
      return this.runtimeManager.getStatus()
    }
    return this.status
  }

  async connect(): Promise<CodexStatus> {
    if (this.runtimeManager) {
      this.status = await this.runtimeManager.healthCheck()
      const binaryPath = this.runtimeManager.getBinaryPath()
      this.transport = binaryPath
        ? { mode: 'cli-exec', binaryPath }
        : { mode: 'unavailable', binaryPath: null }
      return this.status
    }

    this.transport = await detectCodexTransport()
    if (this.transport.mode === 'unavailable' || !this.transport.binaryPath) {
      this.status = buildStatus({
        connected: false,
        authenticated: false,
        authState: 'not_found',
        message: 'Não instalado',
      })
      logger.warn('codex.connect.failed', { message: this.status.message })
      return this.status
    }

    const settings = settingsRepository.get()
    const modelLabel = resolveEffectiveCodexModel(settings.codexModel)

    this.status = buildStatus({
      connected: false,
      authenticated: false,
      authState: 'not_authenticated',
      model: modelLabel,
      message: 'Não vinculado',
      runtimePath: this.transport.binaryPath,
    })
    logger.info('codex.connect.binary_only', {
      binaryPath: this.transport.binaryPath,
      mode: this.transport.mode,
    })
    return this.status
  }

  async runChatPrompt(
    prompt: string,
    signal?: AbortSignal,
    extraReadableDirs?: string[],
    override?: { model?: string | null; effort?: string | null },
  ): Promise<string> {
    await this.connect()
    if (this.transport.mode === 'unavailable' || !this.transport.binaryPath) {
      throw new Error('Codex não está disponível neste computador.')
    }
    const run = this.resolveCodexRun(override)
    return runCodexPrompt({
      binaryPath: this.transport.binaryPath,
      mode: this.transport.mode,
      prompt,
      cwd: this.workspaceRoot,
      model: run.model || undefined,
      reasoningEffort: run.effort || undefined,
      extraReadableDirs,
      signal,
    })
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort()
    this.abortController = null
    if (this.runtimeManager) {
      this.status = this.runtimeManager.getStatus()
      return
    }
    this.status = buildStatus({
      connected: false,
      authenticated: false,
      authState: 'not_authenticated',
      message: 'Não vinculado',
    })
  }

  async healthCheck(): Promise<CodexStatus> {
    if (this.runtimeManager) {
      this.status = await this.runtimeManager.healthCheck()
      const binaryPath = this.runtimeManager.getBinaryPath()
      this.transport = binaryPath
        ? { mode: 'cli-exec', binaryPath }
        : { mode: 'unavailable', binaryPath: null }
      return this.status
    }
    return this.connect()
  }

  async createThread(): Promise<string> {
    return randomUUID()
  }

  async cancel(): Promise<void> {
    this.abortController?.abort()
    this.abortController = null
  }

  private resolveCodexRun(override?: { model?: string | null; effort?: string | null }) {
    const settings = settingsRepository.get()
    return resolveRunConfig({
      defaultModel: settings.codexModel,
      defaultEffort: settings.defaultCodexEffort || null,
      overrideModel: override?.model,
      overrideEffort: override?.effort,
    })
  }
}
