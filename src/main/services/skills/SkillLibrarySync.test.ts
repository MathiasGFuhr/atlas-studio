import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DiscoveredSkill, Niche } from '@shared/types'
import { nicheNameForSkill, skillIsLinkedToNiche } from './SkillLibrarySync'

function skill(name: string, skillPath: string): DiscoveredSkill {
  return {
    name,
    path: skillPath,
    skillMdPath: path.join(skillPath, 'SKILL.md'),
    modifiedAt: null,
    hasReferences: false,
    hasScripts: false,
    hasTemplates: false,
    hasTests: false,
    hasAgents: false,
    references: [],
    scripts: [],
    templates: [],
    tests: [],
    agents: [],
    validationStatus: 'valid',
    validationMessage: null,
  }
}

describe('SkillLibrarySync', () => {
  it('usa a pasta pai como nome do nicho', () => {
    const discovered = skill(
      'extreme-documentary-writer',
      'C:\\Users\\me\\Documents\\ChatGPT\\historia extrema\\extreme-documentary-writer',
    )
    expect(nicheNameForSkill(discovered, 'C:\\Users\\me\\Documents\\ChatGPT')).toBe(
      'historia extrema',
    )
  })

  it('reconhece skill já ligada pelo basename mesmo com path unicode diferente', () => {
    const discovered = skill(
      'roteirista-historia-retencao-pt',
      'C:\\tmp\\roteirista-historia-retencao-pt',
    )
    const niches = [
      {
        id: '1',
        name: 'Histórias Esquecidas',
        defaultLanguage: 'Alemão',
        description: '',
        skillPath: 'C:\\Users\\me\\ChatGPT\\Histórias\\roteirista-historia-retencao-pt',
        scriptsPath: '',
        memoryPath: '',
        active: true,
        createdAt: '',
        updatedAt: '',
      },
    ] as Niche[]
    expect(skillIsLinkedToNiche(discovered, niches)).toBe(true)
  })

  it('sobe pastas .skill-build ao nomear o nicho', () => {
    const discovered = skill(
      'historia-vivida',
      'C:\\Users\\me\\Documents\\ChatGPT\\Historia ironica\\.skill-build\\historia-vivida',
    )
    expect(nicheNameForSkill(discovered, 'C:\\Users\\me\\Documents\\ChatGPT')).toBe(
      'Historia ironica',
    )
  })
})
