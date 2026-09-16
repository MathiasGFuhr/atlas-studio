import fs from 'node:fs'
import path from 'node:path'
import type { EditorialEpisodeMemory, NicheEditorialMemory } from '../../../shared/types'
import { UniquenessAuditService } from '../audit/UniquenessAuditService'

export interface EditorialScriptSummary {
  name: string
  path: string
  excerpt: string
  modifiedAt: string | null
}

const SKIP_DIRS = new Set(['_registro', 'gerados', 'node_modules', '.git'])

function safeRead(filePath: string, maxChars: number): string {
  try {
    const raw = fs.readFileSync(filePath, { encoding: 'utf8' })
    const trimmed = raw.trim()
    if (trimmed.length <= maxChars) return trimmed
    return `${trimmed.slice(0, maxChars)}\n…[trecho truncado]`
  } catch {
    return ''
  }
}

function listMarkdownFiles(root: string): string[] {
  const results: string[] = []
  if (!root || !fs.existsSync(root)) return results

  const walk = (dir: string, depth: number) => {
    if (depth > 4) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name.toLowerCase()) || entry.name.startsWith('.')) continue
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (!/\.(md|txt)$/i.test(entry.name)) continue
      if (entry.name.toLowerCase() === 'skill.md') continue
      results.push(full)
    }
  }

  walk(path.resolve(root), 0)
  return results
}

export function getRecentScriptsFromFolder(
  scriptsPath: string,
  limit = 8,
): EditorialScriptSummary[] {
  const files = listMarkdownFiles(scriptsPath)
  const withStat = files
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath)
        return { filePath, mtime: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() }
      } catch {
        return null
      }
    })
    .filter(Boolean) as Array<{ filePath: string; mtime: number; mtimeIso: string }>

  withStat.sort((a, b) => b.mtime - a.mtime)

  return withStat.slice(0, limit).map((item) => ({
    name: path.basename(item.filePath, path.extname(item.filePath)),
    path: item.filePath,
    excerpt: safeRead(item.filePath, 1200),
    modifiedAt: item.mtimeIso,
  }))
}

export function getRelevantScripts(
  scriptsPath: string,
  topic: string,
  limit = 6,
): EditorialScriptSummary[] {
  const all = getRecentScriptsFromFolder(scriptsPath, 20)
  const tokens = topic
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9à-ü]+/i)
    .filter((t) => t.length > 3)

  if (tokens.length === 0) return all.slice(0, limit)

  const scored = all
    .map((script) => {
      const hay = `${script.name}\n${script.excerpt}`.toLowerCase()
      const score = tokens.reduce((acc, token) => (hay.includes(token) ? acc + 1 : acc), 0)
      return { script, score }
    })
    .sort((a, b) => b.score - a.score || a.script.name.localeCompare(b.script.name))

  const relevant = scored.filter((s) => s.score > 0).map((s) => s.script)
  if (relevant.length >= Math.min(3, limit)) return relevant.slice(0, limit)
  return all.slice(0, limit)
}

function memoryFilePath(scriptsPath: string, memoryPath?: string | null): string | null {
  if (memoryPath?.trim()) {
    return path.join(path.resolve(memoryPath), 'editorial-memory.json')
  }
  if (scriptsPath?.trim()) {
    return path.join(path.resolve(scriptsPath), '_registro', 'editorial-memory.json')
  }
  return null
}

export function loadNicheMemory(
  nicheId: string,
  nicheName: string,
  scriptsPath: string,
  memoryPath?: string | null,
): NicheEditorialMemory {
  const empty: NicheEditorialMemory = {
    nicheId,
    nicheName,
    episodes: [],
    doNotRepeat: [],
    updatedAt: new Date().toISOString(),
  }
  const file = memoryFilePath(scriptsPath, memoryPath)
  if (!file || !fs.existsSync(file)) return empty
  try {
    const parsed = JSON.parse(fs.readFileSync(file, { encoding: 'utf8' })) as NicheEditorialMemory
    return {
      ...empty,
      ...parsed,
      nicheId,
      nicheName,
      episodes: parsed.episodes ?? [],
      doNotRepeat: parsed.doNotRepeat ?? [],
    }
  } catch {
    return empty
  }
}

export function recordApprovedEpisode(options: {
  nicheId: string
  nicheName: string
  scriptsPath: string
  memoryPath?: string | null
  scriptId?: string
  title: string
  topic: string
  content: string
}): NicheEditorialMemory {
  const file = memoryFilePath(options.scriptsPath, options.memoryPath)
  if (!file) {
    return loadNicheMemory(options.nicheId, options.nicheName, options.scriptsPath, options.memoryPath)
  }

  const current = loadNicheMemory(
    options.nicheId,
    options.nicheName,
    options.scriptsPath,
    options.memoryPath,
  )
  const fingerprint = UniquenessAuditService.extractEditorialFingerprint(
    options.content,
    options.title,
    options.topic,
  )

  const episode: EditorialEpisodeMemory = {
    scriptId: options.scriptId,
    title: fingerprint.title,
    topic: fingerprint.topic,
    hook: fingerprint.hook,
    openingType: fingerprint.openingType,
    architecture: fingerprint.architecture,
    throughLine: fingerprint.throughLine,
    retentionDevice: fingerprint.retentionDevice,
    climax: fingerprint.climax,
    endingType: fingerprint.endingType,
    notablePhrases: fingerprint.notablePhrases,
    avoidNext: fingerprint.avoidNext,
    recordedAt: new Date().toISOString(),
  }

  const episodes = [episode, ...current.episodes.filter((e) => e.title !== episode.title)].slice(0, 40)
  const doNotRepeat = Array.from(
    new Set([
      ...current.doNotRepeat,
      ...fingerprint.avoidNext,
      `DO_NOT_REPEAT abertura:${fingerprint.openingType}`,
      `DO_NOT_REPEAT encerramento:${fingerprint.endingType}`,
      `DO_NOT_REPEAT arquitetura:${fingerprint.architecture}`,
    ]),
  ).slice(0, 80)

  const next: NicheEditorialMemory = {
    nicheId: options.nicheId,
    nicheName: options.nicheName,
    episodes,
    doNotRepeat,
    updatedAt: new Date().toISOString(),
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2), { encoding: 'utf8' })
  return next
}

/**
 * Contexto compacto para o Codex — não envia dezenas de roteiros completos.
 */
export function buildCompactEditorialContext(options: {
  scriptsPath: string
  memoryPath?: string | null
  nicheId: string
  nicheName: string
  topic: string
}): string {
  const memory = loadNicheMemory(
    options.nicheId,
    options.nicheName,
    options.scriptsPath,
    options.memoryPath,
  )
  const relevant = getRelevantScripts(options.scriptsPath, options.topic, 4)

  const recentFingerprints = memory.episodes.slice(0, 8).map((ep, i) =>
    [
      `${i + 1}. ${ep.title}`,
      `   abertura=${ep.openingType}; arquitetura=${ep.architecture}; encerramento=${ep.endingType}`,
      `   retenção=${ep.retentionDevice}`,
      ep.hook ? `   hook: ${ep.hook.slice(0, 160)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const doNot = memory.doNotRepeat.slice(0, 20).map((item) => `- ${item}`)

  const excerpts = relevant.map((script, index) =>
    [
      `### Excerto ${index + 1}: ${script.name}`,
      script.excerpt.slice(0, 700),
    ].join('\n'),
  )

  return [
    '## Memória editorial do nicho (compacta)',
    recentFingerprints.length
      ? recentFingerprints.join('\n')
      : '(sem episódios registrados ainda)',
    '',
    '## DO_NOT_REPEAT',
    doNot.length ? doNot.join('\n') : '(vazio)',
    '',
    '## Excertos relevantes (somente referência)',
    excerpts.length ? excerpts.join('\n\n') : '(sem arquivos anteriores)',
  ].join('\n')
}

export function buildMemoryContext(scripts: EditorialScriptSummary[]): string {
  if (scripts.length === 0) {
    return '(Nenhum roteiro anterior encontrado nesta pasta.)'
  }

  return scripts
    .map((script, index) => {
      return [
        `### Roteiro anterior ${index + 1}: ${script.name}`,
        `Arquivo: ${script.path}`,
        'Trecho (somente referência — não copiar estrutura/hooks/frases):',
        script.excerpt,
      ].join('\n')
    })
    .join('\n\n')
}

export const EditorialMemoryService = {
  getRecentScriptsFromFolder,
  getRelevantScripts,
  buildMemoryContext,
  buildCompactEditorialContext,
  loadNicheMemory,
  recordApprovedEpisode,
}
