import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EditorialMemoryService } from '../memory/EditorialMemoryService'
import { UniquenessAuditService } from './UniquenessAuditService'

const root = path.join(
  process.env.USERPROFILE ?? '',
  'Documents',
  'ChatGPT',
  'Histórias esquecidas, guerras, impérios e decisões que mudaram o mundo',
  'roteiros',
)

const geradoDir = path.join(
  root,
  'gerados',
  '001-die-uhrenfabrik-von-der-eine-ganze-stadt-lebte-und-die-dann-',
)

describe('Histórias Esquecidas — auditoria real', () => {
  it('roteiros base têm aberturas e encerramentos diferentes', () => {
    const files = ['muro-de-berlim.md', 'roma-15min.md', 'roma-3min.md']
    const texts = files.map((f) =>
      fs.readFileSync(path.join(root, f), { encoding: 'utf8' }),
    )
    const openings = texts.map((c) => UniquenessAuditService.firstMeaningfulParagraph(c).slice(0, 80))
    const endings = texts.map((c) => UniquenessAuditService.lastMeaningfulParagraph(c).slice(0, 80))
    expect(new Set(openings).size).toBe(3)
    expect(new Set(endings).size).toBe(3)
  })

  it('roteiro gerado passa auditoria contra base e clone é reprovado', () => {
    if (!fs.existsSync(path.join(geradoDir, 'script-v1.md'))) return
    const v1 = fs.readFileSync(path.join(geradoDir, 'script-v1.md'), { encoding: 'utf8' })
    const prev = ['muro-de-berlim.md', 'roma-15min.md', 'roma-3min.md'].map((f) => ({
      title: f.replace('.md', ''),
      content: fs.readFileSync(path.join(root, f), { encoding: 'utf8' }),
    }))

    const audit = UniquenessAuditService.auditUniqueness(
      { title: 'Uhrenfabrik', content: v1 },
      prev,
    )
    expect(audit.passed).toBe(true)

    const clone = v1.replace(/Ruhla/g, 'Glashuette').replace(/7\.000/g, '5.200')
    const cloneAudit = UniquenessAuditService.auditUniqueness(
      { title: 'Clone', content: clone },
      [{ title: 'Uhrenfabrik', content: v1 }, ...prev],
    )
    expect(cloneAudit.passed).toBe(false)
    expect(cloneAudit.issues.length).toBeGreaterThan(0)
  })

  it('registra memória editorial do nicho após aprovação', () => {
    if (!fs.existsSync(path.join(geradoDir, 'script-v1.md'))) return
    const v1 = fs.readFileSync(path.join(geradoDir, 'script-v1.md'), { encoding: 'utf8' })
    const mem = EditorialMemoryService.recordApprovedEpisode({
      nicheId: 'hist-esquecidas',
      nicheName: 'Histórias Esquecidas',
      scriptsPath: root,
      title: 'Die Uhrenfabrik',
      topic: 'fabrica',
      content: v1,
    })
    expect(mem.episodes.length).toBeGreaterThan(0)
    expect(mem.doNotRepeat.length).toBeGreaterThan(0)
    expect(fs.existsSync(path.join(root, '_registro', 'editorial-memory.json'))).toBe(true)
  })
})
