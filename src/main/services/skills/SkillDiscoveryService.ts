import fs from 'node:fs'
import path from 'node:path'
import type {
  DiscoveredSkill,
  SkillScanReport,
  SkillValidationResult,
  SkillValidationStatus,
} from '../../../shared/types'

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.cursor',
  '.vscode',
  'dist',
  'build',
  'release',
  '__pycache__',
  '.venv',
  'venv',
])

const SUPPORT_DIRS = ['references', 'scripts', 'templates', 'tests', 'agents'] as const

function safeStat(target: string): fs.Stats | null {
  try {
    return fs.statSync(target)
  } catch {
    return null
  }
}

function listDirEntries(
  dir: string,
): { entries: fs.Dirent[]; error: string | null } {
  try {
    return {
      entries: fs.readdirSync(dir, { withFileTypes: true, encoding: 'utf8' }),
      error: null,
    }
  } catch (error) {
    return {
      entries: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function hasSubdir(skillPath: string, name: string): boolean {
  const full = path.join(skillPath, name)
  const stat = safeStat(full)
  return Boolean(stat?.isDirectory())
}

function listRelativeFiles(skillPath: string, subdir: string): string[] {
  const full = path.join(skillPath, subdir)
  const stat = safeStat(full)
  if (!stat?.isDirectory()) return []
  const { entries } = listDirEntries(full)
  return entries
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => path.join(subdir, entry.name))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/**
 * Valida uma pasta como skill. Nunca altera o conteúdo do filesystem.
 */
export function validateSkill(skillPath: string): SkillValidationResult {
  const resolved = path.resolve(skillPath)
  const issues: string[] = []
  const warnings: string[] = []

  const dirStat = safeStat(resolved)
  if (!dirStat) {
    return {
      status: 'invalid',
      path: resolved,
      issues: ['Caminho inexistente ou inacessível.'],
      warnings: [],
    }
  }
  if (!dirStat.isDirectory()) {
    return {
      status: 'invalid',
      path: resolved,
      issues: ['O caminho não é um diretório.'],
      warnings: [],
    }
  }

  const skillMd = path.join(resolved, 'SKILL.md')
  const skillMdStat = safeStat(skillMd)
  if (!skillMdStat?.isFile()) {
    return {
      status: 'invalid',
      path: resolved,
      issues: ['Arquivo SKILL.md não encontrado nesta pasta.'],
      warnings: [],
    }
  }

  try {
    const content = fs.readFileSync(skillMd, { encoding: 'utf8' })
    if (!content.trim()) {
      warnings.push('SKILL.md está vazio.')
    }
  } catch {
    issues.push('Não foi possível ler SKILL.md.')
  }

  const support = {
    references: hasSubdir(resolved, 'references'),
    scripts: hasSubdir(resolved, 'scripts'),
    templates: hasSubdir(resolved, 'templates'),
    tests: hasSubdir(resolved, 'tests'),
    agents: hasSubdir(resolved, 'agents'),
  }

  if (!support.references && !support.scripts && !support.templates) {
    warnings.push('Nenhuma pasta de suporte comum encontrada (references/scripts/templates).')
  }

  let status: SkillValidationStatus = 'valid'
  if (issues.length > 0) status = 'invalid'
  else if (warnings.length > 0) status = 'warning'

  return { status, path: resolved, issues, warnings }
}

function buildDiscoveredSkill(skillPath: string): DiscoveredSkill {
  const resolved = path.resolve(skillPath)
  const skillMd = path.join(resolved, 'SKILL.md')
  const skillMdStat = safeStat(skillMd)
  const validation = validateSkill(resolved)

  return {
    name: path.basename(resolved),
    path: resolved,
    skillMdPath: skillMd,
    modifiedAt: (skillMdStat ?? safeStat(resolved))?.mtime.toISOString() ?? null,
    hasReferences: hasSubdir(resolved, 'references'),
    hasScripts: hasSubdir(resolved, 'scripts'),
    hasTemplates: hasSubdir(resolved, 'templates'),
    hasTests: hasSubdir(resolved, 'tests'),
    hasAgents: hasSubdir(resolved, 'agents'),
    references: listRelativeFiles(resolved, 'references'),
    scripts: listRelativeFiles(resolved, 'scripts'),
    templates: listRelativeFiles(resolved, 'templates'),
    tests: listRelativeFiles(resolved, 'tests'),
    agents: listRelativeFiles(resolved, 'agents'),
    validationStatus: validation.status,
    validationMessage:
      [...validation.issues, ...validation.warnings].join(' ') || null,
  }
}

function emptyReport(libraryRoot: string): SkillScanReport {
  return {
    libraryRoot,
    visitedDirectories: [],
    skillMdFound: [],
    ignoredDirectories: [],
    filesystemErrors: [],
  }
}

export function discoverSkillsWithReport(libraryRoot: string): {
  skills: DiscoveredSkill[]
  report: SkillScanReport
} {
  const root = path.resolve(libraryRoot)
  const report = emptyReport(root)
  const found: DiscoveredSkill[] = []

  const rootStat = safeStat(root)
  if (!rootStat) {
    report.filesystemErrors.push({
      path: root,
      error: 'Caminho inexistente ou inacessível.',
    })
    return { skills: [], report }
  }
  if (!rootStat.isDirectory()) {
    report.filesystemErrors.push({
      path: root,
      error: 'O caminho não é um diretório.',
    })
    return { skills: [], report }
  }

  function isWalkableDirectory(entry: fs.Dirent, fullPath: string): boolean {
    try {
      if (entry.isDirectory()) return true
      if (entry.isSymbolicLink()) {
        return Boolean(safeStat(fullPath)?.isDirectory())
      }
      return false
    } catch (error) {
      report.filesystemErrors.push({
        path: fullPath,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  function walk(dir: string, depth: number) {
    if (depth > 12) {
      report.ignoredDirectories.push({ path: dir, reason: 'profundidade máxima (12)' })
      return
    }

    report.visitedDirectories.push(dir)
    const { entries, error } = listDirEntries(dir)
    if (error) {
      report.filesystemErrors.push({ path: dir, error })
      return
    }

    const skillMdEntry = entries.find(
      (entry) => entry.isFile() && entry.name.toLowerCase() === 'skill.md',
    )
    const hasSkillMd = Boolean(skillMdEntry)

    if (hasSkillMd && skillMdEntry) {
      report.skillMdFound.push(path.join(dir, skillMdEntry.name))
      found.push(buildDiscoveredSkill(dir))
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (!isWalkableDirectory(entry, fullPath)) continue
      if (SKIP_DIR_NAMES.has(entry.name)) {
        report.ignoredDirectories.push({ path: fullPath, reason: 'diretório ignorado' })
        continue
      }
      // .skill-build guarda skills geradas; demais pastas ocultas continuam fora.
      if (entry.name.startsWith('.') && entry.name !== '.skill-build') {
        report.ignoredDirectories.push({ path: fullPath, reason: 'diretório ignorado' })
        continue
      }
      if (hasSkillMd && (SUPPORT_DIRS as readonly string[]).includes(entry.name)) {
        report.ignoredDirectories.push({ path: fullPath, reason: 'pasta de suporte da skill' })
        continue
      }

      walk(fullPath, depth + 1)
    }
  }

  walk(root, 0)

  found.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return { skills: found, report }
}

/**
 * Escaneia recursivamente a biblioteca. Só pastas com SKILL.md são skills.
 * Não modifica arquivos. Usa apenas APIs de path/fs do Node (Unicode-safe).
 */
export function discoverSkills(libraryRoot: string): DiscoveredSkill[] {
  return discoverSkillsWithReport(libraryRoot).skills
}

export function readSkillMetadata(skillPath: string): DiscoveredSkill | null {
  const validation = validateSkill(skillPath)
  if (validation.status === 'invalid') return null
  return buildDiscoveredSkill(skillPath)
}
