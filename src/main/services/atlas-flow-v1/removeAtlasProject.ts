import { BrowserWindow } from 'electron'
import { channelRepository } from '../../repositories/channelRepository'
import { IPC, MUSIC_PROJECT_HAS_PUBLICATION_ERROR, type RemoveProjectOptions } from '../../../shared/types'
import { removeProject } from '../videos/musicVideoProjectService'
import { atlasFlowCoordinatorServer } from './CoordinatorServer'
import { flowJobService } from './FlowJobService'

function notifyFlowProjectRemoved(atlasProjectId: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(IPC.atlasFlowV1.benchUpdate, {
      kind: 'flow-project-removed',
      atlasProjectId,
    })
  }
}

const FLOW_DELETE_WAIT_MS = 75_000

type DeleteDigest = {
  outcome?: string
  failureCode?: string | null
  alreadyGone?: boolean
  error?: string | null
}

function readDigest(raw: string | null): DeleteDigest {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as DeleteDigest
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* digest antigo em texto puro */
  }
  return {}
}

function flowDeleteSucceeded(status: string, digest: DeleteDigest): boolean {
  if (status === 'completed') return true
  const code = String(digest.failureCode || '')
  return code === 'ALREADY_GONE' || code === 'PROJECT_NOT_FOUND' || digest.alreadyGone === true
}

async function waitForFlowDelete(commandId: string): Promise<DeleteDigest> {
  const started = Date.now()
  let extraLeaseWait = false
  while (Date.now() - started < FLOW_DELETE_WAIT_MS) {
    const snapshot = flowJobService.getCommandSnapshot(commandId)
    if (!snapshot) throw new Error('O comando de exclusão no Google Flow sumiu da fila.')
    const digest = readDigest(snapshot.resultDigest)
    if (snapshot.status === 'completed' || snapshot.status === 'failed') {
      if (flowDeleteSucceeded(snapshot.status, digest)) return digest
      throw new Error(flowDeleteErrorMessage(digest))
    }
    if (
      !extraLeaseWait &&
      snapshot.status === 'leased' &&
      Date.now() - started > FLOW_DELETE_WAIT_MS - 20_000
    ) {
      extraLeaseWait = true
      await sleep(20_000)
      continue
    }
    await sleep(500)
  }

  const snapshot = flowJobService.getCommandSnapshot(commandId)
  if (snapshot && flowDeleteSucceeded(snapshot.status, readDigest(snapshot.resultDigest))) {
    return readDigest(snapshot.resultDigest)
  }
  if (snapshot?.status === 'queued') {
    flowJobService.cancelQueuedCommand(
      commandId,
      'A extensão não chegou a iniciar a exclusão no Google Flow.',
    )
  }
  throw new Error(
    'A extensão não confirmou a exclusão no Google Flow. Deixe o Chrome aberto, com a extensão Atlas Flow conectada, e tente de novo. O projeto no Atlas foi mantido.',
  )
}

function flowDeleteErrorMessage(digest: DeleteDigest): string {
  const code = String(digest.failureCode || '')
  if (code === 'LOGIN_REQUIRED') {
    return 'Faça login no Google Flow no Chrome e tente excluir o projeto de novo.'
  }
  if (code === 'UNSUPPORTED_OPERATION' || code === 'SENSOR_INCOMPATIBLE') {
    return 'Recarregue a extensão Atlas Flow no Chrome (chrome://extensions) e tente excluir o projeto de novo.'
  }
  if (code === 'DELETE_CONTROL_MISSING') {
    return 'Não encontrei a lixeira desse projeto no Google Flow. Deixe o Chrome aberto na conta do Flow e tente de novo.'
  }
  return (
    digest.error ||
    'Não foi possível excluir o projeto no Google Flow. O projeto no Atlas foi mantido.'
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Remove o projeto no Atlas e, se houver vínculo, também no Google Flow.
 * Sem confirmação da extensão, o cadastro do Atlas permanece.
 */
export async function removeAtlasProject(
  projectId: string,
  options: RemoveProjectOptions = {},
): Promise<{ removed: boolean; deletedOnFlow: boolean }> {
  if (channelRepository.getVideoByProjectId(projectId) && !options.alsoRemovePublication) {
    throw new Error(MUSIC_PROJECT_HAS_PUBLICATION_ERROR)
  }

  const link = flowJobService.getLinkedFlowProject(projectId)
  if (!link || options.skipFlow) {
    flowJobService.archiveFlowProject(projectId)
    atlasFlowCoordinatorServer.forgetAtlasProject(projectId)
    const removed = removeProject(projectId, options)
    if (options.skipFlow && removed) {
      notifyFlowProjectRemoved(projectId)
    }
    return { removed, deletedOnFlow: Boolean(options.skipFlow && link) }
  }

  const status = atlasFlowCoordinatorServer.getStatus()
  if (!status.extensionConnected) {
    throw new Error(
      'O projeto está vinculado ao Google Flow. Abra o Chrome com a extensão Atlas Flow conectada para excluir os dois juntos.',
    )
  }

  const queued = flowJobService.enqueueProjectDelete({
    atlasProjectId: projectId,
    flowProjectId: link.flowProjectId,
    flowProjectUrl: link.flowProjectUrl,
  })
  await waitForFlowDelete(queued.commandId)
  flowJobService.archiveFlowProject(projectId)
  atlasFlowCoordinatorServer.forgetAtlasProject(projectId)
  return { removed: removeProject(projectId, options), deletedOnFlow: true }
}
