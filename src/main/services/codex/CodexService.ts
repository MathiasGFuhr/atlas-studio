import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  AdjustScriptRequest,
  CodexStatus,
  GenerateScriptRequest,
  GenerationProgressEvent,
  GenerationResult,
  GenerationStep,
} from '../../../shared/types'
import { IPC } from '../../../shared/types'
import { scriptRepository } from '../../repositories/scriptRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import { generationRunRepository } from '../../repositories/generationRunRepository'
import { getDb } from '../../db/database'
import {
  buildStatus,
  detectCodexTransport,
  runCodexPrompt,
  type CodexTransport,
} from './transport'
import {
  createInitialSteps,
  markStep,
  markStepsCancelled,
  inferPhaseFromCodexOutput,
  type ICodexService,
  type CodexServiceOptions,
} from './types'
import {
  buildAdjustPrompt,
  buildGeneratePrompt,
  extractTitle,
  estimateDuration,
  resolveProjectRoot,
} from './prompts'
import { resolveSkillForNiche } from '../skills/SkillResolver'
import { resolveAdjustInstruction } from '../../../shared/adjustInstructions'
import { runInScriptFlow } from '../scripts/scriptMutationGuard'
import { persistAdjustedVersion, persistGeneratedScript } from '../scripts/scriptPersistence'
import { EditorialMemoryService } from '../memory/EditorialMemoryService'
import {
  UniquenessAuditService,
  type ComparableScript,
} from '../audit/UniquenessAuditService'
import { logger } from '../logging/logger'
import { resolveEffectiveCodexModel } from './codexModels'

const MAX_AUDIT_RETRIES = 2

export class CodexService implements ICodexService {
  private status: CodexStatus = buildStatus({
    connected: false,
    message: 'Codex desconectado',
  })
  private transport: CodexTransport = { mode: 'unavailable', binaryPath: null }
  private abortController: AbortController | null = null
  private activeRunId: string | null = null
  private activeFlow: 'generate' | 'adjust' | null = null
  private persistAllowedRunId: string | null = null
  private runStartedAt = 0
  private readonly workspaceRoot: string
  private readonly getWindow: () => BrowserWindow | null
  private readonly runtimeManager?: import('./CodexRuntimeManager').CodexRuntimeManager

  constructor(options: CodexServiceOptions) {
    this.workspaceRoot = options.workspaceRoot
    this.getWindow = options.getWindow
    this.runtimeManager = options.runtimeManager
  }

  getStatus(): CodexStatus {
    if (this.runtimeManager) {
      return this.runtimeManager.getStatus()
    }
    return this.status
  }

  async connect(): Promise<CodexStatus> {
    if (this.runtimeManager) {
      this.status = await this.runtimeManager.healthCheck()
      const binaryPath = this.runtimeManager.getBinaryPath()
      this.transport = binaryPath
        ? { mode: 'cli-exec', binaryPath }
        : { mode: 'unavailable', binaryPath: null }
      return this.status
    }

    this.transport = await detectCodexTransport()
    if (this.transport.mode === 'unavailable' || !this.transport.binaryPath) {
      this.status = buildStatus({
        connected: false,
        authenticated: false,
        authState: 'not_found',
        message: 'Não instalado',
      })
      logger.warn('codex.connect.failed', { message: this.status.message })
      return this.status
    }

    const settings = settingsRepository.get()
    const modelLabel = resolveEffectiveCodexModel(settings.codexModel)

    // Legacy path without runtime manager — binary found ≠ authenticated
    this.status = buildStatus({
      connected: false,
      authenticated: false,
      authState: 'not_authenticated',
      model: modelLabel,
      message: 'Não vinculado',
      runtimePath: this.transport.binaryPath,
    })
    logger.info('codex.connect.binary_only', {
      binaryPath: this.transport.binaryPath,
      mode: this.transport.mode,
    })
    return this.status
  }

  async runChatPrompt(
    prompt: string,
    signal?: AbortSignal,
    extraReadableDirs?: string[],
  ): Promise<string> {
    await this.connect()
    if (this.transport.mode === 'unavailable' || !this.transport.binaryPath) {
      throw new Error('Codex não está disponível neste computador.')
    }
    const settings = settingsRepository.get()
    return runCodexPrompt({
      binaryPath: this.transport.binaryPath,
      mode: this.transport.mode,
      prompt,
      cwd: this.workspaceRoot,
      model: resolveEffectiveCodexModel(settings.codexModel),
      extraReadableDirs,
      signal,
    })
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort()
    this.abortController = null
    if (this.runtimeManager) {
      this.status = this.runtimeManager.getStatus()
      return
    }
    this.status = buildStatus({
      connected: false,
      authenticated: false,
      authState: 'not_authenticated',
      message: 'Não vinculado',
    })
  }

  async healthCheck(): Promise<CodexStatus> {
    if (this.runtimeManager) {
      this.status = await this.runtimeManager.healthCheck()
      const binaryPath = this.runtimeManager.getBinaryPath()
      this.transport = binaryPath
        ? { mode: 'cli-exec', binaryPath }
        : { mode: 'unavailable', binaryPath: null }
      return this.status
    }
    return this.connect()
  }

  async createThread(): Promise<string> {
    return randomUUID()
  }

  async cancel(): Promise<void> {
    const runId = this.activeRunId
    this.persistAllowedRunId = null
    this.abortController?.abort()
    if (runId) {
      generationRunRepository.updateStatus(runId, 'cancelled', 'Cancelado pelo usuário')
      logger.info('codex.cancel', { runId })
    }
  }

  async generateScript(request: GenerateScriptRequest): Promise<GenerationResult> {
    return runInScriptFlow('generate', () => this.generateScriptInner(request))
  }

  private beginExclusiveOperation(kind: 'generate' | 'adjust', runId: string) {
    if (this.activeFlow === 'generate' && kind === 'adjust') {
      logger.warn('generation.superseded_by_adjust', {
        abortedRunId: this.activeRunId,
        adjustRunId: runId,
      })
      this.persistAllowedRunId = null
      this.abortController?.abort()
    } else if (this.activeRunId) {
      throw new Error(
        kind === 'generate'
          ? 'Já existe uma geração ou ajuste em andamento.'
          : 'Já existe um ajuste em andamento.',
      )
    }
    this.activeFlow = kind
    this.activeRunId = runId
    this.persistAllowedRunId = runId
    this.abortController = new AbortController()
  }

  private assertPersistAllowed(runId: string) {
    if (this.persistAllowedRunId !== runId) {
      throw new Error('Esta operação foi substituída e o resultado não será gravado.')
    }
  }

  private endOperation(runId: string) {
    if (this.activeRunId === runId) {
      this.activeRunId = null
      this.activeFlow = null
      this.persistAllowedRunId = null
      this.abortController = null
    }
  }

  private async generateScriptInner(request: GenerateScriptRequest): Promise<GenerationResult> {
    if (!request.topic?.trim()) throw new Error('Informe o tema do roteiro.')
    if (!request.language?.trim()) throw new Error('Informe o idioma.')

    const { niche, skillPath, validation } = resolveSkillForNiche(request.nicheId)
    ensureSkillMarkdown(skillPath)

    const settings = settingsRepository.get()
    const runId = randomUUID()
    const threadId = randomUUID()
    const startedAt = new Date().toISOString()
    this.runStartedAt = Date.now()
    this.beginExclusiveOperation('generate', runId)
    const projectRoot = resolveProjectRoot(skillPath, niche.scriptsPath)
    const skillHint = path.relative(projectRoot, skillPath) || path.basename(skillPath)

    getDb()
      .prepare(
        `INSERT INTO generation_runs (id, script_id, niche_id, status, started_at)
         VALUES (?, NULL, ?, 'running', ?)`,
      )
      .run(runId, niche.id, startedAt)

    let steps = createInitialSteps()
    const signal = this.abortController!.signal

    const emit = (message?: string, phase?: string) => {
      this.emitProgress({
        runId,
        steps,
        message,
        phase,
        elapsedMs: Date.now() - this.runStartedAt,
        cancellable: true,
      })
    }

    const advance = (id: GenerationStep['id'], state: GenerationStep['state'], message?: string) => {
      steps = markStep(steps, id, state)
      emit(message, id)
      logger.info('generation.step', {
        runId,
        step: id,
        state,
        elapsedMs: Date.now() - this.runStartedAt,
      })
    }

    const assertNotCancelled = () => {
      if (signal.aborted) throw new Error('Geração cancelada.')
    }

    logger.info('generation.start', {
      runId,
      threadId,
      nicheId: niche.id,
      nicheName: niche.name,
      skillPath,
      cwd: projectRoot,
      topic: request.topic,
      language: request.language,
      scriptsPath: niche.scriptsPath || null,
      skillValidation: validation.status,
    })

    emit('Preparando...', 'prepare')

    try {
      assertNotCancelled()
      advance('prepare', 'done', 'Preparando...')

      if (this.runtimeManager) {
        const runtimeStatus = this.runtimeManager.getStatus()
        if (runtimeStatus.authState === 'not_found') {
          throw new Error('Codex precisa ser configurado para gerar roteiros.')
        }
        if (!runtimeStatus.connected) {
          throw new Error('Vincule o Codex para continuar.')
        }
        const binaryPath = this.runtimeManager.getBinaryPath()
        if (binaryPath) {
          this.transport = { mode: 'cli-exec', binaryPath }
        }
        this.status = runtimeStatus
      } else if (!this.status.connected) {
        await this.connect()
      }

      if (!this.transport.binaryPath || this.transport.mode === 'unavailable') {
        throw new Error('Codex precisa ser configurado para gerar roteiros.')
      }

      assertNotCancelled()
      advance('skill', 'done', 'Skill carregada')

      const memoryNotes = EditorialMemoryService.buildCompactEditorialContext({
        scriptsPath: niche.scriptsPath,
        memoryPath: niche.memoryPath,
        nicheId: niche.id,
        nicheName: niche.name,
        topic: request.topic,
      })
      advance('memory', 'done', 'Roteiros anteriores analisados')

      const previousScripts = collectPreviousForAudit(niche.id, niche.scriptsPath)

      let content = ''
      let auditAttempt = 0
      let lastAudit = UniquenessAuditService.auditUniqueness(
        { title: request.topic, content: '' },
        previousScripts,
      )

      while (auditAttempt <= MAX_AUDIT_RETRIES) {
        assertNotCancelled()
        const isReconstruction = auditAttempt > 0

        if (!isReconstruction) {
          advance('research', 'running', 'Pesquisando...')
        } else {
          steps = markStep(steps, 'writing', 'running')
          emit('Reconstruindo arquitetura...', 'writing')
          logger.info('generation.audit.retry', {
            runId,
            attempt: auditAttempt,
            issues: lastAudit.issues,
          })
        }

        const basePrompt = buildGeneratePrompt({
          nicheName: niche.name,
          language: request.language,
          topic: request.topic,
          skillRelativeHint: skillHint.replace(/\\/g, '/'),
          memoryNotes,
          durationMinutes: request.durationMinutes,
        })

        const prompt = isReconstruction
          ? `${basePrompt}\n\n${UniquenessAuditService.buildReconstructionPrompt({
              closestTitle: lastAudit.closestEpisodeTitle ?? 'episódio anterior',
              issues: lastAudit.issues,
              language: request.language,
            })}\n\nRoteiro atual a reconstruir:\n---\n${content}\n---`
          : basePrompt

        let sawStructure = false
        let sawWriting = false

        content = await runCodexPrompt({
          binaryPath: this.transport.binaryPath,
          mode: this.transport.mode,
          prompt,
          cwd: projectRoot,
          model: resolveEffectiveCodexModel(settings.codexModel),
          threadId,
          extraReadableDirs: [skillPath, niche.scriptsPath].filter(Boolean) as string[],
          signal,
          onChunk: (chunk) => {
            const inferred = inferPhaseFromCodexOutput(chunk)
            if (!inferred) return
            if (inferred === 'structure' && !sawStructure) {
              sawStructure = true
              if (steps.find((s) => s.id === 'research')?.state === 'running') {
                steps = markStep(steps, 'research', 'done')
              }
              steps = markStep(steps, 'structure', 'running')
              emit('Estruturando...', 'structure')
            }
            if (inferred === 'writing' && !sawWriting) {
              sawWriting = true
              if (steps.find((s) => s.id === 'structure')?.state === 'running') {
                steps = markStep(steps, 'structure', 'done')
              } else if (steps.find((s) => s.id === 'research')?.state === 'running') {
                steps = markStep(steps, 'research', 'done')
                steps = markStep(steps, 'structure', 'done')
              }
              steps = markStep(steps, 'writing', 'running')
              emit('Escrevendo...', 'writing')
            }
            if (inferred === 'review') {
              if (steps.find((s) => s.id === 'writing')?.state === 'running') {
                steps = markStep(steps, 'writing', 'done')
              }
              steps = markStep(steps, 'review', 'running')
              emit('Revisando...', 'review')
            }
          },
        })

        if (!content.trim()) throw new Error('Codex retornou resposta vazia.')

        // Fechar etapas de geração sem marcar à frente do tempo real.
        for (const id of ['research', 'structure', 'writing'] as const) {
          const current = steps.find((s) => s.id === id)
          if (current && current.state !== 'done') {
            steps = steps.map((s) => (s.id === id ? { ...s, state: 'done' as const } : s))
          }
        }
        steps = markStep(steps, 'review', 'done')
        emit('Revisão concluída', 'review')

        assertNotCancelled()
        advance('audit', 'running', 'Auditando unicidade...')
        const titleProbe = extractTitle(content, request.topic)
        lastAudit = UniquenessAuditService.auditUniqueness(
          { title: titleProbe, topic: request.topic, content },
          previousScripts,
        )
        logger.info('generation.audit.result', {
          runId,
          attempt: auditAttempt,
          passed: lastAudit.passed,
          originalityScore: lastAudit.originalityScore,
          structuralSimilarity: lastAudit.structuralSimilarity,
          lexicalSimilarity: lastAudit.lexicalSimilarity,
          hookSimilarity: lastAudit.hookSimilarity,
          endingSimilarity: lastAudit.endingSimilarity,
          issues: lastAudit.issues,
        })

        if (lastAudit.passed || !settings.finalAuditEnabled) {
          advance('audit', 'done', 'Auditoria aprovada')
          break
        }

        if (auditAttempt >= MAX_AUDIT_RETRIES) {
          advance('audit', 'done', 'Auditoria com ressalvas (limite de tentativas)')
          logger.warn('generation.audit.limit', { runId, issues: lastAudit.issues })
          break
        }

        auditAttempt += 1
        steps = steps.map((s) =>
          s.id === 'writing' || s.id === 'review' || s.id === 'audit'
            ? { ...s, state: s.id === 'writing' ? 'running' : 'pending' }
            : s,
        )
        emit('Reprovada — reconstruindo arquitetura...', 'audit')
      }

      assertNotCancelled()
      this.assertPersistAllowed(runId)
      advance('saving', 'running', 'Salvando...')

      const duration = request.durationMinutes ?? estimateDuration(content)
      const similarityScore = Math.max(
        lastAudit.structuralSimilarity,
        lastAudit.lexicalSimilarity,
        lastAudit.hookSimilarity,
        lastAudit.endingSimilarity,
      )

      const persisted = persistGeneratedScript({
        nicheId: niche.id,
        projectId: request.projectId ?? null,
        topic: request.topic,
        language: request.language,
        content,
        status: lastAudit.passed ? 'pronto' : 'em_revisao',
        durationMinutes: duration,
        outputStyle: request.outputStyle ?? settings.defaultOutputStyle,
        scores: {
          originality: lastAudit.originalityScore,
          retention: null,
          naturalness: null,
          similarity: similarityScore,
        },
        scriptsPath: niche.scriptsPath,
        workspaceRoot: this.workspaceRoot,
        nicheSlug: path.basename(skillPath),
        nicheName: niche.name,
        skillPath,
        runId,
        audit: lastAudit,
      })

      EditorialMemoryService.recordApprovedEpisode({
        nicheId: niche.id,
        nicheName: niche.name,
        scriptsPath: niche.scriptsPath,
        memoryPath: niche.memoryPath,
        scriptId: persisted.script.id,
        title: persisted.script.title,
        topic: request.topic,
        content,
      })

      advance('saving', 'done')
      advance('done', 'done', 'Roteiro pronto')

      generationRunRepository.updateStatus(runId, 'done', null, persisted.script.id)

      logger.info('generation.done', {
        runId,
        threadId,
        scriptId: persisted.script.id,
        title: persisted.script.title,
        language: persisted.script.language,
        durationMs: Date.now() - this.runStartedAt,
        folderPath: persisted.folder,
        versionFile: persisted.versionFile,
        auditAttempts: auditAttempt + 1,
        originalityScore: lastAudit.originalityScore,
      })

      return { runId, script: persisted.script, version: persisted.version }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      const cancelled = /cancelad/i.test(message) || signal.aborted

      if (cancelled) {
        steps = markStepsCancelled(steps)
        this.emitProgress({
          runId,
          steps,
          message: 'Geração cancelada',
          elapsedMs: Date.now() - this.runStartedAt,
          cancellable: false,
        })
        generationRunRepository.updateStatus(runId, 'cancelled', message)
        logger.info('generation.cancelled', { runId, durationMs: Date.now() - this.runStartedAt })
        throw new Error('Geração cancelada.')
      }

      steps = steps.map((step) =>
        step.state === 'running' ? { ...step, state: 'error' as const } : step,
      )
      this.emitProgress({
        runId,
        steps,
        message,
        elapsedMs: Date.now() - this.runStartedAt,
        cancellable: false,
      })
      generationRunRepository.updateStatus(runId, 'error', message)
      logger.error('generation.error', {
        runId,
        threadId,
        durationMs: Date.now() - this.runStartedAt,
        error: message,
      })
      throw error
    } finally {
      this.endOperation(runId)
    }
  }

  async adjustScript(request: AdjustScriptRequest): Promise<GenerationResult> {
    return runInScriptFlow('adjust', () => this.adjustScriptInner(request))
  }

  private async adjustScriptInner(request: AdjustScriptRequest): Promise<GenerationResult> {
    if (!request.instruction?.trim()) throw new Error('Informe o ajuste desejado.')
    if (!request.scriptId?.trim()) throw new Error('scriptId é obrigatório para ajustar um roteiro.')

    const script = scriptRepository.get(request.scriptId)
    if (!script) throw new Error('Roteiro não encontrado.')

    const currentVersion = request.versionId
      ? scriptRepository.getVersion(script.id, request.versionId)
      : scriptRepository.latestVersion(script.id)
    if (!currentVersion) throw new Error('Versão atual do roteiro não encontrada.')

    const instruction = resolveAdjustInstruction(request.instruction)
    const currentContent = currentVersion.content || script.content
    const { niche, skillPath } = resolveSkillForNiche(script.nicheId)
    ensureSkillMarkdown(skillPath)

    const settings = settingsRepository.get()
    const runId = randomUUID()
    const threadId = randomUUID()
    const startedMs = Date.now()
    this.runStartedAt = startedMs
    this.beginExclusiveOperation('adjust', runId)
    const projectRoot = resolveProjectRoot(skillPath, niche.scriptsPath)
    const skillHint = path.relative(projectRoot, skillPath) || path.basename(skillPath)
    const v1Snapshot = scriptRepository.versions(script.id).find((v) => v.versionNumber === 1)
    const scriptsBefore = scriptRepository.count()

    let steps = createInitialSteps().map((s, i) => ({
      ...s,
      state: (i < 5 ? 'done' : i === 5 ? 'running' : 'pending') as GenerationStep['state'],
    }))
    const signal = this.abortController!.signal

    this.emitProgress({
      runId,
      steps,
      message: 'Ajustando roteiro...',
      elapsedMs: 0,
      cancellable: true,
    })

    logger.info('adjust.start', {
      runId,
      threadId,
      scriptId: script.id,
      versionId: currentVersion.id,
      versionNumber: currentVersion.versionNumber,
      skillPath,
      cwd: projectRoot,
      language: script.language,
      nicheDefaultLanguage: niche.defaultLanguage,
      instruction,
    })

    try {
      if (this.runtimeManager) {
        const runtimeStatus = this.runtimeManager.getStatus()
        if (runtimeStatus.authState === 'not_found') {
          throw new Error('Codex precisa ser configurado para ajustar roteiros.')
        }
        if (!runtimeStatus.connected) {
          throw new Error('Vincule o Codex para continuar.')
        }
        const binaryPath = this.runtimeManager.getBinaryPath()
        if (binaryPath) {
          this.transport = { mode: 'cli-exec', binaryPath }
        }
        this.status = runtimeStatus
      } else if (!this.status.connected) {
        await this.connect()
      }

      if (!this.transport.binaryPath || this.transport.mode === 'unavailable') {
        throw new Error('Codex precisa ser configurado para ajustar roteiros.')
      }

      const memoryNotes = EditorialMemoryService.buildCompactEditorialContext({
        scriptsPath: niche.scriptsPath,
        memoryPath: niche.memoryPath,
        nicheId: niche.id,
        nicheName: niche.name,
        topic: script.topic,
      })

      const prompt = buildAdjustPrompt({
        nicheName: niche.name,
        language: script.language,
        topic: script.topic,
        title: script.title,
        instruction,
        currentScript: currentContent,
        skillRelativeHint: skillHint.replace(/\\/g, '/'),
        memoryNotes,
      })

      const content = await runCodexPrompt({
        binaryPath: this.transport.binaryPath,
        mode: this.transport.mode,
        prompt,
        cwd: projectRoot,
        model: resolveEffectiveCodexModel(settings.codexModel),
        threadId,
        extraReadableDirs: [skillPath, niche.scriptsPath].filter(Boolean) as string[],
        signal,
      })

      if (!content.trim()) throw new Error('Codex retornou resposta vazia no ajuste.')

      this.assertPersistAllowed(runId)

      steps = markStep(steps, 'writing', 'done')
      steps = markStep(steps, 'review', 'done')
      steps = markStep(steps, 'audit', 'running')
      this.emitProgress({
        runId,
        steps,
        message: 'Auditando ajuste...',
        elapsedMs: Date.now() - startedMs,
      })

      const previous = collectPreviousForAudit(niche.id, niche.scriptsPath).filter(
        (p) => p.title !== script.title,
      )
      const audit = UniquenessAuditService.auditUniqueness(
        { title: script.title, topic: script.topic, content },
        previous,
      )

      const similarityScore = Math.max(
        audit.structuralSimilarity,
        audit.lexicalSimilarity,
        audit.hookSimilarity,
        audit.endingSimilarity,
      )

      const persisted = persistAdjustedVersion({
        script,
        content,
        instruction,
        status: audit.passed ? 'pronto' : 'em_revisao',
        scores: {
          originality: audit.originalityScore,
          retention: null,
          naturalness: null,
          similarity: similarityScore,
        },
        scriptsPath: niche.scriptsPath,
        workspaceRoot: this.workspaceRoot,
        nicheSlug: path.basename(skillPath),
        nicheName: niche.name,
        skillPath,
        runId,
        audit: audit,
      })

      if (scriptRepository.count() !== scriptsBefore) {
        throw new Error('Ajuste criou um novo registro em scripts.')
      }

      if (v1Snapshot) {
        const stillV1 = scriptRepository
          .versions(persisted.script.id)
          .find((v) => v.versionNumber === 1)
        if (!stillV1 || stillV1.content !== v1Snapshot.content) {
          throw new Error('Integridade de versão: v1 foi alterada indevidamente.')
        }
      }

      if (audit.passed) {
        EditorialMemoryService.recordApprovedEpisode({
          nicheId: niche.id,
          nicheName: niche.name,
          scriptsPath: niche.scriptsPath,
          memoryPath: niche.memoryPath,
          scriptId: persisted.script.id,
          title: persisted.script.title,
          topic: persisted.script.topic,
          content,
        })
      }

      steps = markStep(steps, 'audit', 'done')
      steps = markStep(steps, 'saving', 'done')
      steps = markStep(steps, 'done', 'done')
      this.emitProgress({
        runId,
        steps,
        message: `Roteiro atualizado. Versão v${persisted.version.versionNumber} criada`,
        elapsedMs: Date.now() - startedMs,
        cancellable: false,
      })

      logger.info('adjust.done', {
        runId,
        threadId,
        scriptId: persisted.script.id,
        versionNumber: persisted.version.versionNumber,
        versionFile: persisted.versionFile,
        language: persisted.script.language,
        durationMs: Date.now() - startedMs,
        originalityScore: audit.originalityScore,
      })

      return { runId, script: persisted.script, version: persisted.version }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/cancelad/i.test(message) || signal.aborted) {
        logger.info('adjust.cancelled', { runId })
        throw new Error('Geração cancelada.')
      }
      logger.error('adjust.error', {
        runId,
        threadId,
        durationMs: Date.now() - startedMs,
        error: message,
      })
      throw error
    } finally {
      this.endOperation(runId)
    }
  }

  private emitProgress(event: GenerationProgressEvent) {
    const win = this.getWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.webContents.send(IPC.generation.progress, event)
  }
}

function ensureSkillMarkdown(skillPath: string) {
  const skillFile = path.join(skillPath, 'SKILL.md')
  if (!fs.existsSync(skillFile)) {
    throw new Error('SKILL.md não encontrado na skill associada ao nicho.')
  }
}

function collectPreviousForAudit(nicheId: string, scriptsPath: string): ComparableScript[] {
  const fromDb = scriptRepository.listByNiche(nicheId, 12).map((s) => ({
    title: s.title,
    topic: s.topic,
    content: s.content,
  }))

  const fromFiles = EditorialMemoryService.getRecentScriptsFromFolder(scriptsPath, 8).map((s) => ({
    title: s.name,
    content: s.excerpt,
  }))

  const byTitle = new Map<string, ComparableScript>()
  for (const item of [...fromFiles, ...fromDb]) {
    if (!item.content?.trim()) continue
    byTitle.set(item.title.toLowerCase(), item)
  }
  return Array.from(byTitle.values())
}
