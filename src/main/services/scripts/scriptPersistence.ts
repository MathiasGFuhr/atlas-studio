import path from 'node:path'
import fs from 'node:fs'
import type { ScriptRecord, ScriptVersion, UniquenessAuditResult } from '../../../shared/types'
import { scriptRepository } from '../../repositories/scriptRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { saveScriptToFilesystem } from '../storage/scriptFiles'
import {
  instructionRequestsLanguageChange,
  instructionRequestsTitleChange,
} from '../../../shared/adjustInstructions'
import { assertCanCreateScript } from './scriptMutationGuard'

export function persistGeneratedScript(input: {
  nicheId: string
  /** Projeto de História informado pela interface. Ausente = um projeto é criado para o roteiro. */
  projectId?: string | null
  topic: string
  language: string
  content: string
  status: ScriptRecord['status']
  durationMinutes: number
  outputStyle?: string
  scores: {
    originality?: number | null
    retention?: number | null
    naturalness?: number | null
    similarity?: number | null
  }
  scriptsPath?: string | null
  workspaceRoot: string
  nicheSlug: string
  nicheName: string
  skillPath: string
  runId: string
  audit: UniquenessAuditResult
}): { script: ScriptRecord; version: ScriptVersion; folder: string; versionFile: string } {
  assertCanCreateScript()

  const title = input.topic.trim()
  const saved = saveScriptToFilesystem({
    scriptsPath: input.scriptsPath,
    workspaceRoot: input.workspaceRoot,
    nicheSlug: input.nicheSlug,
    title,
    content: input.content,
    versionNumber: 1,
    allowCreateFolder: true,
    metadata: {
      niche: input.nicheName,
      language: input.language,
      topic: input.topic,
      durationMinutes: input.durationMinutes,
      skillPath: input.skillPath,
      runId: input.runId,
      audit: input.audit,
    },
  })

  const projectId = resolveHistoryProjectId(input.projectId, title, saved.folder)

  const script = scriptRepository.create({
    nicheId: input.nicheId,
    projectId,
    title,
    topic: input.topic,
    language: input.language,
    content: input.content,
    status: input.status,
    durationMinutes: input.durationMinutes,
    outputStyle: input.outputStyle,
    folderPath: saved.folder,
    originalityScore: input.scores.originality,
    retentionScore: input.scores.retention,
    naturalnessScore: input.scores.naturalness,
    similarityScore: input.scores.similarity,
  })

  projectRepository.touch(projectId)

  const versions = scriptRepository.versions(script.id)
  return { script, version: versions[0], folder: saved.folder, versionFile: saved.versionFile }
}

/**
 * Todo roteiro pertence a um projeto de História. Quando a geração não vem de
 * dentro de um projeto, cria-se um projeto com o título do roteiro.
 */
function resolveHistoryProjectId(
  requestedId: string | null | undefined,
  title: string,
  folder: string,
): string {
  if (requestedId) {
    const existing = projectRepository.get(requestedId)
    if (existing?.projectType === 'history') return existing.id
  }
  return projectRepository.create({
    name: title,
    projectType: 'history',
    projectFolderPath: folder,
  }).id
}

export function persistAdjustedVersion(input: {
  script: ScriptRecord
  content: string
  instruction: string
  status: ScriptRecord['status']
  scores: {
    originality?: number | null
    retention?: number | null
    naturalness?: number | null
    similarity?: number | null
  }
  scriptsPath?: string | null
  workspaceRoot: string
  nicheSlug: string
  nicheName: string
  skillPath: string
  runId: string
  audit: UniquenessAuditResult
}): { script: ScriptRecord; version: ScriptVersion; folder: string; versionFile: string } {
  const original = input.script
  if (!original.folderPath || !fs.existsSync(original.folderPath)) {
    throw new Error('Pasta do roteiro atual não encontrada. Ajuste não cria nova pasta.')
  }

  const languageLocked = !instructionRequestsLanguageChange(input.instruction)

  const updated = scriptRepository.updateContent(original.id, input.content, {
    status: input.status,
    adjustmentPrompt: input.instruction,
    scores: input.scores,
  })
  if (!updated) throw new Error('Falha ao salvar versão ajustada.')

  if (updated.id !== original.id) {
    throw new Error('Ajuste alterou o id do roteiro.')
  }
  if (updated.nicheId !== original.nicheId) {
    throw new Error('Ajuste não pode alterar o nicho do roteiro.')
  }
  if (languageLocked && updated.language !== original.language) {
    throw new Error('Ajuste não pode alterar o idioma do roteiro.')
  }
  if (!instructionRequestsTitleChange(input.instruction) && updated.title !== original.title) {
    throw new Error('Ajuste não pode alterar o título do roteiro.')
  }

  const versions = scriptRepository.versions(updated.id)
  const latest = versions[0]
  if (!latest) throw new Error('Versão ajustada não foi registrada.')

  const saved = saveScriptToFilesystem({
    scriptsPath: input.scriptsPath,
    workspaceRoot: input.workspaceRoot,
    nicheSlug: input.nicheSlug,
    title: updated.title,
    content: input.content,
    versionNumber: latest.versionNumber,
    existingFolder: original.folderPath,
    allowCreateFolder: false,
    metadata: {
      niche: input.nicheName,
      language: updated.language,
      topic: updated.topic,
      durationMinutes: updated.durationMinutes ?? undefined,
      adjustmentPrompt: input.instruction,
      skillPath: input.skillPath,
      runId: input.runId,
      audit: input.audit,
    },
  })

  if (path.resolve(saved.folder) !== path.resolve(original.folderPath)) {
    throw new Error('Ajuste tentou gravar fora da pasta do roteiro atual.')
  }

  const finalScript = scriptRepository.get(updated.id)
  if (!finalScript) throw new Error('Roteiro ajustado não encontrado.')
  if (finalScript.projectId) projectRepository.touch(finalScript.projectId)

  return {
    script: finalScript,
    version: latest,
    folder: saved.folder,
    versionFile: saved.versionFile,
  }
}
