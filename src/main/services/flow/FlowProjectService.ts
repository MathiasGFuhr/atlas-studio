import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { shell } from 'electron'
import type {
  FlowCreateProgress,
  FlowExtensionStatus,
  FlowGenerationCard,
  FlowProject,
  FlowProjectCreateInput,
  FlowProjectPatch,
  FlowSyncStatus,
} from '../../../shared/flowProjects'
import {
  buildFlowProjectUrl,
  buildFlowReferenceUploadFileName,
  buildFlowUploadKey,
  FLOW_IMAGE_MODEL_LABEL,
  maskGoogleAccountHint,
  matchFlowReferencesByMentions,
  normalizeFlowProjectPrompt,
  normalizeFlowProjectUrl,
  parseFlowProjectIdFromUrl,
  parseFlowPromptMentions,
  planFlowLinkAttempt,
  splitFlowPromptSegments,
  validateFlowProjectCreateInput,
} from '../../../shared/flowProjects'
import type { FlowBridgeCommand, FlowBridgeEvent, FlowBridgeReferencePayload } from '../../../shared/flowBridgeProtocol'
import { mimeTypeFromImagePath } from '../../../shared/flowBridgeProtocol'
import { flowGenerationCardRepository } from '../../repositories/flowGenerationCardRepository'
import { flowProjectRepository } from '../../repositories/flowProjectRepository'
import { flowReferenceRepository } from '../../repositories/flowReferenceRepository'
import { parseFlowPromptsForImport } from '../../../shared/scenePromptImport'
import { folderExists } from '../storage/projectFolders'
import { flowBridgeServer } from './FlowBridgeServer'
import { logger } from '../logging/logger'

const MAX_FLOW_UPLOAD_REFS = 8

export type FlowProjectStore = {
  list: (filters?: { query?: string }) => FlowProject[]
  get: (id: string) => FlowProject | null
  create: (
    input: FlowProjectCreateInput & { operationId?: string; syncStatus?: FlowSyncStatus },
  ) => FlowProject
  update: (
    id: string,
    patch: Partial<
      Pick<
        FlowProject,
        | 'remoteUrl'
        | 'remoteId'
        | 'accountHint'
        | 'syncStatus'
        | 'lastError'
        | 'createInFlow'
        | 'name'
        | 'localFolderPath'
        | 'prompt'
        | 'imageModel'
        | 'imageOutputs'
        | 'generationPaused'
      >
    >,
  ) => FlowProject | null
  remove: (id: string) => boolean
  getByRemoteId?: (remoteId: string) => FlowProject | null
}

export type FlowBridgePort = {
  start: () => Promise<{
    running: boolean
    port: number | null
    token: string | null
    extensionConnected: boolean
    accountHint: string | null
    extensionPath: string
    lastError: string | null
  }>
  getStatus: () => {
    running: boolean
    port: number | null
    token: string | null
    extensionConnected: boolean
    accountHint: string | null
    extensionPath: string
    lastError: string | null
  }
  enqueue: (command: FlowBridgeCommand) => void
  on: (event: 'event', listener: (payload: FlowBridgeEvent) => void) => void
  off: (event: 'event', listener: (payload: FlowBridgeEvent) => void) => void
}

type Deps = {
  store: FlowProjectStore
  bridge: FlowBridgePort
  folderExistsFn: (folder: string) => boolean
  now: () => number
  createOperationId: () => string
  waitForExtensionMs: number
  waitForResultMs: number
}

const defaultDeps = (): Deps => ({
  store: flowProjectRepository,
  bridge: flowBridgeServer,
  folderExistsFn: folderExists,
  now: () => Date.now(),
  createOperationId: () => randomUUID(),
  waitForExtensionMs: 45_000,
  waitForResultMs: 120_000,
})

function toExtensionStatus(
  bridge: ReturnType<FlowBridgePort['getStatus']>,
): FlowExtensionStatus {
  return {
    bridgeRunning: bridge.running,
    bridgePort: bridge.port,
    extensionConnected: bridge.extensionConnected,
    accountHint: bridge.accountHint,
    extensionPath: bridge.extensionPath,
    pairToken: bridge.token,
    lastError: bridge.lastError,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertProjectExists(store: FlowProjectStore, projectId: string): FlowProject {
  const project = store.get(projectId)
  if (!project) throw new Error('Projeto Flow não encontrado.')
  return project
}

async function runGenerationCard(
  deps: Deps,
  args: {
    cardId: string
    submit: boolean
    syncPrompt: (
      projectId: string,
      options?: { submit?: boolean; promptOverride?: string },
    ) => Promise<{ mentions: number; submitted: boolean; verified: boolean }>
    emitProgress: (project: FlowProject, stage: string, message: string) => void
    beginInFlight: (id: string, kind: InFlightKind) => symbol
    endInFlight: (id: string, token: symbol) => void
  },
): Promise<FlowGenerationCard> {
  const card = flowGenerationCardRepository.get(args.cardId)
  if (!card) throw new Error('Card de geração não encontrado.')
  const project = assertProjectExists(deps.store, card.projectId)

  if (args.submit && project.generationPaused) {
    const blocked = flowGenerationCardRepository.update(card.id, {
      status: 'blocked',
      lastError:
        project.lastError ||
        'Geração pausada após aviso do Flow. Clique em Retomar geração.',
    })
    throw new Error(blocked?.lastError || 'Geração pausada.')
  }

  const status = args.submit ? 'generating' : 'preparing'
  flowGenerationCardRepository.update(card.id, {
    status,
    lastError: null,
    prepLog: [...card.prepLog, args.submit ? 'generate_requested' : 'prepare_started'],
  })

  try {
    const result = await args.syncPrompt(card.projectId, {
      submit: args.submit,
      promptOverride: card.prompt,
    })
    const next = flowGenerationCardRepository.update(card.id, {
      status: args.submit ? 'done' : 'prepared',
      lastError: null,
      prepLog: [
        ...card.prepLog,
        'ref_located',
        'ref_attached',
        result.verified ? 'text_verified' : 'text_unverified',
        `mentions:${result.mentions}`,
        result.submitted ? 'generate_requested' : 'prepare_only',
        'flow_result:ok',
      ],
    })
    if (!next) throw new Error('Falha ao atualizar o card.')
    args.emitProgress(
      project,
      args.submit ? 'card_generated' : 'card_prepared',
      `Card ${String(card.number).padStart(2, '0')} ${args.submit ? 'gerado' : 'preparado'}.`,
    )
    return next
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const unusual = /atividade incomum|unusual activity|notamos uma atividade/i.test(message)
    const paused = deps.store.get(card.projectId)?.generationPaused
    const next = flowGenerationCardRepository.update(card.id, {
      status: unusual || paused ? 'blocked' : 'error',
      lastError: message,
      prepLog: [...card.prepLog, `flow_result:error`, message.slice(0, 200)],
    })
    if (!next) throw error
    throw Object.assign(error instanceof Error ? error : new Error(message), { card: next })
  }
}

type InFlightKind = 'link' | 'upload' | 'prompt' | 'remove'
type InFlightEntry = { token: symbol; startedAt: number; kind: InFlightKind }

/** Se a UI remontar no meio do envio, o lock antigo não pode bloquear retentativa por 2 min. */
const IN_FLIGHT_STALE_MS = 25_000

export function createFlowProjectService(overrides: Partial<Deps> = {}) {
  const deps: Deps = { ...defaultDeps(), ...overrides }
  const progressListeners = new Set<(event: FlowCreateProgress) => void>()
  const inFlight = new Map<string, InFlightEntry>()

  function findByRemoteId(remoteId: string): FlowProject | null {
    const id = remoteId.trim()
    if (!id) return null
    return deps.store.getByRemoteId?.(id) ?? deps.store.list().find((item) => item.remoteId === id) ?? null
  }

  function getInFlight(id: string): InFlightEntry | null {
    const entry = inFlight.get(id)
    if (!entry) return null
    if (deps.now() - entry.startedAt > IN_FLIGHT_STALE_MS) {
      inFlight.delete(id)
      logger.warn('flow.inflight.stale_cleared', {
        id,
        kind: entry.kind,
        ageMs: deps.now() - entry.startedAt,
      })
      return null
    }
    return entry
  }

  function beginInFlight(id: string, kind: InFlightKind): symbol {
    const current = getInFlight(id)
    if (current) {
      throw new Error(
        kind === 'upload' && current.kind === 'upload'
          ? 'Já estou enviando as referências deste projeto. Aguarde alguns segundos e tente de novo.'
          : 'Aguarde a operação em andamento neste projeto.',
      )
    }
    const token = Symbol(kind)
    inFlight.set(id, { token, startedAt: deps.now(), kind })
    return token
  }

  function endInFlight(id: string, token: symbol): void {
    const current = inFlight.get(id)
    if (current?.token === token) inFlight.delete(id)
  }

  function removeLocalFromRemote(remoteId: string, message: string): FlowProject | null {
    const local = findByRemoteId(remoteId)
    if (!local) return null
    // Operação em andamento (ex.: enviar referências) — nunca apagar o projeto local no meio.
    if (getInFlight(local.id)) {
      logger.warn('flow.project_deleted_ignored_inflight', {
        id: local.id,
        remoteId,
        message,
      })
      return null
    }
    try {
      flowReferenceRepository.removeByProject(local.id)
    } catch {
      /* ignore */
    }
    try {
      flowGenerationCardRepository.removeByProject(local.id)
    } catch {
      /* ignore */
    }
    deps.store.remove(local.id)
    inFlight.delete(local.id)
    emitProgress(local, 'removed', message)
    logger.info('flow.project.removed_from_remote', { id: local.id, remoteId })
    return local
  }

  deps.bridge.on('event', (event) => {
    if (event.type !== 'project_deleted') return
    if (!event.remoteId?.trim()) return
    removeLocalFromRemote(
      event.remoteId,
      event.source === 'atlas'
        ? 'Projeto excluído no Atlas e no Google Flow.'
        : 'Projeto excluído no Google Flow. Removido do Atlas.',
    )
  })

  function emitProgress(project: FlowProject, stage: string, message: string) {
    const event: FlowCreateProgress = {
      projectId: project.id,
      stage,
      message,
      syncStatus: project.syncStatus,
    }
    for (const listener of progressListeners) listener(event)
  }

  function patchProject(
    id: string,
    patch: Parameters<FlowProjectStore['update']>[1],
  ): FlowProject {
    const updated = deps.store.update(id, patch)
    if (!updated) throw new Error('Projeto Flow não encontrado.')
    return updated
  }

  async function ensureBridge() {
    const status = await deps.bridge.start()
    if (!status.running || !status.port || !status.token) {
      throw new Error(status.lastError || 'Não foi possível iniciar a ponte com a extensão Flow.')
    }
    return status
  }

  async function waitForExtensionConnected(): Promise<void> {
    const started = deps.now()
    while (deps.now() - started < deps.waitForExtensionMs) {
      const status = deps.bridge.getStatus()
      if (status.extensionConnected) return
      await sleep(120)
    }
    throw new Error(
      'Extensão Atlas Flow Bridge não conectada. Instale/carregue a extensão no Chrome e abra o Google Flow.',
    )
  }

  let lastWarmAt = 0
  /** Mantém a aba worker do Flow pré-carregada para o próximo create ser rápido. */
  function warmWorkerSession(): void {
    const status = deps.bridge.getStatus()
    if (!status.running || !status.extensionConnected) return
    if (deps.now() - lastWarmAt < 20_000) return
    lastWarmAt = deps.now()
    deps.bridge.enqueue({
      type: 'ensure_session',
      requestId: randomUUID(),
      activate: false,
    })
  }

  function waitForBridgeResult(requestId: string): Promise<FlowBridgeEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        deps.bridge.off('event', onEvent)
        reject(new Error('Tempo esgotado aguardando a extensão do Google Flow.'))
      }, deps.waitForResultMs)

      const onEvent = (event: FlowBridgeEvent) => {
        if (!('requestId' in event) || event.requestId !== requestId) return
        // Eventos intermediários — desfecho fica para linked / needs_login / error / revealed.
        if (
          event.type === 'progress' ||
          event.type === 'reference_progress' ||
          event.type === 'project_partial' ||
          event.type === 'session_ready'
        ) {
          return
        }
        // references_uploaded / prompt_filled / generation_blocked / revealed / …
        clearTimeout(timer)
        deps.bridge.off('event', onEvent)
        resolve(event)
      }

      deps.bridge.on('event', onEvent)
    })
  }

  async function linkWithExtension(projectId: string): Promise<FlowProject> {
    if (getInFlight(projectId)) {
      const current = deps.store.get(projectId)
      if (!current) throw new Error('Projeto Flow não encontrado.')
      return current
    }

    const flightToken = beginInFlight(projectId, 'link')
    try {
      let project = deps.store.get(projectId)
      if (!project) throw new Error('Projeto Flow não encontrado.')

      const previouslyLinked = project.syncStatus === 'linked'
      const plan = planFlowLinkAttempt(project)
      if (plan.action === 'skip') {
        return project
      }

      await ensureBridge()
      emitProgress(project, 'bridge', 'Ponte local iniciada. Aguardando extensão no Chrome…')

      project = patchProject(projectId, {
        syncStatus: 'creating',
        lastError: null,
      })
      emitProgress(
        project,
        'extension',
        'Automatizando o Google Flow em segundo plano (sem roubar o foco)…',
      )

      // Não abrir/focar o Chrome aqui. A extensão reutiliza ou cria uma aba inativa.
      try {
        await waitForExtensionConnected()
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Extensão Atlas Flow Bridge não conectada.'
        project = patchProject(projectId, {
          syncStatus: 'sync_failed',
          lastError:
            `${message} Abra o Google Chrome com a extensão carregada — a automação não roda com o navegador fechado.`,
        })
        emitProgress(project, 'awaiting_extension', project.lastError || message)
        throw new Error(project.lastError || message)
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        project = deps.store.get(projectId)!
        const requestId = randomUUID()
        const remoteId =
          project.remoteId?.trim() || parseFlowProjectIdFromUrl(project.remoteUrl) || null

        const command: FlowBridgeCommand = {
          type: 'create_project',
          requestId,
          operationId: project.operationId,
          name: project.name,
          remoteId: attempt > 0 || plan.action === 'create' ? null : remoteId,
          background: true,
        }

        const resultPromise = waitForBridgeResult(requestId)

        const onPartial = (event: FlowBridgeEvent) => {
          if (event.type !== 'project_partial' || event.requestId !== requestId) return
          const current = deps.store.get(projectId)
          if (!current) return
          // Salva o ID assim que o Flow cria — evita duplicata se o Atlas fechar no rename.
          patchProject(projectId, {
            remoteId: event.remoteId,
            remoteUrl: event.remoteUrl,
            syncStatus: 'creating',
            lastError: null,
          })
          emitProgress(
            { ...current, remoteId: event.remoteId, remoteUrl: event.remoteUrl, syncStatus: 'creating' },
            'project_created',
            'Projeto remoto criado. Definindo o nome…',
          )
        }
        deps.bridge.on('event', onPartial)

        const onNeedsLogin = (event: FlowBridgeEvent) => {
          if (event.type !== 'needs_login' || event.requestId !== requestId) return
          patchProject(projectId, {
            syncStatus: 'awaiting_login',
            lastError:
              event.message ||
              'Faça login na aba do Google Flow no Chrome (a extensão já a mostrou).',
          })
          // A extensão ativa a aba worker — o Atlas não abre Chrome/aba nova.
          emitProgress(
            deps.store.get(projectId)!,
            'awaiting_login',
            'Login necessário — use a aba do Flow já aberta no Chrome.',
          )
        }
        deps.bridge.on('event', onNeedsLogin)

        deps.bridge.enqueue(command)

        try {
          const result = await resultPromise

          if (result.type === 'needs_login') {
            project = patchProject(projectId, {
              syncStatus: 'awaiting_login',
              lastError:
                result.message ||
                'Faça login na aba do Google Flow no Chrome (a extensão já a mostrou).',
            })
            return project
          }

          if (result.type === 'error') {
            const notFound =
              result.code === 'project_not_found' ||
              /404|projeto não encontrado|project not found/i.test(result.message || '')

            if (notFound && previouslyLinked) {
              deps.store.remove(projectId)
              emitProgress(
                project,
                'removed',
                'Projeto excluído no Google Flow. Removido do Atlas.',
              )
              throw new Error('Projeto excluído no Google Flow. Removido do Atlas.')
            }

            if (notFound && attempt === 0) {
              project = patchProject(projectId, {
                remoteId: null,
                remoteUrl: null,
                syncStatus: 'creating',
                lastError: null,
              })
              emitProgress(
                project,
                'recreate',
                'Projeto remoto inexistente. Criando um projeto novo no Flow…',
              )
              continue
            }

            const recoveredId = notFound
              ? null
              : result.remoteId?.trim() ||
                parseFlowProjectIdFromUrl(result.remoteUrl) ||
                deps.store.get(projectId)?.remoteId ||
                null
            const status: FlowSyncStatus =
              result.code === 'not_authenticated' || result.code === 'browser_unavailable'
                ? result.code === 'not_authenticated'
                  ? 'awaiting_login'
                  : 'sync_failed'
                : 'sync_failed'
            const rawMessage = result.message || 'Falha ao sincronizar com o Google Flow.'
            const lastError = /Receiving end does not exist/i.test(rawMessage)
              ? 'A aba do Flow não respondeu à extensão. Em chrome://extensions, recarregue “Atlas Flow Bridge” e use “Tentar vincular novamente”.'
              : /já está executando outra operação/i.test(rawMessage) || result.code === 'extension_busy'
                ? 'A extensão estava ocupada e a fila foi ajustada. Clique em “Tentar vincular novamente”.'
                : notFound
                  ? 'Não foi possível criar o projeto no Google Flow. Recarregue a extensão Atlas Flow Bridge e tente de novo.'
                  : rawMessage
            project = patchProject(projectId, {
              remoteId: recoveredId,
              remoteUrl: recoveredId
                ? result.remoteUrl || buildFlowProjectUrl(recoveredId)
                : null,
              syncStatus: status,
              lastError,
            })
            emitProgress(project, 'error', lastError)
            if (result.code === 'not_authenticated') {
              return project
            }
            throw new Error(lastError)
          }

          if (result.type !== 'project_linked') {
            throw new Error('Resposta inesperada da extensão Flow.')
          }

          project = patchProject(projectId, {
            remoteId: result.remoteId,
            remoteUrl: result.remoteUrl,
            accountHint: maskGoogleAccountHint(result.accountHint),
            syncStatus: 'linked',
            lastError: null,
          })
          emitProgress(project, 'linked', 'Projeto vinculado ao Flow.')
          return project
        } finally {
          deps.bridge.off('event', onPartial)
          deps.bridge.off('event', onNeedsLogin)
        }
      }

      throw new Error('Não foi possível vincular o projeto ao Google Flow.')
    } finally {
      endInFlight(projectId, flightToken)
    }
  }

  async function deleteOnFlow(project: FlowProject): Promise<void> {
    const remoteId = project.remoteId?.trim()
    if (!remoteId) return

    await ensureBridge()
    try {
      await waitForExtensionConnected()
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `${error.message} Abra o Chrome com a extensão para excluir também no Flow.`
          : 'Abra o Chrome com a extensão Atlas Flow Bridge para excluir no Google Flow.',
      )
    }

    const requestId = randomUUID()
    const resultPromise = waitForBridgeResult(requestId)
    deps.bridge.enqueue({
      type: 'delete_project',
      requestId,
      remoteId,
      remoteUrl: project.remoteUrl,
      background: true,
    })

    const result = await resultPromise
    if (result.type === 'project_deleted') return
    if (result.type === 'needs_login') {
      throw new Error(
        'Faça login na aba do Google Flow no Chrome e tente excluir de novo.',
      )
    }
    if (result.type === 'error') {
      if (result.code === 'project_not_found') return
      throw new Error(result.message || 'Falha ao excluir o projeto no Google Flow.')
    }
    throw new Error('Resposta inesperada ao excluir no Google Flow.')
  }

  const api = {
    list(filters?: { query?: string }) {
      api.recoverInterrupted()
      void ensureBridge()
        .then(() => warmWorkerSession())
        .catch(() => undefined)
      return deps.store.list(filters).map((project) => {
        const normalized = normalizeFlowProjectUrl(project.remoteUrl)
        if (normalized && normalized !== project.remoteUrl) {
          return (
            deps.store.update(project.id, {
              remoteUrl: normalized,
              remoteId: parseFlowProjectIdFromUrl(normalized) || project.remoteId,
            }) ?? project
          )
        }
        return project
      })
    },

    get(id: string) {
      this.recoverInterrupted()
      const project = deps.store.get(id)
      if (!project) return null
      const normalized = normalizeFlowProjectUrl(project.remoteUrl)
      if (normalized && normalized !== project.remoteUrl) {
        return (
          deps.store.update(id, {
            remoteUrl: normalized,
            remoteId: parseFlowProjectIdFromUrl(normalized) || project.remoteId,
          }) ?? project
        )
      }
      return project
    },

    update(id: string, patch: FlowProjectPatch): FlowProject {
      const updated = deps.store.update(id, patch)
      if (!updated) throw new Error('Projeto Flow não encontrado.')
      return updated
    },

    async getExtensionStatus(): Promise<FlowExtensionStatus> {
      try {
        const status = await ensureBridge()
        if (status.extensionConnected) warmWorkerSession()
        return toExtensionStatus(status)
      } catch (error) {
        return {
          bridgeRunning: false,
          bridgePort: null,
          extensionConnected: false,
          accountHint: null,
          extensionPath: deps.bridge.getStatus().extensionPath,
          pairToken: null,
          lastError: error instanceof Error ? error.message : String(error),
        }
      }
    },

    onProgress(listener: (event: FlowCreateProgress) => void) {
      progressListeners.add(listener)
      return () => {
        progressListeners.delete(listener)
      }
    },

    async create(input: FlowProjectCreateInput): Promise<FlowProject> {
      const validated = validateFlowProjectCreateInput({
        name: input.name,
        localFolderPath: input.localFolderPath,
        folderExists: deps.folderExistsFn(String(input.localFolderPath ?? '')),
      })
      if (!validated.ok) throw new Error(validated.error)

      const createInFlow = input.createInFlow !== false
      const project = deps.store.create({
        name: validated.name,
        localFolderPath: validated.localFolderPath,
        createInFlow,
        operationId: deps.createOperationId(),
        syncStatus: 'local_created',
      })

      logger.info('flow.project.local_created', {
        id: project.id,
        createInFlow,
      })

      if (!createInFlow) return project

      try {
        return await linkWithExtension(project.id)
      } catch (error) {
        const current = deps.store.get(project.id) ?? project
        if (current.syncStatus === 'linked') return current
        // Preserva o local; status já deve refletir falha/awaiting.
        if (current.syncStatus === 'local_created') {
          return patchProject(project.id, {
            syncStatus: 'sync_failed',
            lastError: error instanceof Error ? error.message : String(error),
          })
        }
        return current
      }
    },

    async retryLink(id: string): Promise<FlowProject> {
      const project = deps.store.get(id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      if (!project.createInFlow) {
        return patchProject(id, { createInFlow: true, lastError: null })
      }
      return linkWithExtension(id)
    },

    async openLocal(id: string): Promise<boolean> {
      const project = deps.store.get(id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      if (!deps.folderExistsFn(project.localFolderPath)) {
        throw new Error('A pasta local vinculada não existe mais.')
      }
      const error = await shell.openPath(project.localFolderPath)
      if (error) throw new Error(error)
      return true
    },

    /**
     * Modo acompanhar ("Ver no Flow"): ativa a aba existente.
     * Não cria nova aba se a sessão/worker já estiver no projeto.
     */
    /**
     * Envia referências para Envios/Uploads do projeto vinculado (sem Incluir no comando).
     * Reutiliza itens já confirmados; marca “Enviada” só após confirmação na galeria.
     */
    async syncReferences(id: string): Promise<{ uploaded: number; reused: number }> {
      const project = deps.store.get(id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      const remoteId = project.remoteId?.trim() || null
      const remoteUrl =
        project.remoteUrl?.trim() || (remoteId ? buildFlowProjectUrl(remoteId) : null)
      if (!remoteId || !remoteUrl) {
        throw new Error(
          'Informe a URL do projeto existente no Google Flow (vínculo remoto) antes de enviar as referências.',
        )
      }

      const refs = flowReferenceRepository.listByProject(id).slice(0, MAX_FLOW_UPLOAD_REFS)
      if (refs.length === 0) {
        throw new Error('Anexe pelo menos uma imagem de referência neste projeto.')
      }

      const uploadDir = path.join(os.tmpdir(), 'atlas-flow-upload', randomUUID())
      fs.mkdirSync(uploadDir, { recursive: true })
      const payloads: FlowBridgeReferencePayload[] = []
      try {
        for (const ref of refs) {
          if (!fs.existsSync(ref.imagePath)) {
            throw new Error(`Arquivo não encontrado: ${ref.label || ref.imagePath}`)
          }
          const fileName = buildFlowReferenceUploadFileName(ref.label, ref.imagePath)
          const localPath = path.join(uploadDir, fileName)
          fs.copyFileSync(ref.imagePath, localPath)
          const expectedKey = ref.flowUploadKey || buildFlowUploadKey(ref.label, fileName)
          flowReferenceRepository.update(ref.id, {
            syncStatus: 'sending',
            lastSyncError: null,
            flowFileName: fileName,
          })
          payloads.push({
            id: ref.id,
            label: ref.label,
            fileName,
            mimeType: mimeTypeFromImagePath(ref.imagePath),
            base64: fs.readFileSync(localPath).toString('base64'),
            localPath,
            // Extensão usa para pular reupload se a galeria já tiver a key.
            ...(ref.syncStatus === 'sent' && ref.flowUploadKey
              ? { flowUploadKey: ref.flowUploadKey }
              : { flowUploadKey: expectedKey }),
          } as FlowBridgeReferencePayload & { flowUploadKey?: string })
        }

        await ensureBridge()
        await waitForExtensionConnected()

        const flightToken = beginInFlight(id, 'upload')
        try {
          emitProgress(
            project,
            'uploading_refs',
            `Enviando ${payloads.length} referência(s) ao Flow (só galeria)…`,
          )
          const requestId = randomUUID()
          const resultPromise = waitForBridgeResult(requestId)

          const onProgress = (event: FlowBridgeEvent) => {
            if (!('requestId' in event) || event.requestId !== requestId) return
            if (event.type === 'reference_progress') {
              emitProgress(project, event.stage, event.message)
              if (event.stage === 'ref_sent' || event.stage === 'ref_reused') {
                flowReferenceRepository.update(event.refId, {
                  syncStatus: 'sent',
                  flowUploadKey: event.flowUploadKey || null,
                  syncedAt: new Date().toISOString(),
                  lastSyncError: null,
                })
              } else if (event.stage === 'ref_pending') {
                // Arquivo visto no seletor, mas prévia/Incluir ainda não prontos — não reenviar bytes.
                flowReferenceRepository.update(event.refId, {
                  syncStatus: 'confirming',
                  lastSyncError: event.message,
                })
              } else if (event.stage === 'ref_error') {
                flowReferenceRepository.update(event.refId, {
                  syncStatus: 'error',
                  lastSyncError: event.message,
                })
              }
            }
          }
          deps.bridge.on('event', onProgress)

          try {
            deps.bridge.enqueue({
              type: 'upload_references',
              requestId,
              remoteId,
              remoteUrl,
              background: true,
              galleryOnly: true,
              references: payloads,
            })
            const result = await resultPromise
            if (result.type === 'needs_login') {
              throw new Error(
                result.message ||
                  'Faça login na aba do Flow no Chrome e tente enviar as referências de novo.',
              )
            }
            if (result.type === 'error') {
              const detailFromRefs = refs
                .map((ref) => flowReferenceRepository.get(ref.id))
                .filter((ref) => ref?.lastSyncError)
                .map((ref) => `[${ref!.label}] ${ref!.lastSyncError}`)
              for (const ref of refs) {
                const current = flowReferenceRepository.get(ref.id)
                if (current?.syncStatus === 'sending') {
                  flowReferenceRepository.update(ref.id, {
                    syncStatus: 'error',
                    lastSyncError: result.message || 'Falha no envio.',
                  })
                }
              }
              throw new Error(
                detailFromRefs[0] ||
                  result.message ||
                  'Falha ao enviar as referências ao Google Flow.',
              )
            }
            if (result.type !== 'references_uploaded') {
              throw new Error('A extensão não confirmou o envio das referências.')
            }

            let reused = 0
            for (const item of result.results || []) {
              flowReferenceRepository.update(item.id, {
                syncStatus: 'sent',
                flowUploadKey: item.flowUploadKey,
                flowFileName: item.fileName,
                syncedAt: new Date().toISOString(),
                lastSyncError: null,
              })
              if (item.reused) reused += 1
            }

            emitProgress(
              project,
              'refs_uploaded',
              result.message || `${result.uploaded} referência(s) confirmada(s) em Uploads.`,
            )
            logger.info('flow.references.uploaded', {
              id: project.id,
              remoteId,
              uploaded: result.uploaded,
              reused,
            })
            return { uploaded: Number(result.uploaded) || 0, reused }
          } finally {
            deps.bridge.off('event', onProgress)
          }
        } finally {
          endInFlight(id, flightToken)
        }
      } finally {
        setTimeout(() => {
          try {
            fs.rmSync(uploadDir, { recursive: true, force: true })
          } catch {
            /* ignore */
          }
        }, 20_000)
      }
    },

    resumeGeneration(id: string): FlowProject {
      const project = deps.store.get(id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      const next = patchProject(id, {
        generationPaused: false,
        lastError: null,
      })
      emitProgress(next, 'generation_resumed', 'Geração retomada. Você pode enviar cards de novo.')
      return next
    },

    /**
     * Prepara ou gera no Flow a partir do prompt do projeto / card.
     * submit=false: valida caixa sem Generate. Respeita generationPaused.
     */
    async syncPrompt(
      id: string,
      options?: { submit?: boolean; promptOverride?: string },
    ): Promise<{ mentions: number; submitted: boolean; verified: boolean }> {
      const project = deps.store.get(id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      const submit = options?.submit !== false

      if (submit && project.generationPaused) {
        throw new Error(
          project.lastError ||
            'Geração pausada após aviso do Flow (atividade incomum). Retome a geração antes de tentar de novo.',
        )
      }

      const remoteId = project.remoteId?.trim() || null
      const remoteUrl =
        project.remoteUrl?.trim() || (remoteId ? buildFlowProjectUrl(remoteId) : null)
      if (!remoteId || !remoteUrl) {
        throw new Error(
          'Informe a URL do projeto existente no Google Flow antes de enviar o prompt.',
        )
      }

      const prompt = normalizeFlowProjectPrompt(options?.promptOverride ?? project.prompt)
      if (!prompt.trim()) {
        throw new Error('Escreva um prompt neste projeto antes de enviar ao Flow.')
      }

      const mentions = parseFlowPromptMentions(prompt)
      const segments = splitFlowPromptSegments(prompt)
      const allRefs = flowReferenceRepository.listByProject(id)
      const mentionedRefs = matchFlowReferencesByMentions(allRefs, mentions)
      const missing = mentions.filter(
        (mention) =>
          !mentionedRefs.some((ref) => ref.label.trim().toLowerCase() === mention.toLowerCase()),
      )
      if (missing.length) {
        throw new Error(
          `Referência(s) sem vínculo/imagem no Atlas: ${missing.map((m) => `[${m}]`).join(', ')}. Anexe, nomeie e envie ao Flow antes de gerar.`,
        )
      }

      const notOnFlow = mentionedRefs.filter(
        (ref) => ref.syncStatus !== 'sent' || !String(ref.flowUploadKey || '').trim(),
      )
      if (notOnFlow.length) {
        throw new Error(
          `Referência(s) ainda não confirmadas em Uploads no Flow: ${notOnFlow
            .map((ref) => `[${ref.label}]`)
            .join(', ')}. Clique em “Enviar referências ao Flow” (se o arquivo já estiver em Envios, o Atlas só vincula — sem nova cópia).`,
        )
      }

      try {
        await ensureBridge()
        await waitForExtensionConnected()

        const flightToken = beginInFlight(id, 'prompt')
        try {
          emitProgress(
            project,
            submit ? 'filling_prompt' : 'preparing_prompt',
            mentionedRefs.length
              ? `${submit ? 'Gerando' : 'Preparando'} no Flow com ${mentionedRefs.length} referência(s)…`
              : `${submit ? 'Gerando' : 'Preparando'} prompt no Flow…`,
          )
          const requestId = randomUUID()
          const resultPromise = waitForBridgeResult(requestId)

          const onProgress = (event: FlowBridgeEvent) => {
            if (!('requestId' in event) || event.requestId !== requestId) return
            if (event.type === 'progress') {
              emitProgress(project, event.stage, event.message)
            }
          }
          deps.bridge.on('event', onProgress)

          try {
            deps.bridge.enqueue({
              type: 'fill_prompt',
              requestId,
              remoteId,
              remoteUrl,
              background: true,
              prompt,
              segments,
              references: mentionedRefs.map((ref) => ({
                id: ref.id,
                label: ref.label,
                fileName: ref.flowFileName || buildFlowReferenceUploadFileName(ref.label, ref.imagePath),
                mimeType: mimeTypeFromImagePath(ref.imagePath),
                base64: '',
                flowUploadKey: ref.flowUploadKey || undefined,
              })) as FlowBridgeReferencePayload[],
              imageModel: project.imageModel,
              imageModelLabel: FLOW_IMAGE_MODEL_LABEL[project.imageModel],
              imageOutputs: project.imageOutputs,
              submit,
            })
            const result = await resultPromise

            if (result.type === 'needs_login') {
              throw new Error(
                result.message ||
                  'Faça login na aba do Flow no Chrome e tente enviar o prompt de novo.',
              )
            }

            if (result.type === 'generation_blocked') {
              patchProject(id, {
                generationPaused: true,
                lastError: result.message,
              })
              emitProgress(project, 'generation_paused', result.message)
              throw new Error(result.message)
            }

            if (result.type === 'error') {
              const unusual =
                result.code === 'unusual_activity' ||
                /atividade incomum|unusual activity|notamos uma atividade/i.test(
                  result.message || '',
                )
              if (unusual) {
                patchProject(id, {
                  generationPaused: true,
                  lastError: result.message,
                })
                emitProgress(project, 'generation_paused', result.message)
              }
              throw new Error(result.message || 'Falha ao enviar o prompt ao Google Flow.')
            }

            if (result.type !== 'prompt_filled') {
              throw new Error('A extensão não confirmou o preenchimento do prompt.')
            }

            emitProgress(
              project,
              result.submitted ? 'prompt_filled' : 'prompt_prepared',
              result.message ||
                (result.submitted ? 'Criação disparada no Flow.' : 'Card preparado no Flow (sem Generate).'),
            )
            logger.info('flow.prompt.filled', {
              id: project.id,
              remoteId,
              mentions: result.mentions,
              submitted: result.submitted,
            })
            return {
              mentions: Number(result.mentions) || mentionedRefs.length,
              submitted: Boolean(result.submitted),
              verified: result.verified !== false,
            }
          } finally {
            deps.bridge.off('event', onProgress)
          }
        } finally {
          endInFlight(id, flightToken)
        }
      } finally {
        /* no temp files for metadata-only refs */
      }
    },

    listGenerationCards(projectId: string): FlowGenerationCard[] {
      return flowGenerationCardRepository.listByProject(projectId)
    },

    importGenerationCards(projectId: string, source: string): FlowGenerationCard[] {
      assertProjectExists(deps.store, projectId)
      const parsed = parseFlowPromptsForImport(source)
      if (!parsed.length) {
        throw new Error('Nenhum prompt numerado encontrado para importar como card.')
      }
      return flowGenerationCardRepository.importPrompts(
        projectId,
        parsed.map((item) => ({ number: item.number, text: item.text })),
      )
    },

    addGenerationCard(projectId: string, prompt: string): FlowGenerationCard {
      assertProjectExists(deps.store, projectId)
      return flowGenerationCardRepository.add(projectId, prompt)
    },

    updateGenerationCard(
      id: string,
      patch: { prompt?: string },
    ): FlowGenerationCard | null {
      return flowGenerationCardRepository.update(id, patch)
    },

    removeGenerationCard(id: string): boolean {
      return flowGenerationCardRepository.remove(id)
    },

    async prepareGenerationCard(cardId: string): Promise<FlowGenerationCard> {
      return runGenerationCard(deps, {
        cardId,
        submit: false,
        syncPrompt: (projectId, options) => api.syncPrompt(projectId, options),
        emitProgress,
        beginInFlight,
        endInFlight,
      })
    },

    async generateGenerationCard(cardId: string): Promise<FlowGenerationCard> {
      return runGenerationCard(deps, {
        cardId,
        submit: true,
        syncPrompt: (projectId, options) => api.syncPrompt(projectId, options),
        emitProgress,
        beginInFlight,
        endInFlight,
      })
    },

    async openRemote(id: string): Promise<boolean> {
      const project = deps.store.get(id)
      if (!project) throw new Error('Projeto Flow não encontrado.')
      const url =
        project.remoteUrl?.trim() ||
        (project.remoteId ? buildFlowProjectUrl(project.remoteId) : null)
      if (!url) throw new Error('Este projeto ainda não tem URL no Google Flow.')

      await ensureBridge()
      if (!deps.bridge.getStatus().extensionConnected) {
        throw new Error(
          'Extensão Atlas Flow Bridge não conectada. Abra o Chrome com a extensão carregada — o Atlas não abre abas novas automaticamente.',
        )
      }

      const requestId = randomUUID()
      const resultPromise = waitForBridgeResult(requestId)
      deps.bridge.enqueue({
        type: 'reveal_project',
        requestId,
        remoteId: project.remoteId,
        remoteUrl: url,
      })
      const result = await resultPromise
      if (result.type === 'error') {
        const gone =
          result.code === 'project_not_found' ||
          /404|projeto não encontrado|project not found/i.test(result.message || '')
        if (gone && project.remoteId) {
          removeLocalFromRemote(
            project.remoteId,
            'Projeto excluído no Google Flow. Removido do Atlas.',
          )
          throw new Error('Projeto excluído no Google Flow. Removido do Atlas.')
        }
        throw new Error(
          result.message ||
            'Não foi possível mostrar o projeto na aba do Flow. Recarregue a extensão e tente de novo.',
        )
      }
      if (result.type === 'project_deleted' && result.remoteId) {
        removeLocalFromRemote(
          result.remoteId,
          'Projeto excluído no Google Flow. Removido do Atlas.',
        )
        throw new Error('Projeto excluído no Google Flow. Removido do Atlas.')
      }
      if (result.type !== 'revealed') {
        throw new Error(
          'A extensão não revelou a aba do Flow. Confirme que o Chrome está aberto com a Atlas Flow Bridge.',
        )
      }
      return true
    },

    async remove(id: string): Promise<boolean> {
      const project = deps.store.get(id)
      if (!project) return false
      const flightToken = beginInFlight(id, 'remove')
      try {
        if (project.remoteId && project.createInFlow) {
          emitProgress(project, 'deleting', 'Excluindo o projeto no Google Flow…')
          await deleteOnFlow(project)
        }
        if (deps.store.get(id)) {
          flowReferenceRepository.removeByProject(id)
          flowGenerationCardRepository.removeByProject(id)
          deps.store.remove(id)
          emitProgress(project, 'removed', 'Projeto excluído.')
        }
        logger.info('flow.project.removed', {
          id: project.id,
          remoteId: project.remoteId,
        })
        return true
      } finally {
        endInFlight(id, flightToken)
      }
    },

    /** Ao reabrir o Atlas, marca criações interrompidas como recuperáveis. */
    recoverInterrupted(): FlowProject[] {
      const recovered: FlowProject[] = []
      for (const project of deps.store.list()) {
        if (!project.createInFlow) continue
        if (project.syncStatus !== 'creating') continue
        const next = patchProject(project.id, {
          syncStatus: project.remoteId ? 'sync_failed' : 'sync_failed',
          lastError:
            project.lastError ||
            'A criação no Flow foi interrompida. Use “Tentar vincular novamente” — sem duplicar se o remoto já existir.',
        })
        recovered.push(next)
      }
      return recovered
    },
  }

  return api
}

export const flowProjectService = createFlowProjectService()
