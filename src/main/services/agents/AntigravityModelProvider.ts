import type { AgentProviderId, AgentReasoningEffort } from '../../../shared/agents/types'
import { settingsRepository } from '../../repositories/settingsRepository'
import { logger } from '../logging/logger'
import type { AgentModelProvider, CliRunner } from './AgentModelProvider'
import { parseAgyModelsOutput } from './parseAgyModels'
import { parseReasoningEffortsFromHelp } from './parseReasoningEfforts'

export class AntigravityModelProvider implements AgentModelProvider {
  readonly id: AgentProviderId = 'antigravity'

  constructor(
    private readonly deps: {
      runCli: CliRunner
      getVersion: () => string | null | Promise<string | null>
      getAuthFingerprint: () => string | Promise<string>
      getConnected?: () => boolean
      hasBinary?: () => boolean | Promise<boolean>
    },
  ) {}

  async getStatus() {
    return {
      version: await this.getVersion(),
      connected: Boolean(this.deps.getConnected?.()),
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
    return settings.defaultAntigravityModel?.trim() || null
  }

  async listModels() {
    const hasBinary = this.deps.hasBinary ? await this.deps.hasBinary() : true
    if (!hasBinary) {
      return {
        models: [],
        source: 'none' as const,
        error: 'Não foi possível carregar os modelos.',
      }
    }

    const jsonAttempt = await this.deps.runCli(['models', '--json'], 15_000).catch((error) => ({
      code: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    }))
    let models = parseAgyModelsOutput(jsonAttempt.stdout, jsonAttempt.code === 0 ? jsonAttempt.stderr : '')
    if (models.length === 0) {
      const textAttempt = await this.deps.runCli(['models'], 15_000).catch((error) => ({
        code: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      }))
      models = parseAgyModelsOutput(textAttempt.stdout, textAttempt.code === 0 ? textAttempt.stderr : '')
      if (models.length === 0) {
        const combined = `${textAttempt.stdout}\n${textAttempt.stderr}\n${jsonAttempt.stderr}`
        logger.warn('agents.antigravity.discovery.empty', { error: combined.slice(0, 300) })
        return {
          models: [],
          source: 'none' as const,
          error: 'Não foi possível carregar os modelos.',
        }
      }
      return { models, source: 'cli' as const, error: null }
    }
    return { models, source: 'cli' as const, error: null }
  }

  async setDefaultModel(model: string) {
    const id = model.trim()
    if (!id) throw new Error('Modelo inválido')
    settingsRepository.update({ defaultAntigravityModel: id })
  }

  async listReasoningEfforts(_modelId?: string | null): Promise<AgentReasoningEffort[]> {
    const help = await this.deps
      .runCli(['--help'], 8000)
      .catch(() => ({ code: 1, stdout: '', stderr: '' }))
    const fromFlag = parseReasoningEffortsFromHelp(`${help.stdout}\n${help.stderr}`)
    if (fromFlag.length > 0) return fromFlag
    const extra = await this.deps
      .runCli(['help'], 8000)
      .catch(() => ({ code: 1, stdout: '', stderr: '' }))
    return parseReasoningEffortsFromHelp(`${extra.stdout}\n${extra.stderr}`)
  }

  async getCurrentReasoningEffort() {
    const settings = this.readSettings()
    return settings.defaultAntigravityEffort?.trim() || null
  }

  async setReasoningEffort(effort: string) {
    const id = effort.trim()
    if (!id) throw new Error('Esforço inválido')
    settingsRepository.update({ defaultAntigravityEffort: id })
  }

  private readSettings() {
    try {
      return settingsRepository.get()
    } catch {
      return { defaultAntigravityModel: '', defaultAntigravityEffort: '' }
    }
  }
}
