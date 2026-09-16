import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type CodexModelInfo = {
  id: string
  label: string
  description?: string
}

function getCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex')
}

export function getCodexConfigPath(): string {
  return path.join(getCodexHome(), 'config.toml')
}

export function getModelsCachePath(): string {
  return path.join(getCodexHome(), 'models_cache.json')
}

/** Lê `model` de ~/.codex/config.toml (fonte oficial do Codex CLI). */
export function readConfiguredModel(): string | null {
  const file = getCodexConfigPath()
  if (!fs.existsSync(file)) return null
  try {
    const text = fs.readFileSync(file, 'utf8')
    const match = text.match(/^\s*model\s*=\s*"([^"]+)"/m) || text.match(/^\s*model\s*=\s*'([^']+)'/m)
    const value = match?.[1]?.trim()
    return value || null
  } catch {
    return null
  }
}

/**
 * Atualiza apenas a chave `model` em config.toml, preservando o restante.
 * Conforme docs: https://developers.openai.com/codex/config-reference
 */
export function writeConfiguredModel(modelId: string): void {
  const id = modelId.trim()
  if (!id) throw new Error('Modelo inválido')

  const file = getCodexConfigPath()
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `model = "${id}"\n`, 'utf8')
    return
  }

  const text = fs.readFileSync(file, 'utf8')
  if (/^\s*model\s*=/m.test(text)) {
    const next = text.replace(/^\s*model\s*=\s*(?:"[^"]*"|'[^']*'|[^\n#]+)/m, `model = "${id}"`)
    fs.writeFileSync(file, next, 'utf8')
    return
  }

  fs.writeFileSync(file, `model = "${id}"\n\n${text}`, 'utf8')
}

/** Catálogo local do Codex (`models_cache.json`), com fallback mínimo. */
export function listCodexModels(): CodexModelInfo[] {
  const cachePath = getModelsCachePath()
  const configured = readConfiguredModel()
  const byId = new Map<string, CodexModelInfo>()

  if (fs.existsSync(cachePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
        models?: Array<{
          slug?: string
          display_name?: string
          description?: string
          visibility?: string
        }>
      }
      for (const entry of raw.models ?? []) {
        const id = entry.slug?.trim()
        if (!id) continue
        if (entry.visibility && entry.visibility !== 'list' && entry.visibility !== 'default') {
          // ainda inclui se for o modelo configurado
          if (id !== configured) continue
        }
        byId.set(id, {
          id,
          label: entry.display_name?.trim() || id,
          description: entry.description?.trim() || undefined,
        })
      }
    } catch {
      /* ignore corrupt cache */
    }
  }

  if (configured && !byId.has(configured)) {
    byId.set(configured, { id: configured, label: configured })
  }

  // Fallbacks documentados / comuns do Codex CLI
  for (const id of ['gpt-5.6-sol', 'gpt-5.6', 'gpt-5.5', 'gpt-5.4']) {
    if (!byId.has(id)) byId.set(id, { id, label: id })
  }

  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/** Preferência efetiva: setting Atlas (se for id real) > config.toml > fallback. */
export function resolveEffectiveCodexModel(settingsModel?: string | null): string {
  const fromSettings = settingsModel?.trim() || ''
  if (fromSettings && isRealCodexModelId(fromSettings)) return fromSettings

  const fromConfig = readConfiguredModel()
  if (fromConfig) return fromConfig

  return 'gpt-5.6-sol'
}

export function isRealCodexModelId(model: string): boolean {
  const m = model.trim()
  if (!m) return false
  // Labels de UI antigas / placeholders — não são model ids do Codex.
  if (/^gpt-4o$/i.test(m)) return false
  if (/^gpt$/i.test(m)) return false
  if (/^codex(\s+cli)?$/i.test(m)) return false
  return true
}

export function formatModelLabel(modelId: string, catalog?: CodexModelInfo[]): string {
  const found = catalog?.find((m) => m.id === modelId)
  return found?.label || modelId
}
