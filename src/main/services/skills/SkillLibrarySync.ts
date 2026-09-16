import fs from 'node:fs'
import path from 'node:path'
import type { DiscoveredSkill, Niche, SkillRescanResult } from '../../../shared/types'
import { nicheRepository } from '../../repositories/nicheRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import { skillsRepository } from '../../repositories/skillsRepository'

export const DEFAULT_SKILL_LIBRARY_ROOT = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'Documents',
  'ChatGPT',
)

function normalizePath(value: string): string {
  return path.resolve(value).replace(/[/\\]+/g, '\\').replace(/\\+$/, '').toLowerCase()
}

function basenameOf(value: string): string {
  return path.basename(value).trim().toLowerCase()
}

export function skillIsLinkedToNiche(skill: DiscoveredSkill, niches: Niche[]): boolean {
  const skillPath = normalizePath(skill.path)
  const skillName = skill.name.trim().toLowerCase()
  return niches.some((niche) => {
    if (!niche.skillPath?.trim()) return false
    const nichePath = normalizePath(niche.skillPath)
    const nicheSkillName = basenameOf(niche.skillPath)
    return skillPath === nichePath || (Boolean(skillName) && skillName === nicheSkillName)
  })
}

export function nicheNameForSkill(skill: DiscoveredSkill, libraryRoot: string): string {
  const root = path.resolve(libraryRoot)
  let current = path.dirname(path.resolve(skill.path))

  while (current && path.resolve(current).toLowerCase() !== root.toLowerCase()) {
    const base = path.basename(current).trim()
    const hiddenOrBuild =
      base.startsWith('.') || base.toLowerCase() === 'build' || base.toLowerCase() === 'dist'
    if (base && !hiddenOrBuild && base.toLowerCase() !== path.basename(root).toLowerCase()) {
      return base
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return skill.name
}

function uniqueNicheName(base: string, existing: Niche[]): string {
  const names = new Set(existing.map((n) => n.name.trim().toLowerCase()))
  if (!names.has(base.trim().toLowerCase())) return base
  let index = 2
  let candidate = `${base} (${index})`
  while (names.has(candidate.trim().toLowerCase())) {
    index += 1
    candidate = `${base} (${index})`
  }
  return candidate
}

export function resolveSkillLibraryRoot(override?: string): string {
  const settings = settingsRepository.get()
  const configured = (override?.trim() || settings.skillLibraryRoot || settings.skillsPath || '').trim()
  if (configured && fs.existsSync(configured)) return path.resolve(configured)
  if (fs.existsSync(DEFAULT_SKILL_LIBRARY_ROOT)) return DEFAULT_SKILL_LIBRARY_ROOT
  return configured || DEFAULT_SKILL_LIBRARY_ROOT
}

export function provisionNichesForSkills(
  skills: DiscoveredSkill[],
  libraryRoot: string,
): number {
  const niches = nicheRepository.list()
  let created = 0

  for (const skill of skills) {
    if (skillIsLinkedToNiche(skill, niches)) continue
    const name = uniqueNicheName(nicheNameForSkill(skill, libraryRoot), niches)
    const niche = nicheRepository.create({
      name,
      defaultLanguage: 'Português',
      description: `Skill: ${skill.name}`,
      skillPath: skill.path,
      scriptsPath: '',
      memoryPath: '',
      thumbnail: null,
      active: true,
    })
    niches.push(niche)
    created += 1
    console.log(`[atlas][skills] nicho criado para ${skill.name} -> ${niche.name}`)
  }

  return created
}

function repairHiddenNicheNames(skills: DiscoveredSkill[], libraryRoot: string) {
  const niches = nicheRepository.list()
  for (const niche of niches) {
    if (!niche.name.trim().startsWith('.')) continue
    const linked = skills.find((skill) => skillIsLinkedToNiche(skill, [niche]))
    if (!linked) continue
    const others = niches.filter((item) => item.id !== niche.id)
    const nextName = uniqueNicheName(nicheNameForSkill(linked, libraryRoot), others)
    if (nextName === niche.name) continue
    nicheRepository.update(niche.id, { name: nextName })
    console.log(`[atlas][skills] nicho renomeado ${niche.name} -> ${nextName}`)
  }
}

/**
 * Varre a biblioteca, grava as skills encontradas e cria um nicho
 * para cada skill que ainda não está ligada a nenhum nicho.
 */
export function syncSkillLibrary(libraryRoot?: string): SkillRescanResult & {
  nichesCreated: number
} {
  const root = resolveSkillLibraryRoot(libraryRoot)
  const settings = settingsRepository.get()
  if (root && settings.skillLibraryRoot !== root) {
    settingsRepository.update({
      skillLibraryRoot: root,
      skillsPath: root,
    })
  }

  const result = skillsRepository.rescan(root)
  const nichesCreated = provisionNichesForSkills(result.skills, result.libraryRoot || root)
  repairHiddenNicheNames(result.skills, result.libraryRoot || root)
  return { ...result, nichesCreated }
}
