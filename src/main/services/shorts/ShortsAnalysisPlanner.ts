import {
  parseCliCapabilityFlags,
  resolveAgentCapabilities,
  TEXT_ONLY_CAPABILITIES,
  type AgentCapabilities,
} from '../../../shared/agents/capabilities'
import { buildShortsAnalysisPlan, type ShortsAnalysisPlan } from '../../../shared/shorts/analysisPlan'
import { settingsRepository } from '../../repositories/settingsRepository'
import type { AntigravityService } from '../antigravity/AntigravityService'
import type { AgentModelCatalog } from '../agents/AgentModelCatalog'

let cachedHelp: { at: number; text: string } | null = null

async function antigravityHelp(antigravity: AntigravityService): Promise<string> {
  const now = Date.now()
  if (cachedHelp && now - cachedHelp.at < 10 * 60_000) return cachedHelp.text
  const text = await antigravity.readCliHelp().catch(() => '')
  cachedHelp = { at: now, text }
  return text
}

export async function loadShortsAnalysisPlan(input: {
  antigravity: AntigravityService
  catalog: AgentModelCatalog
  allowExternalVideoAnalysis?: boolean
}): Promise<ShortsAnalysisPlan> {
  const settings = settingsRepository.get()
  const allow =
    input.allowExternalVideoAnalysis ?? Boolean(settings.allowExternalVideoAnalysis)
  const snapshot = await input.catalog.get('antigravity')
  const help = await antigravityHelp(input.antigravity)
  const cli = parseCliCapabilityFlags(help)
  const modelCapabilities = new Map<string, AgentCapabilities>()
  for (const model of snapshot.models) {
    modelCapabilities.set(
      model.id,
      resolveAgentCapabilities({
        provider: 'antigravity',
        modelId: model.id,
        modalities: model.inputModalities ?? null,
        cli,
      }),
    )
  }
  const currentModel = snapshot.currentModel?.trim() || settings.defaultAntigravityModel?.trim() || null
  const currentCapabilities =
    (currentModel && modelCapabilities.get(currentModel)) ||
    resolveAgentCapabilities({
      provider: 'antigravity',
      modelId: currentModel,
      modalities: snapshot.models.find((model) => model.id === currentModel)?.inputModalities ?? null,
      cli,
    })
  if (!snapshot.models.length && !input.antigravity.getBinaryPath()) {
    return buildShortsAnalysisPlan({
      currentModel,
      currentCapabilities: TEXT_ONLY_CAPABILITIES,
      models: [],
      modelCapabilities,
      allowExternalVideoAnalysis: allow,
    })
  }
  return buildShortsAnalysisPlan({
    currentModel,
    currentCapabilities,
    models: snapshot.models,
    modelCapabilities,
    allowExternalVideoAnalysis: allow,
  })
}
