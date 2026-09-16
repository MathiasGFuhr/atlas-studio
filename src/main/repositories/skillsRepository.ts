import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getDb } from '../db/database'
import type {
  DiscoveredSkill,
  SkillRecord,
  SkillRescanResult,
  SkillScanReport,
} from '../../shared/types'
import { discoverSkillsWithReport } from '../services/skills/SkillDiscoveryService'
import { settingsRepository } from './settingsRepository'

type SkillRow = {
  id: string
  name: string
  path: string
  modified_at: string | null
  has_references: number
  has_scripts: number
  has_templates: number
  has_tests: number
  has_agents: number
  validation_status: string
  validation_message: string | null
  active: number
  created_at: string
  updated_at: string
}

function mapSkill(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    modifiedAt: row.modified_at,
    hasReferences: Number(row.has_references) === 1,
    hasScripts: Number(row.has_scripts) === 1,
    hasTemplates: Number(row.has_templates) === 1,
    hasTests: Number(row.has_tests) === 1,
    hasAgents: Number(row.has_agents) === 1,
    validationStatus: row.validation_status as SkillRecord['validationStatus'],
    validationMessage: row.validation_message,
    active: Number(row.active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDiscovered(row: SkillRecord): DiscoveredSkill {
  return {
    name: row.name,
    path: row.path,
    skillMdPath: path.join(row.path, 'SKILL.md'),
    modifiedAt: row.modifiedAt,
    hasReferences: row.hasReferences,
    hasScripts: row.hasScripts,
    hasTemplates: row.hasTemplates,
    hasTests: row.hasTests,
    hasAgents: row.hasAgents,
    references: [],
    scripts: [],
    templates: [],
    tests: [],
    agents: [],
    validationStatus: row.validationStatus,
    validationMessage: row.validationMessage,
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

function isUsableSkill(skill: DiscoveredSkill): boolean {
  return skill.validationStatus !== 'invalid'
}

function logScan(report: SkillScanReport, skillCount: number) {
  const summary = `[atlas][skills] root=${report.libraryRoot} detectadas=${skillCount} skill.md=${report.skillMdFound.length} visitados=${report.visitedDirectories.length} ignorados=${report.ignoredDirectories.length} erros=${report.filesystemErrors.length}`
  console.log(summary)
  if (skillCount <= 1) {
    console.log('[atlas][skills] diagnóstico', {
      libraryRoot: report.libraryRoot,
      visitedDirectories: report.visitedDirectories,
      skillMdFound: report.skillMdFound,
      ignoredDirectories: report.ignoredDirectories,
      filesystemErrors: report.filesystemErrors,
    })
  }
}

export const skillsRepository = {
  list(activeOnly = true): SkillRecord[] {
    const sql = activeOnly
      ? 'SELECT * FROM skills WHERE active = 1 ORDER BY name ASC'
      : 'SELECT * FROM skills ORDER BY name ASC'
    return (getDb().prepare(sql).all() as SkillRow[]).map(mapSkill)
  },

  /**
   * Lista skills válidas detectadas no filesystem (SkillDiscoveryService).
   * Não cria nichos. A tabela skills só é atualizada em rescan().
   */
  listDiscovered(_activeOnly = true): DiscoveredSkill[] {
    return this.scanLibrary().skills
  },

  scanLibrary(libraryRoot?: string): { skills: DiscoveredSkill[]; report: SkillScanReport } {
    const settings = settingsRepository.get()
    const root = (libraryRoot?.trim() || settings.skillLibraryRoot || '').trim()
    if (!root) {
      return { skills: [], report: emptyReport('') }
    }
    const { skills, report } = discoverSkillsWithReport(root)
    const usable = skills.filter(isUsableSkill)
    logScan(report, usable.length)
    return { skills: usable, report }
  },

  getByPath(skillPath: string): SkillRecord | null {
    const normalized = path.resolve(skillPath)
    const row = getDb()
      .prepare('SELECT * FROM skills WHERE lower(path) = lower(?)')
      .get(normalized) as SkillRow | undefined
    return row ? mapSkill(row) : null
  },

  /**
   * Reescaneia a biblioteca configurada.
   * Upsert por path absoluto — não duplica. Skills ausentes ficam inactive.
   */
  rescan(libraryRoot?: string): SkillRescanResult {
    const settings = settingsRepository.get()
    const root = (libraryRoot?.trim() || settings.skillLibraryRoot || '').trim()
    if (!root) {
      return {
        libraryRoot: '',
        total: 0,
        added: 0,
        updated: 0,
        removed: 0,
        skills: [],
        report: emptyReport(''),
      }
    }

    const { skills: discovered, report } = discoverSkillsWithReport(root)
    const usable = discovered.filter(isUsableSkill)
    logScan(report, usable.length)
    const existing = this.list(false)
    const byPath = new Map(existing.map((s) => [s.path.toLowerCase(), s]))
    const seen = new Set<string>()
    const now = new Date().toISOString()
    let added = 0
    let updated = 0

    const insert = getDb().prepare(`
      INSERT INTO skills (
        id, name, path, modified_at, has_references, has_scripts, has_templates,
        has_tests, has_agents, validation_status, validation_message, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)

    const update = getDb().prepare(`
      UPDATE skills SET
        name = ?, modified_at = ?, has_references = ?, has_scripts = ?,
        has_templates = ?, has_tests = ?, has_agents = ?,
        validation_status = ?, validation_message = ?, active = 1, updated_at = ?
      WHERE id = ?
    `)

    for (const skill of discovered) {
      const key = skill.path.toLowerCase()
      seen.add(key)
      const prev = byPath.get(key)
      if (!prev) {
        insert.run(
          randomUUID(),
          skill.name,
          skill.path,
          skill.modifiedAt,
          skill.hasReferences ? 1 : 0,
          skill.hasScripts ? 1 : 0,
          skill.hasTemplates ? 1 : 0,
          skill.hasTests ? 1 : 0,
          skill.hasAgents ? 1 : 0,
          skill.validationStatus,
          skill.validationMessage,
          now,
          now,
        )
        added += 1
      } else {
        update.run(
          skill.name,
          skill.modifiedAt,
          skill.hasReferences ? 1 : 0,
          skill.hasScripts ? 1 : 0,
          skill.hasTemplates ? 1 : 0,
          skill.hasTests ? 1 : 0,
          skill.hasAgents ? 1 : 0,
          skill.validationStatus,
          skill.validationMessage,
          now,
          prev.id,
        )
        updated += 1
      }
    }

    let removed = 0
    const deactivate = getDb().prepare(
      'UPDATE skills SET active = 0, updated_at = ? WHERE id = ? AND active = 1',
    )
    for (const prev of existing) {
      if (!seen.has(prev.path.toLowerCase()) && prev.active) {
        deactivate.run(now, prev.id)
        removed += 1
      }
    }

    return {
      libraryRoot: root,
      total: usable.length,
      added,
      updated,
      removed,
      skills: usable,
      report,
    }
  },
}
