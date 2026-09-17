import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentModelInfo } from '../../../shared/agents/types'
import { parseCodexCatalog } from '../agents/parseCodexModels'

export function getCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex')
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHome(), 'config.toml')
}

export function getModelsCachePath(): string {
  return path.join(getCodexHome(), 'models_cache.json')
}

const PLACEHOLDER_MODELS = /^(gpt-4o|gpt|codex(\s+cli)?)$/i

export function isRealCodexModelId(model: string): boolean {
  const m = model.trim()
  if (!m) return false
  return !PLACEHOLDER_MODELS.test(m)
}

export function readTomlKey(file: string, key: string): string | null {
  if (!fs.existsSync(file)) return null
  try {
    const text = fs.readFileSync(file, 'utf8')
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match =
      text.match(new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]+)"`, 'm')) ||
      text.match(new RegExp(`^\\s*${escaped}\\s*=\\s*'([^']+)'`, 'm'))
    const value = match?.[1]?.trim()
    return value || null
  } catch {
    return null
  }
}

export function writeTomlKey(file: string, key: string, value: string): void {
  const id = value.trim()
  if (!id) throw new Error('Valor inválido')
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const line = `${key} = "${id}"`
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${line}\n`, 'utf8')
    return
  }
  const text = fs.readFileSync(file, 'utf8')
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const keyRe = new RegExp(`^\\s*${escaped}\\s*=`, 'm')
  if (keyRe.test(text)) {
    const next = text.replace(
      new RegExp(`^\\s*${escaped}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\n#]+)`, 'm'),
      line,
    )
    fs.writeFileSync(file, next, 'utf8')
    return
  }
  fs.writeFileSync(file, `${line}\n\n${text}`, 'utf8')
}

export function readConfiguredModel(): string | null {
  const value = readTomlKey(getCodexConfigPath(), 'model')
  return value && isRealCodexModelId(value) ? value : null
}

export function writeConfiguredModel(modelId: string): void {
  if (!isRealCodexModelId(modelId)) throw new Error('Modelo inválido')
  writeTomlKey(getCodexConfigPath(), 'model', modelId)
}

export function readConfiguredEffort(): string | null {
  return readTomlKey(getCodexConfigPath(), 'model_reasoning_effort')
}

export function writeConfiguredEffort(effort: string): void {
  writeTomlKey(getCodexConfigPath(), 'model_reasoning_effort', effort)
}

export function resolveEffectiveCodexModel(settingsModel?: string | null): string {
  const fromSettings = settingsModel?.trim() || ''
  if (fromSettings && isRealCodexModelId(fromSettings)) return fromSettings
  return readConfiguredModel() || ''
}

export function formatModelLabel(modelId: string, catalog?: AgentModelInfo[]): string {
  const found = catalog?.find((model) => model.id === modelId)
  return found?.label || modelId
}

/** Leitura local do cache do CLI — sem lista fixa do Atlas. */
export function listCodexModels(): AgentModelInfo[] {
  const configured = readConfiguredModel()
  const cachePath = getModelsCachePath()
  if (!fs.existsSync(cachePath)) {
    return configured ? [{ id: configured, label: configured }] : []
  }
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as unknown
    const models = parseCodexCatalog(raw, configured)
    if (configured && !models.some((model) => model.id === configured)) {
      models.unshift({ id: configured, label: configured })
    }
    return models
  } catch {
    return configured ? [{ id: configured, label: configured }] : []
  }
}
