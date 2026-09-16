import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverSkills, discoverSkillsWithReport } from './SkillDiscoveryService'

const tempDirs: string[] = []

function makeTempLibrary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-skills-'))
  tempDirs.push(root)
  return root
}

function writeSkill(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# skill\n', 'utf8')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('SkillDiscoveryService', () => {
  it('encontra duas skills aninhadas sem criar nichos', () => {
    const root = makeTempLibrary()
    writeSkill(path.join(root, 'historia extrema', 'extreme-documentary-writer'))
    writeSkill(
      path.join(
        root,
        'Histórias esquecidas, guerras, impérios e decisões que mudaram o mundo',
        'roteirista-historia-retencao-pt',
      ),
    )

    const { skills, report } = discoverSkillsWithReport(root)
    const names = skills.map((s) => s.name).sort()

    expect(names).toEqual(['extreme-documentary-writer', 'roteirista-historia-retencao-pt'])
    expect(report.skillMdFound).toHaveLength(2)
    expect(report.filesystemErrors).toEqual([])
  })

  it('detecta as skills reais da biblioteca ChatGPT', () => {
    const library = path.join(
      process.env.USERPROFILE ?? '',
      'Documents',
      'ChatGPT',
    )
    if (!fs.existsSync(library)) return

    const skills = discoverSkills(library)
    const names = skills.map((s) => s.name)

    expect(names).toContain('extreme-documentary-writer')
    expect(names).toContain('historia-vivida')
    expect(names.length).toBeGreaterThanOrEqual(3)
  })

  it('entra em .skill-build para achar SKILL.md', () => {
    const root = makeTempLibrary()
    writeSkill(path.join(root, 'Historia ironica', '.skill-build', 'historia-vivida'))

    const names = discoverSkills(root).map((s) => s.name)
    expect(names).toContain('historia-vivida')
  })
})
