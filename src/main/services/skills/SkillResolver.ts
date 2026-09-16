import path from 'node:path'
import { nicheRepository } from '../../repositories/nicheRepository'
import {
  readSkillMetadata,
  validateSkill,
} from './SkillDiscoveryService'
import type { DiscoveredSkill, Niche, SkillValidationResult } from '../../../shared/types'

/**
 * Resolve a skill a partir do nicho.
 * A skill é sempre o caminho absoluto armazenado no nicho — nunca inventada.
 */
export function resolveSkillForNiche(nicheId: string): {
  niche: Niche
  skillPath: string
  validation: SkillValidationResult
  metadata: DiscoveredSkill | null
} {
  const niche = nicheRepository.get(nicheId)
  if (!niche) {
    throw new Error('Nicho não encontrado.')
  }
  if (!niche.skillPath?.trim()) {
    throw new Error('Este nicho não possui skill associada.')
  }

  const skillPath = path.resolve(niche.skillPath)
  const validation = validateSkill(skillPath)
  if (validation.status === 'invalid') {
    throw new Error(validation.issues[0] ?? 'Skill inválida ou inexistente.')
  }

  return {
    niche,
    skillPath,
    validation,
    metadata: readSkillMetadata(skillPath),
  }
}
