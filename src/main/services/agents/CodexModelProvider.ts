import fs from 'node:fs'
import type { AgentModelInfo, AgentProviderId, AgentReasoningEffort } from '../../../shared/agents/types'
import { settingsRepository } from '../../repositories/settingsRepository'
import { logger } from '../logging/logger'
import {
  getModelsCachePath,
  isRealCodexModelId,
  readConfiguredEffort,
  readConfiguredModel,
  writeConfiguredEffort,
  writeConfiguredModel,
} from '../codex/codexModels'
import type { AgentModelProvider, CliRunner, RpcRunner } from './AgentModelProvider'
import { parseCodexCatalog, parseCodexCatalogText, parseOfficialFallback } from './parseCodexModels'
import { parseReasoningEffortsFromHelp, uniqueEfforts } from './parseReasoningEfforts'

const RPC_METHODS = ['model/list', 'models/list']
const CLI_CATALOG_COMMANDS: string[][] = [
  ['debug', 'models'],
  ['models', '--json'],
  ['models'],
]

export class CodexModelProvider implements AgentModelProvider {
  readonly id: AgentProviderId = 'codex'

  constructor(
    private readonly deps: {
      runCli: CliRunner
      tryRpc?: RpcRunner
      getVersion: () => string | null | Promise<string | null>
      getAuthFingerprint: () => string | Promise<string>
      getConnected?: () => boolean
      getAccountLabel?: () => string | null
    },
  ) {}

  async getStatus() {
    return {
      version: await this.getVersion(),
      connected: Boolean(this.deps.getConnected?.()),
      account: this.deps.getAccountLabel?.() ?? null,
    }
  }

  async getVersion() {
    return this.deps.getVersion()
  }

  async getAuthFingerprint() {
    return this.deps.getAuthFingerprint()
  }

  async getCurrentModel() {
    const settings = this.readSettings()
    const fromSettings = (settings.defaultCodexModel || settings.codexModel || '').trim()
    if (fromSettings && isRealCodexModelId(fromSettings)) return fromSettings
    return readConfiguredModel()
  }

  async listModels() {
    const configured = await this.getCurrentModel()
    const rpc = await this.tryRpcCatalog(configured)
    if (rpc.models.length > 0) {
      return { ...rpc, source: 'app-server' as const, error: null }
    }

    const cli = await this.tryCliCatalog(configured)
    if (cli.models.length > 0) {
      return cli
    }

    const fileCatalog = this.readModelsCacheFile(configured)
    if (fileCatalog.length > 0) {
      return { models: fileCatalog, source: 'catalog' as const, error: null }
    }

    if (configured) {
      return {
        models: [{ id: configured, label: configured }],
        source: 'config' as const,
        error: null,
      }
    }

    const error = cli.error || rpc.error || 'Não foi possível carregar os modelos.'
    logger.warn('agents.codex.discovery.empty', { error })
    return { models: [], source: 'none' as const, error }
  }

  async setDefaultModel(model: string) {
    const id = model.trim()
    if (!isRealCodexModelId(id)) throw new Error('Modelo inválido')
    writeConfiguredModel(id)
    settingsRepository.update({ defaultCodexModel: id, codexModel: id })
  }

  async listReasoningEfforts(_modelId?: string | null) {
    const help = await this.deps.runCli(['exec', '--help'], 8000).catch(() => ({
      code: 1,
      stdout: '',
      stderr: '',
    }))
    const fromExec = parseReasoningEffortsFromHelp(`${help.stdout}\n${help.stderr}`)
    if (fromExec.length > 0) return fromExec
    const extra = await this.deps.runCli(['--help'], 8000).catch(() => ({
      code: 1,
      stdout: '',
      stderr: '',
    }))
    return parseReasoningEffortsFromHelp(`${extra.stdout}\n${extra.stderr}`)
  }

  async getCurrentReasoningEffort() {
    const settings = this.readSettings()
    const fromSettings = settings.defaultCodexEffort?.trim()
    if (fromSettings) return fromSettings
    return readConfiguredEffort()
  }

  async setReasoningEffort(effort: string) {
    const id = effort.trim()
    if (!id) throw new Error('Esforço inválido')
    writeConfiguredEffort(id)
    settingsRepository.update({ defaultCodexEffort: id })
  }

  private readSettings() {
    try {
      return settingsRepository.get()
    } catch {
      return {
        defaultCodexModel: '',
        codexModel: '',
        defaultCodexEffort: '',
      }
    }
  }

  private async tryRpcCatalog(configured: string | null): Promise<{
    models: AgentModelInfo[]
    error: string | null
    officialFallback?: string | null
    officialFallbackMessage?: string | null
  }> {
    if (!this.deps.tryRpc) return { models: [], error: null }
    for (const method of RPC_METHODS) {
      try {
        const result = await this.deps.tryRpc(method, {})
        const models = parseCodexCatalog(result, configured)
        if (models.length > 0) return { models, error: null }
      } catch (error) {
        logger.info('agents.codex.rpc.miss', {
          method,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { models: [], error: null }
  }

  private async tryCliCatalog(configured: string | null) {
    let lastError: string | null = null
    let fallback: { id: string; message: string } | null = null
    for (const args of CLI_CATALOG_COMMANDS) {
      const result = await this.deps.runCli(args, 20_000).catch((error) => ({
        code: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      }))
      const combined = `${result.stdout}\n${result.stderr}`
      fallback = fallback ?? parseOfficialFallback(combined)
      if (this.isUnknownCommand(combined, result.code)) continue
      const payload = result.code === 0 ? `${result.stdout}\n${result.stderr}` : result.stdout
      const models = parseCodexCatalogText(payload, configured)
      if (models.length > 0) {
        return {
          models,
          source: 'cli' as const,
          error: null,
          officialFallback: fallback?.id ?? null,
          officialFallbackMessage: fallback?.message ?? null,
        }
      }
      if (result.code !== 0) {
        lastError = this.shortError(combined) || lastError
      }
    }
    return {
      models: [] as AgentModelInfo[],
      source: 'none' as const,
      error: lastError,
      officialFallback: fallback?.id ?? null,
      officialFallbackMessage: fallback?.message ?? null,
    }
  }

  private readModelsCacheFile(configured: string | null): AgentModelInfo[] {
    const cachePath = getModelsCachePath()
    if (!fs.existsSync(cachePath)) return []
    try {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as unknown
      return parseCodexCatalog(raw, configured)
    } catch {
      return []
    }
  }

  private isUnknownCommand(text: string, code: number | null) {
    if (/unrecognized|unknown (command|subcommand)|unexpected argument/i.test(text)) return true
    return code !== 0 && /usage:\s*codex/i.test(text) && /debug models|models/i.test(text) === false
  }

  private shortError(text: string) {
    const line = text
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item && !/^usage:/i.test(item))
    return line ? line.slice(0, 180) : null
  }
}

export function effortsForModel(
  models: AgentModelInfo[],
  modelId: string | null,
): AgentReasoningEffort[] {
  const selected = models.find((model) => model.id === modelId)
  if (selected?.reasoningEfforts?.length) return selected.reasoningEfforts
  return uniqueEfforts(models.flatMap((model) => model.reasoningEfforts?.map((item) => item.id) ?? []))
}
